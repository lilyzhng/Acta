import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Annotation, DeleteSegment, Encoder } from '@/types';

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

/**
 * Extract a single frame from a video at a given timestamp
 * @param videoPath Path to the video file
 * @param timestamp Time in seconds (e.g., 0, 1.5, 10.25)
 * @param outputPath Path for the output image (should end in .jpg or .png)
 * @param maxWidth Optional max width to resize (maintains aspect ratio)
 * @returns Path to the extracted frame
 */
export function extractFrame(
  videoPath: string,
  timestamp: number,
  outputPath: string,
  maxWidth?: number
): string {
  const scaleFilter = maxWidth ? `-vf "scale=${maxWidth}:-1"` : '';
  
  execSync(
    `ffmpeg -y -ss ${timestamp} -i "file:${videoPath}" -frames:v 1 ${scaleFilter} -q:v 2 "file:${outputPath}"`,
    { stdio: 'pipe' }
  );
  
  return outputPath;
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
  // -ac 1 converts to mono so waveform displays as single wave
  execSync(`ffmpeg -y -i "file:${videoPath}" -vn -ac 1 -acodec libmp3lame -q:a 2 "file:${audioPath}"`, { stdio: 'pipe' });
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
      '-vf', `subtitles=${escapedSrt}:force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H00ffffff,OutlineColour=&H00000000,Outline=${outline},Alignment=2,MarginV=30'`,
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

/**
 * Convert an annotation to a PNG overlay image
 * Returns the path to the generated PNG file
 */
export function annotationToPng(
  annotation: Annotation,
  outputDir: string,
  videoWidth: number,
  videoHeight: number
): { path: string; x: number; y: number; width: number; height: number } {
  const pngPath = path.join(outputDir, `annotation_${annotation.id}.png`);
  
  // Calculate center position in pixels (annotation.position is percentage)
  const centerX = Math.round((annotation.position.x / 100) * videoWidth);
  const centerY = Math.round((annotation.position.y / 100) * videoHeight);
  
  // Determine size - scale based on video dimensions
  // Base sizes are percentages of the smaller video dimension
  const minDimension = Math.min(videoWidth, videoHeight);
  const sizePercents: Record<string, number> = { small: 0.12, medium: 0.20, large: 0.32 };
  const sizePercent = sizePercents[annotation.style.size] || 0.20;
  const baseSize = Math.round(minDimension * sizePercent);
  
  // For explicit svgWidth/Height: these are stored as pixel values relative to a ~600px preview container
  // We need to scale them proportionally to the actual video size
  // Preview container is typically 400-700px, so we use 500px as reference
  const PREVIEW_REFERENCE_SIZE = 500;
  const scaleFactor = minDimension / PREVIEW_REFERENCE_SIZE;
  
  let width: number;
  let height: number;
  
  if (annotation.svgWidth && annotation.svgHeight) {
    // Scale the explicit dimensions from preview size to video size
    width = Math.round(annotation.svgWidth * scaleFactor);
    height = Math.round(annotation.svgHeight * scaleFactor);
  } else if (annotation.svgWidth) {
    width = Math.round(annotation.svgWidth * scaleFactor);
    height = width; // Maintain square if only width provided
  } else if (annotation.svgHeight) {
    height = Math.round(annotation.svgHeight * scaleFactor);
    width = height;
  } else {
    // Use size preset
    width = baseSize;
    height = baseSize;
  }
  
  // Ensure minimum size for visibility (scaled to video)
  const minSize = Math.round(minDimension * 0.05); // At least 5% of video
  width = Math.max(width, minSize);
  height = Math.max(height, minSize);
  
  console.log(`[annotationToPng] ${annotation.id}: svgWidth=${annotation.svgWidth}, svgHeight=${annotation.svgHeight}, scaleFactor=${scaleFactor.toFixed(2)}, finalSize=${width}x${height}`);
  
  // Build complete SVG
  let svgContent: string;
  const color = annotation.style.color || 'yellow';
  
  if (annotation.type === 'custom_svg' && annotation.svgContent) {
    // Strip CDATA wrappers if present - they break rsvg-convert
    let cleanedContent = annotation.svgContent
      .replace(/<!\[CDATA\[/g, '')
      .replace(/\]\]>/g, '');
    
    // Add drop shadow filter to match preview appearance
    const dropShadowFilter = `
      <defs>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.5"/>
        </filter>
      </defs>
    `;
    
    // Wrap content in a group with the filter applied
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${annotation.svgViewBox || '0 0 100 100'}">
      ${dropShadowFilter}
      <g filter="url(#dropShadow)">${cleanedContent}</g>
    </svg>`;
  } else if (annotation.type === 'arrow') {
    // Generate arrow SVG based on direction
    const arrowPaths: Record<string, string> = {
      'up': 'M50,80 L50,20 M30,40 L50,20 L70,40',
      'down': 'M50,20 L50,80 M30,60 L50,80 L70,60',
      'left': 'M80,50 L20,50 M40,30 L20,50 L40,70',
      'right': 'M20,50 L80,50 M60,30 L80,50 L60,70',
      'up-left': 'M75,75 L25,25 M25,55 L25,25 L55,25',
      'up-right': 'M25,75 L75,25 M45,25 L75,25 L75,55',
      'down-left': 'M75,25 L25,75 M25,45 L25,75 L55,75',
      'down-right': 'M25,25 L75,75 M45,75 L75,75 L75,45',
    };
    const d = arrowPaths[annotation.arrowDirection || 'right'] || arrowPaths['right'];
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100">
      <defs>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.5"/>
        </filter>
      </defs>
      <g filter="url(#dropShadow)">
        <path d="${d}" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>`;
  } else if (annotation.type === 'circle') {
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100">
      <defs>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.5"/>
        </filter>
      </defs>
      <g filter="url(#dropShadow)">
        <circle cx="50" cy="50" r="40" stroke="${color}" stroke-width="4" fill="none"/>
      </g>
    </svg>`;
  } else if (annotation.type === 'box') {
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100">
      <defs>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.5"/>
        </filter>
      </defs>
      <g filter="url(#dropShadow)">
        <rect x="10" y="10" width="80" height="80" stroke="${color}" stroke-width="4" fill="none"/>
      </g>
    </svg>`;
  } else if (annotation.type === 'text' && annotation.text) {
    // For text, we'll use a different approach with FFmpeg drawtext
    // Return a transparent placeholder
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`;
    width = 1;
    height = 1;
  } else if (annotation.type === 'spotlight') {
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100">
      <defs>
        <radialGradient id="spotlight_${annotation.id}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" style="stop-color:${color};stop-opacity:0.3"/>
          <stop offset="100%" style="stop-color:${color};stop-opacity:0"/>
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#spotlight_${annotation.id})"/>
    </svg>`;
  } else {
    // Fallback
    svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 100 100">
      <defs>
        <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.5"/>
        </filter>
      </defs>
      <g filter="url(#dropShadow)">
        <circle cx="50" cy="50" r="40" stroke="${color}" stroke-width="4" fill="none"/>
      </g>
    </svg>`;
  }
  
  // Write SVG to temp file
  const svgPath = path.join(outputDir, `annotation_${annotation.id}.svg`);
  fs.writeFileSync(svgPath, svgContent);
  
  // Convert SVG to PNG using rsvg-convert or fallback methods
  // Try multiple paths for rsvg-convert
  const rsvgPaths = [
    '/opt/homebrew/bin/rsvg-convert',
    '/usr/local/bin/rsvg-convert',
    'rsvg-convert',
  ];
  
  let converted = false;
  for (const rsvgPath of rsvgPaths) {
    try {
      execSync(`"${rsvgPath}" -w ${width} -h ${height} "${svgPath}" -o "${pngPath}"`, { stdio: 'pipe' });
      // Verify PNG was created
      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
        converted = true;
        break;
      }
    } catch {
      // Try next path
    }
  }
  
  if (!converted) {
    try {
      // Fallback to ImageMagick convert
      execSync(`convert -background none "${svgPath}" -resize ${width}x${height} "${pngPath}"`, { stdio: 'pipe' });
      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
        converted = true;
      }
    } catch {
      // Continue to next fallback
    }
  }
  
  if (!converted) {
    // Last resort: create a simple colored shape with FFmpeg
    try {
      // Create a simple colored circle as fallback
      const fallbackColor = color.replace('#', '').toLowerCase();
      execSync(`ffmpeg -y -f lavfi -i "color=c=${fallbackColor}:size=${width}x${height}:d=1,format=rgba" -frames:v 1 "${pngPath}"`, { stdio: 'pipe' });
      if (fs.existsSync(pngPath) && fs.statSync(pngPath).size > 0) {
        converted = true;
      }
    } catch (e) {
      console.error(`Failed to convert SVG to PNG for annotation ${annotation.id}:`, e);
    }
  }
  
  // Final check - if PNG doesn't exist, throw an error
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Failed to create PNG overlay for annotation ${annotation.id}`);
  }
  
  // Clean up SVG
  try { fs.unlinkSync(svgPath); } catch { /* ignore */ }
  
  // Center the annotation on the position (convert center to top-left for FFmpeg overlay)
  const overlayX = Math.max(0, centerX - Math.round(width / 2));
  const overlayY = Math.max(0, centerY - Math.round(height / 2));
  
  console.log(`[annotationToPng] ${annotation.id}: position=(${annotation.position.x}%, ${annotation.position.y}%) -> center=(${centerX}, ${centerY}) -> overlay=(${overlayX}, ${overlayY})`);
  
  return { path: pngPath, x: overlayX, y: overlayY, width, height };
}

/**
 * Burn annotations into video using FFmpeg overlay filters
 */
export function burnAnnotations(
  videoPath: string,
  annotations: Annotation[],
  outputPath: string,
  onProgress?: (data: { frame: number; totalFrames: number; percent: number; speed: number; fps: number; elapsed: number; remaining: number }) => void
): Promise<{ success: boolean; path?: string; elapsed?: string; error?: string }> {
  return new Promise((resolve) => {
    if (annotations.length === 0) {
      // No annotations, just copy the video
      try {
        fs.copyFileSync(videoPath, outputPath);
        resolve({ success: true, path: outputPath, elapsed: '0' });
      } catch (err) {
        resolve({ success: false, error: (err as Error).message });
      }
      return;
    }
    
    // Get video info
    let videoWidth = 1920;
    let videoHeight = 1080;
    let totalFrames = 0;
    let fps = 30;
    let duration = 0;
    
    try {
      const info = getVideoInfo(videoPath);
      videoWidth = info.width;
      videoHeight = info.height;
      fps = info.fps;
      duration = info.duration;
      totalFrames = Math.round(duration * fps);
    } catch {
      // Use defaults
    }
    
    // Create temp directory for PNG overlays
    const tmpDir = path.join(path.dirname(outputPath), `tmp_annotations_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    
    try {
      // Convert annotations to PNG overlays
      const overlays: Array<{
        path: string;
        x: number;
        y: number;
        startTime?: number;
        endTime?: number;
      }> = [];
      
      for (const ann of annotations) {
        // Skip text annotations for now (would need drawtext)
        if (ann.type === 'text') continue;
        
        try {
          const overlay = annotationToPng(ann, tmpDir, videoWidth, videoHeight);
          // Verify the PNG exists
          if (fs.existsSync(overlay.path)) {
            overlays.push({
              ...overlay,
              startTime: ann.startTime,
              endTime: ann.endTime ?? duration,
            });
            console.log(`Created PNG overlay for annotation ${ann.id}: ${overlay.path}`);
          } else {
            console.error(`PNG not created for annotation ${ann.id}`);
          }
        } catch (err) {
          console.error(`Failed to create PNG for annotation ${ann.id}:`, err);
        }
      }
      
      if (overlays.length === 0) {
        // No overlays to apply
        fs.copyFileSync(videoPath, outputPath);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve({ success: true, path: outputPath, elapsed: '0' });
        return;
      }
      
      // Build FFmpeg filter complex
      // Input 0: video, Input 1-N: overlay PNGs
      const inputs: string[] = ['-i', videoPath];
      overlays.forEach(o => {
        inputs.push('-i', o.path);
      });
      
      // Build filter chain
      let filterComplex = '';
      let lastOutput = '[0:v]';
      
      overlays.forEach((o, i) => {
        const inputIdx = i + 1;
        const outputLabel = i === overlays.length - 1 ? '[vout]' : `[v${i}]`;
        
        // Enable expression for timing
        let enable = '';
        if (o.startTime !== undefined || o.endTime !== undefined) {
          const start = o.startTime ?? 0;
          const end = o.endTime ?? duration;
          enable = `:enable='between(t,${start},${end})'`;
        }
        
        filterComplex += `${lastOutput}[${inputIdx}:v]overlay=${o.x}:${o.y}${enable}${outputLabel};`;
        lastOutput = outputLabel;
      });
      
      // Remove trailing semicolon
      filterComplex = filterComplex.slice(0, -1);
      
      const encoder = detectEncoder();
      const args = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-map', '0:a?',
        '-c:v', encoder.name,
        ...encoder.args.split(' '),
        '-c:a', 'aac', '-b:a', '192k',
        '-y',
        outputPath,
      ];
      
      console.log('FFmpeg burn annotations command:', 'ffmpeg', args.join(' '));
      console.log('Filter complex:', filterComplex);
      console.log('Overlays:', overlays.map(o => ({ path: o.path, x: o.x, y: o.y, start: o.startTime, end: o.endTime })));
      
      const startTime = Date.now();
      const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let stderrOutput = '';
      proc.stderr.on('data', (data: Buffer) => {
        const line = data.toString();
        stderrOutput += line;
        
        if (!onProgress) return;
        const frameMatch = line.match(/frame=\s*(\d+)/);
        const speedMatch = line.match(/speed=\s*([\d.]+)x/);
        const fpsMatch = line.match(/fps=\s*([\d.]+)/);
        if (frameMatch) {
          const frame = parseInt(frameMatch[1]);
          const speed = speedMatch ? parseFloat(speedMatch[1]) : 0;
          const fpsVal = fpsMatch ? parseFloat(fpsMatch[1]) : 0;
          const percent = totalFrames > 0 ? Math.min(99, Math.round((frame / totalFrames) * 100)) : 0;
          const elapsed = (Date.now() - startTime) / 1000;
          const remaining = percent > 0 ? Math.round((elapsed / percent) * (100 - percent)) : 0;
          onProgress({ frame, totalFrames, percent, speed, fps: fpsVal, elapsed: Math.round(elapsed), remaining });
        }
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('FFmpeg burn annotations failed with code:', code);
          console.error('FFmpeg stderr:', stderrOutput.slice(-2000)); // Last 2000 chars
        }
        // Clean up temp directory
        fs.rmSync(tmpDir, { recursive: true, force: true });
        
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        if (code === 0) {
          resolve({ success: true, path: outputPath, elapsed });
        } else {
          resolve({ success: false, error: `FFmpeg exit code ${code}` });
        }
      });
      
      proc.on('error', (err) => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        resolve({ success: false, error: err.message });
      });
      
    } catch (err) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      resolve({ success: false, error: (err as Error).message });
    }
  });
}
