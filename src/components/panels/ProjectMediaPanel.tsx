'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { WaveformPlayer } from '@/components/review/WaveformPlayer';
import { WordSelector } from '@/components/review/WordSelector';
import { indicesToDeleteSegments } from '@/lib/segment-merger';
import type { SubtitleWord } from '@/types';

interface WaveSurferInstance {
  destroy: () => void;
  playPause: () => void;
  setTime: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  isPlaying: () => boolean;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
}

interface ProjectMediaPanelProps {
  projectId: string;
}

export function ProjectMediaPanel({ projectId }: ProjectMediaPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WaveSurferInstance | null>(null);
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [words, setWords] = useState<SubtitleWord[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [autoSelected, setAutoSelected] = useState<number[]>([]);
  const extractTriggeredRef = useRef(false);

  const fetchProject = useCallback(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((project) => {
        if (project) {
          setHasAudio(!!project.audioFile);
          setStatus(project.status);
          if (project.subtitlesWords) {
            return fetch(`/api/review/data?projectId=${projectId}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (data?.words) {
                  setWords(data.words);
                  setAutoSelected(data.autoSelected ?? []);
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => setHasAudio(false));
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Trigger extraction when we have video but no audio (e.g. legacy projects)
  useEffect(() => {
    if (hasAudio === false && status === 'uploaded' && !extractTriggeredRef.current) {
      extractTriggeredRef.current = true;
      fetch(`/api/projects/${projectId}/extract-audio`, { method: 'POST' })
        .then((r) => r.ok && fetchProject())
        .catch(() => {});
    }
  }, [hasAudio, status, projectId, fetchProject]);

  // Poll when extracting audio or when we have audio but no words yet (transcription)
  useEffect(() => {
    const shouldPoll =
      status === 'extracting_audio' || (hasAudio && !words);
    if (shouldPoll) {
      const id = setInterval(fetchProject, 2000);
      return () => clearInterval(id);
    }
  }, [hasAudio, words, status, fetchProject]);

  // Sync video to waveform (waveform is primary for playback when audio exists)
  const handleTimeUpdate = useCallback(
    (t: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = t;
      }
      const idx = words?.findIndex((w) => !w.isGap && t >= w.start && t < w.end) ?? -1;
      setCurrentIndex(idx);
    },
    [words],
  );

  const handleJump = useCallback((time: number) => {
    wsRef.current?.setTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Video - top */}
      <div className="flex-shrink-0 p-4 pb-2">
        <video
          ref={videoRef}
          className="w-full max-h-[40vh] bg-black rounded-lg object-contain"
          src={`/api/video/${projectId}`}
          controls
          playsInline
          muted={hasAudio === true}
        />
      </div>

      {/* Audio waveform + words - bottom */}
      <div className="flex-1 overflow-auto p-4 pt-2">
        {hasAudio === true && (
          <>
            <WaveformPlayer
              audioUrl={`/api/audio/${projectId}`}
              onTimeUpdate={handleTimeUpdate}
              wsRef={wsRef}
              removeSegments={words ? indicesToDeleteSegments(words, autoSelected) : []}
            />
            {words && words.length > 0 && (
              <div className="mt-3">
                <WordSelector
                  words={words}
                  selected={new Set()}
                  autoSelected={new Set(autoSelected)}
                  currentIndex={currentIndex}
                  onToggle={() => {}}
                  onStartDrag={() => {}}
                  onMoveDrag={() => {}}
                  onEndDrag={() => {}}
                  onJump={handleJump}
                />
              </div>
            )}
          </>
        )}
        {hasAudio === false && (
          <div className="p-4 bg-neutral-800 rounded-lg text-center text-neutral-500 text-sm">
            {status === 'extracting_audio'
              ? 'Extracting audio from video…'
              : 'Processing video. The waveform will appear shortly.'}
          </div>
        )}
        {hasAudio === null && (
          <div className="p-4 bg-neutral-800 rounded-lg text-center text-neutral-500 text-sm">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
