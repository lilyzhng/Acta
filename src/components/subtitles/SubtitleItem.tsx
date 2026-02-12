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
      className={`px-4 py-3 border-b border-neutral-800 cursor-pointer transition-colors ${
        isActive ? 'bg-blue-900/30 border-l-2 border-l-green-500' : 'hover:bg-neutral-800/50'
      } ${isEditing ? 'bg-blue-900/20' : ''}`}
      onClick={() => {
        if (!isEditing) onJump(subtitle.start);
      }}
    >
      <div className="text-xs text-neutral-500 font-mono mb-1">
        {index + 1}. {formatTime(subtitle.start)} &rarr; {formatTime(subtitle.end)}
      </div>
      <div className="text-sm">
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
            className="w-full px-2 py-1 bg-neutral-700 border border-green-600 rounded text-white text-sm"
          />
        ) : (
          <span onDoubleClick={() => setIsEditing(true)}>{subtitle.text}</span>
        )}
      </div>
    </div>
  );
});
