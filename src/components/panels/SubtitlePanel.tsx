'use client';

import { useState, useCallback, useEffect } from 'react';
import { SubtitleEditor } from '@/components/subtitles/SubtitleEditor';
import type { SubtitlePanelData, PanelSubmission, Subtitle } from '@/types';

interface SubtitlePanelProps {
  projectId: string;
  data: SubtitlePanelData;
  onSubmit: (submission: PanelSubmission) => void;
}

export function SubtitlePanel({ projectId, data, onSubmit }: SubtitlePanelProps) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>(data.subtitles);
  const [dictionary, setDictionary] = useState<string[]>([]);

  useEffect(() => {
    fetch('/dictionary.txt')
      .then(r => r.text())
      .then(text => setDictionary(text.split('\n').filter(l => l.trim())))
      .catch(() => {});
  }, []);

  const handleSave = useCallback(async () => {
    await fetch('/api/subtitles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, subtitles }),
    });
  }, [projectId, subtitles]);

  const handleConfirm = useCallback(() => {
    onSubmit({ type: 'subtitles_complete', subtitles });
  }, [subtitles, onSubmit]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-neutral-900 border-b border-neutral-800 flex items-center gap-2">
        <button
          onClick={handleConfirm}
          className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
        >
          Done Editing
        </button>
        <span className="text-xs text-neutral-500">
          Click &quot;Done Editing&quot; when you&apos;re finished to continue
        </span>
      </div>
      <div className="flex-1">
        <SubtitleEditor
          projectId={projectId}
          videoUrl={`/api/video/${projectId}`}
          subtitles={subtitles}
          dictionary={dictionary}
          onSubtitlesChange={setSubtitles}
          onSave={handleSave}
          onBurn={() => {}}
          isBurning={false}
        />
      </div>
    </div>
  );
}
