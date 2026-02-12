import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import type { SubtitleWord, ClaudeResult } from '@/types';

const client = new Anthropic();

/**
 * Load the original SKILL.md as system prompt context.
 */
function loadSkillPrompt(): string {
  const skillPath = path.join(process.cwd(), 'detection-rules', 'SKILL.md');
  if (fs.existsSync(skillPath)) return fs.readFileSync(skillPath, 'utf8');
  return '';
}

/**
 * Load additional skill files (self-evolve, subtitles) as extra context.
 */
function loadAdditionalSkills(): string {
  const rulesDir = path.join(process.cwd(), 'detection-rules');
  if (!fs.existsSync(rulesDir)) return '';

  const skillFiles = fs.readdirSync(rulesDir)
    .filter(f => f.endsWith('-SKILL.md'))
    .sort();

  if (skillFiles.length === 0) return '';

  return skillFiles
    .map(f => {
      const content = fs.readFileSync(path.join(rulesDir, f), 'utf8');
      return `### ${f}\n\n${content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Load ALL user-preference rule files (exclude SKILL files and README).
 */
function loadAllUserPreferences(): string {
  const rulesDir = path.join(process.cwd(), 'detection-rules');
  if (!fs.existsSync(rulesDir)) return '';

  const files = fs.readdirSync(rulesDir)
    .filter(f => f.endsWith('.md') && !f.includes('SKILL.md') && f !== 'README.md' && f !== 'feedback-log.md')
    .sort();

  return files
    .map(f => {
      const content = fs.readFileSync(path.join(rulesDir, f), 'utf8');
      return `### ${f}\n\n${content}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Generate readable.txt format — same as original: idx|content|time
 */
function generateReadable(words: SubtitleWord[]): string {
  const lines: string[] = [];
  words.forEach((w, i) => {
    if (w.isGap) {
      const dur = (w.end - w.start).toFixed(2);
      if (parseFloat(dur) >= 0.5) {
        lines.push(`${i}|[silence${dur}s]|${w.start.toFixed(2)}-${w.end.toFixed(2)}`);
      }
    } else if (w.text.trim()) {
      lines.push(`${i}|${w.text}|${w.start.toFixed(2)}-${w.end.toFixed(2)}`);
    }
  });
  return lines.join('\n');
}

/**
 * Generate sentences.txt format — same as original: sentenceIdx|startIdx-endIdx|text
 */
function generateSentences(words: SubtitleWord[]): string {
  const sentences: Array<{ text: string; startIdx: number; endIdx: number }> = [];
  let curr = { text: '', startIdx: -1, endIdx: -1 };

  words.forEach((w, i) => {
    const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
    if (isLongGap) {
      if (curr.text.length > 0) sentences.push({ ...curr });
      curr = { text: '', startIdx: -1, endIdx: -1 };
    } else if (!w.isGap) {
      if (curr.startIdx === -1) curr.startIdx = i;
      curr.text += w.text;
      curr.endIdx = i;
    }
  });
  if (curr.text.length > 0) sentences.push(curr);

  return sentences
    .map((s, i) => `${i}|${s.startIdx}-${s.endIdx}|${s.text}`)
    .join('\n');
}

/**
 * Analyze stutters using Claude API with the original SKILL.md as system prompt.
 * Processes in 300-line chunks, same as the original workflow.
 */
export async function analyzeWithClaude(
  words: SubtitleWord[],
  ruleMarkedIndices: Set<number>
): Promise<ClaudeResult[]> {
  const readable = generateReadable(words);
  const sentences = generateSentences(words);

  // Process in chunks of ~300 lines, same as original
  const readableLines = readable.split('\n');
  const CHUNK_SIZE = 300;
  const allResults: ClaudeResult[] = [];

  for (let offset = 0; offset < readableLines.length; offset += CHUNK_SIZE) {
    const chunk = readableLines.slice(offset, offset + CHUNK_SIZE).join('\n');
    const chunkResults = await analyzeChunk(
      chunk, sentences, ruleMarkedIndices, words, offset,
      Math.min(offset + CHUNK_SIZE, readableLines.length)
    );
    allResults.push(...chunkResults);
  }

  return allResults;
}

async function analyzeChunk(
  readableChunk: string,
  sentences: string,
  ruleMarkedIndices: Set<number>,
  words: SubtitleWord[],
  lineStart: number,
  lineEnd: number
): Promise<ClaudeResult[]> {
  const skillPrompt = loadSkillPrompt();
  const additionalSkills = loadAdditionalSkills();
  const userPreferences = loadAllUserPreferences();

  const systemPrompt = `${skillPrompt}

## Additional Skills Context

${additionalSkills}

## User Preferences (Detection Rules)

${userPreferences}

You are now executing Step 5.5 of the workflow: AI analyzes stutters.
Silences >= 0.5s have already been marked by the script in step 5.4.
You must analyze the readable.txt segment provided and identify additional stutters.`;

  const userMessage = `## Already marked by rules (DO NOT re-mark these indices)

[${[...ruleMarkedIndices].sort((a, b) => a - b).join(', ')}]

## sentences.txt (full)

${sentences}

## readable.txt (lines ${lineStart}-${lineEnd})

Format: idx|content|time

${readableChunk}

**Critical warning: the first column is the idx, use THAT value for indices, not the line number.**

Analyze this segment now. Output a stutter analysis table, then output the JSON array of indices to append to auto_selected.json:

\`\`\`json
[idx1, idx2, ...]
\`\`\`

If no stutters found, output:

\`\`\`json
[]
\`\`\``;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');

  try {
    // Extract the JSON array from the response
    const jsonBlockMatch = text.match(/```json\s*\n?\s*(\[[\s\S]*?\])\s*\n?\s*```/);
    const jsonStr = jsonBlockMatch
      ? jsonBlockMatch[1]
      : (text.match(/\[[\d\s,]*\]/) || ['[]'])[0];

    const indices = JSON.parse(jsonStr) as number[];

    // Filter to valid indices, exclude already-marked
    const validIndices = indices.filter(
      i => i >= 0 && i < words.length && !ruleMarkedIndices.has(i)
    );

    // Safety: reject if it tries to mark too many words
    const totalNonGapWords = words.filter(w => !w.isGap && w.text.trim()).length;
    if (validIndices.length > totalNonGapWords * 0.3) {
      console.warn(
        `Claude chunk rejected: tried to mark ${validIndices.length}/${totalNonGapWords} words`
      );
      return [];
    }

    if (validIndices.length === 0) return [];

    return [{
      indices: validIndices,
      type: 'claude-analysis',
      description: `Segment ${lineStart}-${lineEnd}: ${validIndices.length} stutter indices`,
    }];
  } catch {
    console.error('Failed to parse Claude chunk response:', text.slice(0, 200));
    return [];
  }
}
