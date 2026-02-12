'use client';

import { use, useCallback } from 'react';
import { useChatAgent } from '@/hooks/useChatAgent';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { AdaptivePanel } from '@/components/panels/AdaptivePanel';

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
    submitPanelData,
  } = useChatAgent(projectId);

  const handleConfirmPanel = useCallback(() => {
    // This is handled by the panel components themselves via onSubmitPanel
  }, []);

  const pendingPanel = pendingToolCallId
    ? panelState.type === 'review'
      ? ('review' as const)
      : panelState.type === 'subtitle_editor'
      ? ('subtitle_editor' as const)
      : null
    : null;

  return (
    <div className="flex h-screen bg-neutral-950">
      {/* Left: Adaptive content panel */}
      <div className="flex-1 overflow-auto border-r border-neutral-800">
        <AdaptivePanel
          projectId={projectId}
          panelState={panelState}
          onSubmitPanel={submitPanelData}
        />
      </div>

      {/* Right: Chat panel */}
      <div className="w-[420px] flex-shrink-0 flex flex-col">
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          pendingPanel={pendingPanel}
          onSendMessage={sendMessage}
          onConfirmPanel={handleConfirmPanel}
        />
      </div>
    </div>
  );
}
