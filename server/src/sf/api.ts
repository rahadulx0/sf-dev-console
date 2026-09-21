import { XMLParser } from 'fast-xml-parser';
import type { AuthProvider, OrgAuth } from './auth.js';

/*
 * A direct client for an org's REST, Tooling, and Metadata APIs.
 *
 * This is the fast path behind most read endpoints. Measured against the same operations run
 * through `sf`:
 *
 *   org list metadata ApexClass   11,911ms -> 3,055ms   (SOAP listMetadata)
 *   sobject describe Account       3,947ms ->   753ms
 *   data query (count)             3,915ms ->   526ms
 *   apex log list                 ~4,000ms ->   303ms
 *
 * The gap is almost entirely CLI process startup, which this avoids. Node's fetch keeps
 * connections alive per origin, so calls after the first also skip the TLS handshake.
 *
 * Failures are classified, because that decides who answers the request. A transport problem
 * or an expired token means "try the CLI instead"; a MALFORMED_QUERY from the org is the real
 * answer and must be shown as-is rather than replayed slowly through the CLI.
 */

export class SfApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Salesforce's own error code, when the body carried one. */
    readonly errorCode?: string,
    /** True when the CLI might succeed where this failed: transport, auth, or throttling. */
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'SfApiError';
  }
}

/** Raised when there is no token, so the caller should not treat it as an org failure. */
export class FastPathUnavailable extends Error {
  constructor(message = 'Direct API path unavailable') {
    super(message);
    this.name = 'FastPathUnavailable';
  }
}

export interface QueryResult {
  totalSize: number;
  done: boolean;
  records: Record<string, any>[];
}

export interface MetadataListEntry {
  fullName: string;
  type?: string;
  namespacePrefix?: string;
  manageableState?: string;
  lastModifiedDate?: string;
  lastModifiedByName?: string;
}

/** Composite batch accepts at most 25 subrequests per call. */
const BATCH_LIMIT = 25;
/** Guards against a runaway `queryMore` loop on an unbounded SOQL statement. */
const MAX_QUERY_PAGES = 40;
const MAX_QUERY_RECORDS = 100_000;
const DEFAULT_TIMEOUT_MS = 120_000;

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export class SfApi {
  constructor(private readonly auth: AuthProvider) {}

  /** True when a token is already held or looks obtainable, without spending a CLI boot. */
  get likelyAvailable(): boolean {
    return this.auth.fastPathLikely;
  }

  private async credentials(org: string): Promise<OrgAuth> {
    const auth = await this.auth.auth(org);
    if (!auth) throw new FastPathUnavailable();
    return auth;
  }

  /**
   * Issues one authenticated request, re-acquiring the token once on a 401.
   * `pathOrUrl` may be an absolute instance path (as `nextRecordsUrl` returns) or a path
   * relative to the versioned data endpoint.
   */
  private async send(
    org: string,
    pathOrUrl: string,
    init: RequestInit & { timeoutMs?: number } = {},
    attempt = 0,
  ): Promise<any> {
    const auth = await this.credentials(org);
    const url = pathOrUrl.startsWith('/services/')
      ? `${auth.instanceUrl}${pathOrUrl}`
      : `${auth.instanceUrl}/services/data/v${auth.apiVersion}${pathOrUrl}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    // An external signal (client disconnect) must still cancel the request.
    const abortExternal = () => controller.abort();
    init.signal?.addEventListener('abort', abortExternal, { once: true });

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          Accept: 'application/json',
          // Describes and sobject listings are large; transfer them compressed.
          'Accept-Encoding': 'gzip, deflate',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch (error) {
      // A caller-driven abort is not a fast-path failure; it must not fall back to the CLI.
      if (init.signal?.aborted) throw error;
      throw new SfApiError(error instanceof Error ? error.message : String(error), 0, undefined, true);
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abortExternal);
    }

    if (response.status === 401 && attempt === 0) {
      this.auth.expire(org);
      return await this.send(org, pathOrUrl, init, attempt + 1);
    }
    if (response.status === 204) return null;

    const text = await response.text();
    if (!response.ok) throw toApiError(response.status, text);
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new SfApiError('Unreadable response from the Salesforce API', response.status, undefined, true);
    }
  }

  /** Runs SOQL, following `nextRecordsUrl` so a large result is complete rather than truncated. */
  async query(org: string, soql: string, options: { tooling?: boolean; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<QueryResult> {
    const base = options.tooling ? '/tooling/query' : '/query';
    let next = `${base}?q=${encodeURIComponent(soql)}`;
    const records: Record<string, any>[] = [];
    let totalSize = 0;
    let done = true;

    for (let page = 0; page < MAX_QUERY_PAGES && next; page++) {
      const result = await this.send(org, next, { signal: options.signal, timeoutMs: options.timeoutMs });
      totalSize = typeof result?.totalSize === 'number' ? result.totalSize : records.length;
      if (Array.isArray(result?.records)) records.push(...result.records);
      done = result?.done !== false;
      next = !done && typeof result?.nextRecordsUrl === 'string' && records.length < MAX_QUERY_RECORDS ? result.nextRecordsUrl : '';
      if (next) done = false;
    }
    return { totalSize, done, records };
  }

  async describe(org: string, sobject: string, options: { tooling?: boolean; signal?: AbortSignal } = {}) {
    const prefix = options.tooling ? '/tooling/sobjects' : '/sobjects';
    return await this.send(org, `${prefix}/${encodeURIComponent(sobject)}/describe`, { signal: options.signal });
  }

  /** The global describe, used for the object picker. */
  async globalDescribe(org: string, options: { tooling?: boolean; signal?: AbortSignal } = {}) {
    const prefix = options.tooling ? '/tooling/sobjects' : '/sobjects';
    return await this.send(org, prefix, { signal: options.signal });
  }

  async limits(org: string, options: { signal?: AbortSignal } = {}) {
    return await this.send(org, '/limits', { signal: options.signal });
  }

  async getRecord(org: string, sobject: string, recordId: string, options: { tooling?: boolean; signal?: AbortSignal } = {}) {
    const prefix = options.tooling ? '/tooling/sobjects' : '/sobjects';
    return await this.send(org, `${prefix}/${encodeURIComponent(sobject)}/${encodeURIComponent(recordId)}`, { signal: options.signal });
  }

  async updateRecord(org: string, sobject: string, recordId: string, fields: Record<string, unknown>, options: { tooling?: boolean } = {}) {
    const prefix = options.tooling ? '/tooling/sobjects' : '/sobjects';
    return await this.send(org, `${prefix}/${encodeURIComponent(sobject)}/${encodeURIComponent(recordId)}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
  }

  async deleteRecord(org: string, sobject: string, recordId: string, options: { tooling?: boolean } = {}) {
    const prefix = options.tooling ? '/tooling/sobjects' : '/sobjects';
    return await this.send(org, `${prefix}/${encodeURIComponent(sobject)}/${encodeURIComponent(recordId)}`, { method: 'DELETE' });
  }

  /**
   * Runs up to 25 independent GETs in one round trip. Record counts across many objects used
   * to be one CLI process per object; this collapses them into a single request.
   */
  async batchGet(
    org: string,
    paths: string[],
    options: { signal?: AbortSignal } = {},
  ): Promise<{ statusCode: number; result: any }[]> {
    const auth = await this.credentials(org);
    const out: { statusCode: number; result: any }[] = [];
    for (let index = 0; index < paths.length; index += BATCH_LIMIT) {
      const chunk = paths.slice(index, index + BATCH_LIMIT);
      const response = await this.send(
        org,
        '/composite/batch',
        {
          method: 'POST',
          signal: options.signal,
          // Subrequest URLs are version-relative, not absolute.
          body: JSON.stringify({ batchRequests: chunk.map((p) => ({ method: 'GET', url: `v${auth.apiVersion}${p}` })) }),
        },
      );
      for (const entry of response?.results ?? []) out.push({ statusCode: entry.statusCode, result: entry.result });
    }
    return out;
  }

  /**
   * Posts a SOAP envelope to one of the org's SOAP endpoints and returns the parsed body.
   *
   * Three operations the app needs have no REST equivalent — listing metadata, describing the
   * metadata types, and running anonymous Apex with its debug log — so they go through SOAP
   * rather than through a CLI process.
   */
  private async soap(
    org: string,
    endpoint: 'm' | 's',
    action: string,
    buildBody: (auth: OrgAuth) => string,
    options: { signal?: AbortSignal; timeoutMs?: number; header?: string } = {},
  ): Promise<{ body: any; header: any }> {
    const auth = await this.credentials(org);
    const namespace = endpoint === 'm' ? 'http://soap.sforce.com/2006/04/metadata' : 'http://soap.sforce.com/2006/08/apex';
    const envelope =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="${namespace}">` +
      '<soapenv:Header>' +
      `<SessionHeader><sessionId>${escapeXml(auth.accessToken)}</sessionId></SessionHeader>${options.header ?? ''}` +
      '</soapenv:Header>' +
      `<soapenv:Body>${buildBody(auth)}</soapenv:Body></soapenv:Envelope>`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const abortExternal = () => controller.abort();
    options.signal?.addEventListener('abort', abortExternal, { once: true });

    let response: Response;
    try {
      response = await fetch(`${auth.instanceUrl}/services/Soap/${endpoint}/${auth.apiVersion}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: action, 'Accept-Encoding': 'gzip, deflate' },
        body: envelope,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new SfApiError(error instanceof Error ? error.message : String(error), 0, undefined, true);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortExternal);
    }

    const text = await response.text();
    if (response.status === 401 || text.includes('INVALID_SESSION_ID')) {
      this.auth.expire(org);
      throw new SfApiError('Session expired', 401, 'INVALID_SESSION_ID', true);
    }
    if (!response.ok) {
      const fault = /<faultstring>([^<]*)<\/faultstring>/.exec(text)?.[1];
      // A fault naming the request itself is the org's real answer, not a transport problem.
      throw new SfApiError(fault || `SOAP endpoint returned ${response.status}`, response.status, undefined, !fault);
    }

    const parsed = xml.parse(text);
    const parsedEnvelope: any = parsed?.['soapenv:Envelope'] ?? parsed?.Envelope ?? {};
    // The Apex endpoint returns its debug log in the response header, not the body.
    return {
      body: parsedEnvelope['soapenv:Body'] ?? parsedEnvelope.Body ?? {},
      header: parsedEnvelope['soapenv:Header'] ?? parsedEnvelope.Header ?? {},
    };
  }

  /**
   * Compiles and runs anonymous Apex, returning the same shape as `sf apex run`.
   *
   * The Tooling REST endpoint reports compile and execution status but no debug log, which is
   * the output the Apex page actually shows. The SOAP endpoint returns both when asked with a
   * DebuggingHeader, so it is the one used here: ~1.0s against ~4.0s through the CLI.
   */
  async executeAnonymous(org: string, code: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}) {
    const header =
      '<DebuggingHeader><categories><category>Apex_code</category><level>DEBUG</level></categories>' +
      '<debugLevel>DETAIL</debugLevel></DebuggingHeader>';
    const { body, header: responseHeader } = await this.soap(
      org,
      's',
      'executeAnonymous',
      () => `<executeAnonymous><String>${escapeXml(code)}</String></executeAnonymous>`,
      { signal: options.signal, timeoutMs: options.timeoutMs ?? 180_000, header },
    );
    const result = body?.executeAnonymousResponse?.result ?? {};
    const debugLog = responseHeader?.DebuggingInfo?.debugLog ?? responseHeader?.debuggingInfo?.debugLog ?? '';
    return {
      success: asBoolean(result.success),
      compiled: asBoolean(result.compiled),
      compileProblem: emptyToUndefined(result.compileProblem),
      exceptionMessage: emptyToUndefined(result.exceptionMessage),
      exceptionStackTrace: emptyToUndefined(result.exceptionStackTrace),
      line: Number(result.line ?? -1),
      column: Number(result.column ?? -1),
      logs: typeof debugLog === 'string' ? debugLog : String(debugLog ?? ''),
    };
  }

  /** Fetches a debug log body. This endpoint returns text, not JSON. */
  async apexLogBody(org: string, logId: string, options: { signal?: AbortSignal } = {}): Promise<string> {
    const auth = await this.credentials(org);
    const url = `${auth.instanceUrl}/services/data/v${auth.apiVersion}/tooling/sobjects/ApexLog/${encodeURIComponent(logId)}/Body`;
    let response: Response;
    try {
      response = await fetch(url, {
        signal: options.signal,
        headers: { Authorization: `Bearer ${auth.accessToken}`, 'Accept-Encoding': 'gzip, deflate' },
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new SfApiError(error instanceof Error ? error.message : String(error), 0, undefined, true);
    }
    const text = await response.text();
    if (response.status === 401) {
      this.auth.expire(org);
      throw new SfApiError('Session expired', 401, undefined, true);
    }
    if (!response.ok) throw toApiError(response.status, text);
    return text;
  }

  /**
   * Lists every component of a metadata type through the Metadata API.
   *
   * `listMetadata` is SOAP-only, so this posts the envelope directly. It replaces
   * `sf org list metadata`, the single slowest read in the app at 11.9 seconds, and returns
   * the identical component set (verified at 2,455 ApexClass entries from both paths).
   */
  async listMetadata(org: string, type: string, options: { signal?: AbortSignal; folder?: string } = {}): Promise<MetadataListEntry[]> {
    const folder = options.folder ? `<folder>${escapeXml(options.folder)}</folder>` : '';
    const { body } = await this.soap(
      org,
      'm',
      'listMetadata',
      (auth) =>
        `<listMetadata><queries><type>${escapeXml(type)}</type>${folder}</queries>` +
        `<asOfVersion>${escapeXml(auth.apiVersion)}</asOfVersion></listMetadata>`,
      { signal: options.signal, timeoutMs: 180_000 },
    );
    const results = body?.listMetadataResponse?.result;
    if (!results) return [];
    const list = Array.isArray(results) ? results : [results];
    return list
      .map((entry: any) => ({
        fullName: typeof entry?.fullName === 'string' ? entry.fullName : '',
        type: typeof entry?.type === 'string' ? entry.type : type,
        namespacePrefix: typeof entry?.namespacePrefix === 'string' ? entry.namespacePrefix : undefined,
        manageableState: typeof entry?.manageableState === 'string' ? entry.manageableState : undefined,
        lastModifiedDate: typeof entry?.lastModifiedDate === 'string' ? entry.lastModifiedDate : undefined,
        lastModifiedByName: typeof entry?.lastModifiedByName === 'string' ? entry.lastModifiedByName : undefined,
      }))
      .filter((entry) => entry.fullName);
  }

  /** Describes every metadata type the org exposes, replacing `org list metadata-types`. */
  async describeMetadata(org: string, options: { signal?: AbortSignal } = {}): Promise<{ metadataObjects: any[] }> {
    const { body } = await this.soap(
      org,
      'm',
      'describeMetadata',
      (auth) => `<describeMetadata><asOfVersion>${escapeXml(auth.apiVersion)}</asOfVersion></describeMetadata>`,
      { signal: options.signal, timeoutMs: 180_000 },
    );
    const objects = body?.describeMetadataResponse?.result?.metadataObjects;
    return { metadataObjects: objects ? (Array.isArray(objects) ? objects : [objects]) : [] };
  }
}

const asBoolean = (value: unknown) => value === true || value === 'true';
const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** Maps a Salesforce error body onto the retryable/authoritative distinction callers depend on. */
function toApiError(status: number, text: string): SfApiError {
  let code: string | undefined;
  let message = '';
  try {
    const parsed = JSON.parse(text);
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    code = first?.errorCode ?? first?.error;
    message = first?.message ?? first?.error_description ?? '';
  } catch {
    message = text.slice(0, 500);
  }
  // 5xx and throttling may succeed elsewhere or later; a 4xx with an error code is the answer.
  const retryable = status >= 500 || status === 403 || status === 429 || !code;
  return new SfApiError(message || `Salesforce API returned ${status}`, status, code, retryable);
}

/**
 * Decides whether a fast-path failure should be retried through the CLI.
 * An authoritative org error (bad SOQL, unknown field) is returned to the user directly;
 * anything else means the fast path could not answer and the CLI should try.
 */
export function shouldFallBack(error: unknown): boolean {
  if (error instanceof FastPathUnavailable) return true;
  if (error instanceof SfApiError) return error.retryable;
  // An AbortError is the client leaving; never replay it through the CLI.
  if (error instanceof Error && error.name === 'AbortError') return false;
  return true;
}
