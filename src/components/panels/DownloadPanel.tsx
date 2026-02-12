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
        <h2 className="text-xl font-semibold mb-6 text-center">Downloads</h2>
        <div className="space-y-3">
          {files.map((f) => (
            <div
              key={f.label}
              className={`flex items-center justify-between p-4 rounded-lg border ${
                f.available
                  ? 'bg-neutral-900 border-neutral-800'
                  : 'bg-neutral-900/50 border-neutral-800/50 opacity-50'
              }`}
            >
              <div>
                <div className="font-medium text-sm">{f.label}</div>
                <div className="text-xs text-neutral-500 mt-1">
                  {f.file || 'Not yet generated'}
                </div>
              </div>
              {f.available && f.file && (
                <a
                  href={`/api/video/${data.projectId}?file=${encodeURIComponent(f.file)}`}
                  download={f.file}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                >
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 bg-green-900/30 border border-green-800 rounded-lg text-center">
          <div className="text-green-400 font-medium text-sm">Pipeline complete!</div>
        </div>
      </div>
    </div>
  );
}
