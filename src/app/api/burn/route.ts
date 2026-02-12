import { NextRequest } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { burnSubtitles } from '@/lib/ffmpeg';
import { generateSRT, generateReadableTranscript } from '@/lib/srt';
import type { Subtitle } from '@/types';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const { projectId, outline = 2 } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const dir = getProjectDir(projectId);

  // Use cut video if available, otherwise original
  const videoFileName = project.cutVideoFile || project.videoFile;
  const videoPath = path.join(dir, videoFileName);

  // Load subtitles
  const subtitlesPath = path.join(dir, project.subtitlesWithTime || 'subtitles_with_time.json');
  if (!fs.existsSync(subtitlesPath)) {
    return new Response(JSON.stringify({ error: 'Subtitles not found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const subtitles: Subtitle[] = JSON.parse(fs.readFileSync(subtitlesPath, 'utf8'));

  // Generate SRT
  const baseName = path.basename(videoFileName, '.mp4');
  const srtPath = path.join(dir, `${baseName}.srt`);
  const srt = generateSRT(subtitles);
  fs.writeFileSync(srtPath, srt);

  // Generate readable transcript
  const transcriptPath = path.join(dir, `${baseName}_transcript.md`);
  const transcript = generateReadableTranscript(subtitles);
  fs.writeFileSync(transcriptPath, transcript);

  const outputPath = path.join(dir, `${baseName}_subtitled.mp4`);

  updateProject(projectId, { status: 'burning', srtFile: `${baseName}.srt` });

  // SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await burnSubtitles(
          videoPath,
          srtPath,
          outputPath,
          outline,
          (progress) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
            );
          }
        );

        if (result.success) {
          updateProject(projectId, {
            status: 'done',
            burnedVideoFile: `${baseName}_subtitled.mp4`,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                path: result.path,
                srtPath: `${baseName}.srt`,
                elapsed: result.elapsed,
              })}\n\n`
            )
          );
        } else {
          updateProject(projectId, { status: 'subtitles_ready' });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: result.error })}\n\n`)
          );
        }
      } catch (err) {
        updateProject(projectId, { status: 'subtitles_ready' });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: (err as Error).message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
