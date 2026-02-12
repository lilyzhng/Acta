import { NextRequest } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { executeFFmpegCut, getVideoDuration } from '@/lib/ffmpeg';
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
  const videoPath = path.join(dir, project.videoFile);
  const deleteSegmentsPath = path.join(dir, project.deleteSegments || 'delete_segments.json');

  if (!fs.existsSync(deleteSegmentsPath)) {
    return new Response(JSON.stringify({ error: 'No delete segments' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const deleteSegments = JSON.parse(fs.readFileSync(deleteSegmentsPath, 'utf8'));
  const baseName = path.basename(project.videoFile, '.mp4');
  const outputFile = `${baseName}_cut.mp4`;
  const outputPath = path.join(dir, outputFile);

  updateProject(projectId, { status: 'cutting' });

  // SSE response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await executeFFmpegCut(
          videoPath,
          deleteSegments,
          outputPath,
          (progress) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(progress)}\n\n`)
            );
          }
        );

        if (result.success) {
          const originalDuration = getVideoDuration(videoPath);
          const newDuration = getVideoDuration(outputPath);
          const deletedDuration = originalDuration - newDuration;
          const savedPercent = ((deletedDuration / originalDuration) * 100).toFixed(1);

          updateProject(projectId, {
            status: 'cut',
            cutVideoFile: outputFile,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                done: true,
                output: outputFile,
                originalDuration,
                newDuration,
                deletedDuration,
                savedPercent,
              })}\n\n`
            )
          );
        } else {
          updateProject(projectId, { status: 'reviewed' });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: result.error })}\n\n`)
          );
        }
      } catch (err) {
        updateProject(projectId, { status: 'reviewed' });
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
