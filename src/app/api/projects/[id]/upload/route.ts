import { NextRequest, NextResponse } from 'next/server';
import { getProjectDir, updateProject } from '@/lib/project-store';
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
  const filePath = path.join(dir, file.name);
  fs.writeFileSync(filePath, buffer);

  updateProject(id, { videoFile: file.name });

  return NextResponse.json({ success: true, fileName: file.name });
}
