import { useEffect, useRef, useState } from 'react';

/**
 * Delays a value so expensive derived work (fuzzy scoring over thousands of entries) runs
 * once the user pauses instead of on every keystroke.
 */
export function useDebounced<T>(value: T, delay = 120): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === debounced) return;
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type HotkeyOptions = { meta?: boolean; shift?: boolean; allowInInput?: boolean };

/** Registers a window-level shortcut. `meta` matches Cmd on macOS and Ctrl elsewhere. */
export function useHotkey(key: string, handler: () => void, options: HotkeyOptions = {}) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;
      if (!!options.meta !== (event.metaKey || event.ctrlKey)) return;
      if (options.shift !== undefined && options.shift !== event.shiftKey) return;
      if (!options.allowInInput) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      }
      event.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, options.meta, options.shift, options.allowInInput]);
}

/** Re-renders on an interval; used by elapsed-time and freshness labels. */
export function useTicker(intervalMs: number, active = true) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((n) => n + 1), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // A full or disabled storage must not break the application.
    }
  }, [key, value]);
  return [value, setValue] as const;
}
