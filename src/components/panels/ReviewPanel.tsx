'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { WaveformPlayer } from '@/components/review/WaveformPlayer';
import { WordSelector } from '@/components/review/WordSelector';
import { ReviewStats } from '@/components/review/ReviewStats';
import { indicesToDeleteSegments } from '@/lib/segment-merger';
import type { ReviewPanelData, PanelSubmission } from '@/types';

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

interface ReviewPanelProps {
  projectId: string;
  data: ReviewPanelData;
  onSubmit: (submission: PanelSubmission) => void;
}

export function ReviewPanel({ projectId, data, onSubmit }: ReviewPanelProps) {
  const { words, autoSelected: autoSelectedArr } = data;
  const autoSelected = new Set(autoSelectedArr);
  const [selected, setSelected] = useState<Set<number>>(new Set(autoSelectedArr));
  const [currentIndex, setCurrentIndex] = useState(-1);
  const wsRef = useRef<WaveSurferInstance | null>(null);
  const isSelectingRef = useRef(false);
  const selectStartRef = useRef(-1);
  const selectModeRef = useRef<'add' | 'remove'>('add');

  // Auto-skip selected segments during playback
  const handleTimeUpdate = useCallback(
    (t: number) => {
      if (wsRef.current?.isPlaying()) {
        const sortedSelected = [...selected].sort((a, b) => a - b);
        for (const i of sortedSelected) {
          const w = words[i];
          if (t >= w.start && t < w.end) {
            let endTime = w.end;
            let j = sortedSelected.indexOf(i) + 1;
            while (j < sortedSelected.length) {
              const nextIdx = sortedSelected[j];
              const nextW = words[nextIdx];
              if (nextW.start - endTime < 0.1) {
                endTime = nextW.end;
                j++;
              } else break;
            }
            wsRef.current?.setTime(endTime);
            return;
          }
        }
      }
      const idx = words.findIndex(w => t >= w.start && t < w.end);
      setCurrentIndex(idx);
    },
    [words, selected],
  );

  const handleToggle = useCallback((index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleStartDrag = useCallback(
    (index: number) => {
      isSelectingRef.current = true;
      selectStartRef.current = index;
      selectModeRef.current = selected.has(index) ? 'remove' : 'add';
    },
    [selected],
  );

  const handleMoveDrag = useCallback((index: number) => {
    if (!isSelectingRef.current) return;
    const min = Math.min(selectStartRef.current, index);
    const max = Math.max(selectStartRef.current, index);
    setSelected(prev => {
      const next = new Set(prev);
      for (let j = min; j <= max; j++) {
        if (selectModeRef.current === 'add') next.add(j);
        else next.delete(j);
      }
      return next;
    });
  }, []);

  const handleEndDrag = useCallback(() => {
    isSelectingRef.current = false;
  }, []);

  const handleJump = useCallback((time: number) => {
    if (!isSelectingRef.current) {
      wsRef.current?.setTime(time);
    }
  }, []);

  const removeSegments = useMemo(
    () => indicesToDeleteSegments(words, [...selected]),
    [words, selected],
  );

  const handleConfirm = useCallback(() => {
    const sorted = [...selected].sort((a, b) => a - b);
    const segments = sorted.map(i => ({ start: words[i].start, end: words[i].end }));
    onSubmit({
      type: 'review_complete',
      selectedIndices: sorted,
      deleteSegments: segments,
    });
  }, [selected, words, onSubmit]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        wsRef.current?.playPause();
      } else if (e.code === 'ArrowLeft') {
        const t = wsRef.current?.getCurrentTime() || 0;
        wsRef.current?.setTime(Math.max(0, t - (e.shiftKey ? 5 : 1)));
      } else if (e.code === 'ArrowRight') {
        const t = wsRef.current?.getCurrentTime() || 0;
        wsRef.current?.setTime(t + (e.shiftKey ? 5 : 1));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  let statCount = 0;
  let statDuration = 0;
  selected.forEach(i => {
    if (i < words.length) {
      statCount++;
      statDuration += words[i].end - words[i].start;
    }
  });

  return (
    <div className="p-5 max-w-4xl mx-auto">
      <div className="sticky top-0 bg-neutral-950 pb-4 z-10">
        <WaveformPlayer
          audioUrl={`/api/audio/${projectId}`}
          onTimeUpdate={handleTimeUpdate}
          wsRef={wsRef}
          removeSegments={removeSegments}
        />

        <div className="mt-3 p-3 bg-neutral-800 rounded text-xs text-neutral-400 leading-relaxed">
          <div>
            <b className="text-white">Mouse:</b> Click red word = deselect | Click other = jump to play | Double-click = toggle | Shift+drag = batch
          </div>
          <div>
            <b className="text-white">Keyboard:</b> Space = play/pause | Left/Right = skip 1s | Shift+Left/Right = skip 5s
          </div>
          <div>
            <b className="text-white">Colors:</b>{' '}
            <span className="text-red-400">Red strikethrough</span> = will be cut |{' '}
            <span className="text-orange-400 border-b-2 border-orange-500/50">Orange underline</span> = AI suggested, you removed
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleConfirm}
            className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
          >
            Confirm Selections
          </button>
          <button
            onClick={() => setSelected(new Set(autoSelectedArr))}
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors"
          >
            Reset to AI
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      <WordSelector
        words={words}
        selected={selected}
        autoSelected={autoSelected}
        currentIndex={currentIndex}
        onToggle={handleToggle}
        onStartDrag={handleStartDrag}
        onMoveDrag={handleMoveDrag}
        onEndDrag={handleEndDrag}
        onJump={handleJump}
      />

      <ReviewStats count={statCount} totalDuration={statDuration} />
    </div>
  );
}
