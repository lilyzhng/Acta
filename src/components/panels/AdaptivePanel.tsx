'use client';

import type { PanelState, ReviewPanelData, SubtitlePanelData, ProgressPanelData, DownloadPanelData, WordPreviewData, PanelSubmission } from '@/types';
import { ReviewPanel } from './ReviewPanel';
import { SubtitlePanel } from './SubtitlePanel';
import { ProgressPanel } from './ProgressPanel';
import { DownloadPanel } from './DownloadPanel';
import { MediaPreviewPanel } from './MediaPreviewPanel';
import { ProjectMediaPanel } from './ProjectMediaPanel';

interface AdaptivePanelProps {
  projectId: string;
  panelState: PanelState;
  onSubmitPanel: (submission: PanelSubmission) => void;
}

export function AdaptivePanel({ projectId, panelState, onSubmitPanel }: AdaptivePanelProps) {
  switch (panelState.type) {
    case 'review':
      return (
        <ReviewPanel
          projectId={projectId}
          data={panelState.data as ReviewPanelData}
          onSubmit={onSubmitPanel}
        />
      );

    case 'subtitle_editor':
      return (
        <SubtitlePanel
          projectId={projectId}
          data={panelState.data as SubtitlePanelData}
          onSubmit={onSubmitPanel}
        />
      );

    case 'progress':
      return <ProgressPanel data={panelState.data as ProgressPanelData} />;

    case 'word_preview':
      return (
        <MediaPreviewPanel
          projectId={projectId}
          data={panelState.data as WordPreviewData}
        />
      );

    case 'download':
      return <DownloadPanel data={panelState.data as DownloadPanelData} />;

    case 'video':
    case 'none':
    default:
      return <ProjectMediaPanel projectId={projectId} />;
  }
}
