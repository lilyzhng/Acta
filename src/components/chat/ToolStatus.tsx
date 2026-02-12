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
    <div className="flex items-center gap-2 text-xs py-0.5 ml-5">
      {subtask.status === 'pending' && (
        <div className="w-2.5 h-2.5 rounded-full border border-neutral-600" />
      )}
      {subtask.status === 'running' && (
        <div className="w-2.5 h-2.5 border-2 border-neutral-500 border-t-purple-400 rounded-full animate-spin" />
      )}
      {subtask.status === 'done' && (
        <div className="w-2.5 h-2.5 rounded-full bg-green-600 flex items-center justify-center">
          <svg className="w-1.5 h-1.5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
      <span className={subtask.status === 'done' ? 'text-neutral-500' : subtask.status === 'running' ? 'text-neutral-300' : 'text-neutral-600'}>
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
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <div className="w-3 h-3 border-2 border-neutral-500 border-t-purple-400 rounded-full animate-spin" />
          <span>{label}</span>
          {tool.progress !== undefined && (
            <span className="text-purple-400">{tool.progress}%</span>
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
        <div className="flex items-center gap-2 text-xs text-neutral-500">
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
