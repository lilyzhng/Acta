import type { SubtitleWord, DeleteSegment, Subtitle, VolcengineResult } from '@/types';

/**
 * Generate character-level subtitles from Volcengine result
 * Ported from cut/scripts/generate_subtitles.js
 */
export function generateSubtitleWords(
  result: VolcengineResult,
  deleteSegments?: DeleteSegment[]
): SubtitleWord[] {
  // Extract all characters
  const allWords: Array<{ text: string; start: number; end: number }> = [];
  for (const utterance of result.utterances) {
    if (utterance.words) {
      for (const word of utterance.words) {
        allWords.push({
          text: word.text,
          start: word.start_time / 1000,
          end: word.end_time / 1000,
        });
      }
    }
  }

  // If delete segments exist, remap timestamps
  let outputWords = allWords;

  if (deleteSegments && deleteSegments.length > 0) {
    function getDeletedTimeBefore(time: number): number {
      let deleted = 0;
      for (const seg of deleteSegments!) {
        if (seg.end <= time) {
          deleted += seg.end - seg.start;
        } else if (seg.start < time) {
          deleted += time - seg.start;
        }
      }
      return deleted;
    }

    function isDeleted(start: number, end: number): boolean {
      for (const seg of deleteSegments!) {
        if (start < seg.end && end > seg.start) return true;
      }
      return false;
    }

    outputWords = [];
    for (const word of allWords) {
      if (!isDeleted(word.start, word.end)) {
        const deletedBefore = getDeletedTimeBefore(word.start);
        outputWords.push({
          text: word.text,
          start: Math.round((word.start - deletedBefore) * 100) / 100,
          end: Math.round((word.end - deletedBefore) * 100) / 100,
        });
      }
    }
  }

  // Add gap markers (silences >0.5s split by 1s for fine-grained control)
  const wordsWithGaps: SubtitleWord[] = [];
  let lastEnd = 0;

  for (const word of outputWords) {
    const gapDuration = word.start - lastEnd;

    if (gapDuration > 0.1) {
      if (gapDuration > 0.5) {
        // Split by 1s
        let gapStart = lastEnd;
        while (gapStart < word.start) {
          const gapEnd = Math.min(gapStart + 1, word.start);
          wordsWithGaps.push({
            text: '',
            start: Math.round(gapStart * 100) / 100,
            end: Math.round(gapEnd * 100) / 100,
            isGap: true,
          });
          gapStart = gapEnd;
        }
      } else {
        wordsWithGaps.push({
          text: '',
          start: Math.round(lastEnd * 100) / 100,
          end: Math.round(word.start * 100) / 100,
          isGap: true,
        });
      }
    }

    wordsWithGaps.push({
      text: word.text,
      start: word.start,
      end: word.end,
      isGap: false,
    });
    lastEnd = word.end;
  }

  return wordsWithGaps;
}

/**
 * Group subtitle words into subtitle lines
 * Groups characters into lines of ~15 chars, split at natural boundaries
 */
export function groupIntoSubtitles(words: SubtitleWord[]): Subtitle[] {
  const textWords = words.filter(w => !w.isGap);
  if (textWords.length === 0) return [];

  const subtitles: Subtitle[] = [];
  let currentText = '';
  let currentStart = textWords[0].start;
  let currentEnd = textWords[0].end;

  for (const word of textWords) {
    currentText += word.text;
    currentEnd = word.end;

    // Split at ~15 characters or at sentence boundaries
    if (currentText.length >= 15) {
      subtitles.push({
        text: currentText,
        start: currentStart,
        end: currentEnd,
      });
      currentText = '';
      currentStart = currentEnd;
    }
  }

  // Add remaining text
  if (currentText) {
    subtitles.push({
      text: currentText,
      start: currentStart,
      end: currentEnd,
    });
  }

  return subtitles;
}
