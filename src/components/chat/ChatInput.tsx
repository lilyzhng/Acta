'use client';

import { useState, useCallback, useRef } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  pendingPanel?: 'review' | 'subtitle_editor' | null;
  onConfirmPanel?: () => void;
}

export function ChatInput({ onSend, disabled, pendingPanel, onConfirmPanel }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const confirmLabel =
    pendingPanel === 'review'
      ? 'CONFIRM SELECTIONS'
      : pendingPanel === 'subtitle_editor'
      ? 'DONE EDITING'
      : null;

  return (
    <div className="border-t border-[var(--retro-border)] p-3">
      {confirmLabel && onConfirmPanel && (
        <button
          onClick={onConfirmPanel}
          disabled={disabled}
          className="w-full mb-2 py-2.5 border-2 border-[var(--retro-green)] text-[var(--retro-green)] hover:bg-[var(--retro-green)]/10 disabled:opacity-40 rounded-[2px] text-sm font-bold uppercase transition-colors"
        >
          {confirmLabel}
        </button>
      )}
      <div className="flex items-center gap-2">
        <span className="text-[var(--retro-amber)] font-bold text-sm whitespace-nowrap">&gt;</span>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Processing...' : ''}
          disabled={disabled}
          rows={1}
          className="flex-1 px-2 py-1 bg-transparent border-none text-sm text-[var(--retro-text-light)] placeholder-[var(--retro-text-light)]/30 resize-none focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  );
}
