'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Project } from '@/types';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  const loadProjects = useCallback(async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setProjects(data);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.mp4')) {
        alert('Please upload an MP4 file');
        return;
      }

      setIsUploading(true);

      try {
        // Create project
        const name = file.name.replace('.mp4', '');
        const createRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, videoFileName: file.name }),
        });
        const project = await createRes.json();

        // Upload video
        const formData = new FormData();
        formData.append('video', file);
        await fetch(`/api/projects/${project.id}/upload`, {
          method: 'POST',
          body: formData,
        });

        router.push(`/project/${project.id}`);
      } catch (err) {
        alert('Upload failed: ' + (err as Error).message);
      } finally {
        setIsUploading(false);
      }
    },
    [router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload]
  );

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm('Delete this project?')) return;
      await fetch('/api/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      loadProjects();
    },
    [loadProjects]
  );

  const statusLabels: Record<string, string> = {
    uploaded: 'Uploaded',
    extracting_audio: 'Extracting audio...',
    audio_ready: 'Audio ready',
    transcribing: 'Transcribing...',
    transcribed: 'Transcribed',
    analyzing: 'Analyzing...',
    analyzed: 'Ready for review',
    reviewed: 'Reviewed',
    cutting: 'Cutting...',
    cut: 'Cut complete',
    subtitles_ready: 'Subtitles ready',
    burning: 'Burning subtitles...',
    done: 'Done',
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-center mb-8 uppercase tracking-widest">ACTA</h1>

      {/* Upload area */}
      <div
        className={`terminal-border border-dashed p-12 text-center transition-colors ${
          isDragging
            ? 'border-[var(--retro-cyan)] bg-[var(--retro-cyan)]/5'
            : 'border-[var(--retro-border-beige)] hover:border-[var(--retro-charcoal)]'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <div className="flex flex-col items-center">
            <div className="text-[var(--retro-green)] text-lg animate-pulse">[UPLOADING...]</div>
            <p className="mt-4 text-[var(--retro-charcoal)]/60">Processing file...</p>
          </div>
        ) : (
          <>
            <p className="text-lg text-[var(--retro-charcoal)]/60 mb-4">
              Drag and drop a video file here
            </p>
            <label className="px-6 py-3 bg-[var(--retro-charcoal)] border-2 border-[var(--retro-green)] text-[var(--retro-green)] rounded-[2px] cursor-pointer text-sm font-bold transition-colors hover:bg-[var(--retro-charcoal-light)]">
              Choose File
              <input
                type="file"
                accept=".mp4"
                className="hidden"
                onChange={handleFileInput}
              />
            </label>
            <p className="mt-3 text-xs text-[var(--retro-charcoal)]/40">MP4 files only</p>
          </>
        )}
      </div>

      {/* Project list */}
      {projects.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold mb-4 uppercase tracking-wide">Projects</h2>
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/project/${project.id}`)}
                className="flex items-center justify-between p-4 bg-[var(--retro-charcoal)] rounded-[2px] hover:bg-[var(--retro-charcoal-light)] cursor-pointer transition-colors border-3 border-[var(--retro-border)]"
              >
                <div>
                  <div className="font-bold text-[var(--retro-text-light)]">{project.name}</div>
                  <div className="text-xs text-[var(--retro-text-light)]/50 mt-1">
                    {new Date(project.createdAt).toLocaleString()} &middot;{' '}
                    <span
                      className={
                        project.status === 'done'
                          ? 'text-[var(--retro-green)]'
                          : project.status.endsWith('ing')
                          ? 'text-[var(--retro-amber)]'
                          : 'text-[var(--retro-text-light)]/60'
                      }
                    >
                      {statusLabels[project.status] || project.status}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => handleDelete(project.id, e)}
                  className="text-[var(--retro-text-light)]/40 hover:text-[var(--retro-red)] transition-colors text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
