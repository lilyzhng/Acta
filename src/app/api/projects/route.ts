import { NextRequest, NextResponse } from 'next/server';
import { listProjects, createProject, deleteProject } from '@/lib/project-store';

export async function GET() {
  const projects = listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const { name, videoFileName } = await req.json();
  if (!name || !videoFileName) {
    return NextResponse.json({ error: 'Missing name or videoFileName' }, { status: 400 });
  }
  const project = createProject(name, videoFileName);
  return NextResponse.json(project);
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }
  const success = deleteProject(id);
  return NextResponse.json({ success });
}
