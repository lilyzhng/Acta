'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { SubtitleItem } from './SubtitleItem';
import { DictionaryPanel } from './DictionaryPanel';
import type { Subtitle } from '@/types';

interface SubtitleEditorProps {
  projectId: string;
  videoUrl: string;
  subtitles: Subtitle[];
  dictionary: string[];
  onSubtitlesChange: (subtitles: Subtitle[]) => void;
  onSave: () => void;
  onBurn: (outline: number) => void;
  isBurning: boolean;
  burnPercent?: number;
  statusMessage?: string;
}

export function SubtitleEditor({
  projectId,
  videoUrl,
  subtitles,
  dictionary,
  onSubtitlesChange,
  onSave,
  onBurn,
  isBurning,
  burnPercent,
  statusMessage,
}: SubtitleEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [outline, setOutline] = useState(2);
  const [search, setSearch] = useState('');

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    const idx = subtitles.findIndex(s => t >= s.start && t < s.end);
    if (idx >= 0 && idx !== activeIndex) {
      setActiveIndex(idx);
      // Scroll to active
      const el = listRef.current?.querySelector(`[data-sub-idx="${idx}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [subtitles, activeIndex]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [handleTimeUpdate]);

  const handleJump = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  const handleEdit = useCallback(
    (index: number, text: string) => {
      const updated = [...subtitles];
      updated[index] = { ...updated[index], text };
      onSubtitlesChange(updated);
    },
    [subtitles, onSubtitlesChange]
  );

  const handleInsertWord = useCallback((word: string) => {
    // Insert at currently editing subtitle if any
    // This is a simplified version - in practice the editing input needs a ref
    console.log('Insert word:', word);
  }, []);

  const filteredSubtitles = search
    ? subtitles.map((s, i) => ({ ...s, originalIndex: i })).filter(s => s.text.includes(search))
    : subtitles.map((s, i) => ({ ...s, originalIndex: i }));

  return (
    <div className="flex h-full">
      {/* Video panel */}
      <div className="flex-1 p-5 flex flex-col">
        <video
          ref={videoRef}
          controls
          className="w-full max-h-[60vh] bg-black rounded-lg"
          src={videoUrl}
        />
        <div className="flex gap-2 mt-4 flex-wrap items-center">
          <button
            onClick={() => {
              const v = videoRef.current;
              if (v) v.paused ? v.play() : v.pause();
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
          >
            Play/Pause
          </button>
          <select
            onChange={(e) => {
              if (videoRef.current) videoRef.current.playbackRate = parseFloat(e.target.value);
            }}
            className="px-3 py-2 bg-neutral-700 text-white border-none rounded text-sm"
            defaultValue="1"
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
            <option value="3">3x</option>
          </select>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => onBurn(outline)}
            disabled={isBurning}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-neutral-600 text-white rounded text-sm transition-colors"
          >
            {isBurning ? 'Burning...' : 'Burn Subtitles'}
          </button>
          <label className="text-sm text-neutral-400 flex items-center gap-1">
            Outline:
            <input
              type="number"
              value={outline}
              onChange={(e) => setOutline(parseInt(e.target.value) || 2)}
              min={1}
              max={5}
              className="w-12 px-2 py-1 bg-neutral-700 border-none text-white rounded text-sm"
            />
          </label>
        </div>
        {statusMessage && (
          <div className={`mt-2 px-3 py-2 rounded text-xs ${
            statusMessage.includes('failed') || statusMessage.includes('error')
              ? 'bg-red-900/30 text-red-400'
              : 'bg-green-900/30 text-green-400'
          }`}>
            {statusMessage}
          </div>
        )}
        {isBurning && burnPercent !== undefined && (
          <div className="mt-2">
            <div className="h-1.5 bg-neutral-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${burnPercent}%` }}
              />
            </div>
            <div className="text-xs text-neutral-400 mt-1">{burnPercent}%</div>
          </div>
        )}
      </div>

      {/* Subtitle panel */}
      <div className="w-[450px] border-l border-neutral-700 flex flex-col">
        <div className="p-4 bg-neutral-800 border-b border-neutral-700">
          <h2 className="text-sm font-medium mb-2">
            Subtitles ({subtitles.length})
          </h2>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 bg-neutral-700 border-none rounded text-white text-sm placeholder-neutral-500"
          />
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {filteredSubtitles.map((sub) => (
            <div key={sub.originalIndex} data-sub-idx={sub.originalIndex}>
              <SubtitleItem
                subtitle={sub}
                index={sub.originalIndex}
                isActive={sub.originalIndex === activeIndex}
                onJump={handleJump}
                onEdit={handleEdit}
              />
            </div>
          ))}
        </div>
        <DictionaryPanel words={dictionary} onInsert={handleInsertWord} />
      </div>
    </div>
  );
}
