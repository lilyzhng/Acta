'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const steps = [
  { name: 'Transcribe', path: 'transcribe', icon: '1' },
  { name: 'Review', path: 'review', icon: '2' },
  { name: 'Subtitles', path: 'subtitles', icon: '3' },
  { name: 'Download', path: 'download', icon: '4' },
];

interface StepNavProps {
  projectId: string;
  currentStatus?: string;
}

function getStepState(stepPath: string, status?: string): 'done' | 'current' | 'upcoming' {
  const statusOrder: Record<string, number> = {
    uploaded: 0,
    extracting_audio: 0,
    audio_ready: 0,
    transcribing: 0,
    transcribed: 1,
    analyzing: 1,
    analyzed: 1,
    reviewed: 1,
    cutting: 1,
    cut: 2,
    subtitles_ready: 2,
    burning: 2,
    done: 3,
  };

  const stepOrder: Record<string, number> = {
    transcribe: 0,
    review: 1,
    subtitles: 2,
    download: 3,
  };

  const currentOrder = statusOrder[status || 'uploaded'] ?? 0;
  const thisStep = stepOrder[stepPath] ?? 0;

  if (thisStep < currentOrder) return 'done';
  if (thisStep === currentOrder) return 'current';
  return 'upcoming';
}

export function StepNav({ projectId, currentStatus }: StepNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 p-4 bg-neutral-900 border-b border-neutral-800">
      <Link
        href="/"
        className="mr-4 text-neutral-400 hover:text-white transition-colors text-sm"
      >
        &larr; Projects
      </Link>
      {steps.map((step, i) => {
        const state = getStepState(step.path, currentStatus);
        const isActive = pathname?.includes(step.path);
        const href = `/project/${projectId}/${step.path}`;

        return (
          <div key={step.path} className="flex items-center">
            {i > 0 && <div className="w-8 h-px bg-neutral-700 mx-1" />}
            <Link
              href={href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-neutral-700 text-white'
                  : state === 'done'
                  ? 'text-green-400 hover:bg-neutral-800'
                  : state === 'current'
                  ? 'text-white hover:bg-neutral-800'
                  : 'text-neutral-500 hover:bg-neutral-800'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  state === 'done'
                    ? 'bg-green-600 text-white'
                    : isActive
                    ? 'bg-purple-600 text-white'
                    : 'bg-neutral-700 text-neutral-400'
                }`}
              >
                {state === 'done' ? '\u2713' : step.icon}
              </span>
              {step.name}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
