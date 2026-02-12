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
  const subtitlesPath = path.join(dir, project.subtitlesWithTime || 'subtitles_with_time.json');

  if (!fs.existsSync(subtitlesPath)) {
    return NextResponse.json({ error: 'Subtitles not found' }, { status: 404 });
  }

  const subtitles = JSON.parse(fs.readFileSync(subtitlesPath, 'utf8'));
  return NextResponse.json(subtitles);
}

export async function POST(req: NextRequest) {
  const { projectId, subtitles } = await req.json();

  if (!projectId || !subtitles) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const dir = getProjectDir(projectId);
  const subtitlesPath = path.join(dir, 'subtitles_with_time.json');
  fs.writeFileSync(subtitlesPath, JSON.stringify(subtitles, null, 2));

  return NextResponse.json({ success: true });
}
