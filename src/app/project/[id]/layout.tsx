'use client';

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  return <div className="h-screen">{children}</div>;
}
