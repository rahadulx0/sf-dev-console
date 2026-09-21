import { readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CliRunner } from '../cli/CliRunner.js';
import type { SfOrg } from '../types.js';

/*
 * Access to an org without paying for a CLI boot.
 *
 * Every `sf` invocation starts a fresh Node runtime and loads the oclif plugin tree, which
 * measures at roughly 4-12 seconds on this machine — `org list metadata` was 11.9s. The org's
 * REST API answers the same questions in 300-700ms. What stands between the two is an access
 * token, so this module's whole job is to get one cheaply and keep it.
 *
 * A token costs exactly one `sf org display --verbose` per org per session. Everything after
 * that is a direct HTTPS call. When a token cannot be obtained the caller falls back to the
 * CLI, so the fast path is always an optimization and never a requirement.
 */

export interface OrgAuth {
  username: string;
  accessToken: string;
  instanceUrl: string;
  apiVersion: string;
}

/**
 * Newer Salesforce CLI releases redact secrets from `org display` unless this is set. The CLI
 * prints its own notice calling the flag a temporary workaround, so a redacted token is
 * treated as "no fast path for now" rather than an error — the CLI fallback still works.
 */
const SHOW_SECRETS_ENV = { SF_TEMP_SHOW_SECRETS: 'true' };
const REDACTED = /redacted/i;

/** Conservative: real expiry is org-configured. A 401 is what actually drives a refresh. */
const TOKEN_TTL_MS = 25 * 60_000;
/** After a failed acquisition, wait before spending another CLI boot on the same org. */
const FAILURE_COOLDOWN_MS = 60_000;
/** How long to stop attempting the fast path after the CLI withholds a token. */
const SECRETS_BACKOFF_MS = 10 * 60_000;
const DEFAULT_API_VERSION = '62.0';

interface TokenEntry {
  auth?: OrgAuth;
  expiresAt: number;
  /** Set when acquisition failed, to stop a broken org from costing a CLI boot per request. */
  failedUntil?: number;
  inFlight?: Promise<OrgAuth | undefined>;
}

const sfdxDir = path.join(os.homedir(), '.sfdx');
const NON_ORG_FILES = new Set(['alias.json', 'key.json', 'sfdx-config.json']);

export class AuthProvider {
  private readonly tokens = new Map<string, TokenEntry>();
  /** A future timestamp means the CLI is redacting secrets, so the fast path is off. */
  private secretsUnavailableUntil = 0;

  constructor(private readonly cli: Pick<CliRunner, 'execute'>) {}

  /** True when the direct-API path is worth attempting at all. */
  get fastPathLikely(): boolean {
    return Date.now() >= this.secretsUnavailableUntil;
  }

  /**
   * Returns a usable token for `org`, or `undefined` when the caller should use the CLI.
   * Never throws: an unavailable fast path is a routine condition, not a failure.
   */
  async auth(org: string): Promise<OrgAuth | undefined> {
    const now = Date.now();
    const entry = this.tokens.get(org);
    if (entry?.auth && entry.expiresAt > now) return entry.auth;
    if (entry?.inFlight) return await entry.inFlight;
    if (entry?.failedUntil && entry.failedUntil > now) return undefined;
    if (!this.fastPathLikely) return undefined;

    const inFlight = this.acquire(org).finally(() => {
      const current = this.tokens.get(org);
      if (current?.inFlight) current.inFlight = undefined;
    });
    this.tokens.set(org, { expiresAt: 0, inFlight });
    return await inFlight;
  }

  private async acquire(org: string): Promise<OrgAuth | undefined> {
    try {
      const result = await this.cli.execute(['org', 'display', '--target-org', org, '--verbose'], {
        timeoutMs: 120_000,
        env: SHOW_SECRETS_ENV,
      });
      const accessToken = typeof result?.accessToken === 'string' ? result.accessToken : '';
      const instanceUrl = typeof result?.instanceUrl === 'string' ? result.instanceUrl : '';
      if (!accessToken || !instanceUrl || REDACTED.test(accessToken)) {
        // The CLI withheld the token. Stop asking for a while; the CLI path still serves reads.
        this.secretsUnavailableUntil = Date.now() + SECRETS_BACKOFF_MS;
        this.tokens.set(org, { expiresAt: 0, failedUntil: Date.now() + FAILURE_COOLDOWN_MS });
        return undefined;
      }
      this.secretsUnavailableUntil = 0;
      const auth: OrgAuth = {
        username: typeof result.username === 'string' ? result.username : org,
        accessToken,
        instanceUrl: instanceUrl.replace(/\/+$/, ''),
        apiVersion: normalizeApiVersion(result.apiVersion),
      };
      this.tokens.set(org, { auth, expiresAt: Date.now() + TOKEN_TTL_MS });
      return auth;
    } catch {
      this.tokens.set(org, { expiresAt: 0, failedUntil: Date.now() + FAILURE_COOLDOWN_MS });
      return undefined;
    }
  }

  /** Forces the next `auth()` to re-acquire. Called when the org rejects a token with a 401. */
  expire(org: string) {
    this.tokens.delete(org);
  }

  /** Drops every cached token, e.g. after a new org is authorized. */
  reset() {
    this.tokens.clear();
    this.secretsUnavailableUntil = 0;
  }
}

function normalizeApiVersion(value: unknown): string {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return /^\d{2,3}\.\d$/.test(text) ? text : DEFAULT_API_VERSION;
}

/**
 * Lists authorized orgs by reading the CLI's own auth files.
 *
 * `sf org list` costs a full CLI boot (measured at 4.9s) to report information that is sitting
 * in plaintext on disk — only the tokens in these files are encrypted, and this reads none of
 * them. At 12ms it lets the org switcher paint immediately; the caller refreshes from the CLI
 * behind that to pick up real connection status.
 */
export async function readLocalOrgs(): Promise<SfOrg[]> {
  let files: string[];
  try {
    files = await readdir(sfdxDir);
  } catch {
    return [];
  }

  const aliasByUsername = new Map<string, string>();
  try {
    const parsed = JSON.parse(await readFile(path.join(sfdxDir, 'alias.json'), 'utf8')) as { orgs?: Record<string, string> };
    for (const [alias, username] of Object.entries(parsed.orgs ?? {})) aliasByUsername.set(username, alias);
  } catch {
    // Aliases are a convenience; usernames alone identify an org.
  }

  const defaultUsername = await readDefaultUsername();
  const orgs: SfOrg[] = [];
  await Promise.all(
    files.map(async (file) => {
      // Auth files are `<username>.json`; a `.sandbox.json` entry describes a sandbox, not a login.
      if (!file.endsWith('.json') || NON_ORG_FILES.has(file) || file.endsWith('.sandbox.json')) return;
      try {
        const data = JSON.parse(await readFile(path.join(sfdxDir, file), 'utf8')) as Record<string, unknown>;
        const username = typeof data.username === 'string' ? data.username : '';
        if (!username) return;
        orgs.push({
          username,
          alias: aliasByUsername.get(username),
          orgId: typeof data.orgId === 'string' ? data.orgId : undefined,
          instanceUrl: typeof data.instanceUrl === 'string' ? data.instanceUrl : undefined,
          isSandbox: !!data.isSandbox,
          // The file's existence means the CLI holds credentials. The UI treats a connected
          // org as ready, and the background CLI refresh corrects a revoked one.
          connectedStatus: 'Connected',
          isDefaultUsername: username === defaultUsername,
        });
      } catch {
        // A partially written or unreadable auth file simply is not offered.
      }
    }),
  );
  return orgs.sort((left, right) => (left.alias ?? left.username).localeCompare(right.alias ?? right.username));
}

/** Resolves the CLI's configured default org from either config location, if one is set. */
async function readDefaultUsername(): Promise<string | undefined> {
  const candidates = [
    { file: path.join(os.homedir(), '.sf', 'config.json'), key: 'target-org' },
    { file: path.join(sfdxDir, 'sfdx-config.json'), key: 'defaultusername' },
  ];
  for (const { file, key } of candidates) {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      const value = parsed[key];
      if (typeof value === 'string' && value) return value;
    } catch {
      // No config file, or not readable: there is simply no default.
    }
  }
  return undefined;
}
