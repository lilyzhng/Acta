'use client';

import { useState, useCallback } from 'react';

interface UseSSEOptions<T> {
  onMessage?: (data: T) => void;
  onDone?: (data: T) => void;
  onError?: (error: string) => void;
}

export function useSSE<T extends Record<string, unknown>>(options?: UseSSEOptions<T>) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      setIsRunning(true);
      setError(null);
      setProgress(null);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6)) as T;

            if ('done' in data && data.done) {
              setProgress(data);
              options?.onDone?.(data);
              setIsRunning(false);
              return;
            }

            if ('error' in data && data.error) {
              const errMsg = String(data.error);
              setError(errMsg);
              options?.onError?.(errMsg);
              setIsRunning(false);
              return;
            }

            setProgress(data);
            options?.onMessage?.(data);
          }
        }
      } catch (err) {
        const errMsg = (err as Error).message;
        setError(errMsg);
        options?.onError?.(errMsg);
      } finally {
        setIsRunning(false);
      }
    },
    [options]
  );

  return { start, isRunning, progress, error };
}
