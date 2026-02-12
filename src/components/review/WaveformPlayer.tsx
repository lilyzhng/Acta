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
  wsRef,
  removeSegments = [],
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalRef = useRef<WaveSurferInstance | null>(null);
  const regionsPluginRef = useRef<{ addRegion: (opts: { start: number; end: number; color?: string; drag?: boolean; resize?: boolean }) => void; clearRegions: () => void } | null>(null);
  const [time, setTime] = useState('00:00 / 00:00');
  const [speed, setSpeed] = useState(1);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onReadyRef = useRef(onReady);
  const removeSegmentsRef = useRef(removeSegments);
  onTimeUpdateRef.current = onTimeUpdate;
  onReadyRef.current = onReady;
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
        color: 'rgba(239, 68, 68, 0.35)',
        drag: false,
        resize: false,
      });
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    let ws: WaveSurferInstance | null = null;

    const init = async () => {
      const [WaveSurferModule, RegionsModule] = await Promise.all([
        import('wavesurfer.js'),
        import('wavesurfer.js/dist/plugins/regions.esm.js'),
      ]);
      const WaveSurfer = WaveSurferModule.default;
      const RegionsPlugin = RegionsModule.default;
      const regionsPlugin = RegionsPlugin.create();

      ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: '#4a9eff',
        progressColor: '#1976D2',
        cursorColor: '#fff',
        height: 80,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        url: audioUrl,
        // Overlay both stereo channels into one visual waveform
        splitChannels: [{ overlay: false }, { overlay: true }],
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
    };

    init();

    return () => {
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
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => internalRef.current?.playPause()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
        >
          Play/Pause
        </button>
        <select
          value={speed}
          onChange={handleSpeedChange}
          className="px-3 py-2 bg-neutral-700 text-white border-none rounded text-sm cursor-pointer"
        >
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <span className="font-mono text-neutral-500 text-sm">{time}</span>
      </div>
      <div ref={containerRef} className="bg-neutral-800 rounded" />
    </div>
  );
});
