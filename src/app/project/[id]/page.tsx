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
  const [chatCollapsed, setChatCollapsed] = useState(false);
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
    <div ref={containerRef} className="flex h-screen bg-[var(--retro-beige)]">
      {/* Column 1 & 2: Video + Waveform | Transcription/Subtitles */}
      <div className="flex-1 overflow-hidden">
        <UnifiedProjectPanel projectId={projectId} refreshTrigger={refreshKey} />
      </div>

      {/* Resize handle for chat panel (hidden when collapsed) */}
      {!chatCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="w-2 bg-[var(--retro-border)] hover:bg-[var(--retro-cyan)] cursor-col-resize flex-shrink-0 transition-colors z-10"
        />
      )}

      {/* Column 3: Chat panel */}
      <div
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{ width: chatCollapsed ? 'auto' : chatWidth }}
      >
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          pendingPanel={pendingPanel}
          onSendMessage={sendMessage}
          onConfirmPanel={() => {}}
          collapsed={chatCollapsed}
          onCollapse={() => setChatCollapsed(true)}
          onExpand={() => setChatCollapsed(false)}
        />
      </div>
    </div>
  );
}
