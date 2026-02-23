'use client';

import { memo } from 'react';
import { ToolStatusDisplay } from './ToolStatus';
import type { ChatMessage as ChatMessageType } from '@/types';

function ChatMessageComponent({ message }: { message: ChatMessageType }) {
  if (message.role === 'user') {
    return (
      <div className="mb-2">
        <div className="text-sm text-[var(--retro-text-light)] whitespace-pre-wrap break-words">
          <span className="text-[var(--retro-amber)] font-bold">&gt; </span>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div className="max-w-[95%]">
        {message.content && (
          <div className="text-sm text-[var(--retro-text-light)] whitespace-pre-wrap break-words">
            <span className="text-[var(--retro-green)] font-bold">[Acta] </span>
            {message.content}
          </div>
        )}
        {message.downloads && (
          <div className="mt-2 space-y-1.5">
            {[
              { label: 'Subtitled Video', file: message.downloads.burnedVideoFile },
              { label: 'Cut Video', file: message.downloads.cutVideoFile },
              { label: 'Original Video', file: message.downloads.videoFile },
              { label: 'SRT Subtitles', file: message.downloads.srtFile },
            ]
              .filter((f) => f.file)
              .map((f) => (
                <a
                  key={f.label}
                  href={`/api/video/${message.downloads!.projectId}?file=${encodeURIComponent(f.file!)}`}
                  download={f.file}
                  className="flex items-center gap-2 px-3 py-2 bg-[var(--retro-charcoal)] border-2 border-[var(--retro-green)] rounded-[2px] text-sm text-[var(--retro-green)] hover:bg-[var(--retro-charcoal-light)] transition-colors"
                >
                  <span className="font-bold">[FILE]</span>
                  <span>{f.label}</span>
                  <span className="ml-auto text-xs opacity-60">{f.file}</span>
                </a>
              ))}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-1 border-l-2 border-[var(--retro-cyan)] pl-3 py-1">
            {message.toolCalls.map((tc) => (
              <ToolStatusDisplay key={tc.id} tool={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessageDisplay = memo(ChatMessageComponent);
