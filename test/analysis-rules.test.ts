import fs from 'fs';
import path from 'path';
import type { SubtitleWord } from '@/types';
import {
  detectSilence,
  detectStutteringWords,
  detectConsecutiveFillers,
  detectRepeatedSentences,
  detectFillerWords,
  runAllRules,
  splitIntoSentences,
} from '@/lib/analysis/rules';

// Load real test data from the PXL_20260130_022652193.mp4 transcription
const testDataPath = path.join(__dirname, 'data', 'subtitles_words.json');
const words: SubtitleWord[] = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));

/**
 * Test data overview (PXL_20260130_022652193.mp4):
 *
 * Index 0:  gap  0.00-1.00  (1.0s silence)
 * Index 1:  gap  1.00-2.00  (1.0s silence)
 * Index 2:  gap  2.00-2.16  (0.16s)
 * Index 3:  "Uh" 2.16-2.96  ← FILLER, should be selected
 * Index 4:  gap  2.96-3.60  (0.64s silence)
 * Index 5:  "congratulations" 3.60-4.44  ← normal word, should NOT be selected
 * Index 6:  " "  4.44-4.44
 * Index 7:  "for" 4.44-4.56
 * ... (normal speech continues)
 * Index 25: "Uh" 8.40-8.48  ← FILLER, should be selected
 * Index 26: " "  8.48-8.48
 * Index 27: gap  8.48-8.68  (0.2s)
 * ... (normal speech continues)
 * Index 69: "Congratulations" 14.64-16.02
 */

describe('Rule-based analysis on real test data', () => {
  describe('detectSilence', () => {
    it('should detect silences >= 0.5s', () => {
      const result = detectSilence(words);

      // Index 0: gap 0-1 (1.0s) — should be detected
      expect(result.indices).toContain(0);
      // Index 1: gap 1-2 (1.0s) — should be detected
      expect(result.indices).toContain(1);
      // Index 4: gap 2.96-3.60 (0.64s) — should be detected
      expect(result.indices).toContain(4);

      // Index 2: gap 2.00-2.16 (0.16s) — should NOT be detected (< 0.5s)
      expect(result.indices).not.toContain(2);
    });

    it('should not detect short gaps', () => {
      const result = detectSilence(words);

      // All detected indices should be gaps >= 0.5s
      for (const idx of result.indices) {
        expect(words[idx].isGap).toBe(true);
        const duration = words[idx].end - words[idx].start;
        expect(duration).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  describe('detectFillerWords', () => {
    it('should detect standalone filler word "Uh" at index 3', () => {
      const result = detectFillerWords(words);

      // "Uh" at index 3 is a filler word — should be detected
      expect(result.indices).toContain(3);
    });

    it('should detect standalone filler word "Uh" at index 25', () => {
      const result = detectFillerWords(words);

      // "Uh" at index 25 is also a filler word
      expect(result.indices).toContain(25);
    });

    it('should NOT mark normal words as fillers', () => {
      const result = detectFillerWords(words);

      // Normal words should never be in the filler list
      const normalWordIndices = words
        .map((w, i) => ({ word: w, index: i }))
        .filter(({ word }) => !word.isGap && word.text.trim() !== '' && !isFillerWord(word.text))
        .map(({ index }) => index);

      for (const idx of normalWordIndices) {
        expect(result.indices).not.toContain(idx);
      }
    });
  });

  describe('runAllRules', () => {
    it('should select filler words and silences, NOT normal speech', () => {
      const results = runAllRules(words);
      const allSelected = new Set<number>();
      for (const r of results) {
        for (const idx of r.indices) {
          allSelected.add(idx);
        }
      }

      // Filler words MUST be selected
      expect(allSelected.has(3)).toBe(true);   // "Uh" at index 3
      expect(allSelected.has(25)).toBe(true);  // "Uh" at index 25

      // Long silences MUST be selected
      expect(allSelected.has(0)).toBe(true);   // 1s silence
      expect(allSelected.has(1)).toBe(true);   // 1s silence
      expect(allSelected.has(4)).toBe(true);   // 0.64s silence

      // Normal words MUST NOT be selected
      expect(allSelected.has(5)).toBe(false);  // "congratulations"
      expect(allSelected.has(7)).toBe(false);  // "for"
      expect(allSelected.has(9)).toBe(false);  // "your"
      expect(allSelected.has(11)).toBe(false); // "requirement"
      expect(allSelected.has(13)).toBe(false); // "Thank"
      expect(allSelected.has(15)).toBe(false); // "you"
      expect(allSelected.has(69)).toBe(false); // "Congratulations"
    });

    it('should never select the majority of words', () => {
      const results = runAllRules(words);
      const allSelected = new Set<number>();
      for (const r of results) {
        for (const idx of r.indices) {
          allSelected.add(idx);
        }
      }

      const totalWords = words.filter(w => !w.isGap && w.text.trim() !== '').length;
      const selectedWords = [...allSelected].filter(i => !words[i].isGap && words[i].text.trim() !== '').length;

      // Rule-based should select a small minority of words, not the majority
      // In this test case, only 2 filler "Uh" words should be selected out of ~35 real words
      expect(selectedWords).toBeLessThan(totalWords * 0.3);
    });
  });

  describe('detectStutteringWords', () => {
    it('should not false-positive on this data', () => {
      const result = detectStutteringWords(words);
      // This test data has no stuttering words
      expect(result.indices.length).toBe(0);
    });
  });

  describe('detectConsecutiveFillers', () => {
    it('should not false-positive on this data', () => {
      const result = detectConsecutiveFillers(words);
      // This test data has no consecutive fillers (the two "Uh" are far apart)
      expect(result.indices.length).toBe(0);
    });
  });

  describe('detectRepeatedSentences', () => {
    it('should not false-positive on normal speech', () => {
      const result = detectRepeatedSentences(words);
      // No repeated sentences in this test data
      // (The two occurrences of "congratulations" are in different contexts)
      expect(result.indices.length).toBe(0);
    });
  });

  describe('splitIntoSentences', () => {
    it('should correctly split by silences >= 0.5s', () => {
      const sentences = splitIntoSentences(words);

      // Should produce multiple sentences
      expect(sentences.length).toBeGreaterThan(1);

      // First sentence after the opening silence should be "Uh" (standalone)
      // or the sentence starting with "congratulations"
      const firstSentenceText = sentences[0].text.trim();
      expect(['Uh', 'congratulations'].some(w => firstSentenceText.includes(w))).toBe(true);
    });
  });
});

// Helper function matching the rules implementation
function isFillerWord(text: string): boolean {
  const fillers = ['um', 'uh', 'er', 'ah', 'eh', 'oh', 'hmm', 'huh',
                   '嗯', '啊', '呃', '哦', '额', '唔', '哈'];
  return fillers.includes(text.toLowerCase().trim());
}
