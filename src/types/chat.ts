import type { SubtitleWord, Subtitle, DeleteSegment } from './index';

// Panel types for the left adaptive panel
export type PanelType = 'video' | 'review' | 'subtitle_editor' | 'progress' | 'download' | 'word_preview' | 'none';

export interface PanelState {
  type: PanelType;
  data?: ReviewPanelData | SubtitlePanelData | ProgressPanelData | DownloadPanelData | WordPreviewData;
}

export interface ReviewPanelData {
  words: SubtitleWord[];
  autoSelected: number[];
}

export interface WordPreviewData {
  words: SubtitleWord[];
  selectedIndices: number[];
}

export interface SubtitlePanelData {
  subtitles: Subtitle[];
}

export interface ProgressPanelData {
  label: string;
  percent: number;
}

export interface DownloadPanelData {
  projectId: string;
  videoFile: string;
  cutVideoFile?: string;
  burnedVideoFile?: string;
  srtFile?: string;
}

// Chat display message for frontend
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallStatus[];
  downloads?: DownloadPanelData;
  timestamp: number;
}

export interface SubtaskStatus {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done';
}

export interface ToolCallStatus {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  progress?: number;
  summary?: string;
  error?: string;
  subtasks?: SubtaskStatus[];
}

// SSE event types streamed from POST /api/chat
export type ChatSSEEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; id: string; name: string; subtasks?: SubtaskStatus[] }
  | { type: 'tool_progress'; id: string; percent: number; message?: string; subtasks?: SubtaskStatus[] }
  | { type: 'tool_result'; id: string; name: string; summary: string }
  | { type: 'ui_panel'; panel: PanelType; data: unknown }
  | { type: 'done'; pendingToolCallId?: string }
  | { type: 'error'; message: string };

// POST /api/chat request body
export interface ChatRequest {
  projectId: string;
  message?: string;
  panelData?: PanelSubmission;
}

export type PanelSubmission =
  | { type: 'review_complete'; selectedIndices: number[]; deleteSegments: DeleteSegment[] }
  | { type: 'subtitles_complete'; subtitles: Subtitle[] };

// Persisted conversation state per project
export interface ConversationState {
  messages: AnthropicMessage[];
  pendingToolCall?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

// Minimal Anthropic message shape for persistence
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };
