'use client';

import { useState, useCallback, useRef } from 'react';
import type { SubtitleWord } from '@/types';

export function useWordSelection(words: SubtitleWord[], autoSelected: number[]) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(autoSelected));
  const isSelectingRef = useRef(false);
  const selectStartRef = useRef(-1);
  const selectModeRef = useRef<'add' | 'remove'>('add');

  const toggle = useCallback((index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const startDrag = useCallback(
    (index: number) => {
      isSelectingRef.current = true;
      selectStartRef.current = index;
      selectModeRef.current = selected.has(index) ? 'remove' : 'add';
    },
    [selected]
  );

  const moveDrag = useCallback(
    (index: number) => {
      if (!isSelectingRef.current) return;

      const min = Math.min(selectStartRef.current, index);
      const max = Math.max(selectStartRef.current, index);

      setSelected(prev => {
        const next = new Set(prev);
        for (let j = min; j <= max; j++) {
          if (selectModeRef.current === 'add') {
            next.add(j);
          } else {
            next.delete(j);
          }
        }
        return next;
      });
    },
    []
  );

  const endDrag = useCallback(() => {
    isSelectingRef.current = false;
  }, []);

  const clearAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const resetToAutoSelected = useCallback(() => {
    setSelected(new Set(autoSelected));
  }, [autoSelected]);

  const getDeleteSegments = useCallback(() => {
    const sorted = [...selected].sort((a, b) => a - b);
    const segments: Array<{ start: number; end: number }> = [];

    for (const i of sorted) {
      segments.push({ start: words[i].start, end: words[i].end });
    }

    // Merge adjacent segments
    const merged: Array<{ start: number; end: number }> = [];
    for (const seg of segments) {
      if (merged.length === 0) {
        merged.push({ ...seg });
      } else {
        const last = merged[merged.length - 1];
        if (Math.abs(seg.start - last.end) < 0.05) {
          last.end = seg.end;
        } else {
          merged.push({ ...seg });
        }
      }
    }

    return merged;
  }, [selected, words]);

  const stats = useCallback(() => {
    let totalDuration = 0;
    selected.forEach(i => {
      if (i < words.length) {
        totalDuration += words[i].end - words[i].start;
      }
    });
    return { count: selected.size, totalDuration };
  }, [selected, words]);

  return {
    selected,
    toggle,
    startDrag,
    moveDrag,
    endDrag,
    clearAll,
    resetToAutoSelected,
    getDeleteSegments,
    stats,
    isSelecting: isSelectingRef,
  };
}
