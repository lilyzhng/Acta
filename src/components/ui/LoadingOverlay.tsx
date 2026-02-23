'use client';

import { ProgressBar } from './ProgressBar';

interface LoadingOverlayProps {
  show: boolean;
  title: string;
  percent?: number;
  elapsed?: number;
  remaining?: number;
}

function formatTime(sec: number): string {
  if (sec <= 0) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

export function LoadingOverlay({ show, title, percent = 0, elapsed = 0, remaining }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex flex-col items-center justify-center">
      <div className="text-[var(--retro-green)] text-2xl font-bold animate-pulse">[PROCESSING]</div>
      <div className="mt-5 text-lg text-[var(--retro-text-light)]">{title}</div>
      <div className="mt-5 w-72">
        <ProgressBar percent={percent} />
      </div>
      <div className="mt-4 text-sm text-[var(--retro-text-light)]/60">
        Elapsed: {formatTime(elapsed)}
      </div>
      {remaining !== undefined && (
        <div className="mt-2 text-sm text-[var(--retro-text-light)]/40">
          {remaining > 0 ? `Remaining: ~${formatTime(remaining)}` : 'Almost done...'}
        </div>
      )}
    </div>
  );
}
