import { useCallback, useEffect, useReducer, useRef } from 'react';
import { isAbort } from './api';

/*
 * A small cache for read-only org data.
 *
 * Every `sf` invocation costs a fresh Node boot (roughly 1-3 seconds), so re-fetching on
 * every page mount made navigation feel broken. Entries live here keyed by request, shared
 * across components, with three properties that matter:
 *
 *   - de-duplication: concurrent subscribers to the same key await one request;
 *   - stale-while-revalidate: cached data renders immediately while a refresh runs;
 *   - cancellation: when the last subscriber unmounts, the request is aborted, which kills
 *     the `sf` child process on the server rather than leaving it to finish unwatched.
 */

type Fetcher<T> = (signal: AbortSignal) => Promise<T>;

interface Entry {
  value?: unknown;
  error?: Error;
  /** Epoch millis of the last successful load; 0 means never loaded. */
  updatedAt: number;
  loading: boolean;
  promise?: Promise<unknown>;
  controller?: AbortController;
  fetcher?: Fetcher<unknown>;
  listeners: Set<() => void>;
  abortTimer?: ReturnType<typeof setTimeout>;
}

const entries = new Map<string, Entry>();

/**
 * React StrictMode mounts, unmounts, and remounts effects in development, and navigating
 * away and straight back is common. Waiting a beat before cancelling avoids throwing away a
 * request that is about to be wanted again.
 */
const ABORT_GRACE_MS = 120;

function entryOf(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { updatedAt: 0, loading: false, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
}

function emit(entry: Entry) {
  for (const listener of [...entry.listeners]) listener();
}

function load(entry: Entry, fetcher: Fetcher<unknown>): Promise<unknown> {
  if (entry.promise) return entry.promise;
  const controller = new AbortController();
  entry.controller = controller;
  entry.fetcher = fetcher;
  entry.loading = true;
  entry.error = undefined;
  emit(entry);

  const promise = fetcher(controller.signal)
    .then((value) => {
      entry.value = value;
      entry.error = undefined;
      entry.updatedAt = Date.now();
      return value;
    })
    .catch((error) => {
      // An abort is a deliberate cancellation, not a failure worth showing.
      if (!isAbort(error)) entry.error = error instanceof Error ? error : new Error(String(error));
      throw error;
    })
    .finally(() => {
      if (entry.promise !== promise) return;
      entry.promise = undefined;
      entry.controller = undefined;
      entry.loading = false;
      emit(entry);
    });

  entry.promise = promise;
  return promise;
}

/**
 * Marks matching entries stale. Mounted entries reload immediately; the rest reload the next
 * time something subscribes. Used after a mutation and when the active org changes.
 */
export function invalidate(prefix: string) {
  for (const [key, entry] of entries) {
    if (!key.startsWith(prefix)) continue;
    entry.updatedAt = 0;
    if (entry.listeners.size && entry.fetcher && !entry.promise) {
      void load(entry, entry.fetcher).catch(() => {});
    } else {
      emit(entry);
    }
  }
}

/** Drops matching entries entirely, including any cached value. */
export function clearResources(prefix: string) {
  for (const [key, entry] of entries) {
    if (!key.startsWith(prefix)) continue;
    entry.controller?.abort();
    entry.value = undefined;
    entry.error = undefined;
    entry.updatedAt = 0;
    if (entry.listeners.size && entry.fetcher) {
      void load(entry, entry.fetcher).catch(() => {});
    } else {
      entries.delete(key);
    }
  }
}

export interface Resource<T> {
  data: T | undefined;
  error: Error | undefined;
  /** True only while a request is in flight. Cached data may be present at the same time. */
  loading: boolean;
  /** True on the first load, when there is nothing to show yet. */
  pending: boolean;
  updatedAt: number;
  /** True when data is being shown from cache while a refresh runs. */
  revalidating: boolean;
  refresh: () => void;
  /** Replaces the cached value locally, e.g. after deleting rows from a result set. */
  set: (value: T) => void;
}

export function useResource<T>(
  key: string | null,
  fetcher: Fetcher<T>,
  options: { ttl?: number } = {},
): Resource<T> {
  const ttl = options.ttl ?? 0;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!key) return;
    const entry = entryOf(key);
    if (entry.abortTimer) {
      clearTimeout(entry.abortTimer);
      entry.abortTimer = undefined;
    }
    entry.listeners.add(rerender);

    const fresh = entry.updatedAt > 0 && Date.now() - entry.updatedAt < ttl;
    if (!fresh && !entry.promise) {
      void load(entry, fetcherRef.current as Fetcher<unknown>).catch(() => {});
    }

    return () => {
      entry.listeners.delete(rerender);
      if (entry.listeners.size || !entry.controller) return;
      entry.abortTimer = setTimeout(() => {
        entry.abortTimer = undefined;
        if (!entry.listeners.size) entry.controller?.abort();
      }, ABORT_GRACE_MS);
    };
  }, [key, ttl]);

  const refresh = useCallback(() => {
    if (!key) return;
    const entry = entryOf(key);
    entry.updatedAt = 0;
    if (!entry.promise) void load(entry, fetcherRef.current as Fetcher<unknown>).catch(() => {});
  }, [key]);

  const set = useCallback(
    (value: T) => {
      if (!key) return;
      const entry = entryOf(key);
      entry.value = value;
      entry.updatedAt = Date.now();
      emit(entry);
    },
    [key],
  );

  const entry = key ? entryOf(key) : undefined;
  const hasValue = entry?.updatedAt ? true : entry?.value !== undefined;
  // The fetch starts in an effect, which runs after the first paint. Treating "never loaded,
  // no error yet" as pending stops empty states from flashing for a frame before it begins.
  const pending = !!entry && !hasValue && !entry.error && (entry.loading || entry.updatedAt === 0);
  return {
    data: entry?.value as T | undefined,
    error: entry?.error,
    loading: !!entry?.loading,
    pending,
    revalidating: !!entry?.loading && hasValue,
    updatedAt: entry?.updatedAt ?? 0,
    refresh,
    set,
  };
}
