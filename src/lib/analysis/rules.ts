import type { SubtitleWord, RuleResult } from '@/types';

const FILLER_WORDS = ['um', 'uh', 'er', 'ah', 'eh', 'oh', 'hmm', 'huh'];
// Chinese equivalents
const FILLER_WORDS_ZH = ['嗯', '啊', '呃', '哦', '额', '唔', '哈'];

const ALL_FILLERS = [...FILLER_WORDS, ...FILLER_WORDS_ZH];

/**
 * Detect silences >= 0.5s (user-preferences/3)
 */
export function detectSilence(words: SubtitleWord[]): RuleResult {
  const indices: number[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.isGap) {
      const duration = w.end - w.start;
      if (duration >= 0.5) {
        indices.push(i);
      }
    }
  }

  return {
    indices,
    rule: 'silence',
    description: 'Silence >= 0.5s',
  };
}

/**
 * Detect stuttering words - consecutive duplicate words (user-preferences/5)
 * "that that", "so so", "and and"
 */
export function detectStutteringWords(words: SubtitleWord[]): RuleResult {
  const indices: number[] = [];
  const textWords = words.map((w, i) => ({ text: w.text.toLowerCase().trim(), index: i, isGap: w.isGap }));

  for (let i = 0; i < textWords.length - 1; i++) {
    if (textWords[i].isGap || !textWords[i].text) continue;

    // Find the next non-gap word
    let j = i + 1;
    while (j < textWords.length && textWords[j].isGap) j++;
    if (j >= textWords.length) break;

    if (textWords[i].text === textWords[j].text && textWords[i].text.length > 0) {
      // Delete the front one (and any gaps between)
      indices.push(textWords[i].index);
      for (let k = i + 1; k < j; k++) {
        if (textWords[k].isGap) indices.push(textWords[k].index);
      }
    }
  }

  return {
    indices: [...new Set(indices)],
    rule: 'stuttering-words',
    description: 'Consecutive duplicate words',
  };
}

/**
 * Detect standalone filler words (user-preferences/2)
 * "um", "uh", "er", "ah", etc. — mark for deletion
 */
export function detectFillerWords(words: SubtitleWord[]): RuleResult {
  const indices: number[] = [];

  for (let i = 0; i < words.length; i++) {
    if (words[i].isGap || !words[i].text.trim()) continue;
    const text = words[i].text.toLowerCase().trim();
    if (ALL_FILLERS.includes(text)) {
      indices.push(i);
    }
  }

  return {
    indices,
    rule: 'filler-words',
    description: 'Standalone filler words (um, uh, er, etc.)',
  };
}

/**
 * Detect consecutive filler words (user-preferences/7)
 * "um uh", "uh er", "oh um"
 */
export function detectConsecutiveFillers(words: SubtitleWord[]): RuleResult {
  const indices: number[] = [];

  for (let i = 0; i < words.length - 1; i++) {
    if (words[i].isGap || !words[i].text) continue;
    const currText = words[i].text.toLowerCase().trim();
    if (!ALL_FILLERS.includes(currText)) continue;

    // Find next non-gap word
    let j = i + 1;
    while (j < words.length && words[j].isGap) j++;
    if (j >= words.length) break;

    const nextText = words[j].text.toLowerCase().trim();
    if (ALL_FILLERS.includes(nextText)) {
      // Delete both fillers and gaps between
      indices.push(i);
      for (let k = i + 1; k <= j; k++) {
        indices.push(k);
      }
    }
  }

  return {
    indices: [...new Set(indices)],
    rule: 'consecutive-fillers',
    description: 'Two adjacent filler words',
  };
}

/**
 * Detect exact repeated sentences (user-preferences/4)
 * Adjacent sentences sharing >= 5 identical starting characters
 */
export function detectRepeatedSentences(words: SubtitleWord[]): RuleResult {
  const indices: number[] = [];

  // Split into sentences by silence (gaps >= 0.5s)
  const sentences = splitIntoSentences(words);

  // Compare adjacent sentences
  for (let i = 0; i < sentences.length - 1; i++) {
    const curr = sentences[i];
    const next = sentences[i + 1];

    if (curr.text.length >= 5 && next.text.length >= 5) {
      if (curr.text.slice(0, 5) === next.text.slice(0, 5)) {
        // Delete the shorter (or earlier) full sentence
        const toDelete = curr.text.length <= next.text.length ? curr : next;
        for (let j = toDelete.startIdx; j <= toDelete.endIdx; j++) {
          indices.push(j);
        }
        // Also delete any gap right after the deleted sentence
        if (toDelete === curr && toDelete.endIdx + 1 < words.length && words[toDelete.endIdx + 1].isGap) {
          indices.push(toDelete.endIdx + 1);
        }
      }
    }
  }

  // Skip-one comparison (fragment in between)
  for (let i = 0; i < sentences.length - 2; i++) {
    const curr = sentences[i];
    const mid = sentences[i + 1];
    const next = sentences[i + 2];

    if (mid.text.length <= 5) {
      if (curr.text.length >= 5 && next.text.length >= 5 && curr.text.slice(0, 5) === next.text.slice(0, 5)) {
        // Delete curr + mid
        for (let j = curr.startIdx; j <= curr.endIdx; j++) indices.push(j);
        for (let j = mid.startIdx; j <= mid.endIdx; j++) indices.push(j);
        // Delete gaps between
        for (let j = curr.endIdx + 1; j < mid.startIdx; j++) {
          if (words[j].isGap) indices.push(j);
        }
        for (let j = mid.endIdx + 1; j < next.startIdx; j++) {
          if (words[j].isGap) indices.push(j);
        }
      }
    }
  }

  return {
    indices: [...new Set(indices)],
    rule: 'repeated-sentences',
    description: 'Adjacent sentences with same start',
  };
}

interface Sentence {
  text: string;
  startIdx: number;
  endIdx: number;
  wordIndices: number[];
}

export function splitIntoSentences(words: SubtitleWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  let currentWords: number[] = [];
  let currentText = '';

  for (let i = 0; i < words.length; i++) {
    if (words[i].isGap) {
      const duration = words[i].end - words[i].start;
      if (duration >= 0.5 && currentWords.length > 0) {
        // End current sentence
        sentences.push({
          text: currentText.trim(),
          startIdx: currentWords[0],
          endIdx: currentWords[currentWords.length - 1],
          wordIndices: [...currentWords],
        });
        currentWords = [];
        currentText = '';
      }
    } else {
      currentWords.push(i);
      currentText += words[i].text;
    }
  }

  // Don't forget the last sentence
  if (currentWords.length > 0) {
    sentences.push({
      text: currentText.trim(),
      startIdx: currentWords[0],
      endIdx: currentWords[currentWords.length - 1],
      wordIndices: [...currentWords],
    });
  }

  return sentences;
}

/**
 * Run all rule-based detections
 */
export function runAllRules(words: SubtitleWord[]): RuleResult[] {
  return [
    detectSilence(words),
    detectFillerWords(words),
    detectStutteringWords(words),
    detectConsecutiveFillers(words),
    detectRepeatedSentences(words),
  ];
}
