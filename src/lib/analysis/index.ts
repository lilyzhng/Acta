import type { SubtitleWord, AnalysisResult, ClaudeResult } from '@/types';
import { runAllRules } from './rules';
import { analyzeWithClaude } from './claude';

/**
 * Hybrid analysis orchestrator:
 * 1. Run rule-based detection first (silence, exact repeats, stuttering, consecutive fillers)
 * 2. Send transcript + rule results to Claude API (fragments, restatements, intra-repetition)
 * 3. Merge all indices, deduplicate
 */
export async function runHybridAnalysis(
  words: SubtitleWord[]
): Promise<AnalysisResult> {
  // Step 1: Rule-based detection
  const ruleResults = runAllRules(words);

  // Collect all rule-marked indices
  const ruleMarkedIndices = new Set<number>();
  for (const result of ruleResults) {
    for (const idx of result.indices) {
      ruleMarkedIndices.add(idx);
    }
  }

  // Step 2: Claude API for nuanced detection
  let claudeResults: ClaudeResult[] = [];
  try {
    claudeResults = await analyzeWithClaude(words, ruleMarkedIndices);
  } catch (err) {
    console.error('Claude analysis failed, using rules only:', err);
  }

  // Step 3: Merge all indices
  const allIndices = new Set<number>(ruleMarkedIndices);
  for (const result of claudeResults) {
    for (const idx of result.indices) {
      allIndices.add(idx);
    }
  }

  return {
    autoSelected: [...allIndices].sort((a, b) => a - b),
    ruleResults,
    claudeResults,
  };
}
