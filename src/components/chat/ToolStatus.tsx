'use client';

import { memo } from 'react';
import type { ToolCallStatus, SubtaskStatus } from '@/types';

const toolLabels: Record<string, string> = {
  get_project_status: 'Checking project status',
  auto_cut: 'Auto cut',
  transcribe_video: 'Transcribing video',
  analyze_transcript: 'Analyzing transcript',
  show_review_panel: 'Opening review panel',
  execute_cut: 'Cutting video',
  attach_subtitles: 'Attaching subtitles',
  show_subtitle_editor: 'Opening subtitle editor',
  burn_subtitles: 'Burning subtitles',
  provide_download_links: 'Preparing downloads',
};

function SubtaskItem({ subtask }: { subtask: SubtaskStatus }) {
  return (
    <div className="flex items-center gap-2 text-xs py-0.5 ml-4">
      <span className="text-[var(--retro-text-light)]/30">|--</span>
      {subtask.status === 'pending' && (
        <span className="text-[var(--retro-text-light)]/30">[ ]</span>
      )}
      {subtask.status === 'running' && (
        <span className="text-[var(--retro-amber)] animate-pulse">[*]</span>
      )}
      {subtask.status === 'done' && (
        <span className="text-[var(--retro-green)]">[+]</span>
      )}
      <span className={subtask.status === 'done' ? 'text-[var(--retro-text-light)]/40' : subtask.status === 'running' ? 'text-[var(--retro-text-light)]' : 'text-[var(--retro-text-light)]/30'}>
        {subtask.label}
      </span>
    </div>
  );
}

function ToolStatusComponent({ tool }: { tool: ToolCallStatus }) {
  const label = toolLabels[tool.name] || tool.name;

  if (tool.status === 'running') {
    return (
      <div className="py-1">
        <div className="flex items-center gap-2 text-xs text-[var(--retro-text-light)]/60">
          <span className="text-[var(--retro-amber)] animate-pulse">[*]</span>
          <span>{label}</span>
          {tool.progress !== undefined && (
            <span className="text-[var(--retro-cyan)]">{tool.progress}%</span>
          )}
        </div>
        {tool.subtasks && tool.subtasks.length > 0 && (
          <div className="mt-1">
            {tool.subtasks.map((subtask) => (
              <SubtaskItem key={subtask.id} subtask={subtask} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tool.status === 'done') {
    return (
      <div className="py-1">
        <div className="flex items-center gap-2 text-xs text-[var(--retro-text-light)]/40">
          <span className="text-[var(--retro-green)]">[+]</span>
          <span>{label}</span>
          {tool.summary && (
            <span className="text-[var(--retro-text-light)]/30 truncate max-w-[200px]">
              — {tool.summary.slice(0, 60)}
            </span>
          )}
        </div>
        {tool.subtasks && tool.subtasks.length > 0 && (
          <div className="mt-1">
            {tool.subtasks.map((subtask) => (
              <SubtaskItem key={subtask.id} subtask={{ ...subtask, status: 'done' }} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tool.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--retro-red)] py-1">
        <span>[!]</span>
        <span>{label}</span>
        {tool.error && <span className="truncate max-w-[200px]">— {tool.error}</span>}
      </div>
    );
  }

  return null;
}

export const ToolStatusDisplay = memo(ToolStatusComponent);
