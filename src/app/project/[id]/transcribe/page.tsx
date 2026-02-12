'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { Project } from '@/types';

export default function TranscribePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [step, setStep] = useState<'idle' | 'extracting' | 'uploading' | 'transcribing' | 'analyzing' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  const loadProject = useCallback(async () => {
    const res = await fetch('/api/projects');
    const projects: Project[] = await res.json();
    const p = projects.find(p => p.id === projectId);
    if (p) {
      setProject(p);
      if (['analyzed', 'reviewed', 'cut', 'subtitles_ready', 'done'].includes(p.status)) {
        setStep('done');
      } else if (p.status === 'transcribing') {
        setStep('transcribing');
      }
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const handleStart = useCallback(async () => {
    setError(null);
    setStep('extracting');
    startTimer();

    try {
      // Submit transcription (extracts audio + uploads + submits to Volcengine)
      setStep('uploading');
      const submitRes = await fetch('/api/transcribe/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (!submitRes.ok) {
        const data = await submitRes.json();
        throw new Error(data.error || 'Submit failed');
      }

      // Poll for transcription result
      setStep('transcribing');

      const poll = async (): Promise<void> => {
        const pollRes = await fetch(`/api/transcribe/poll?projectId=${projectId}`);
        const data = await pollRes.json();

        if (data.status === 'done') {
          // Run AI analysis
          setStep('analyzing');

          const analyzeRes = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
          });

          if (!analyzeRes.ok) {
            const aData = await analyzeRes.json();
            throw new Error(aData.error || 'Analysis failed');
          }

          stopTimer();
          setStep('done');
          loadProject();
          return;
        }

        if (data.status === 'error') {
          throw new Error(data.error || 'Transcription failed');
        }

        // Still processing, poll again
        await new Promise(r => setTimeout(r, 5000));
        return poll();
      };

      await poll();
    } catch (err) {
      stopTimer();
      setError((err as Error).message);
      setStep('idle');
    }
  }, [projectId, startTimer, stopTimer, loadProject]);

  const stepLabels = {
    idle: 'Ready to start',
    extracting: 'Extracting audio...',
    uploading: 'Extracting audio & uploading...',
    transcribing: 'Transcribing with Volcengine...',
    analyzing: 'AI analyzing stutters...',
    done: 'Analysis complete!',
  };

  const stepPercent = {
    idle: 0,
    extracting: 10,
    uploading: 25,
    transcribing: 50,
    analyzing: 80,
    done: 100,
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h2 className="text-xl font-semibold mb-6">
        Step 1: Transcribe & Analyze
      </h2>

      {project && (
        <div className="mb-6 p-4 bg-neutral-900 rounded-lg border border-neutral-800">
          <div className="text-sm text-neutral-400">Project</div>
          <div className="font-medium mt-1">{project.name}</div>
          <div className="text-xs text-neutral-500 mt-1">{project.videoFile}</div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <div className="text-sm text-neutral-400 mb-2">{stepLabels[step]}</div>
          <ProgressBar percent={stepPercent[step]} />
          {elapsed > 0 && step !== 'done' && (
            <div className="text-xs text-neutral-500 mt-2">
              Elapsed: {elapsed}s
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-400">
            {error}
          </div>
        )}

        {step === 'idle' && (
          <button
            onClick={handleStart}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
          >
            Start Transcription & Analysis
          </button>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="p-3 bg-green-900/30 border border-green-800 rounded text-sm text-green-400">
              Transcription and AI analysis complete. Proceed to review.
            </div>
            <button
              onClick={() => router.push(`/project/${projectId}/review`)}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              Go to Review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
