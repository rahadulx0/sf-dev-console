import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appHome } from '../state/store.js';

/*
 * A shared read cache for org data.
 *
 * Two properties beyond a plain TTL map matter for perceived speed:
 *
 *   - stale-while-revalidate: an entry past its TTL but inside its stale window is returned
 *     immediately while a refresh runs in the background. The user sees last-known data now
 *     instead of waiting on a round trip, and the next read is fresh.
 *   - disk persistence: describes and metadata listings are expensive and change rarely, so
 *     they outlive the process. Without this, every restart pays full price again.
 *
 * Single-flight is enforced per key, so N concurrent readers cause one load.
 */

const cacheDir = path.join(appHome, 'cache');
/** Above this, an entry stays in memory only — writing it back would cost more than a refetch. */
const MAX_PERSISTED_BYTES = 4_000_000;
const DISK_GENERATION = 'v1';

interface Entry {
  value: unknown;
  /** Epoch millis the value was produced. */
  storedAt: number;
  ttlMs: number;
  staleMs: number;
  persist: boolean;
  /** Set while a load is running, so concurrent readers share one request. */
  inFlight?: Promise<unknown>;
  /** True once a background revalidation is queued, to avoid stacking them up. */
  revalidating?: boolean;
}

export interface CacheOptions {
  ttlMs: number;
  /**
   * How long past the TTL a value may still be served while it refreshes behind the request.
   * Defaults to the TTL, and is skipped entirely for a key that has never loaded.
   */
  staleMs?: number;
  /** Keep the value across restarts. Only for data that is expensive and slow-changing. */
  persist?: boolean;
}

const entries = new Map<string, Entry>();
let diskReady: Promise<void> | undefined;

const fileFor = (key: string) => path.join(cacheDir, `${createHash('sha1').update(`${DISK_GENERATION}:${key}`).digest('hex')}.json`);

async function ensureDir() {
  diskReady ??= mkdir(cacheDir, { recursive: true }).then(() => undefined).catch(() => undefined);
  return diskReady;
}

/** Reads a persisted entry into memory. Corrupt or expired files are ignored, never thrown. */
async function hydrate(key: string, options: CacheOptions): Promise<Entry | undefined> {
  try {
    const raw = JSON.parse(await readFile(fileFor(key), 'utf8')) as { key: string; storedAt: number; value: unknown };
    if (raw.key !== key || typeof raw.storedAt !== 'number') return undefined;
    const staleMs = options.staleMs ?? options.ttlMs;
    // A file older than its whole usable window is dead weight; treat it as a miss.
    if (Date.now() - raw.storedAt > options.ttlMs + staleMs) return undefined;
    const entry: Entry = { value: raw.value, storedAt: raw.storedAt, ttlMs: options.ttlMs, staleMs, persist: true };
    entries.set(key, entry);
    return entry;
  } catch {
    return undefined;
  }
}

function persist(key: string, entry: Entry) {
  if (!entry.persist) return;
  void (async () => {
    try {
      const body = JSON.stringify({ key, storedAt: entry.storedAt, value: entry.value });
      if (body.length > MAX_PERSISTED_BYTES) return;
      await ensureDir();
      await writeFile(fileFor(key), body);
    } catch {
      // A cache that cannot be written is still a working cache.
    }
  })();
}

/**
 * Returns a cached value, serving stale data while refreshing when possible.
 * `load` is only ever running once per key at a time.
 */
export async function cached<T>(key: string, options: CacheOptions, load: () => Promise<T>): Promise<T> {
  const staleMs = options.staleMs ?? options.ttlMs;
  let entry = entries.get(key);
  if (!entry && options.persist) entry = await hydrate(key, options);

  const age = entry ? Date.now() - entry.storedAt : Infinity;
  if (entry && age < entry.ttlMs) return entry.value as T;

  const run = (): Promise<T> => {
    const existing = entries.get(key);
    if (existing?.inFlight) return existing.inFlight as Promise<T>;
    const promise = load()
      .then((value) => {
        const next: Entry = { value, storedAt: Date.now(), ttlMs: options.ttlMs, staleMs, persist: !!options.persist };
        entries.set(key, next);
        persist(key, next);
        return value;
      })
      .finally(() => {
        const current = entries.get(key);
        if (current?.inFlight === promise) {
          current.inFlight = undefined;
          current.revalidating = false;
        }
      });
    // Park the promise on the existing entry so stale reads keep their value while it runs.
    const holder = entries.get(key) ?? { value: undefined, storedAt: 0, ttlMs: options.ttlMs, staleMs, persist: !!options.persist };
    holder.inFlight = promise as Promise<unknown>;
    entries.set(key, holder);
    return promise;
  };

  // Inside the stale window: hand back what we have and refresh behind the response.
  if (entry && age < entry.ttlMs + staleMs) {
    if (!entry.inFlight && !entry.revalidating) {
      entry.revalidating = true;
      void run().catch(() => {
        const current = entries.get(key);
        if (current) current.revalidating = false;
      });
    }
    return entry.value as T;
  }

  return await run();
}

/** Reads a cached value without triggering a load. Used to answer "is this already warm?". */
export function peek<T>(key: string): { value: T; storedAt: number } | undefined {
  const entry = entries.get(key);
  if (!entry || entry.storedAt === 0) return undefined;
  return { value: entry.value as T, storedAt: entry.storedAt };
}

/** Drops every in-memory entry whose key starts with `prefix`, and its persisted copy. */
export function invalidateCache(prefix: string) {
  for (const [key, entry] of entries) {
    if (!key.startsWith(prefix)) continue;
    entries.delete(key);
    if (entry.persist) void rm(fileFor(key), { force: true }).catch(() => {});
  }
}

/**
 * Removes persisted files that no longer correspond to a live cache generation.
 * Runs once at boot so an upgrade cannot leave the directory growing forever.
 */
export async function pruneDiskCache(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  try {
    await ensureDir();
    const now = Date.now();
    const files = await readdir(cacheDir);
    await Promise.all(
      files.map(async (file) => {
        const full = path.join(cacheDir, file);
        try {
          const raw = JSON.parse(await readFile(full, 'utf8')) as { storedAt?: number };
          if (typeof raw.storedAt !== 'number' || now - raw.storedAt > maxAgeMs) await rm(full, { force: true });
        } catch {
          await rm(full, { force: true }).catch(() => {});
        }
      }),
    );
  } catch {
    // Pruning is housekeeping; failing it must not delay startup.
  }
}
