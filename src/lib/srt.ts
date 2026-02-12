import type { Subtitle } from '@/types';

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function generateSRT(subtitles: Subtitle[]): string {
  return subtitles
    .map(
      (s, i) =>
        `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text}\n`
    )
    .join('\n');
}

export function generateReadableTranscript(subtitles: Subtitle[]): string {
  function formatReadableTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(2);
    return m.toString().padStart(2, '0') + ':' + s.padStart(5, '0');
  }

  return subtitles
    .map((s, i) => {
      const start = formatReadableTime(s.start);
      const end = formatReadableTime(s.end);
      return `${i + 1}. ${start} → ${end}\n${s.text}`;
    })
    .join('\n');
}
