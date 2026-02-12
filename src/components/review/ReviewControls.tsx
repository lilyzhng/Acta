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
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-600 text-white rounded text-sm font-medium transition-colors"
      >
        {isCutting ? 'Cutting...' : 'Execute Cut'}
      </button>
      <button
        onClick={onReset}
        className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors"
      >
        Reset to AI
      </button>
      <button
        onClick={onClear}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
      >
        Clear All
      </button>
    </div>
  );
}
