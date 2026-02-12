import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { extractAudio } from '@/lib/ffmpeg';
import { uploadToUguu } from '@/lib/upload';
import { submitTranscription } from '@/lib/volcengine';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const dir = getProjectDir(projectId);
  const videoPath = path.join(dir, project.videoFile);
  const audioPath = path.join(dir, 'audio.mp3');

  try {
    // Step 1: Extract audio
    updateProject(projectId, { status: 'extracting_audio' });

    if (!fs.existsSync(audioPath)) {
      extractAudio(videoPath, audioPath);
    }

    updateProject(projectId, { status: 'audio_ready', audioFile: 'audio.mp3' });

    // Step 2: Upload to uguu.se
    const audioUrl = await uploadToUguu(audioPath);

    // Step 3: Submit to Volcengine
    const taskId = await submitTranscription(audioUrl);

    updateProject(projectId, {
      status: 'transcribing',
      volcengineTaskId: taskId,
    });

    return NextResponse.json({ taskId });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
