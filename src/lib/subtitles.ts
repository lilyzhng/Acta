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

/**
 * Group subtitles by Volcengine utterance boundaries (natural speech pauses)
 * Each utterance represents a natural sentence/phrase from the transcription.
 * Long utterances are split at word boundaries (~40 chars max per subtitle).
 */
export function groupIntoSubtitlesByUtterance(
  result: VolcengineResult,
  deleteSegments?: DeleteSegment[]
): Subtitle[] {
  const subtitles: Subtitle[] = [];
  const MAX_CHARS = 40;

  // Helper to check if a time range overlaps with any delete segment
  function isDeleted(start: number, end: number): boolean {
    if (!deleteSegments || deleteSegments.length === 0) return false;
    for (const seg of deleteSegments) {
      if (start < seg.end && end > seg.start) return true;
    }
    return false;
  }

  // Helper to calculate deleted time before a given timestamp
  function getDeletedTimeBefore(time: number): number {
    if (!deleteSegments || deleteSegments.length === 0) return 0;
    let deleted = 0;
    for (const seg of deleteSegments) {
      if (seg.end <= time) {
        deleted += seg.end - seg.start;
      } else if (seg.start < time) {
        deleted += time - seg.start;
      }
    }
    return deleted;
  }

  for (const utterance of result.utterances) {
    // Always process at word level to properly filter deleted words
    // Use word-level data if available for accurate timestamps
    if (utterance.words && utterance.words.length > 0) {
      let currentText = '';
      let currentStart = -1;
      let currentEnd = 0;

      for (const word of utterance.words) {
        const wordStart = word.start_time / 1000;
        const wordEnd = word.end_time / 1000;

        // Skip deleted words
        if (isDeleted(wordStart, wordEnd)) continue;

        const remappedWordStart = Math.round((wordStart - getDeletedTimeBefore(wordStart)) * 100) / 100;
        const remappedWordEnd = Math.round((wordEnd - getDeletedTimeBefore(wordEnd)) * 100) / 100;

        if (currentStart < 0) currentStart = remappedWordStart;

        // Add space between words (for languages that use spaces)
        const separator = currentText.length > 0 ? ' ' : '';
        const newText = currentText + separator + word.text;

        if (newText.length > MAX_CHARS && currentText.length > 0) {
          // Push current subtitle and start new one
          subtitles.push({
            text: currentText,
            start: currentStart,
            end: currentEnd,
          });
          currentText = word.text;
          currentStart = remappedWordStart;
          currentEnd = remappedWordEnd;
        } else {
          currentText = newText;
          currentEnd = remappedWordEnd;
        }
      }

      // Add remaining text
      if (currentText && currentStart >= 0) {
        subtitles.push({
          text: currentText,
          start: currentStart,
          end: currentEnd,
        });
      }
    } else {
      // No word-level data - use utterance text directly
      // This is a fallback; Volcengine typically provides word-level data
      const uttStart = utterance.start_time / 1000;
      const uttEnd = utterance.end_time / 1000;
      
      // Skip if entire utterance is deleted (can't filter at word level)
      if (isDeleted(uttStart, uttEnd)) continue;
      
      const text = utterance.text.trim();
      if (!text) continue;
      
      const remappedStart = Math.round((uttStart - getDeletedTimeBefore(uttStart)) * 100) / 100;
      const remappedEnd = Math.round((uttEnd - getDeletedTimeBefore(uttEnd)) * 100) / 100;

      // Split by spaces and distribute time evenly
      const words = text.split(/\s+/);
      const duration = remappedEnd - remappedStart;
      const timePerWord = duration / words.length;

      let currentText = '';
      let currentStart = remappedStart;
      let wordIndex = 0;

      for (const word of words) {
        const separator = currentText.length > 0 ? ' ' : '';
        const newText = currentText + separator + word;

        if (newText.length > MAX_CHARS && currentText.length > 0) {
          subtitles.push({
            text: currentText,
            start: currentStart,
            end: Math.round((remappedStart + wordIndex * timePerWord) * 100) / 100,
          });
          currentText = word;
          currentStart = Math.round((remappedStart + wordIndex * timePerWord) * 100) / 100;
        } else {
          currentText = newText;
        }
        wordIndex++;
      }

      if (currentText) {
        subtitles.push({
          text: currentText,
          start: currentStart,
          end: remappedEnd,
        });
      }
    }
  }

  return subtitles;
}
