import { NextRequest, NextResponse } from 'next/server';
import { getProjectDir, updateProject } from '@/lib/project-store';
import { splitIntoSentences } from '@/lib/analysis/rules';
import fs from 'fs';
import path from 'path';
import type { SubtitleWord, AnalysisResult, FeedbackCorrection } from '@/types';

export async function POST(req: NextRequest) {
  const { projectId, selectedIndices, deleteSegments } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const dir = getProjectDir(projectId);

  // Save selected indices
  if (selectedIndices) {
    fs.writeFileSync(
      path.join(dir, 'selected_indices.json'),
      JSON.stringify(selectedIndices, null, 2)
    );
  }

  // Save delete segments
  if (deleteSegments) {
    fs.writeFileSync(
      path.join(dir, 'delete_segments.json'),
      JSON.stringify(deleteSegments, null, 2)
    );
    updateProject(projectId, {
      status: 'reviewed',
      deleteSegments: 'delete_segments.json',
    });
  }

  // Compute feedback diff (auto_selected vs user's final selection)
  let correctionCount = 0;
  try {
    correctionCount = computeFeedback(dir, selectedIndices as number[]);
  } catch (err) {
    console.error('Failed to compute feedback:', err);
  }

  return NextResponse.json({ success: true, correctionCount });
}

function computeFeedback(dir: string, selectedIndices: number[]): number {
  const autoSelectedPath = path.join(dir, 'auto_selected.json');
  const analysisPath = path.join(dir, 'analysis_result.json');
  const wordsPath = path.join(dir, 'subtitles_words.json');

  if (!fs.existsSync(autoSelectedPath) || !fs.existsSync(wordsPath) || !selectedIndices) {
    return 0;
  }

  const autoSelected: number[] = JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8'));
  const words: SubtitleWord[] = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const autoSet = new Set(autoSelected);
  const userSet = new Set(selectedIndices);

  // False positives: AI selected but user removed
  const falsePositives = autoSelected.filter(i => !userSet.has(i));
  // False negatives: user added but AI didn't select
  const falseNegatives = selectedIndices.filter(i => !autoSet.has(i));

  if (falsePositives.length === 0 && falseNegatives.length === 0) {
    return 0; // No diff, skip
  }

  // Load analysis result for source attribution
  let analysisResult: AnalysisResult | null = null;
  if (fs.existsSync(analysisPath)) {
    analysisResult = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  }

  const sentences = splitIntoSentences(words);

  function getSentenceContext(wordIndex: number): string {
    for (const s of sentences) {
      if (wordIndex >= s.startIdx && wordIndex <= s.endIdx) {
        return s.text;
      }
    }
    return words[wordIndex]?.text || '';
  }

  function getSource(wordIndex: number): string {
    if (!analysisResult) return 'unknown';

    // Check rule results
    for (const r of analysisResult.ruleResults) {
      if (r.indices.includes(wordIndex)) {
        return `rule:${r.rule}`;
      }
    }
    // Check claude results
    for (const c of analysisResult.claudeResults) {
      if (c.indices.includes(wordIndex)) {
        return `claude:${c.type}`;
      }
    }
    return 'unknown';
  }

  const corrections: FeedbackCorrection[] = [];

  for (const i of falsePositives) {
    const w = words[i];
    if (!w) continue;
    corrections.push({
      index: i,
      type: 'false_positive',
      word: w.text,
      start: w.start,
      end: w.end,
      sentenceContext: getSentenceContext(i),
      source: getSource(i),
    });
  }

  for (const i of falseNegatives) {
    const w = words[i];
    if (!w) continue;
    corrections.push({
      index: i,
      type: 'false_negative',
      word: w.text,
      start: w.start,
      end: w.end,
      sentenceContext: getSentenceContext(i),
      source: 'user-added',
    });
  }

  fs.writeFileSync(
    path.join(dir, 'feedback.json'),
    JSON.stringify(corrections, null, 2)
  );

  return corrections.length;
}
