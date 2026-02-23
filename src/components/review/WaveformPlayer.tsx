'use client';

import { useEffect, useRef, useState, useCallback, memo } from 'react';

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

/** Segments to show as "removed" on the waveform (grayed out overlay) */
export interface RemoveSegment {
  start: number;
  end: number;
}

interface WaveformPlayerProps {
  audioUrl: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  wsRef?: React.MutableRefObject<WaveSurferInstance | null>;
  /** Segments marked for removal - shown as semi-transparent overlay on the waveform */
  removeSegments?: RemoveSegment[];
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const WaveformPlayer = memo(function WaveformPlayer({
  audioUrl,
  onTimeUpdate,
  onReady,
  onPlay,
  onPause,
  wsRef,
  removeSegments = [],
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef<WaveSurferInstance | null>(null);
  const regionsPluginRef = useRef<{ addRegion: (opts: { start: number; end: number; color?: string; drag?: boolean; resize?: boolean }) => void; clearRegions: () => void } | null>(null);
  const [time, setTime] = useState('00:00 / 00:00');
  const [speed, setSpeed] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onReadyRef = useRef(onReady);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const removeSegmentsRef = useRef(removeSegments);
  onTimeUpdateRef.current = onTimeUpdate;
  onReadyRef.current = onReady;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;
  removeSegmentsRef.current = removeSegments;

  const applyRemoveRegions = useCallback(() => {
    const regions = regionsPluginRef.current;
    if (!regions) return;
    const segments = removeSegmentsRef.current;
    regions.clearRegions();
    for (const seg of segments) {
      regions.addRegion({
        start: seg.start,
        end: seg.end,
        color: 'rgba(255, 59, 59, 0.35)',
        drag: false,
        resize: false,
      });
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    let ws: WaveSurferInstance | null = null;
    let cancelled = false;

    const init = async () => {
      const [WaveSurferModule, RegionsModule] = await Promise.all([
        import('wavesurfer.js'),
        import('wavesurfer.js/dist/plugins/regions.esm.js'),
      ]);

      // Check if effect was cleaned up while we were loading
      if (cancelled) return;

      const WaveSurfer = WaveSurferModule.default;
      const RegionsPlugin = RegionsModule.default;
      const regionsPlugin = RegionsPlugin.create();

      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: '#39FF14',
        progressColor: '#00E5FF',
        cursorColor: '#FFB800',
        height: 60,
        barWidth: 2,
        barGap: 1,
        barRadius: 0,
        barAlign: 'bottom',
        url: audioUrl,
        normalize: true,
        plugins: [regionsPlugin],
      }) as unknown as WaveSurferInstance;

      regionsPluginRef.current = regionsPlugin;
      internalRef.current = ws;
      if (wsRef) wsRef.current = ws;

      ws.on('ready', () => {
        const dur = ws!.getDuration();
        setTime(`00:00 / ${formatTime(dur)}`);
        onReadyRef.current?.(dur);
        applyRemoveRegions();
      });

      ws.on('timeupdate', (t: unknown) => {
        const currentTime = t as number;
        const dur = ws!.getDuration();
        setTime(`${formatTime(currentTime)} / ${formatTime(dur)}`);
        onTimeUpdateRef.current?.(currentTime);
      });

      ws.on('play', () => {
        setIsPlaying(true);
        onPlayRef.current?.();
      });
      ws.on('pause', () => {
        setIsPlaying(false);
        onPauseRef.current?.();
      });
      ws.on('finish', () => {
        setIsPlaying(false);
        onPauseRef.current?.();
      });
    };

    init();

    return () => {
      cancelled = true;
      ws?.destroy();
      regionsPluginRef.current = null;
      internalRef.current = null;
      if (wsRef) wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, applyRemoveRegions]);

  // Update regions when removeSegments changes (after waveform is ready)
  useEffect(() => {
    applyRemoveRegions();
  }, [removeSegments, applyRemoveRegions]);

  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const rate = parseFloat(e.target.value);
    setSpeed(rate);
    internalRef.current?.setPlaybackRate(rate);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-3">
        <span className="font-mono text-[var(--retro-text-light)]/50 text-sm">{time}</span>
        <button
          onClick={() => internalRef.current?.playPause()}
          className="w-10 h-10 flex items-center justify-center rounded-[2px] bg-[var(--retro-charcoal)] border-2 border-[var(--retro-green)] text-[var(--retro-green)] hover:bg-[var(--retro-charcoal-light)] transition-colors"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        <select
          value={speed}
          onChange={handleSpeedChange}
          className="px-2 py-1 bg-[var(--retro-charcoal)] text-[var(--retro-text-light)] border-2 border-[var(--retro-border)] rounded-[2px] text-sm cursor-pointer"
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
      <div ref={containerRef} className="bg-[var(--retro-charcoal)] rounded-[2px]" />
    </div>
  );
});
