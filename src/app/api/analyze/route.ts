import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { runHybridAnalysis } from '@/lib/analysis';
import type { SubtitleWord } from '@/types';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const dir = getProjectDir(projectId);
  const wordsPath = path.join(dir, project.subtitlesWords || 'subtitles_words.json');

  if (!fs.existsSync(wordsPath)) {
    return NextResponse.json({ error: 'Subtitles words not found' }, { status: 400 });
  }

  try {
    updateProject(projectId, { status: 'analyzing' });

    const words: SubtitleWord[] = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
    const result = await runHybridAnalysis(words);

    // Save auto_selected.json
    const autoSelectedPath = path.join(dir, 'auto_selected.json');
    fs.writeFileSync(autoSelectedPath, JSON.stringify(result.autoSelected, null, 2));

    // Save full analysis result for debugging
    const analysisPath = path.join(dir, 'analysis_result.json');
    fs.writeFileSync(analysisPath, JSON.stringify(result, null, 2));

    updateProject(projectId, {
      status: 'analyzed',
      autoSelected: 'auto_selected.json',
    });

    return NextResponse.json({
      autoSelected: result.autoSelected,
      ruleResults: result.ruleResults.map(r => ({
        rule: r.rule,
        count: r.indices.length,
        description: r.description,
      })),
      claudeResults: result.claudeResults.map(r => ({
        type: r.type,
        count: r.indices.length,
        description: r.description,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
