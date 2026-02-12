'use client';

import { use, useState, useCallback, useRef, useEffect } from 'react';
import { useChatAgent } from '@/hooks/useChatAgent';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { UnifiedProjectPanel } from '@/components/panels/UnifiedProjectPanel';

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const {
    messages,
    isStreaming,
    panelState,
    pendingToolCallId,
    sendMessage,
  } = useChatAgent(projectId);

  const pendingPanel = pendingToolCallId
    ? panelState.type === 'review'
      ? ('review' as const)
      : panelState.type === 'subtitle_editor'
      ? ('subtitle_editor' as const)
      : null
    : null;

  // Use panelState changes to trigger refresh in UnifiedProjectPanel
  // Generate a refresh key that changes when panel events occur
  const refreshKey = panelState.type + JSON.stringify(panelState.data || {});

  // Resizable chat panel
  const [chatWidth, setChatWidth] = useState(380);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      // Clamp between 280px and 600px
      setChatWidth(Math.max(280, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="flex h-screen bg-neutral-950">
      {/* Column 1 & 2: Video + Waveform | Transcription/Subtitles */}
      <div className="flex-1 overflow-hidden">
        <UnifiedProjectPanel projectId={projectId} refreshTrigger={refreshKey} />
      </div>

      {/* Resize handle for chat panel */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 bg-neutral-800 hover:bg-blue-500 cursor-col-resize flex-shrink-0 transition-colors"
      />

      {/* Column 3: Chat panel */}
      <div 
        className="flex-shrink-0 flex flex-col border-l border-neutral-800"
        style={{ width: chatWidth }}
      >
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          pendingPanel={pendingPanel}
          onSendMessage={sendMessage}
          onConfirmPanel={() => {}}
        />
      </div>
    </div>
  );
}
