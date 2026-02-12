import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Project } from '@/types';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function projectDir(id: string): string {
  return path.join(PROJECTS_DIR, id);
}

function metaPath(id: string): string {
  return path.join(projectDir(id), 'meta.json');
}

export function createProject(name: string, videoFileName: string): Project {
  const id = uuidv4();
  const dir = projectDir(id);
  ensureDir(dir);

  const project: Project = {
    id,
    name,
    videoFile: videoFileName,
    createdAt: new Date().toISOString(),
    status: 'uploaded',
  };

  fs.writeFileSync(metaPath(id), JSON.stringify(project, null, 2));
  return project;
}

export function getProject(id: string): Project | null {
  const mp = metaPath(id);
  if (!fs.existsSync(mp)) return null;
  return JSON.parse(fs.readFileSync(mp, 'utf8'));
}

export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const project = getProject(id);
  if (!project) return null;

  const updated = { ...project, ...updates };
  fs.writeFileSync(metaPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export function listProjects(): Project[] {
  ensureDir(PROJECTS_DIR);
  const dirs = fs.readdirSync(PROJECTS_DIR).filter(d => {
    const mp = path.join(PROJECTS_DIR, d, 'meta.json');
    return fs.existsSync(mp);
  });

  return dirs
    .map(d => {
      try {
        return JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, d, 'meta.json'), 'utf8')) as Project;
      } catch {
        return null;
      }
    })
    .filter((p): p is Project => p !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function deleteProject(id: string): boolean {
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function getProjectDir(id: string): string {
  const dir = projectDir(id);
  ensureDir(dir);
  return dir;
}

export function getProjectFilePath(id: string, filename: string): string {
  return path.join(projectDir(id), filename);
}
