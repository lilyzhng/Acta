'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

interface WaveSurferInstance {
  destroy: () => void;
  playPause: () => void;
  play: () => void;
  pause: () => void;
  isPlaying: () => boolean;
  setTime: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
}

interface UseWaveSurferOptions {
  url: string;
  container: string;
  onTimeUpdate?: (time: number) => void;
  onReady?: (duration: number) => void;
}

export function useWaveSurfer(options: UseWaveSurferOptions) {
  const wsRef = useRef<WaveSurferInstance | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let ws: WaveSurferInstance | null = null;

    const init = async () => {
      const WaveSurfer = (await import('wavesurfer.js')).default;
      ws = WaveSurfer.create({
        container: optionsRef.current.container,
        waveColor: '#4a9eff',
        progressColor: '#1976D2',
        cursorColor: '#fff',
        height: 60,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        barAlign: 'bottom',
        url: optionsRef.current.url,
        normalize: true,
      }) as unknown as WaveSurferInstance;

      wsRef.current = ws;

      ws.on('ready', () => {
        setIsReady(true);
        const dur = ws!.getDuration();
        setDuration(dur);
        optionsRef.current.onReady?.(dur);
      });

      ws.on('timeupdate', (t: unknown) => {
        const time = t as number;
        setCurrentTime(time);
        optionsRef.current.onTimeUpdate?.(time);
      });

      ws.on('play', () => setIsPlaying(true));
      ws.on('pause', () => setIsPlaying(false));
    };

    init();

    return () => {
      ws?.destroy();
      wsRef.current = null;
    };
  }, []);

  const playPause = useCallback(() => {
    wsRef.current?.playPause();
  }, []);

  const setTime = useCallback((time: number) => {
    wsRef.current?.setTime(time);
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    wsRef.current?.setPlaybackRate(rate);
  }, []);

  return {
    wavesurfer: wsRef,
    isReady,
    isPlaying,
    currentTime,
    duration,
    playPause,
    setTime,
    setPlaybackRate,
  };
}
