'use client';

import type { DownloadPanelData } from '@/types';

interface DownloadPanelProps {
  data: DownloadPanelData;
}

export function DownloadPanel({ data }: DownloadPanelProps) {
  const files = [
    { label: 'Original Video', file: data.videoFile, available: true },
    { label: 'Cut Video', file: data.cutVideoFile, available: !!data.cutVideoFile },
    { label: 'Subtitled Video', file: data.burnedVideoFile, available: !!data.burnedVideoFile },
    { label: 'SRT Subtitles', file: data.srtFile, available: !!data.srtFile },
  ];

  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-lg w-full px-8">
        <h2 className="text-xl font-bold mb-6 text-center uppercase tracking-wide text-[var(--retro-text-light)]">Downloads</h2>
        <div className="space-y-3">
          {files.map((f) => (
            <div
              key={f.label}
              className={`flex items-center justify-between p-4 rounded-[2px] border-2 ${
                f.available
                  ? 'bg-[var(--retro-charcoal)] border-[var(--retro-border)]'
                  : 'bg-[var(--retro-charcoal)]/50 border-[var(--retro-border)]/50 opacity-50'
              }`}
            >
              <div>
                <div className="font-bold text-sm text-[var(--retro-text-light)]">{f.label}</div>
                <div className="text-xs text-[var(--retro-text-light)]/40 mt-1">
                  {f.file || 'Not yet generated'}
                </div>
              </div>
              {f.available && f.file && (
                <a
                  href={`/api/video/${data.projectId}?file=${encodeURIComponent(f.file)}`}
                  download={f.file}
                  className="px-4 py-2 border-2 border-[var(--retro-green)] text-[var(--retro-green)] hover:bg-[var(--retro-green)]/10 rounded-[2px] text-sm font-bold transition-colors"
                >
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 bg-[var(--retro-charcoal)] border-2 border-[var(--retro-green)] rounded-[2px] text-center">
          <div className="text-[var(--retro-green)] font-bold text-sm">[OK] Pipeline complete!</div>
        </div>
      </div>
    </div>
  );
}
