'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { WaveformPlayer } from '@/components/review/WaveformPlayer';
import { WordSelector } from '@/components/review/WordSelector';
import { SubtitleItem } from '@/components/subtitles/SubtitleItem';
import { AnnotationOverlay } from '@/components/annotations/AnnotationOverlay';
import { indicesToDeleteSegments } from '@/lib/segment-merger';
import type { SubtitleWord, Subtitle, Annotation } from '@/types';

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

interface UnifiedProjectPanelProps {
  projectId: string;
  refreshTrigger?: string;
}

export function UnifiedProjectPanel({ projectId, refreshTrigger }: UnifiedProjectPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurferInstance | null>(null);
  const [hasAudio, setHasAudio] = useState<boolean | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [cutVideoFile, setCutVideoFile] = useState<string | null>(null);
  const [cutAudioFile, setCutAudioFile] = useState<string | null>(null);
  const [burnedVideoFile, setBurnedVideoFile] = useState<string | null>(null);
  const [videoKey, setVideoKey] = useState(0);
  const [waveformKey, setWaveformKey] = useState(0);
  const [words, setWords] = useState<SubtitleWord[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [autoSelected, setAutoSelected] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [removedIndices, setRemovedIndices] = useState<number[]>([]);
  const [subtitles, setSubtitles] = useState<Subtitle[] | null>(null);
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState(-1);
  const [isBurning, setIsBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [videoTime, setVideoTime] = useState(0);
  const [videoContainerSize, setVideoContainerSize] = useState({ width: 0, height: 0 });
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const subtitlesLoadedRef = useRef(false);
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [panelHeight, setPanelHeight] = useState(250);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [videoCollapsed, setVideoCollapsed] = useState(false);
  const panelHeightBeforeMinRef = useRef(250);
  const isPanelDraggingRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const extractTriggeredRef = useRef(false);
  const initialSelectionSetRef = useRef(false);
  const subtitleGenTriggeredRef = useRef(false);
  const isSelectingRef = useRef(false);
  const selectStartRef = useRef(-1);
  const selectModeRef = useRef<'add' | 'remove'>('add');
  const prevCutVideoFileRef = useRef<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const justCompletedCutRef = useRef(false);

  const fetchProject = useCallback(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (project) => {
        if (project) {
          setHasAudio(!!project.audioFile);
          setStatus(project.status);

          const newCutVideoFile = project.cutVideoFile || null;
          const newCutAudioFile = project.cutAudioFile || null;
          setCutVideoFile(prev => {
            if (newCutVideoFile && newCutVideoFile !== prev) {
              setVideoKey(k => k + 1);
            }
            return newCutVideoFile;
          });
          setCutAudioFile(prev => {
            if (newCutAudioFile && newCutAudioFile !== prev) {
              setWaveformKey(k => k + 1);
            }
            return newCutAudioFile;
          });

          const newBurnedVideoFile = project.burnedVideoFile || null;
          setBurnedVideoFile(prev => {
            if (newBurnedVideoFile && newBurnedVideoFile !== prev) {
              setVideoKey(k => k + 1);
            }
            return newBurnedVideoFile;
          });

          if (project.subtitlesWithTime) {
            try {
              const subRes = await fetch(`/api/subtitles?projectId=${projectId}`);
              if (subRes.ok) {
                const subData = await subRes.json();
                if (Array.isArray(subData)) {
                  setSubtitles(subData);
                  subtitlesLoadedRef.current = true;
                }
              }
            } catch {
              // Ignore subtitle fetch errors
            }
          }

          if (project.subtitlesWords) {
            return fetch(`/api/review/data?projectId=${projectId}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (data?.words) {
                  setWords(data.words);
                  const auto = data.autoSelected ?? [];
                  setAutoSelected(auto);
                  if (data.selectedIndices) {
                    setRemovedIndices(data.selectedIndices);
                  }
                  if (!initialSelectionSetRef.current) {
                    setSelected(new Set(auto));
                    initialSelectionSetRef.current = true;
                  }
                }
              })
              .catch(() => {});
          }
        }
      })
      .catch(() => setHasAudio(false));
  }, [projectId]);

  const fetchAnnotations = useCallback(() => {
    fetch(`/api/annotations?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setAnnotations(data);
          const video = videoRef.current;
          if (video && video.videoWidth && video.videoHeight) {
            setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
          }
        }
      })
      .catch(() => setAnnotations([]));
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchAnnotations();
  }, [fetchProject, fetchAnnotations]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchProject();
      fetchAnnotations();
    }
  }, [refreshTrigger, fetchProject, fetchAnnotations]);

  useEffect(() => {
    const video = videoRef.current;

    const updateSize = () => {
      if (videoContainerRef.current) {
        const rect = videoContainerRef.current.getBoundingClientRect();
        setVideoContainerSize({ width: rect.width, height: rect.height });
      }
    };

    const updateVideoDimensions = () => {
      if (video && video.videoWidth && video.videoHeight) {
        console.log('[UnifiedProjectPanel] Video dimensions:', video.videoWidth, 'x', video.videoHeight);
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
        return true;
      }
      return false;
    };

    const handleMetadataLoaded = () => {
      updateSize();
      updateVideoDimensions();
    };

    updateSize();

    if (video && video.readyState >= 1) {
      updateVideoDimensions();
    }

    const pollInterval = setInterval(() => {
      if (updateVideoDimensions()) {
        clearInterval(pollInterval);
      }
    }, 100);

    const pollTimeout = setTimeout(() => {
      clearInterval(pollInterval);
    }, 5000);

    window.addEventListener('resize', updateSize);

    if (video) {
      video.addEventListener('loadedmetadata', handleMetadataLoaded);
    }

    return () => {
      window.removeEventListener('resize', updateSize);
      clearInterval(pollInterval);
      clearTimeout(pollTimeout);
      if (video) {
        video.removeEventListener('loadedmetadata', handleMetadataLoaded);
      }
    };
  }, [videoKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setVideoTime(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [videoKey]);

  useEffect(() => {
    const cutJustCompleted = prevStatusRef.current === 'cutting' && status === 'cut';
    const cutFileChanged = cutVideoFile && cutVideoFile !== prevCutVideoFileRef.current;

    if (cutJustCompleted || cutFileChanged) {
      prevCutVideoFileRef.current = cutVideoFile;
      setVideoKey(k => k + 1);
    }

    prevStatusRef.current = status;
  }, [cutVideoFile, status]);

  useEffect(() => {
    if (hasAudio === false && status === 'uploaded' && !extractTriggeredRef.current) {
      extractTriggeredRef.current = true;
      fetch(`/api/projects/${projectId}/extract-audio`, { method: 'POST' })
        .then((r) => r.ok && fetchProject())
        .catch(() => {});
    }
  }, [hasAudio, status, projectId, fetchProject]);

  useEffect(() => {
    if (status === 'cut' && cutVideoFile && !subtitles && !subtitleGenTriggeredRef.current) {
      subtitleGenTriggeredRef.current = true;
      fetch('/api/subtitles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
        .then((r) => r.ok && fetchProject())
        .catch(() => {});
    }
  }, [status, cutVideoFile, subtitles, projectId, fetchProject]);

  useEffect(() => {
    const shouldPoll =
      status === 'extracting_audio' ||
      status === 'transcribing' ||
      status === 'analyzing' ||
      status === 'cutting' ||
      status === 'burning' ||
      (hasAudio && !words);

    if (prevStatusRef.current === 'cutting' && status === 'cut' && !justCompletedCutRef.current) {
      justCompletedCutRef.current = true;
      setTimeout(() => fetchProject(), 500);
    } else if (status !== 'cut') {
      justCompletedCutRef.current = false;
    }

    if (shouldPoll) {
      const id = setInterval(fetchProject, 2000);
      return () => clearInterval(id);
    }
  }, [hasAudio, words, status, fetchProject, cutVideoFile]);

  const handleTimeUpdate = useCallback(
    (t: number) => {
      if (videoRef.current && Math.abs(videoRef.current.currentTime - t) > 0.1) {
        videoRef.current.currentTime = t;
      }
      const idx = words?.findIndex((w) => !w.isGap && t >= w.start && t < w.end) ?? -1;
      setCurrentIndex(idx);
    },
    [words],
  );

  // Panel resize drag
  const handlePanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isPanelDraggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handlePanelDragMove = (e: MouseEvent) => {
      if (!isPanelDraggingRef.current) return;
      const bottom = window.innerHeight - e.clientY;
      setPanelHeight(Math.max(120, Math.min(window.innerHeight - 200, bottom)));
    };
    const handlePanelDragEnd = () => {
      if (isPanelDraggingRef.current) {
        isPanelDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    document.addEventListener('mousemove', handlePanelDragMove);
    document.addEventListener('mouseup', handlePanelDragEnd);
    return () => {
      document.removeEventListener('mousemove', handlePanelDragMove);
      document.removeEventListener('mouseup', handlePanelDragEnd);
    };
  }, []);

  const handlePlay = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  const handlePause = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, []);


  const handleJump = useCallback((time: number) => {
    if (!isSelectingRef.current) {
      wsRef.current?.setTime(time);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
    }
  }, []);

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

  const handleSubtitleChange = useCallback((index: number, newText: string) => {
    setSubtitles(prev => {
      if (!prev) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], text: newText };
      return updated;
    });
  }, []);

  const handleSubtitleSave = useCallback(async () => {
    if (!subtitles) return;
    await fetch('/api/subtitles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, subtitles }),
    });
  }, [projectId, subtitles]);

  useEffect(() => {
    if (!subtitlesLoadedRef.current || !subtitles) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      fetch('/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, subtitles }),
      }).catch(() => {});
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [subtitles, projectId]);

  const handleBurnSubtitles = useCallback(async () => {
    if (!subtitles || isBurning) return;

    await handleSubtitleSave();
    setIsBurning(true);
    setBurnProgress(0);

    try {
      const response = await fetch('/api/burn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, outline: 2 }),
      });

      if (!response.ok) throw new Error('Burn failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.percent !== undefined) {
                setBurnProgress(data.percent);
              }
              if (data.done) {
                setIsBurning(false);
                fetchProject();
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Burn failed:', error);
      setIsBurning(false);
    }
  }, [projectId, subtitles, isBurning, handleSubtitleSave, fetchProject]);

  const handleVideoTimeUpdate = useCallback(() => {
    if (!videoRef.current || !subtitles) return;
    const t = videoRef.current.currentTime;
    const idx = subtitles.findIndex(s => t >= s.start && t < s.end);
    if (idx >= 0 && idx !== activeSubtitleIndex) {
      setActiveSubtitleIndex(idx);
      const el = subtitleListRef.current?.querySelector(`[data-sub-idx="${idx}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [subtitles, activeSubtitleIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitles) return;
    video.addEventListener('timeupdate', handleVideoTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleVideoTimeUpdate);
  }, [handleVideoTimeUpdate, subtitles]);

  const handleSubtitleJump = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  const removeSegments = useMemo(
    () => (words ? indicesToDeleteSegments(words, [...selected]) : []),
    [words, selected],
  );

  const videoUrl = useMemo(() => {
    if (burnedVideoFile) {
      return `/api/video/${projectId}?file=${encodeURIComponent(burnedVideoFile)}&v=${videoKey}`;
    }
    if (cutVideoFile) {
      return `/api/video/${projectId}?file=${encodeURIComponent(cutVideoFile)}&v=${videoKey}`;
    }
    return `/api/video/${projectId}`;
  }, [projectId, burnedVideoFile, cutVideoFile, videoKey]);

  const showSubtitles = subtitles && subtitles.length > 0;
  const showWordSelector = !showSubtitles && words && words.length > 0 && !cutVideoFile;

  const hasTranscriptContent = showSubtitles || showWordSelector;
  const panelTitle = showSubtitles ? 'Subtitles' : showWordSelector ? 'Transcription' : 'Subtitles';

  // Auto-open bottom panel when transcript/subtitles become available
  const prevHasContentRef = useRef(false);
  useEffect(() => {
    if (hasTranscriptContent && !prevHasContentRef.current) {
      setShowSubtitlePanel(true);
      setPanelMinimized(false);
    }
    prevHasContentRef.current = !!hasTranscriptContent;
  }, [hasTranscriptContent]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Video + Waveform */}
      <div className={`flex flex-col overflow-hidden min-w-0 min-h-0 ${videoCollapsed ? 'flex-shrink-0' : 'flex-1'}`}>
        {/* Video */}
        <div className={`${videoCollapsed ? '' : 'flex-1 min-h-0'} p-4 pb-2 flex flex-col`}>
          {/* Status bar with + button */}
          <div className="flex items-center justify-between mb-2">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-[var(--retro-text-dark)] hover:text-[var(--retro-cyan)] transition-colors font-bold"
            >
              <span>&larr;</span>
              <span>ACTA</span>
            </Link>
            <div className="flex-1">
              {burnedVideoFile && (
                <div className="text-center text-sm text-[var(--retro-charcoal)]">
                  [OK] Subtitles attached - final video ready
                </div>
              )}
              {cutVideoFile && !burnedVideoFile && (
                <div className="text-center text-sm text-[var(--retro-charcoal)]">
                  [OK] Cut complete - filler words removed
                </div>
              )}
            </div>

            {/* Plus button for opening panels */}
            <div className="relative">
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="w-8 h-8 flex items-center justify-center rounded-[2px] bg-[var(--retro-charcoal)] border-2 border-[var(--retro-border)] text-[var(--retro-text-light)]/60 hover:text-[var(--retro-green)] hover:border-[var(--retro-green)] transition-colors"
                title="Add panel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              {/* Dropdown menu */}
              {showPlusMenu && (
                <div className="absolute right-0 top-10 z-50 bg-[var(--retro-charcoal)] border-3 border-[var(--retro-border)] rounded-[2px] shadow-xl py-1 min-w-[180px]">
                  <button
                    onClick={() => {
                      setShowSubtitlePanel(true);
                      setShowPlusMenu(false);
                    }}
                    disabled={!hasTranscriptContent}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                      hasTranscriptContent
                        ? 'text-[var(--retro-text-light)] hover:bg-[var(--retro-charcoal-light)]'
                        : 'text-[var(--retro-text-light)]/30 cursor-not-allowed'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {panelTitle}
                    {showSubtitlePanel && <span className="ml-auto text-[var(--retro-green)]">●</span>}
                  </button>
                </div>
              )}
            </div>
          </div>

          {videoCollapsed ? (
            <div className="terminal-border bg-[var(--retro-charcoal)] flex-shrink-0">
              <div className="flex items-center gap-3 px-4 py-2 bg-[var(--retro-charcoal-light)]">
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] opacity-40" style={{ minWidth: 14, minHeight: 14 }} />
                  <div className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] opacity-40" style={{ minWidth: 14, minHeight: 14 }} />
                  <button
                    onClick={() => {
                      setVideoCollapsed(false);
                      setPanelMinimized(true);
                    }}
                    className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
                    style={{ minWidth: 14, minHeight: 14 }}
                    title="Expand"
                  />
                </div>
                <h3 className="text-xs font-bold text-[var(--retro-text-light)] uppercase tracking-wide">Video Preview</h3>
              </div>
            </div>
          ) : (
            <>
              {/* Video container with annotation overlay */}
              <div ref={videoContainerRef} className="relative terminal-border bg-[var(--retro-charcoal)] flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* Window chrome buttons */}
                <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] opacity-40" style={{ minWidth: 14, minHeight: 14 }} />
                  <button
                    onClick={() => setVideoCollapsed(true)}
                    className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
                    style={{ minWidth: 14, minHeight: 14 }}
                    title="Minimize"
                  />
                  <button
                    onClick={() => {
                      if (showSubtitlePanel && !panelMinimized) {
                        setPanelMinimized(true);
                      }
                    }}
                    className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
                    style={{ minWidth: 14, minHeight: 14 }}
                    title="Maximize"
                  />
                </div>
                <video
                  key={`video-${videoKey}`}
                  ref={videoRef}
                  className="w-full flex-1 min-h-0 bg-black rounded-[2px] object-contain"
                  src={videoUrl}
                  playsInline
                  muted
                />
                {/* Annotation overlay */}
                {annotations.length > 0 && videoContainerSize.width > 0 && (
                  <AnnotationOverlay
                    annotations={annotations}
                    currentTime={videoTime}
                    containerWidth={videoContainerSize.width}
                    containerHeight={videoContainerSize.height}
                    videoWidth={videoDimensions.width}
                    videoHeight={videoDimensions.height}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Waveform */}
        {!videoCollapsed && (
          <div className="flex-shrink-0 overflow-auto p-4 pt-2">
            {/* Before cut - show original audio waveform */}
            {!cutVideoFile && hasAudio === true && (
              <WaveformPlayer
                audioUrl={`/api/audio/${projectId}`}
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlay}
                onPause={handlePause}
                wsRef={wsRef}
                removeSegments={removeSegments}
              />
            )}

            {/* After cut - show cut audio waveform if available */}
            {cutVideoFile && cutAudioFile && (
              <WaveformPlayer
                key={`cut-waveform-${waveformKey}`}
                audioUrl={`/api/audio/${projectId}?cut=true&v=${waveformKey}`}
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlay}
                onPause={handlePause}
                wsRef={wsRef}
                removeSegments={[]}
              />
            )}

            {/* After cut but no cut audio - show simple message */}
            {cutVideoFile && !cutAudioFile && (
              <div className="p-4 bg-[var(--retro-charcoal)] rounded-[2px] border-2 border-[var(--retro-border)] text-center text-[var(--retro-text-light)]/60 text-sm">
                <div className="text-[var(--retro-green)] font-bold mb-1">[OK] Video ready</div>
                Use the video controls above to play with audio
              </div>
            )}

            {!cutVideoFile && hasAudio === false && (
              <div className="p-4 bg-[var(--retro-charcoal)] rounded-[2px] border-2 border-[var(--retro-border)] text-center text-[var(--retro-text-light)]/40 text-sm">
                {status === 'extracting_audio'
                  ? 'Extracting audio from video...'
                  : 'Processing video. The waveform will appear shortly.'}
              </div>
            )}
            {!cutVideoFile && hasAudio === null && (
              <div className="p-4 bg-[var(--retro-charcoal)] rounded-[2px] border-2 border-[var(--retro-border)] text-center text-[var(--retro-text-light)]/40 text-sm">
                Loading...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click outside to close plus menu */}
      {showPlusMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowPlusMenu(false)}
        />
      )}

      {/* Bottom Subtitle/Transcription Panel */}
      {showSubtitlePanel && (
        <>
          {/* Resize handle */}
          {!panelMinimized && (
            <div
              onMouseDown={handlePanelDragStart}
              className="h-1.5 bg-[var(--retro-border)] hover:bg-[var(--retro-cyan)] cursor-row-resize flex-shrink-0 transition-colors"
            />
          )}

          <div
            className="flex-shrink-0 terminal-border bg-[var(--retro-charcoal)] flex flex-col overflow-hidden"
            style={{ height: panelMinimized ? 'auto' : panelHeight }}
          >
            {/* Panel header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--retro-border)] bg-[var(--retro-charcoal-light)] flex-shrink-0 relative z-10">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowSubtitlePanel(false);
                    setVideoCollapsed(false);
                  }}
                  className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
                  style={{ minWidth: 14, minHeight: 14 }}
                  title="Close"
                />
                <button
                  onClick={() => {
                    if (!panelMinimized) {
                      panelHeightBeforeMinRef.current = panelHeight;
                      setPanelMinimized(true);
                      setVideoCollapsed(false);
                    } else {
                      setPanelMinimized(false);
                    }
                  }}
                  className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
                  style={{ minWidth: 14, minHeight: 14 }}
                  title={panelMinimized ? 'Restore' : 'Minimize'}
                />
                <button
                  onClick={() => {
                    setPanelMinimized(false);
                    setVideoCollapsed(true);
                    setPanelHeight(window.innerHeight - 120);
                  }}
                  className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:brightness-75 transition-all cursor-pointer p-0 border-none outline-none"
                  style={{ minWidth: 14, minHeight: 14 }}
                  title="Full height"
                />
              </div>
              <h3 className="text-xs font-bold text-[var(--retro-text-light)] uppercase tracking-wide">{panelTitle}</h3>
            </div>

            {/* Panel content */}
            <div className={`flex-1 overflow-auto ${panelMinimized ? 'hidden' : ''}`}>
              {/* Subtitles Editor */}
              {showSubtitles && (
                <div className="p-4" ref={subtitleListRef}>
                  <div className="text-xs text-[var(--retro-text-light)]/40 mb-2">
                    Subtitles ({subtitles.length}) - Double-click to edit, click timestamp to seek
                  </div>
                  <div className="space-y-1">
                    {subtitles.map((sub, i) => (
                      <SubtitleItem
                        key={i}
                        subtitle={sub}
                        index={i}
                        isActive={i === activeSubtitleIndex}
                        onEdit={handleSubtitleChange}
                        onJump={handleSubtitleJump}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Word Selector (during cutting stage) */}
              {showWordSelector && (
                <div className="p-4">
                  <div className="mb-3 p-3 bg-[var(--retro-charcoal-light)] rounded-[2px] border border-[var(--retro-border)] text-xs text-[var(--retro-text-light)]/60 leading-relaxed">
                    <b className="text-[var(--retro-text-light)]">Tip:</b> Click a red word to deselect it. Double-click any word to toggle. Shift+drag to batch select/deselect.
                  </div>
                  <WordSelector
                    words={words}
                    selected={selected}
                    autoSelected={new Set(autoSelected)}
                    currentIndex={currentIndex}
                    onToggle={handleToggle}
                    onStartDrag={handleStartDrag}
                    onMoveDrag={handleMoveDrag}
                    onEndDrag={handleEndDrag}
                    onJump={handleJump}
                  />
                </div>
              )}

              {/* Empty state */}
              {!showSubtitles && !showWordSelector && (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center text-[var(--retro-text-light)]/40">
                    {status === 'transcribing' && 'Transcribing video...'}
                    {status === 'analyzing' && 'Analyzing transcript...'}
                    {status === 'cutting' && 'Cutting video...'}
                    {(status === 'cut' || status === 'burning') && !subtitles && 'Generating subtitles...'}
                    {!['transcribing', 'analyzing', 'cutting', 'cut', 'burning'].includes(status || '') &&
                      'Transcription will appear here'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
