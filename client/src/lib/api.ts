export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiOptions extends RequestInit {
  signal?: AbortSignal;
}

export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    // Fastify's JSON parser rejects a declared application/json body that's actually empty,
    // so a body-less POST (e.g. "open this org") must not claim one — this was silently
    // breaking every such call, including the org-open button, since the original app.
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new ApiError(body.error || 'Request failed', response.status, body.details);
  }
  return (await response.json()) as T;
}

/** True when a rejection came from an aborted request rather than a real failure. */
export function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export const orgPath = (org: string) => `/orgs/${encodeURIComponent(org)}`;
