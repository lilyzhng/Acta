'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { WaveformPlayer } from '@/components/review/WaveformPlayer';
import { WordSelector } from '@/components/review/WordSelector';
import { SubtitleItem } from '@/components/subtitles/SubtitleItem';
import { indicesToDeleteSegments } from '@/lib/segment-merger';
import type { SubtitleWord, Subtitle } from '@/types';

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
  const subtitleListRef = useRef<HTMLDivElement>(null);
  const subtitlesLoadedRef = useRef(false); // Track if subtitles were loaded from server
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
          
          // Track burned video file
          const newBurnedVideoFile = project.burnedVideoFile || null;
          setBurnedVideoFile(prev => {
            if (newBurnedVideoFile && newBurnedVideoFile !== prev) {
              setVideoKey(k => k + 1);
            }
            return newBurnedVideoFile;
          });
          
          // Fetch subtitles if available
          if (project.subtitlesWithTime) {
            try {
              const subRes = await fetch(`/api/subtitles?projectId=${projectId}`);
              if (subRes.ok) {
                const subData = await subRes.json();
                if (Array.isArray(subData)) {
                  setSubtitles(subData);
                  subtitlesLoadedRef.current = true; // Mark as loaded from server
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

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Refresh when triggered by panel events from chat
  useEffect(() => {
    if (refreshTrigger) {
      fetchProject();
    }
  }, [refreshTrigger, fetchProject]);

  // Force video reload when cut completes
  useEffect(() => {
    const cutJustCompleted = prevStatusRef.current === 'cutting' && status === 'cut';
    const cutFileChanged = cutVideoFile && cutVideoFile !== prevCutVideoFileRef.current;
    
    if (cutJustCompleted || cutFileChanged) {
      prevCutVideoFileRef.current = cutVideoFile;
      setVideoKey(k => k + 1);
    }
    
    prevStatusRef.current = status;
  }, [cutVideoFile, status]);

  // Trigger extraction when we have video but no audio
  useEffect(() => {
    if (hasAudio === false && status === 'uploaded' && !extractTriggeredRef.current) {
      extractTriggeredRef.current = true;
      fetch(`/api/projects/${projectId}/extract-audio`, { method: 'POST' })
        .then((r) => r.ok && fetchProject())
        .catch(() => {});
    }
  }, [hasAudio, status, projectId, fetchProject]);

  // Auto-generate subtitles when cut completes
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

  // Poll when processing
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

  // Sync video to waveform (waveform controls playback, video is always muted)
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

  // Subtitle handlers
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

  // Auto-save subtitles when edited (debounced)
  useEffect(() => {
    // Skip if subtitles haven't been loaded from server yet (initial load)
    if (!subtitlesLoadedRef.current || !subtitles) return;
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(() => {
      fetch('/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, subtitles }),
      }).catch(() => {
        // Ignore save errors silently
      });
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

  // Track active subtitle based on video time
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
    // Prioritize: burned video > cut video > original video
    if (burnedVideoFile) {
      return `/api/video/${projectId}?file=${encodeURIComponent(burnedVideoFile)}&v=${videoKey}`;
    }
    if (cutVideoFile) {
      return `/api/video/${projectId}?file=${encodeURIComponent(cutVideoFile)}&v=${videoKey}`;
    }
    return `/api/video/${projectId}`;
  }, [projectId, burnedVideoFile, cutVideoFile, videoKey]);

  // Determine what to show in the content column
  const showSubtitles = subtitles && subtitles.length > 0;
  const showWordSelector = !showSubtitles && words && words.length > 0 && !cutVideoFile;

  return (
    <div className="flex h-full">
      {/* Column 1: Video + Waveform */}
      <div className="w-1/2 flex flex-col border-r border-neutral-800 overflow-hidden">
        {/* Video */}
        <div className="flex-shrink-0 p-4 pb-2">
          {burnedVideoFile && (
            <div className="mb-2 text-center text-sm text-green-400">
              Subtitles attached - final video ready
            </div>
          )}
          {cutVideoFile && !burnedVideoFile && (
            <div className="mb-2 text-center text-sm text-green-400">
              Cut complete - filler words removed
            </div>
          )}
          <video
            key={`video-${videoKey}`}
            ref={videoRef}
            className="w-full max-h-[70vh] bg-black rounded-lg object-contain"
            src={videoUrl}
            playsInline
            muted
          />
        </div>

        {/* Waveform */}
        <div className="flex-1 overflow-auto p-4 pt-2">
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
            <div className="p-4 bg-neutral-800 rounded-lg text-center text-neutral-400 text-sm">
              <div className="text-green-400 font-medium mb-1">Video ready</div>
              Use the video controls above to play with audio
            </div>
          )}
          
          {!cutVideoFile && hasAudio === false && (
            <div className="p-4 bg-neutral-800 rounded-lg text-center text-neutral-500 text-sm">
              {status === 'extracting_audio'
                ? 'Extracting audio from video…'
                : 'Processing video. The waveform will appear shortly.'}
            </div>
          )}
          {!cutVideoFile && hasAudio === null && (
            <div className="p-4 bg-neutral-800 rounded-lg text-center text-neutral-500 text-sm">
              Loading...
            </div>
          )}
        </div>
      </div>

      {/* Column 2: Transcription / Subtitles */}
      <div className="w-1/2 flex flex-col overflow-hidden">
        {/* Subtitles Editor */}
        {showSubtitles && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Subtitles list */}
            <div className="flex-1 overflow-auto p-4" ref={subtitleListRef}>
              <div className="text-xs text-neutral-500 mb-2">
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
          </div>
        )}

        {/* Word Selector (during cutting stage) */}
        {showWordSelector && (
          <div className="flex-1 overflow-auto p-4">
            <div className="mb-3 p-3 bg-neutral-800 rounded text-xs text-neutral-400 leading-relaxed">
              <b className="text-white">Tip:</b> Click a red word to deselect it. Double-click any word to toggle. Shift+drag to batch select/deselect.
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
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center text-neutral-500">
              {status === 'transcribing' && 'Transcribing video...'}
              {status === 'analyzing' && 'Analyzing transcript...'}
              {status === 'cutting' && 'Cutting video...'}
              {status === 'cut' && !subtitles && 'Generating subtitles...'}
              {!['transcribing', 'analyzing', 'cutting', 'cut'].includes(status || '') && 
                'Transcription will appear here'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
