'use client';

import { ProgressBar } from '@/components/ui/ProgressBar';
import type { ProgressPanelData } from '@/types';

interface ProgressPanelProps {
  data: ProgressPanelData;
}

export function ProgressPanel({ data }: ProgressPanelProps) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-80">
        <div className="text-sm text-neutral-400 mb-3 text-center">{data.label}</div>
        <ProgressBar percent={data.percent} />
        <div className="text-xs text-neutral-500 mt-2 text-center">{data.percent}%</div>
      </div>
    </div>
  );
}
