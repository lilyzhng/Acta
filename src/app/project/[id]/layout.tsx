'use client';

import { useEffect, useState, use } from 'react';
import { StepNav } from '@/components/ui/StepNav';
import type { Project } from '@/types';

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    fetch(`/api/projects`)
      .then(r => r.json())
      .then((projects: Project[]) => {
        const p = projects.find(p => p.id === id);
        if (p) setProject(p);
      });
  }, [id]);

  return (
    <div className="flex flex-col h-screen">
      <StepNav projectId={id} currentStatus={project?.status} />
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
