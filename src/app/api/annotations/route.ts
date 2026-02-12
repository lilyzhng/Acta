import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectDir } from '@/lib/project-store';
import fs from 'fs';
import path from 'path';
import type { Annotation } from '@/types';

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
  const annotationsPath = path.join(dir, 'annotations.json');

  if (!fs.existsSync(annotationsPath)) {
    // Return empty array if no annotations yet
    return NextResponse.json([]);
  }

  const annotations: Annotation[] = JSON.parse(fs.readFileSync(annotationsPath, 'utf8'));
  return NextResponse.json(annotations);
}

export async function POST(req: NextRequest) {
  const { projectId, annotations } = await req.json();

  if (!projectId || !Array.isArray(annotations)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const dir = getProjectDir(projectId);
  const annotationsPath = path.join(dir, 'annotations.json');
  fs.writeFileSync(annotationsPath, JSON.stringify(annotations, null, 2));

  return NextResponse.json({ success: true });
}
