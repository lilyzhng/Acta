'use client';

interface ReviewStatsProps {
  count: number;
  totalDuration: number;
}

export function ReviewStats({ count, totalDuration }: ReviewStatsProps) {
  return (
    <div className="mt-3 p-3 bg-neutral-800 rounded text-sm text-neutral-300">
      Selected {count} elements, total duration {totalDuration.toFixed(2)}s
    </div>
  );
}
