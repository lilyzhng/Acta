'use client';

interface ProgressBarProps {
  percent: number;
  label?: string;
  sublabel?: string;
  color?: string;
}

export function ProgressBar({ percent, label, sublabel }: ProgressBarProps) {
  return (
    <div className="w-full">
      <div className="h-2 bg-[var(--retro-charcoal)] rounded-[2px] overflow-hidden border border-[var(--retro-border)]">
        <div
          className="h-full bg-[var(--retro-green)] rounded-[2px] transition-all duration-300"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      {(label || sublabel) && (
        <div className="flex justify-between mt-1 text-sm text-[var(--retro-text-light)]/60">
          <span>{label}</span>
          <span>{sublabel}</span>
        </div>
      )}
    </div>
  );
}
