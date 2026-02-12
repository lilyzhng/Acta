import { NextRequest } from 'next/server';
import { getProject, getProjectDir } from '@/lib/project-store';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) {
    return new Response('Not Found', { status: 404 });
  }

  // Check for ?file= query param, otherwise prefer cut video if available
  const fileParam = req.nextUrl.searchParams.get('file');
  const fileName = fileParam || project.cutVideoFile || project.videoFile;
  const dir = getProjectDir(id);
  const filePath = path.join(dir, fileName);

  if (!fs.existsSync(filePath)) {
    return new Response('File Not Found', { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const range = req.headers.get('range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    const stream = fs.createReadStream(filePath, { start, end });
    const readableStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk) => controller.enqueue(chunk));
        stream.on('end', () => controller.close());
        stream.on('error', (err) => controller.error(err));
      },
    });

    return new Response(readableStream, {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
      },
    });
  }

  const stream = fs.createReadStream(filePath);
  const readableStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new Response(readableStream, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
    },
  });
}
