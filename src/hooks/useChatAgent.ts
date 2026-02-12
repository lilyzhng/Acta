'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  ChatMessage,
  ChatSSEEvent,
  PanelState,
  ToolCallStatus,
  PanelSubmission,
} from '@/types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useChatAgent(projectId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [panelState, setPanelState] = useState<PanelState>({ type: 'none' });
  const [pendingToolCallId, setPendingToolCallId] = useState<string | null>(null);
  const [progressOverlay, setProgressOverlay] = useState<{ label: string; percent: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initializedRef = useRef(false);

  const processSSEStream = useCallback(
    async (response: Response) => {
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buf = '';
      let currentAssistantId: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          let event: ChatSSEEvent;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }

          switch (event.type) {
            case 'text_delta': {
              if (!currentAssistantId) {
                currentAssistantId = generateId();
                setMessages((prev) => [
                  ...prev,
                  {
                    id: currentAssistantId!,
                    role: 'assistant',
                    content: event.delta,
                    toolCalls: [],
                    timestamp: Date.now(),
                  },
                ]);
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentAssistantId
                      ? { ...m, content: m.content + event.delta }
                      : m,
                  ),
                );
              }
              break;
            }

            case 'tool_call': {
              if (!currentAssistantId) {
                currentAssistantId = generateId();
                setMessages((prev) => [
                  ...prev,
                  {
                    id: currentAssistantId!,
                    role: 'assistant',
                    content: '',
                    toolCalls: [],
                    timestamp: Date.now(),
                  },
                ]);
              }
              const newToolCall: ToolCallStatus = {
                id: event.id,
                name: event.name,
                status: 'running',
                subtasks: event.subtasks,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === currentAssistantId
                    ? { ...m, toolCalls: [...(m.toolCalls || []), newToolCall] }
                    : m,
                ),
              );
              break;
            }

            case 'tool_progress': {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === currentAssistantId
                    ? {
                        ...m,
                        toolCalls: m.toolCalls?.map((tc) =>
                          tc.id === event.id
                            ? { ...tc, progress: event.percent, subtasks: event.subtasks || tc.subtasks }
                            : tc,
                        ),
                      }
                    : m,
                ),
              );
              // Update progress overlay (shown on video panel, not replacing it)
              if (event.percent !== undefined) {
                setProgressOverlay({
                  label: event.message || 'Processing...',
                  percent: event.percent,
                });
              }
              break;
            }

            case 'tool_result': {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === currentAssistantId
                    ? {
                        ...m,
                        toolCalls: m.toolCalls?.map((tc) =>
                          tc.id === event.id
                            ? { ...tc, status: 'done' as const, summary: event.summary }
                            : tc,
                        ),
                      }
                    : m,
                ),
              );
              break;
            }

            case 'ui_panel': {
              setPanelState({
                type: event.panel as PanelState['type'],
                data: event.data as PanelState['data'],
              });
              break;
            }

            case 'done': {
              if (event.pendingToolCallId) {
                setPendingToolCallId(event.pendingToolCallId);
              } else {
                setPendingToolCallId(null);
              }
              // Clear progress overlay when done
              setProgressOverlay(null);
              // Reset for next iteration in multi-turn
              currentAssistantId = null;
              break;
            }

            case 'error': {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateId(),
                  role: 'assistant',
                  content: `Error: ${event.message}`,
                  timestamp: Date.now(),
                },
              ]);
              break;
            }
          }
        }
      }
    },
    [],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      // Add user message to display
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: 'user',
          content: text,
          timestamp: Date.now(),
        },
      ]);

      setIsStreaming(true);
      abortRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, message: text }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        await processSSEStream(response);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'assistant',
              content: `Connection error: ${(err as Error).message}`,
              timestamp: Date.now(),
            },
          ]);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [projectId, isStreaming, processSSEStream],
  );

  const submitPanelData = useCallback(
    async (submission: PanelSubmission) => {
      if (isStreaming || !pendingToolCallId) return;

      setIsStreaming(true);
      setPendingToolCallId(null);
      abortRef.current = new AbortController();

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, panelData: submission }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        await processSSEStream(response);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'assistant',
              content: `Connection error: ${(err as Error).message}`,
              timestamp: Date.now(),
            },
          ]);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [projectId, isStreaming, pendingToolCallId, processSSEStream],
  );

  // Auto-initialize: send get_project_status on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    sendMessage('What is the current status of this project?');
  }, [sendMessage]);

  return {
    messages,
    isStreaming,
    panelState,
    pendingToolCallId,
    progressOverlay,
    sendMessage,
    submitPanelData,
    setPanelState,
  };
}
