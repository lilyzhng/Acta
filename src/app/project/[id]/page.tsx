'use client';

import { use } from 'react';
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

  return (
    <div className="flex h-screen bg-neutral-950">
      {/* Column 1 & 2: Video + Waveform | Transcription/Subtitles */}
      <div className="flex-1 overflow-hidden">
        <UnifiedProjectPanel projectId={projectId} refreshTrigger={refreshKey} />
      </div>

      {/* Column 3: Chat panel */}
      <div className="w-[380px] flex-shrink-0 flex flex-col border-l border-neutral-800">
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
