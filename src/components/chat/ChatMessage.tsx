'use client';

import { memo } from 'react';
import { ToolStatusDisplay } from './ToolStatus';
import type { ChatMessage as ChatMessageType } from '@/types';

function ChatMessageComponent({ message }: { message: ChatMessageType }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3">
        <div className="max-w-[85%] px-3.5 py-2 bg-purple-600 rounded-2xl rounded-br-md text-sm text-white whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <div className="max-w-[95%]">
        {message.content && (
          <div className="px-3.5 py-2 bg-neutral-800 rounded-2xl rounded-bl-md text-sm text-neutral-200 whitespace-pre-wrap break-words">
            {message.content}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-1 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
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
