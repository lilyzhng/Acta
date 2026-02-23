'use client';

interface ReviewStatsProps {
  count: number;
  totalDuration: number;
}

export function ReviewStats({ count, totalDuration }: ReviewStatsProps) {
  return (
    <div className="mt-3 p-3 bg-[var(--retro-charcoal)] rounded-[2px] border border-[var(--retro-border)] text-sm text-[var(--retro-text-light)]">
      Selected {count} elements, total duration {totalDuration.toFixed(2)}s
    </div>
  );
}
