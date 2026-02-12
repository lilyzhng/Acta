import { NextRequest, NextResponse } from 'next/server';
import { getProjectDir, updateProject } from '@/lib/project-store';
import { extractAudio } from '@/lib/ffmpeg';
import fs from 'fs';
import path from 'path';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dir = getProjectDir(id);

  const formData = await req.formData();
  const file = formData.get('video') as File;

  if (!file) {
    return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const videoPath = path.join(dir, file.name);
  fs.writeFileSync(videoPath, buffer);

  try {
    updateProject(id, { videoFile: file.name, status: 'extracting_audio' });

    // Extract audio so waveform and video are available immediately (no transcription needed)
    const audioPath = path.join(dir, 'audio.mp3');
    extractAudio(videoPath, audioPath);
    updateProject(id, { status: 'audio_ready', audioFile: 'audio.mp3' });

    return NextResponse.json({ success: true, fileName: file.name });
  } catch (err) {
    updateProject(id, { status: 'uploaded' });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
