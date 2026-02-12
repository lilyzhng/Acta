'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { SubtitleEditor } from '@/components/subtitles/SubtitleEditor';
import type { Subtitle, BurnProgress } from '@/types';

export default function SubtitlesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [dictionary, setDictionary] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [burnPercent, setBurnPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const router = useRouter();

  // Load dictionary
  useEffect(() => {
    fetch('/dictionary.txt')
      .then(r => r.text())
      .then(text => {
        setDictionary(text.split('\n').filter(l => l.trim()));
      })
      .catch(() => {
        // Dictionary not found, that's okay
      });
  }, []);

  // Load or generate subtitles
  useEffect(() => {
    fetch(`/api/subtitles?projectId=${projectId}`)
      .then(r => {
        if (r.ok) return r.json();
        return null;
      })
      .then(data => {
        if (data && !data.error) {
          setSubtitles(data);
          setIsLoaded(true);
        }
      });
  }, [projectId]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setStatusMessage('Generating subtitles...');

    try {
      const res = await fetch('/api/subtitles/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      const data = await res.json();
      if (data.subtitles) {
        setSubtitles(data.subtitles);
        setIsLoaded(true);
        setStatusMessage(`Generated ${data.count} subtitles`);
      } else {
        setStatusMessage('Generation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      setStatusMessage('Generation failed: ' + (err as Error).message);
    } finally {
      setIsGenerating(false);
    }
  }, [projectId]);

  const handleSave = useCallback(async () => {
    setStatusMessage('Saving...');
    try {
      await fetch('/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, subtitles }),
      });
      setStatusMessage('Saved');
    } catch (err) {
      setStatusMessage('Save failed: ' + (err as Error).message);
    }
  }, [projectId, subtitles]);

  const handleBurn = useCallback(
    async (outline: number) => {
      if (!confirm('Burn subtitles into video?')) return;

      // Save first
      await fetch('/api/subtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, subtitles }),
      });

      setIsBurning(true);
      setBurnPercent(0);
      setStatusMessage('Burning... preparing encoder');

      try {
        const res = await fetch('/api/burn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, outline }),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6)) as BurnProgress;

            if (data.done) {
              setBurnPercent(100);
              setStatusMessage(`Burn complete (${data.elapsed}s)`);
              setIsBurning(false);
              router.push(`/project/${projectId}/download`);
              return;
            }

            if (data.error) {
              setStatusMessage('Burn failed: ' + data.error);
              setIsBurning(false);
              return;
            }

            setBurnPercent(data.percent || 0);
            setStatusMessage(`Burning... ${data.percent}%`);
          }
        }
      } catch (err) {
        setStatusMessage('Burn failed: ' + (err as Error).message);
      } finally {
        setIsBurning(false);
      }
    },
    [projectId, subtitles]
  );

  // Determine which video to show (cut video if available, otherwise original)
  const videoUrl = `/api/video/${projectId}?file=`;

  if (!isLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-neutral-400">No subtitles generated yet.</p>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-600 text-white rounded-lg font-medium transition-colors"
        >
          {isGenerating ? 'Generating...' : 'Generate Subtitles'}
        </button>
        {statusMessage && (
          <p className="text-sm text-neutral-500">{statusMessage}</p>
        )}
      </div>
    );
  }

  return (
    <div className="h-full">
      <SubtitleEditor
        projectId={projectId}
        videoUrl={`/api/video/${projectId}`}
        subtitles={subtitles}
        dictionary={dictionary}
        onSubtitlesChange={setSubtitles}
        onSave={handleSave}
        onBurn={handleBurn}
        isBurning={isBurning}
        burnPercent={burnPercent}
        statusMessage={statusMessage}
      />
    </div>
  );
}
