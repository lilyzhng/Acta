import { NextRequest } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { burnAnnotations } from '@/lib/ffmpeg';
import type { Annotation } from '@/types';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const dir = getProjectDir(projectId);

  // For input, always use cut video (or original) - never use burnedVideoFile
  // to avoid FFmpeg in-place editing issues
  const inputVideoFileName = project.cutVideoFile || project.videoFile;
  const videoPath = path.join(dir, inputVideoFileName);

  if (!fs.existsSync(videoPath)) {
    return new Response(JSON.stringify({ error: 'Video file not found' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Load annotations
  const annotationsPath = path.join(dir, 'annotations.json');
  let annotations: Annotation[] = [];
  if (fs.existsSync(annotationsPath)) {
    annotations = JSON.parse(fs.readFileSync(annotationsPath, 'utf8'));
  }

  if (annotations.length === 0) {
    return new Response(JSON.stringify({ error: 'No annotations to burn' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Output path - use timestamp to ensure unique filename
  const baseName = path.basename(inputVideoFileName, '.mp4');
  const timestamp = Date.now();
  const outputFileName = `${baseName}_annotated_${timestamp}.mp4`;
  const outputPath = path.join(dir, outputFileName);

  // SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await burnAnnotations(
          videoPath,
          annotations,
          outputPath,
          (progress) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
            );
          }
        );

        if (result.success) {
          // Update project with the annotated video
          updateProject(projectId, {
            burnedVideoFile: outputFileName,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                path: outputPath,
                fileName: outputFileName,
                elapsed: result.elapsed,
                downloadUrl: `/api/projects/${projectId}/download?file=${outputFileName}`,
              })}\n\n`
            )
          );
        } else {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: result.error })}\n\n`)
          );
        }
      } catch (err) {
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
