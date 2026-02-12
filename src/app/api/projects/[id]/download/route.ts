import { NextRequest, NextResponse } from 'next/server';
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
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  
  const dir = getProjectDir(id);
  const url = new URL(req.url);
  const fileName = url.searchParams.get('file');
  
  if (!fileName) {
    return NextResponse.json({ error: 'No file specified' }, { status: 400 });
  }
  
  // Security: only allow files within the project directory
  const filePath = path.join(dir, path.basename(fileName));
  
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  
  // Read file and return as download
  const fileBuffer = fs.readFileSync(filePath);
  const ext = path.extname(fileName).toLowerCase();
  
  let contentType = 'application/octet-stream';
  if (ext === '.mp4') contentType = 'video/mp4';
  else if (ext === '.srt') contentType = 'text/plain';
  else if (ext === '.json') contentType = 'application/json';
  else if (ext === '.md') contentType = 'text/markdown';
  
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${path.basename(fileName)}"`,
      'Content-Length': fileBuffer.length.toString(),
    },
  });
}
