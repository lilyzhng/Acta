import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { extractAudio } from '@/lib/ffmpeg';
import path from 'path';
import fs from 'fs';

/** Extract audio from video when we have video but no audio (e.g. legacy projects) */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const dir = getProjectDir(id);
  const videoPath = path.join(dir, project.videoFile);
  const audioPath = path.join(dir, 'audio.mp3');

  if (!fs.existsSync(videoPath)) {
    return NextResponse.json({ error: 'Video not found' }, { status: 400 });
  }
  if (fs.existsSync(audioPath)) {
    return NextResponse.json({ success: true, alreadyExists: true });
  }

  try {
    updateProject(id, { status: 'extracting_audio' });
    extractAudio(videoPath, audioPath);
    updateProject(id, { status: 'audio_ready', audioFile: 'audio.mp3' });
    return NextResponse.json({ success: true });
  } catch (err) {
    updateProject(id, { status: project.status || 'uploaded' });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
