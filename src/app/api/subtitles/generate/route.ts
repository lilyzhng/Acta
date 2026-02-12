import { NextRequest, NextResponse } from 'next/server';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { groupIntoSubtitlesByUtterance } from '@/lib/subtitles';
import type { VolcengineResult, DeleteSegment } from '@/types';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  const { projectId } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const dir = getProjectDir(projectId);

  // Load Volcengine result
  const resultPath = path.join(dir, project.volcengineResult || 'volcengine_result.json');
  if (!fs.existsSync(resultPath)) {
    return NextResponse.json({ error: 'Volcengine result not found' }, { status: 400 });
  }

  const volcResult: VolcengineResult = JSON.parse(fs.readFileSync(resultPath, 'utf8'));

  // Load delete segments (if cut was performed)
  let deleteSegments: DeleteSegment[] | undefined;
  const deleteSegmentsPath = path.join(dir, 'delete_segments.json');
  if (fs.existsSync(deleteSegmentsPath)) {
    deleteSegments = JSON.parse(fs.readFileSync(deleteSegmentsPath, 'utf8'));
  }

  // Generate subtitles using utterance boundaries (natural speech pauses)
  const subtitles = groupIntoSubtitlesByUtterance(volcResult, deleteSegments);

  // Save
  const subtitlesPath = path.join(dir, 'subtitles_with_time.json');
  fs.writeFileSync(subtitlesPath, JSON.stringify(subtitles, null, 2));

  updateProject(projectId, {
    subtitlesWithTime: 'subtitles_with_time.json',
    status: 'subtitles_ready',
  });

  return NextResponse.json({ subtitles, count: subtitles.length });
}
