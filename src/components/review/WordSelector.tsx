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
      className="leading-[2.5] py-5 select-none text-[var(--retro-text-light)]"
      onMouseMove={handleMouseMove}
      onMouseUp={onEndDrag}
      onMouseLeave={onEndDrag}
    >
      {words.map((word, i) => {
        const isSelected = selected.has(i);
        const isAutoSelected = autoSelected.has(i) && !isSelected;
        const isCurrent = i === currentIndex;

        const handleClick = isSelected
          ? () => onToggle(i)
          : () => onJump(word.start);

        if (word.isGap) {
          const duration = (word.end - word.start).toFixed(1);
          return (
            <span
              key={i}
              data-index={i}
              className={`inline-block px-2 py-1 mx-0.5 rounded-[2px] text-xs cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[var(--retro-red)] text-white'
                  : isAutoSelected
                  ? 'border border-[var(--retro-amber)]/50 text-[var(--retro-text-light)]/40'
                  : 'bg-[var(--retro-charcoal-light)] text-[var(--retro-text-light)]/40 hover:bg-[var(--retro-charcoal)]'
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
            className={`inline-block px-0.5 py-1 mx-0.5 rounded-[2px] cursor-pointer transition-all ${
              isSelected
                ? `bg-[var(--retro-red)] text-white line-through ${isCurrent ? 'ring-2 ring-[var(--retro-cyan)]' : ''}`
                : isAutoSelected
                ? `border-b-2 border-[var(--retro-amber)]/50 ${isCurrent ? 'bg-[var(--retro-cyan)] text-black' : ''}`
                : isCurrent
                ? 'bg-[var(--retro-cyan)] text-black'
                : 'hover:bg-[var(--retro-charcoal-light)]'
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
