import { useCallback, useSyncExternalStore } from 'react';
import type { PageKey } from '../app/pages';

/*
 * Hash routing.
 *
 * Page state used to live in React state alone, so a refresh dropped the user back on the
 * overview and the Refresh control had to reload the whole application. Keeping the route in
 * the hash makes back, forward, refresh, and deep links work, and lets Refresh mean
 * "re-fetch this view" instead of "reboot".
 */

export interface Route {
  page: PageKey;
  /** Extra path segments, e.g. the object name in #/objects/Account. */
  params: string[];
}

const DEFAULT_PAGE: PageKey = 'overview';

export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '').split('?')[0];
  const segments = clean.split('/').filter(Boolean).map(decodeURIComponent);
  if (!segments.length) return { page: DEFAULT_PAGE, params: [] };
  return { page: segments[0] as PageKey, params: segments.slice(1) };
}

export function href(page: PageKey, ...params: string[]) {
  return `#/${[page, ...params.map(encodeURIComponent)].join('/')}`;
}

export function navigate(page: PageKey, ...params: string[]) {
  const next = href(page, ...params);
  if (window.location.hash !== next) window.location.hash = next;
}

/** Replaces the current entry instead of pushing, for incidental state such as a selected row. */
export function replace(page: PageKey, ...params: string[]) {
  const next = href(page, ...params);
  if (window.location.hash === next) return;
  window.history.replaceState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  // parseHash is cheap and pure, so deriving on render keeps the store snapshot stable.
  return parseHash(hash);
}

export function useNavigate() {
  return useCallback((page: PageKey, ...params: string[]) => navigate(page, ...params), []);
}
