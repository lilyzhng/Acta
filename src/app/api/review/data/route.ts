import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectDir } from '@/lib/project-store';
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

  const dir = getProjectDir(projectId);

  // Load subtitle words
  const wordsPath = path.join(dir, project.subtitlesWords || 'subtitles_words.json');
  if (!fs.existsSync(wordsPath)) {
    return NextResponse.json({ error: 'Subtitles words not found' }, { status: 400 });
  }
  const words = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));

  // Load auto selected
  let autoSelected: number[] = [];
  const autoSelectedPath = path.join(dir, project.autoSelected || 'auto_selected.json');
  if (fs.existsSync(autoSelectedPath)) {
    autoSelected = JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8'));
  }

  return NextResponse.json({ words, autoSelected });
}
