import type { DeleteSegment, SubtitleWord } from '@/types';

const BUFFER_MS = 50;

/**
 * Convert selected word indices to delete segments with buffer expansion and merging
 */
export function indicesToDeleteSegments(
  words: SubtitleWord[],
  selectedIndices: number[]
): DeleteSegment[] {
  const sorted = [...selectedIndices].sort((a, b) => a - b);

  const segments: DeleteSegment[] = sorted.map(i => ({
    start: words[i].start,
    end: words[i].end,
  }));

  // Merge adjacent segments (gap < 0.05s)
  const merged: DeleteSegment[] = [];
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
}

/**
 * Add buffer to segments and merge overlapping ones
 */
export function expandAndMergeSegments(
  segments: DeleteSegment[],
  duration: number,
  bufferMs: number = BUFFER_MS
): DeleteSegment[] {
  const bufferSec = bufferMs / 1000;

  const expanded = segments
    .map(seg => ({
      start: Math.max(0, seg.start - bufferSec),
      end: Math.min(duration, seg.end + bufferSec),
    }))
    .sort((a, b) => a.start - b.start);

  const merged: DeleteSegment[] = [];
  for (const seg of expanded) {
    if (merged.length === 0 || seg.start > merged[merged.length - 1].end) {
      merged.push({ ...seg });
    } else {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, seg.end);
    }
  }

  return merged;
}
