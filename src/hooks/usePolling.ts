'use client';

import { useState, useRef, useCallback } from 'react';

interface UsePollingOptions {
  interval?: number;
  maxAttempts?: number;
}

export function usePolling<T>(
  fetchFn: () => Promise<T>,
  isDone: (result: T) => boolean,
  options?: UsePollingOptions
) {
  const [isPolling, setIsPolling] = useState(false);
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const attemptRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsPolling(false);
    attemptRef.current = 0;
  }, []);

  const start = useCallback(() => {
    const interval = options?.interval ?? 5000;
    const maxAttempts = options?.maxAttempts ?? 120;

    setIsPolling(true);
    setError(null);
    attemptRef.current = 0;

    const poll = async () => {
      if (attemptRef.current >= maxAttempts) {
        setError('Polling timeout');
        stop();
        return;
      }

      attemptRef.current++;

      try {
        const data = await fetchFn();
        setResult(data);

        if (isDone(data)) {
          stop();
          return;
        }
      } catch (err) {
        setError((err as Error).message);
        stop();
        return;
      }

      timerRef.current = setTimeout(poll, interval);
    };

    poll();
  }, [fetchFn, isDone, options, stop]);

  return { start, stop, isPolling, result, error };
}
