'use client';

import { useEffect, useRef } from 'react';
import { ChatMessageDisplay } from './ChatMessage';
import { ChatInput } from './ChatInput';
import type { ChatMessage } from '@/types';

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingPanel: 'review' | 'subtitle_editor' | null;
  onSendMessage: (text: string) => void;
  onConfirmPanel: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  pendingPanel,
  onSendMessage,
  onConfirmPanel,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-sm font-medium text-neutral-200">Acta Assistant</span>
        {isStreaming && (
          <span className="text-xs text-neutral-500 ml-auto">thinking...</span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && !isStreaming && (
          <div className="text-center text-neutral-600 text-sm mt-8">
            Starting Acta assistant...
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessageDisplay key={msg.id} message={msg} />
        ))}
        {isStreaming && messages.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-neutral-500 pl-2">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput
        onSend={onSendMessage}
        disabled={isStreaming}
        pendingPanel={pendingPanel}
        onConfirmPanel={onConfirmPanel}
      />
    </div>
  );
}
