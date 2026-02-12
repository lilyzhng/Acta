'use client';

import { memo } from 'react';
import type { ToolCallStatus } from '@/types';

const toolLabels: Record<string, string> = {
  get_project_status: 'Checking project status',
  transcribe_video: 'Transcribing video',
  analyze_transcript: 'Analyzing transcript',
  show_review_panel: 'Opening review panel',
  execute_cut: 'Cutting video',
  generate_subtitles: 'Generating subtitles',
  show_subtitle_editor: 'Opening subtitle editor',
  burn_subtitles: 'Burning subtitles',
  provide_download_links: 'Preparing downloads',
};

function ToolStatusComponent({ tool }: { tool: ToolCallStatus }) {
  const label = toolLabels[tool.name] || tool.name;

  if (tool.status === 'running') {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-400 py-1">
        <div className="w-3 h-3 border-2 border-neutral-500 border-t-purple-400 rounded-full animate-spin" />
        <span>{label}</span>
        {tool.progress !== undefined && (
          <span className="text-purple-400">{tool.progress}%</span>
        )}
      </div>
    );
  }

  if (tool.status === 'done') {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500 py-1">
        <div className="w-3 h-3 rounded-full bg-green-600 flex items-center justify-center text-white text-[8px]">
          ✓
        </div>
        <span>{label}</span>
        {tool.summary && (
          <span className="text-neutral-600 truncate max-w-[200px]">
            — {tool.summary.slice(0, 60)}
          </span>
        )}
      </div>
    );
  }

  if (tool.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-red-400 py-1">
        <div className="w-3 h-3 rounded-full bg-red-600 flex items-center justify-center text-white text-[8px]">
          ✕
        </div>
        <span>{label}</span>
        {tool.error && <span className="truncate max-w-[200px]">— {tool.error}</span>}
      </div>
    );
  }

  return null;
}

export const ToolStatusDisplay = memo(ToolStatusComponent);
