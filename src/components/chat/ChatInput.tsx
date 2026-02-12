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
      ? 'Confirm Selections'
      : pendingPanel === 'subtitle_editor'
      ? 'Done Editing'
      : null;

  return (
    <div className="border-t border-neutral-800 p-3">
      {confirmLabel && onConfirmPanel && (
        <button
          onClick={onConfirmPanel}
          disabled={disabled}
          className="w-full mb-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {confirmLabel}
        </button>
      )}
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Processing...' : 'Type a message...'}
          disabled={disabled}
          rows={1}
          className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm text-white placeholder-neutral-500 resize-none focus:outline-none focus:border-purple-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-700 text-white rounded-lg text-sm transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
