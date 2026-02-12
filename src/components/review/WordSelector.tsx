'use client';

import { useRef, useCallback, memo } from 'react';
import type { SubtitleWord } from '@/types';

interface WordSelectorProps {
  words: SubtitleWord[];
  selected: Set<number>;
  autoSelected: Set<number>;
  currentIndex: number;
  onToggle: (index: number) => void;
  onStartDrag: (index: number) => void;
  onMoveDrag: (index: number) => void;
  onEndDrag: () => void;
  onJump: (time: number) => void;
}

export const WordSelector = memo(function WordSelector({
  words,
  selected,
  autoSelected,
  currentIndex,
  onToggle,
  onStartDrag,
  onMoveDrag,
  onEndDrag,
  onJump,
}: WordSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (e.shiftKey) {
        e.preventDefault();
        onStartDrag(index);
      }
    },
    [onStartDrag]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
      if (!target) return;
      const index = parseInt(target.dataset.index!, 10);
      onMoveDrag(index);
    },
    [onMoveDrag]
  );

  return (
    <div
      ref={containerRef}
      className="leading-[2.5] py-5 select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={onEndDrag}
      onMouseLeave={onEndDrag}
    >
      {words.map((word, i) => {
        const isSelected = selected.has(i);
        const isAutoSelected = autoSelected.has(i) && !isSelected;
        const isCurrent = i === currentIndex;

        // Click: selected (red) words toggle on single click to deselect,
        // all other words jump playback (double-click to toggle any word)
        const handleClick = isSelected
          ? () => onToggle(i)
          : () => onJump(word.start);

        if (word.isGap) {
          const duration = (word.end - word.start).toFixed(1);
          return (
            <span
              key={i}
              data-index={i}
              className={`inline-block px-2 py-1 mx-0.5 rounded text-xs cursor-pointer transition-all ${
                isSelected
                  ? 'bg-red-600 text-white'
                  : isAutoSelected
                  ? 'border border-orange-500/50 text-neutral-400'
                  : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'
              }`}
              onClick={handleClick}
              onDoubleClick={() => onToggle(i)}
              onMouseDown={(e) => handleMouseDown(e, i)}
            >
              {duration}s
            </span>
          );
        }

        return (
          <span
            key={i}
            data-index={i}
            className={`inline-block px-0.5 py-1 mx-0.5 rounded cursor-pointer transition-all ${
              isSelected
                ? `bg-red-600 text-white line-through ${isCurrent ? 'ring-2 ring-blue-400' : ''}`
                : isAutoSelected
                ? `border-b-2 border-orange-500/50 ${isCurrent ? 'bg-blue-600 text-white' : ''}`
                : isCurrent
                ? 'bg-blue-600 text-white'
                : 'hover:bg-neutral-700'
            }`}
            onClick={handleClick}
            onDoubleClick={() => onToggle(i)}
            onMouseDown={(e) => handleMouseDown(e, i)}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
});
