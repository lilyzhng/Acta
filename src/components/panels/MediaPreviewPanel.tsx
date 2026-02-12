'use client';

import { useRef, useCallback, useState, useMemo } from 'react';
import { WaveformPlayer } from '@/components/review/WaveformPlayer';
import { WordSelector } from '@/components/review/WordSelector';
import { indicesToDeleteSegments } from '@/lib/segment-merger';
import type { WordPreviewData } from '@/types';

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

interface MediaPreviewPanelProps {
  projectId: string;
  data: WordPreviewData;
}

export function MediaPreviewPanel({ projectId, data }: MediaPreviewPanelProps) {
  const { words, selectedIndices } = data;
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WaveSurferInstance | null>(null);
  const selectedSet = new Set(selectedIndices);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const removeSegments = useMemo(
    () => indicesToDeleteSegments(words, selectedIndices),
    [words, selectedIndices],
  );

  // Sync video to waveform (waveform is primary - plays audio, video shows picture)
  const handleTimeUpdate = useCallback(
    (t: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = t;
      }
      const idx = words.findIndex(w => !w.isGap && t >= w.start && t < w.end);
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
          playsInline
          muted
        />
      </div>

      {/* Audio waveform + words - bottom */}
      <div className="flex-1 overflow-auto p-4 pt-2">
        <WaveformPlayer
          audioUrl={`/api/audio/${projectId}`}
          onTimeUpdate={handleTimeUpdate}
          wsRef={wsRef}
          removeSegments={removeSegments}
        />

        <div className="mt-3 p-3 bg-neutral-800 rounded text-xs text-neutral-400 leading-relaxed">
          <b className="text-white">Legend:</b>{' '}
          <span className="text-red-400">Red strikethrough</span> = will be cut. Click a word to seek.
        </div>

        <div className="mt-3">
          <WordSelector
            words={words}
            selected={selectedSet}
            autoSelected={new Set()}
            currentIndex={currentIndex}
            onToggle={() => {}}
            onStartDrag={() => {}}
            onMoveDrag={() => {}}
            onEndDrag={() => {}}
            onJump={handleJump}
          />
        </div>
      </div>
    </div>
  );
}
