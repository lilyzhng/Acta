'use client';

interface ReviewControlsProps {
  onCut: () => void;
  onClear: () => void;
  onReset: () => void;
  isCutting: boolean;
}

export function ReviewControls({ onCut, onClear, onReset, isCutting }: ReviewControlsProps) {
  return (
    <div className="flex gap-2 flex-wrap items-center mt-3">
      <button
        onClick={onCut}
        disabled={isCutting}
        className="px-4 py-2 bg-[var(--retro-charcoal)] border-2 border-[var(--retro-green)] text-[var(--retro-green)] hover:bg-[var(--retro-green)]/10 disabled:opacity-40 rounded-[2px] text-sm font-bold transition-colors uppercase"
      >
        {isCutting ? 'Cutting...' : 'Execute Cut'}
      </button>
      <button
        onClick={onReset}
        className="px-4 py-2 bg-[var(--retro-charcoal)] border-2 border-[var(--retro-border)] text-[var(--retro-text-light)] hover:bg-[var(--retro-charcoal-light)] rounded-[2px] text-sm font-bold transition-colors"
      >
        Reset to AI
      </button>
      <button
        onClick={onClear}
        className="px-4 py-2 bg-[var(--retro-charcoal)] border-2 border-[var(--retro-red)] text-[var(--retro-red)] hover:bg-[var(--retro-red)]/10 rounded-[2px] text-sm font-bold transition-colors"
      >
        Clear All
      </button>
    </div>
  );
}
