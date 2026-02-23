'use client';

import { useState, useRef, useEffect, memo } from 'react';
import type { Subtitle } from '@/types';

interface SubtitleItemProps {
  subtitle: Subtitle;
  index: number;
  isActive: boolean;
  onJump: (time: number) => void;
  onEdit: (index: number, text: string) => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return m.toString().padStart(2, '0') + ':' + sec.padStart(5, '0');
}

export const SubtitleItem = memo(function SubtitleItem({
  subtitle,
  index,
  isActive,
  onJump,
  onEdit,
}: SubtitleItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(subtitle.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleFinishEdit = () => {
    onEdit(index, editText);
    setIsEditing(false);
  };

  return (
    <div
      data-sub-idx={index}
      className={`px-4 py-3 border-b border-[var(--retro-border)] cursor-pointer transition-colors ${
        isActive ? 'bg-[var(--retro-green)]/5 border-l-2 border-l-[var(--retro-green)]' : 'hover:bg-[var(--retro-charcoal-light)]'
      } ${isEditing ? 'bg-[var(--retro-cyan)]/5' : ''}`}
      onClick={() => {
        if (!isEditing) onJump(subtitle.start);
      }}
    >
      <div className="text-xs text-[var(--retro-text-light)]/40 font-mono mb-1">
        {index + 1}. {formatTime(subtitle.start)} &rarr; {formatTime(subtitle.end)}
      </div>
      <div className="text-sm text-[var(--retro-text-light)]">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFinishEdit();
            }}
            className="w-full px-2 py-1 bg-[var(--retro-charcoal)] border-2 border-[var(--retro-cyan)] rounded-[2px] text-[var(--retro-text-light)] text-sm"
          />
        ) : (
          <span onDoubleClick={() => setIsEditing(true)}>{subtitle.text}</span>
        )}
      </div>
    </div>
  );
});
