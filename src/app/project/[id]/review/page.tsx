'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { WaveformPlayer } from '@/components/review/WaveformPlayer';
import { WordSelector } from '@/components/review/WordSelector';
import { ReviewControls } from '@/components/review/ReviewControls';
import { ReviewStats } from '@/components/review/ReviewStats';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import type { SubtitleWord, CutProgress } from '@/types';

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

export default function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [words, setWords] = useState<SubtitleWord[]>([]);
  const [autoSelected, setAutoSelected] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCutting, setIsCutting] = useState(false);
  const [cutProgress, setCutProgress] = useState<CutProgress | null>(null);
  const [cutElapsed, setCutElapsed] = useState(0);
  const [evolveMessage, setEvolveMessage] = useState<string | null>(null);
  const wsRef = useRef<WaveSurferInstance | null>(null);
  const isSelectingRef = useRef(false);
  const selectStartRef = useRef(-1);
  const selectModeRef = useRef<'add' | 'remove'>('add');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Load review data
  useEffect(() => {
    fetch(`/api/review/data?projectId=${projectId}`)
      .then(r => r.json())
      .then(data => {
        setWords(data.words);
        const auto = new Set<number>(data.autoSelected);
        setAutoSelected(auto);
        setSelected(new Set(auto));
        setIsLoaded(true);
      });
  }, [projectId]);

  // Auto-skip selected segments during playback
  const handleTimeUpdate = useCallback(
    (t: number) => {
      if (!wsRef.current?.isPlaying()) {
        // Update current word highlight
        const idx = words.findIndex(w => t >= w.start && t < w.end);
        setCurrentIndex(idx);
        return;
      }

      // Skip selected segments
      const sortedSelected = [...selected].sort((a, b) => a - b);
      for (const i of sortedSelected) {
        const w = words[i];
        if (t >= w.start && t < w.end) {
          // Find end of continuous selected segment
          let endTime = w.end;
          let j = sortedSelected.indexOf(i) + 1;
          while (j < sortedSelected.length) {
            const nextIdx = sortedSelected[j];
            const nextW = words[nextIdx];
            if (nextW.start - endTime < 0.1) {
              endTime = nextW.end;
              j++;
            } else {
              break;
            }
          }
          wsRef.current?.setTime(endTime);
          return;
        }
      }

      // Update current word highlight
      const idx = words.findIndex(w => t >= w.start && t < w.end);
      setCurrentIndex(idx);
    },
    [words, selected]
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
    [selected]
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

  const handleClear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleReset = useCallback(() => {
    setSelected(new Set(autoSelected));
  }, [autoSelected]);

  const handleCut = useCallback(async () => {
    if (!confirm('Execute cut? This will create a new video file.')) return;

    // Build delete segments from selected
    const sorted = [...selected].sort((a, b) => a - b);
    const segments = sorted.map(i => ({ start: words[i].start, end: words[i].end }));

    // Save selection first
    const saveRes = await fetch('/api/review/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        selectedIndices: sorted,
        deleteSegments: segments,
      }),
    });
    const saveData = await saveRes.json();
    const correctionCount = saveData.correctionCount || 0;

    // Execute cut with SSE
    setIsCutting(true);
    setCutElapsed(0);
    timerRef.current = setInterval(() => setCutElapsed(p => p + 1), 1000);

    try {
      const res = await fetch('/api/cut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6)) as CutProgress;

          if (data.done) {
            setCutProgress(data);
            clearInterval(timerRef.current!);
            setIsCutting(false);

            if (correctionCount >= 2) {
              // Fire-and-forget: trigger self-evolve to update detection rules
              fetch('/api/evolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId }),
              }).catch(() => {});
              // Show evolve toast briefly before navigating
              setEvolveMessage(`Learning from ${correctionCount} corrections...`);
              setTimeout(() => {
                router.push(`/project/${projectId}/subtitles`);
              }, 2000);
            } else {
              router.push(`/project/${projectId}/subtitles`);
            }
            return;
          }

          if (data.error) {
            throw new Error(data.error);
          }

          setCutProgress(data);
        }
      }
    } catch (err) {
      alert('Cut failed: ' + (err as Error).message);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsCutting(false);
    }
  }, [selected, words, projectId]);

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

  // Compute stats
  let statCount = 0;
  let statDuration = 0;
  selected.forEach(i => {
    if (i < words.length) {
      statCount++;
      statDuration += words[i].end - words[i].start;
    }
  });

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500">
        Loading review data...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-5">
      <LoadingOverlay
        show={isCutting}
        title="Cutting video..."
        percent={cutProgress?.percent || 0}
        elapsed={cutElapsed}
        remaining={cutProgress?.remaining}
      />

      {evolveMessage && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-purple-900/90 border border-purple-700 rounded-lg shadow-lg"
          style={{ animation: 'fadeSlideUp 0.3s ease-out' }}
        >
          <div className="flex items-center gap-3 text-sm text-purple-100">
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            {evolveMessage}
          </div>
        </div>
      )}

      <h2 className="text-xl font-semibold mb-4">Step 2: Review & Select</h2>

      {/* Controls area */}
      <div className="sticky top-0 bg-neutral-950 pb-4 z-10">
        <WaveformPlayer
          audioUrl={`/api/audio/${projectId}`}
          onTimeUpdate={handleTimeUpdate}
          wsRef={wsRef}
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
            <span className="text-orange-400 border-b-2 border-orange-500/50">Orange underline</span> = AI suggested, you removed | Playback auto-skips red
          </div>
        </div>

        <ReviewControls
          onCut={handleCut}
          onClear={handleClear}
          onReset={handleReset}
          isCutting={isCutting}
        />

        <button
          onClick={() => router.push(`/project/${projectId}/subtitles`)}
          className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
        >
          Skip to Subtitles &rarr;
        </button>
      </div>

      {/* Word grid */}
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
