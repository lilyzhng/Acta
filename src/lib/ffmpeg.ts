import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { DeleteSegment, Encoder } from '@/types';

const BUFFER_MS = 50;
const CROSSFADE_MS = 30;

let cachedEncoder: Encoder | null = null;

export function detectEncoder(): Encoder {
  if (cachedEncoder) return cachedEncoder;

  const platform = process.platform;
  const encoders: Encoder[] = [];

  if (platform === 'darwin') {
    encoders.push({ name: 'h264_videotoolbox', args: '-q:v 60', label: 'VideoToolbox (macOS)' });
  } else if (platform === 'win32') {
    encoders.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_qsv', args: '-global_quality 20', label: 'QSV (Intel)' });
    encoders.push({ name: 'h264_amf', args: '-quality balanced', label: 'AMF (AMD)' });
  } else {
    encoders.push({ name: 'h264_nvenc', args: '-preset p4 -cq 20', label: 'NVENC (NVIDIA)' });
    encoders.push({ name: 'h264_vaapi', args: '-qp 20', label: 'VAAPI (Linux)' });
  }

  encoders.push({ name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (software)' });

  for (const enc of encoders) {
    try {
      execSync(`ffmpeg -hide_banner -encoders 2>/dev/null | grep ${enc.name}`, { stdio: 'pipe' });
      cachedEncoder = enc;
      return enc;
    } catch {
      // Encoder not available, try next
    }
  }

  cachedEncoder = { name: 'libx264', args: '-preset fast -crf 18', label: 'x264 (software)' };
  return cachedEncoder;
}

export function getVideoDuration(filePath: string): number {
  const result = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "file:${filePath}"`
  ).toString().trim();
  return parseFloat(result);
}

export function getVideoInfo(filePath: string): { duration: number; width: number; height: number; fps: number } {
  const duration = getVideoDuration(filePath);

  let width = 1920, height = 1080, fps = 30;
  try {
    const streamInfo = execSync(
      `ffprobe -v error -show_entries stream=width,height,r_frame_rate -select_streams v:0 -of csv=p=0 "file:${filePath}"`
    ).toString().trim();
    const parts = streamInfo.split(',');
    width = parseInt(parts[0]) || 1920;
    height = parseInt(parts[1]) || 1080;
    const fpsStr = parts[2] || '30/1';
    const fpsParts = fpsStr.split('/');
    fps = fpsParts.length === 2 ? Math.round(parseInt(fpsParts[0]) / parseInt(fpsParts[1])) : Math.round(parseFloat(fpsStr));
  } catch {
    // Use defaults
  }

  return { duration, width, height, fps };
}

export function extractAudio(videoPath: string, audioPath: string): void {
  execSync(`ffmpeg -y -i "file:${videoPath}" -vn -acodec libmp3lame -q:a 2 "file:${audioPath}"`, { stdio: 'pipe' });
}

interface KeepSegment {
  start: number;
  end: number;
}

export function buildFilterComplex(
  deleteList: DeleteSegment[],
  duration: number,
  audioOffset: number = 0
): { filterComplex: string; keepSegments: KeepSegment[] } {
  const bufferSec = BUFFER_MS / 1000;
  const crossfadeSec = CROSSFADE_MS / 1000;

  // Compensate offset + expand deletion range
  const expandedDelete = deleteList
    .map(seg => ({
      start: Math.max(0, seg.start - audioOffset - bufferSec),
      end: Math.min(duration, seg.end - audioOffset + bufferSec),
    }))
    .sort((a, b) => a.start - b.start);

  // Merge overlapping deletion segments
  const mergedDelete: DeleteSegment[] = [];
  for (const seg of expandedDelete) {
    if (mergedDelete.length === 0 || seg.start > mergedDelete[mergedDelete.length - 1].end) {
      mergedDelete.push({ ...seg });
    } else {
      mergedDelete[mergedDelete.length - 1].end = Math.max(
        mergedDelete[mergedDelete.length - 1].end,
        seg.end
      );
    }
  }

  // Calculate keep segments
  const keepSegments: KeepSegment[] = [];
  let cursor = 0;

  for (const del of mergedDelete) {
    if (del.start > cursor) {
      keepSegments.push({ start: cursor, end: del.start });
    }
    cursor = del.end;
  }
  if (cursor < duration) {
    keepSegments.push({ start: cursor, end: duration });
  }

  // Generate filter_complex
  const filters: string[] = [];
  let vconcat = '';

  for (let i = 0; i < keepSegments.length; i++) {
    const seg = keepSegments[i];
    filters.push(`[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    filters.push(`[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
    vconcat += `[v${i}]`;
  }

  // Video direct concat
  filters.push(`${vconcat}concat=n=${keepSegments.length}:v=1:a=0[outv]`);

  // Audio crossfade
  if (keepSegments.length === 1) {
    filters.push(`[a0]anull[outa]`);
  } else {
    let currentLabel = 'a0';
    for (let i = 1; i < keepSegments.length; i++) {
      const nextLabel = `a${i}`;
      const outLabel = i === keepSegments.length - 1 ? 'outa' : `amid${i}`;
      filters.push(
        `[${currentLabel}][${nextLabel}]acrossfade=d=${crossfadeSec.toFixed(3)}:c1=tri:c2=tri[${outLabel}]`
      );
      currentLabel = outLabel;
    }
  }

  return { filterComplex: filters.join(';'), keepSegments };
}

export function executeFFmpegCut(
  input: string,
  deleteList: DeleteSegment[],
  output: string,
  onProgress?: (data: { frame: number; totalFrames: number; percent: number; speed: number; fps: number; elapsed: number; remaining: number }) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const duration = getVideoDuration(input);
      const { filterComplex } = buildFilterComplex(deleteList, duration);
      const encoder = detectEncoder();
      const info = getVideoInfo(input);
      const totalFrames = Math.round(info.duration * info.fps);

      const args = [
        '-y', '-i', `file:${input}`,
        '-filter_complex', filterComplex,
        '-map', '[outv]', '-map', '[outa]',
        '-c:v', encoder.name, ...encoder.args.split(' '),
        '-c:a', 'aac', '-b:a', '192k',
        '-progress', 'pipe:1',
        `file:${output}`,
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const startTime = Date.now();

      proc.stderr.on('data', (data: Buffer) => {
        if (!onProgress) return;
        const line = data.toString();
        const frameMatch = line.match(/frame=\s*(\d+)/);
        const speedMatch = line.match(/speed=\s*([\d.]+)x/);
        const fpsMatch = line.match(/fps=\s*([\d.]+)/);
        if (frameMatch) {
          const frame = parseInt(frameMatch[1]);
          const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
          const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
          const percent = totalFrames > 0 ? Math.min(99, Math.round((frame / totalFrames) * 100)) : 0;
          const elapsed = (Date.now() - startTime) / 1000;
          const remaining = percent > 0 ? Math.round((elapsed / percent) * (100 - percent)) : 0;
          onProgress({ frame, totalFrames, percent, speed, fps, elapsed: Math.round(elapsed), remaining });
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          // Try fallback
          try {
            executeFFmpegCutFallback(input, deleteList, output);
            resolve({ success: true });
          } catch (err) {
            resolve({ success: false, error: `FFmpeg exit code ${code}` });
          }
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      resolve({ success: false, error: (err as Error).message });
    }
  });
}

function executeFFmpegCutFallback(input: string, deleteList: DeleteSegment[], output: string): void {
  const duration = getVideoDuration(input);
  const { keepSegments } = buildFilterComplex(deleteList, duration);
  const encoder = detectEncoder();

  const tmpDir = path.join(path.dirname(output), `tmp_cut_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const partFiles: string[] = [];
    keepSegments.forEach((seg, i) => {
      const partFile = path.join(tmpDir, `part${i.toString().padStart(4, '0')}.mp4`);
      const segDuration = seg.end - seg.start;
      execSync(
        `ffmpeg -y -ss ${seg.start.toFixed(3)} -i "file:${input}" -t ${segDuration.toFixed(3)} -c:v ${encoder.name} ${encoder.args} -c:a aac -b:a 128k -avoid_negative_ts make_zero "${partFile}"`,
        { stdio: 'pipe' }
      );
      partFiles.push(partFile);
    });

    const listFile = path.join(tmpDir, 'list.txt');
    const listContent = partFiles.map(f => `file '${path.resolve(f)}'`).join('\n');
    fs.writeFileSync(listFile, listContent);
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${output}"`, { stdio: 'pipe' });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function burnSubtitles(
  videoPath: string,
  srtPath: string,
  outputPath: string,
  outline: number = 2,
  onProgress?: (data: { frame: number; totalFrames: number; percent: number; speed: number; fps: number; elapsed: number; remaining: number }) => void
): Promise<{ success: boolean; path?: string; elapsed?: string; error?: string }> {
  return new Promise((resolve) => {
    let totalFrames = 0;
    try {
      const info = getVideoInfo(videoPath);
      totalFrames = Math.round(info.duration * info.fps);
    } catch {
      // ignore
    }

    // Escape special chars in SRT path for FFmpeg subtitle filter (: \ ' [ ])
    const escapedSrt = srtPath.replace(/([:\\'\[\]])/g, '\\$1');
    const args = [
      '-i', videoPath,
      '-vf', `subtitles=${escapedSrt}:force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=${outline},Alignment=2,MarginV=30'`,
      '-c:a', 'copy',
      '-y', outputPath,
    ];

    const startTime = Date.now();
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    proc.stderr.on('data', (data: Buffer) => {
      if (!onProgress) return;
      const line = data.toString();
      const frameMatch = line.match(/frame=\s*(\d+)/);
      const speedMatch = line.match(/speed=\s*([\d.]+)x/);
      const fpsMatch = line.match(/fps=\s*([\d.]+)/);
      if (frameMatch) {
        const frame = parseInt(frameMatch[1]);
        const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
        const fps = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
        const percent = totalFrames > 0 ? Math.min(99, Math.round((frame / totalFrames) * 100)) : 0;
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = percent > 0 ? Math.round((elapsed / percent) * (100 - percent)) : 0;
        onProgress({ frame, totalFrames, percent, speed, fps, elapsed: Math.round(elapsed), remaining });
      }
    });

    proc.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (code === 0) {
        resolve({ success: true, path: outputPath, elapsed });
      } else {
        resolve({ success: false, error: `ffmpeg exit code ${code}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
