import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { queryTranscription } from '@/lib/volcengine';
import { generateSubtitleWords } from '@/lib/subtitles';
import type { VolcengineResult } from '@/types';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!project.volcengineTaskId) {
    return NextResponse.json({ error: 'No transcription task' }, { status: 400 });
  }

  // Check if already completed
  if (project.status === 'transcribed' || project.status === 'analyzed') {
    return NextResponse.json({ status: 'done' });
  }

  try {
    const result = await queryTranscription(project.volcengineTaskId);

    if (result.status === 'done' && result.result) {
      const dir = getProjectDir(projectId);

      // Save Volcengine result
      const resultPath = path.join(dir, 'volcengine_result.json');
      fs.writeFileSync(resultPath, JSON.stringify(result.result, null, 2));

      // Generate subtitle words
      const words = generateSubtitleWords(result.result as unknown as VolcengineResult);
      const wordsPath = path.join(dir, 'subtitles_words.json');
      fs.writeFileSync(wordsPath, JSON.stringify(words, null, 2));

      updateProject(projectId, {
        status: 'transcribed',
        volcengineResult: 'volcengine_result.json',
        subtitlesWords: 'subtitles_words.json',
      });

      return NextResponse.json({ status: 'done' });
    }

    if (result.status === 'error') {
      return NextResponse.json({ status: 'error', error: result.error });
    }

    return NextResponse.json({ status: 'processing' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: (err as Error).message },
      { status: 500 }
    );
  }
}
