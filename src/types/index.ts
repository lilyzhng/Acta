export interface SubtitleWord {
  text: string;
  start: number;
  end: number;
  isGap: boolean;
}

export interface DeleteSegment {
  start: number;
  end: number;
}

export interface Subtitle {
  text: string;
  start: number;
  end: number;
}

export interface Project {
  id: string;
  name: string;
  videoFile: string;
  audioFile?: string;
  createdAt: string;
  status: ProjectStatus;
  volcengineTaskId?: string;
  volcengineResult?: string; // filename
  subtitlesWords?: string; // filename
  autoSelected?: string; // filename
  deleteSegments?: string; // filename
  cutVideoFile?: string;
  cutAudioFile?: string; // audio extracted from cut video
  subtitlesWithTime?: string; // filename
  srtFile?: string;
  burnedVideoFile?: string;
}

export type ProjectStatus =
  | 'uploaded'
  | 'extracting_audio'
  | 'audio_ready'
  | 'transcribing'
  | 'transcribed'
  | 'analyzing'
  | 'analyzed'
  | 'reviewed'
  | 'cutting'
  | 'cut'
  | 'subtitles_ready'
  | 'burning'
  | 'done';

export interface TranscribeSubmitResponse {
  taskId: string;
}

export interface TranscribePollResponse {
  status: 'processing' | 'done' | 'error';
  result?: VolcengineResult;
  error?: string;
}

export interface VolcengineResult {
  utterances: VolcengineUtterance[];
}

export interface VolcengineUtterance {
  text: string;
  start_time: number;
  end_time: number;
  words?: VolcengineWord[];
}

export interface VolcengineWord {
  text: string;
  start_time: number;
  end_time: number;
}

export interface CutProgress {
  frame?: number;
  totalFrames?: number;
  percent?: number;
  speed?: number;
  fps?: number;
  elapsed?: number;
  remaining?: number;
  done?: boolean;
  error?: string;
  output?: string;
  originalDuration?: number;
  newDuration?: number;
  deletedDuration?: number;
  savedPercent?: string;
}

export interface BurnProgress {
  frame?: number;
  totalFrames?: number;
  percent?: number;
  speed?: number;
  fps?: number;
  elapsed?: number;
  remaining?: number;
  done?: boolean;
  error?: string;
  path?: string;
  srtPath?: string;
}

export interface Encoder {
  name: string;
  args: string;
  label: string;
}

export interface AnalysisResult {
  autoSelected: number[];
  ruleResults: RuleResult[];
  claudeResults: ClaudeResult[];
}

export interface RuleResult {
  indices: number[];
  rule: string;
  description: string;
}

export interface ClaudeResult {
  indices: number[];
  type: string;
  description: string;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
}

export interface FeedbackCorrection {
  index: number;
  type: 'false_positive' | 'false_negative';
  word: string;
  start: number;
  end: number;
  sentenceContext: string;
  source: string; // which rule/source originally marked it (or 'user-added')
}

export interface EvolveResult {
  updates: { file: string; content: string }[];
  summary: string;
  noChangesNeeded: boolean;
}

export * from './chat';
