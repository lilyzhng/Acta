import { NextRequest, NextResponse } from 'next/server';
import { getProjectDir } from '@/lib/project-store';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import type { FeedbackCorrection, EvolveResult } from '@/types';

const client = new Anthropic();

const RULES_DIR = path.join(process.cwd(), 'detection-rules');

function loadRuleFiles(): { file: string; content: string }[] {
  if (!fs.existsSync(RULES_DIR)) return [];

  return fs.readdirSync(RULES_DIR)
    .filter(f => f.endsWith('.md') && !f.includes('SKILL.md') && f !== 'README.md' && f !== 'feedback-log.md')
    .sort()
    .map(f => ({
      file: f,
      content: fs.readFileSync(path.join(RULES_DIR, f), 'utf8'),
    }));
}

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const dir = getProjectDir(projectId);
  const feedbackPath = path.join(dir, 'feedback.json');

  if (!fs.existsSync(feedbackPath)) {
    return NextResponse.json({ noChangesNeeded: true, summary: 'No feedback to process' });
  }

  const corrections: FeedbackCorrection[] = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));

  // Safety: skip if fewer than 2 corrections (single corrections may be noise)
  if (corrections.length < 2) {
    return NextResponse.json({ noChangesNeeded: true, summary: 'Too few corrections to evolve (need >= 2)' });
  }

  const ruleFiles = loadRuleFiles();
  if (ruleFiles.length === 0) {
    return NextResponse.json({ error: 'No detection rule files found' }, { status: 500 });
  }

  const falsePositives = corrections.filter(c => c.type === 'false_positive');
  const falseNegatives = corrections.filter(c => c.type === 'false_negative');

  const systemPrompt = `You are a self-evolving detection rule editor for a video cutting tool.

## Your Task
Analyze user corrections to AI-selected word deletions, and update the detection rule files to improve future accuracy.

## Key Principles (from self-evolve SKILL)
1. **Integrate into the body** — find the appropriate section in the rule file and integrate the lesson there
2. **Don't just append** — feedback log records events only, rules go into the rule body
3. **Be conservative** — only update rules when the pattern is clear from the corrections
4. **Preserve structure** — maintain the existing section structure of each rule file

## Output Format
Respond with ONLY a JSON object (no markdown fencing):
{
  "updates": [
    { "file": "filename.md", "content": "full updated file content" }
  ],
  "summary": "brief description of what was changed and why",
  "noChangesNeeded": false
}

If no rule changes are warranted, set noChangesNeeded to true with an empty updates array.
Only include files that actually need changes in updates.
Only update .md rule files — never modify code.`;

  const correctionsText = [
    falsePositives.length > 0 ? `### False Positives (AI marked, user UN-marked — AI was too aggressive)\n${falsePositives.map(c =>
      `- Index ${c.index}: "${c.word}" (source: ${c.source}) — sentence: "${c.sentenceContext}"`
    ).join('\n')}` : '',
    falseNegatives.length > 0 ? `### False Negatives (user added — AI missed these)\n${falseNegatives.map(c =>
      `- Index ${c.index}: "${c.word}" — sentence: "${c.sentenceContext}"`
    ).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  const ruleFilesText = ruleFiles
    .map(r => `### ${r.file}\n\n${r.content}`)
    .join('\n\n---\n\n');

  const userMessage = `## User Corrections

${correctionsText}

## Current Detection Rule Files

${ruleFilesText}

Analyze the corrections above. Determine which rule files should be updated to prevent these errors in the future. Output the JSON result.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    // Parse JSON from response (may be wrapped in ```json fences)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const result: EvolveResult = JSON.parse(jsonStr);

    if (result.noChangesNeeded || result.updates.length === 0) {
      appendFeedbackLog(corrections, result.summary || 'No changes needed');
      return NextResponse.json({ noChangesNeeded: true, summary: result.summary });
    }

    // Write updated rule files (only allow .md files in detection-rules/)
    for (const update of result.updates) {
      const safeName = path.basename(update.file);
      if (!safeName.endsWith('.md')) continue;
      if (safeName.includes('SKILL.md') || safeName === 'README.md') continue;

      const filePath = path.join(RULES_DIR, safeName);
      // Only update existing files (don't create new rule files)
      if (!fs.existsSync(filePath)) continue;

      fs.writeFileSync(filePath, update.content);
    }

    appendFeedbackLog(corrections, result.summary);

    return NextResponse.json({
      noChangesNeeded: false,
      summary: result.summary,
      updatedFiles: result.updates.map(u => u.file),
    });
  } catch (err) {
    console.error('Evolve failed:', err);
    return NextResponse.json(
      { error: 'Evolve failed: ' + (err as Error).message },
      { status: 500 }
    );
  }
}

function appendFeedbackLog(corrections: FeedbackCorrection[], summary: string) {
  const logPath = path.join(RULES_DIR, 'feedback-log.md');

  const falsePositives = corrections.filter(c => c.type === 'false_positive');
  const falseNegatives = corrections.filter(c => c.type === 'false_negative');

  const date = new Date().toISOString().slice(0, 10);
  const entry = `\n### ${date}\n- ${falsePositives.length} false positives, ${falseNegatives.length} false negatives\n- ${summary}\n`;

  if (fs.existsSync(logPath)) {
    fs.appendFileSync(logPath, entry);
  } else {
    fs.writeFileSync(logPath, `# Feedback Log\n${entry}`);
  }
}
