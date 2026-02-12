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

export type AnnotationType = 'arrow' | 'circle' | 'box' | 'text' | 'spotlight' | 'custom_svg';
export type AnnotationSize = 'small' | 'medium' | 'large';
export type AnnotationAnimation = 'none' | 'pulse' | 'bounce' | 'fade-in';
export type ArrowDirection = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';

export interface Annotation {
  id: string;
  type: AnnotationType;
  position: { x: number; y: number }; // percentage 0-100
  startTime?: number;  // seconds, omit for whole video
  endTime?: number;
  style: {
    color: string;     // hex or named color
    size: AnnotationSize;
    animation?: AnnotationAnimation;
  };
  // Type-specific properties
  text?: string;              // for text type
  arrowDirection?: ArrowDirection; // for arrow type
  target?: string;            // original user description for reference
  // Custom SVG properties
  svgContent?: string;        // raw SVG elements for custom_svg type
  svgViewBox?: string;        // viewBox for custom SVG (e.g., "0 0 100 100")
  svgWidth?: number;          // width in pixels
  svgHeight?: number;         // height in pixels
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
  annotationsFile?: string; // filename for annotations.json
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
