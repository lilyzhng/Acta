'use client';

import { useEffect, useRef, useState } from 'react';
import { ChatMessageDisplay } from './ChatMessage';
import { ChatInput } from './ChatInput';
import type { ChatMessage } from '@/types';

const DANCE_FRAMES = [
  '✂(^-^)✂',
  '✂(^-^✂)',
  '(✂^-^)✂',
  '✂(^-^)✂',
  '(✂^-^✂)',
];

function DancingActa() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % DANCE_FRAMES.length);
    }, 300);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="text-[var(--retro-green)]">{DANCE_FRAMES[frame]}</span>
  );
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingPanel: 'review' | 'subtitle_editor' | null;
  onSendMessage: (text: string) => void;
  onConfirmPanel: () => void;
  collapsed?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}

export function ChatPanel({
  messages,
  isStreaming,
  pendingPanel,
  onSendMessage,
  onConfirmPanel,
  collapsed,
  onCollapse,
  onExpand,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (collapsed) {
    return (
      <div className="bg-[var(--retro-charcoal)] h-full">
        <div className="flex items-center gap-3 px-4 py-2 bg-[var(--retro-charcoal-light)]">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] opacity-40" style={{ minWidth: 14, minHeight: 14 }} />
            <div className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] opacity-40" style={{ minWidth: 14, minHeight: 14 }} />
            <button
              onClick={onExpand}
              className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
              style={{ minWidth: 14, minHeight: 14 }}
              title="Expand"
            />
          </div>
          <span className="text-xs font-bold text-[var(--retro-text-light)] uppercase tracking-wide">Acta</span>
          <DancingActa />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--retro-charcoal)] flex flex-col h-full">
      {/* Header with window buttons */}
      <div className="px-4 py-2 border-b border-[var(--retro-border)] flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] opacity-40" style={{ minWidth: 14, minHeight: 14 }} />
          <button
            onClick={onCollapse}
            className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
            style={{ minWidth: 14, minHeight: 14 }}
            title="Minimize"
          />
          <div className="w-3.5 h-3.5 rounded-full bg-[#28C840] opacity-40" style={{ minWidth: 14, minHeight: 14 }} />
        </div>
        <span className="text-xs font-bold text-[var(--retro-text-light)] tracking-widest">Acta</span>
        <DancingActa />
        {isStreaming && (
          <span className="text-xs text-[var(--retro-amber)] ml-2 animate-pulse">[...processing]</span>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && !isStreaming && (
          <div className="text-[var(--retro-green)] text-sm mt-8">
            [SYSTEM] Initializing...
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessageDisplay key={msg.id} message={msg} />
        ))}
        {isStreaming && messages.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-[var(--retro-amber)] pl-2 animate-pulse">
            [...processing]
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
