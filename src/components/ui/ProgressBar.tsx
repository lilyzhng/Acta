'use client';

interface ProgressBarProps {
  percent: number;
  label?: string;
  sublabel?: string;
  color?: string;
}

export function ProgressBar({ percent, label, sublabel, color = 'from-purple-600 to-pink-600' }: ProgressBarProps) {
  return (
    <div className="w-full">
      <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-300`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {(label || sublabel) && (
        <div className="flex justify-between mt-1 text-sm text-neutral-400">
          <span>{label}</span>
          <span>{sublabel}</span>
        </div>
      )}
    </div>
  );
}
