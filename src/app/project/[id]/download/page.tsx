'use client';

import { useState, useEffect, use } from 'react';
import type { Project } from '@/types';

export default function DownloadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then((projects: Project[]) => {
        const p = projects.find(p => p.id === projectId);
        if (p) setProject(p);
      });
  }, [projectId]);

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500">
        Loading...
      </div>
    );
  }

  const files = [
    {
      label: 'Original Video',
      file: project.videoFile,
      available: true,
    },
    {
      label: 'Cut Video',
      file: project.cutVideoFile,
      available: !!project.cutVideoFile,
    },
    {
      label: 'Subtitled Video',
      file: project.burnedVideoFile,
      available: !!project.burnedVideoFile,
    },
    {
      label: 'SRT Subtitles',
      file: project.srtFile,
      available: !!project.srtFile,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-xl font-semibold mb-6">Step 4: Download</h2>

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
              <div className="font-medium">{f.label}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {f.file || 'Not yet generated'}
              </div>
            </div>
            {f.available && f.file && (
              <a
                href={`/api/video/${projectId}?file=${encodeURIComponent(f.file)}`}
                download={f.file}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
              >
                Download
              </a>
            )}
          </div>
        ))}
      </div>

      {project.status === 'done' && (
        <div className="mt-8 p-4 bg-green-900/30 border border-green-800 rounded-lg text-center">
          <div className="text-green-400 font-medium">Pipeline complete!</div>
          <div className="text-xs text-green-500 mt-1">
            All processing steps have been completed.
          </div>
        </div>
      )}
    </div>
  );
}
