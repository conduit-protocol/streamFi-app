import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface DebounceControls {
  /** Apply the latest value immediately and drop any pending update. */
  flush: () => void;
  /** Drop any pending update, leaving the debounced value as it is. */
  cancel: () => void;
}

/**
 * Debounce a value to delay updates until a specified delay has passed
 * since the last change. Useful for search inputs to reduce API calls.
 *
 * The returned controls allow imperative control, e.g. calling `flush()` on
 * form submission so a pending debounce can't leave stale state behind.
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds (default: 300ms)
 * @returns A `[debouncedValue, { flush, cancel }]` tuple
 */
export function useDebounce<T>(
  value: T,
  delay = 300,
): [T, DebounceControls] {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const latestValue = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestValue.current = value;

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    cancel();
    setDebouncedValue(latestValue.current);
  }, [cancel]);

  useEffect(() => {
    timer.current = setTimeout(() => {
      timer.current = null;
      setDebouncedValue(value);
    }, delay);

    return cancel;
  }, [value, delay, cancel]);

  const controls = useMemo(() => ({ flush, cancel }), [flush, cancel]);

  return [debouncedValue, controls];
}
