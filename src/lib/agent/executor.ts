import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { extractAudio, executeFFmpegCut, burnSubtitles, burnAnnotations, getVideoDuration, extractFrame } from '@/lib/ffmpeg';
import { uploadToUguu } from '@/lib/upload';
import { submitTranscription, queryTranscription } from '@/lib/volcengine';
import { generateSubtitleWords, groupIntoSubtitlesByUtterance } from '@/lib/subtitles';
import { generateSRT, generateReadableTranscript } from '@/lib/srt';
import { runHybridAnalysis } from '@/lib/analysis';
import { indicesToDeleteSegments } from '@/lib/segment-merger';
import { analyzeFrameForPositions, analyzeFrameForSafeZones, changeImageBackground, clampPositionToFrame } from '@/lib/vision';
import type { VolcengineResult, SubtitleWord, Subtitle, DeleteSegment, SubtaskStatus, Annotation, AnnotationType, AnnotationSize, AnnotationAnimation, ArrowDirection } from '@/types';

type ProgressCallback = (data: { id: string; percent: number; message?: string; subtasks?: SubtaskStatus[] }) => void;

interface ToolResult {
  result: string;
  uiPanel?: { panel: string; data: unknown };
  emitEvent?: { type: 'ui_panel'; panel: string; data: unknown };
  initialSubtasks?: SubtaskStatus[];
}

export async function executeTool(
  projectId: string,
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>,
  onProgress?: ProgressCallback,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_project_status':
      return executeGetProjectStatus(projectId);
    case 'auto_cut':
      return executeAutoCut(projectId, toolCallId, onProgress);
    case 'transcribe_video':
      return executeTranscribeVideo(projectId, toolCallId, onProgress);
    case 'analyze_transcript':
      return executeAnalyzeTranscript(projectId, toolCallId, onProgress);
    case 'get_flagged_words':
      return executeGetFlaggedWords(projectId);
    case 'remove_words':
      return executeRemoveWords(projectId, input);
    case 'show_review_panel':
      return executeShowReviewPanel(projectId);
    case 'execute_cut':
      return executeExecuteCut(projectId, toolCallId, onProgress);
    case 'attach_subtitles':
      return executeAttachSubtitles(projectId, toolCallId, input, onProgress);
    case 'show_subtitle_editor':
      return executeShowSubtitleEditor(projectId);
    case 'provide_download_links':
      return executeProvideDownloadLinks(projectId);
    case 'add_annotation':
      return executeAddAnnotation(projectId, input);
    case 'list_annotations':
      return executeListAnnotations(projectId);
    case 'remove_annotation':
      return executeRemoveAnnotation(projectId, input);
    case 'analyze_frame':
      return executeAnalyzeFrame(projectId, input);
    case 'find_safe_placement':
      return executeFindSafePlacement(projectId, input);
    case 'update_annotation':
      return executeUpdateAnnotation(projectId, input);
    case 'save_video':
      return executeSaveVideo(projectId, toolCallId, onProgress);
    case 'change_background':
      return executeChangeBackground(projectId, input);
    default:
      return { result: `Unknown tool: ${toolName}` };
  }
}

async function executeGetProjectStatus(projectId: string): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) {
    return { result: 'Project not found.' };
  }

  const statusDescriptions: Record<string, string> = {
    uploaded: 'Video uploaded, ready to start processing',
    extracting_audio: 'Currently extracting audio from video',
    audio_ready: 'Audio extracted, ready for transcription',
    transcribing: 'Transcription in progress',
    transcribed: 'Transcription complete, ready for analysis',
    analyzing: 'AI analysis in progress',
    analyzed: 'Analysis complete, ready for human review',
    reviewed: 'User review complete, ready to cut video or attach subtitles',
    cutting: 'Video cut in progress',
    cut: 'Video cut complete, ready for subtitles or download',
    subtitles_ready: 'Subtitles generated, ready for editing',
    burning: 'Burning subtitles into video',
    done: 'All processing complete, files ready for download',
  };

  const result: Record<string, unknown> = {
    name: project.name,
    status: project.status,
    description: statusDescriptions[project.status] || project.status,
    videoFile: project.videoFile,
    hasAudio: !!project.audioFile,
    hasTranscription: !!project.volcengineResult,
    hasAnalysis: !!project.autoSelected,
    hasCutVideo: !!project.cutVideoFile,
    hasSubtitles: !!project.subtitlesWithTime,
    hasBurnedVideo: !!project.burnedVideoFile,
    hasSRT: !!project.srtFile,
  };

  // Add flagged/selected counts when analysis exists (helps assistant understand "remove the rest")
  const dir = getProjectDir(projectId);
  const autoSelectedPath = path.join(dir, project.autoSelected || 'auto_selected.json');
  if (fs.existsSync(autoSelectedPath)) {
    const autoSelected: number[] = JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8'));
    result.flaggedWordCount = autoSelected.length;
    const selectedPath = path.join(dir, 'selected_indices.json');
    if (fs.existsSync(selectedPath)) {
      const selected: number[] = JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
      result.selectedForRemovalCount = selected.length;
      result.keptDuringReviewCount = autoSelected.length - selected.length;
    }
  }

  return {
    result: JSON.stringify(result),
  };
}

async function executeAutoCut(
  projectId: string,
  toolCallId: string,
  onProgress?: ProgressCallback,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  // Define subtasks with their initial states
  const subtasks: SubtaskStatus[] = [
    { id: 'transcribe', label: 'Transcribe video', status: 'pending' },
    { id: 'analyze', label: 'Detect filler words', status: 'pending' },
    { id: 'cut', label: 'Cut video', status: 'pending' },
  ];

  // Helper to update subtask status
  const updateSubtask = (id: string, status: 'pending' | 'running' | 'done') => {
    const subtask = subtasks.find(s => s.id === id);
    if (subtask) subtask.status = status;
  };

  // Emit initial subtasks
  onProgress?.({ id: toolCallId, percent: 0, message: 'Starting auto cut...', subtasks: [...subtasks] });

  // Step 1: Transcribe if needed
  updateSubtask('transcribe', 'running');
  onProgress?.({ id: toolCallId, percent: 5, message: 'Transcribing...', subtasks: [...subtasks] });

  if (!project.volcengineResult) {
    const transcribeResult = await executeTranscribeVideo(projectId, toolCallId, (p) =>
      onProgress?.({ ...p, percent: Math.round(p.percent * 0.3), subtasks: [...subtasks] }),
    );
    if (transcribeResult.result.includes('failed') || transcribeResult.result.includes('not found')) {
      return transcribeResult;
    }
  }

  updateSubtask('transcribe', 'done');
  onProgress?.({ id: toolCallId, percent: 30, message: 'Transcription complete', subtasks: [...subtasks] });

  // Step 2: Analyze if needed
  updateSubtask('analyze', 'running');
  onProgress?.({ id: toolCallId, percent: 32, message: 'Analyzing transcript...', subtasks: [...subtasks] });

  const proj = getProject(projectId)!;
  if (!proj.autoSelected) {
    const analyzeResult = await executeAnalyzeTranscript(projectId, toolCallId, (p) =>
      onProgress?.({ ...p, percent: 30 + Math.round(p.percent * 0.2), subtasks: [...subtasks] }),
    );
    if (analyzeResult.result.includes('failed') || analyzeResult.result.includes('not found')) {
      return analyzeResult;
    }
  }

  updateSubtask('analyze', 'done');
  onProgress?.({ id: toolCallId, percent: 50, message: 'Analysis complete', subtasks: [...subtasks] });

  // Step 3: Remove all flagged words (quick, no subtask needed)
  const removeResult = await executeRemoveWords(projectId, { mode: 'all_flagged' });
  if (removeResult.result.includes('Provide') || removeResult.result.includes('not found')) {
    return removeResult;
  }
  onProgress?.({ id: toolCallId, percent: 52, message: 'Words selected...', subtasks: [...subtasks] });

  // Step 4: Execute cut
  updateSubtask('cut', 'running');
  onProgress?.({ id: toolCallId, percent: 55, message: 'Cutting video...', subtasks: [...subtasks] });

  const cutResult = await executeExecuteCut(
    projectId,
    toolCallId,
    (p) => onProgress?.({ ...p, percent: 55 + Math.round(p.percent * 0.45), subtasks: [...subtasks] }),
  );

  updateSubtask('cut', 'done');
  onProgress?.({ id: toolCallId, percent: 100, message: 'Auto cut complete', subtasks: [...subtasks] });

  // Use cutResult's emitEvent (video panel) instead of removeResult's (word_preview)
  // This ensures the UI switches to show the cut video after completion
  return cutResult;
}

async function executeTranscribeVideo(
  projectId: string,
  toolCallId: string,
  onProgress?: ProgressCallback,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const videoPath = path.join(dir, project.videoFile);
  const audioPath = path.join(dir, 'audio.mp3');

  // Step 1: Extract audio
  onProgress?.({ id: toolCallId, percent: 10, message: 'Extracting audio...' });
  updateProject(projectId, { status: 'extracting_audio' });

  if (!fs.existsSync(audioPath)) {
    extractAudio(videoPath, audioPath);
  }

  updateProject(projectId, { status: 'audio_ready', audioFile: 'audio.mp3' });
  onProgress?.({ id: toolCallId, percent: 25, message: 'Uploading audio...' });

  // Step 2: Upload
  const audioUrl = await uploadToUguu(audioPath);

  // Step 3: Submit to Volcengine
  onProgress?.({ id: toolCallId, percent: 35, message: 'Submitting transcription...' });
  const taskId = await submitTranscription(audioUrl);
  updateProject(projectId, { status: 'transcribing', volcengineTaskId: taskId });

  // Step 4: Poll until done
  let pollPercent = 40;
  while (true) {
    const result = await queryTranscription(taskId);

    if (result.status === 'done' && result.result) {
      // Save Volcengine result
      const resultPath = path.join(dir, 'volcengine_result.json');
      fs.writeFileSync(resultPath, JSON.stringify(result.result, null, 2));

      // Generate subtitle words
      const words = generateSubtitleWords(result.result as unknown as VolcengineResult);
      const wordsPath = path.join(dir, 'subtitles_words.json');
      fs.writeFileSync(wordsPath, JSON.stringify(words, null, 2));

      updateProject(projectId, {
        status: 'transcribed',
        volcengineResult: 'volcengine_result.json',
        subtitlesWords: 'subtitles_words.json',
      });

      onProgress?.({ id: toolCallId, percent: 100, message: 'Transcription complete' });

      const textWords = words.filter(w => !w.isGap);
      return { result: `Transcription complete. ${textWords.length} words detected.` };
    }

    if (result.status === 'error') {
      return { result: `Transcription failed: ${result.error}` };
    }

    pollPercent = Math.min(90, pollPercent + 5);
    onProgress?.({ id: toolCallId, percent: pollPercent, message: 'Transcribing...' });
    await new Promise(r => setTimeout(r, 5000));
  }
}

async function executeAnalyzeTranscript(
  projectId: string,
  toolCallId: string,
  onProgress?: ProgressCallback,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const wordsPath = path.join(dir, project.subtitlesWords || 'subtitles_words.json');

  if (!fs.existsSync(wordsPath)) {
    return { result: 'No transcription found. Run transcribe_video first.' };
  }

  onProgress?.({ id: toolCallId, percent: 10, message: 'Analyzing transcript...' });
  updateProject(projectId, { status: 'analyzing' });

  const words: SubtitleWord[] = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const result = await runHybridAnalysis(words);

  // Save results
  const autoSelectedPath = path.join(dir, 'auto_selected.json');
  fs.writeFileSync(autoSelectedPath, JSON.stringify(result.autoSelected, null, 2));

  const analysisPath = path.join(dir, 'analysis_result.json');
  fs.writeFileSync(analysisPath, JSON.stringify(result, null, 2));

  updateProject(projectId, {
    status: 'analyzed',
    autoSelected: 'auto_selected.json',
  });

  onProgress?.({ id: toolCallId, percent: 100, message: 'Analysis complete' });

  const ruleCount = result.ruleResults.reduce((sum, r) => sum + r.indices.length, 0);
  const claudeCount = result.claudeResults.reduce((sum, r) => sum + r.indices.length, 0);
  const totalWords = words.filter(w => !w.isGap).length;

  return {
    result: `Analysis complete. ${result.autoSelected.length} words flagged for deletion out of ${totalWords} total. Rules detected ${ruleCount} issues, Claude detected ${claudeCount} additional issues.`,
    emitEvent: {
      type: 'ui_panel',
      panel: 'word_preview',
      data: { words, selectedIndices: result.autoSelected },
    },
  };
}

async function executeGetFlaggedWords(projectId: string): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const wordsPath = path.join(dir, project.subtitlesWords || 'subtitles_words.json');
  const autoSelectedPath = path.join(dir, project.autoSelected || 'auto_selected.json');

  if (!fs.existsSync(wordsPath) || !fs.existsSync(autoSelectedPath)) {
    return { result: 'No analysis data found. Run analyze_transcript first.' };
  }

  const words: SubtitleWord[] = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const autoSelected: number[] = JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8'));

  const flagged = autoSelected
    .filter(i => i >= 0 && i < words.length && !words[i].isGap)
    .map(i => ({
      index: i,
      text: words[i].text,
      start: words[i].start,
      end: words[i].end,
    }));

  let selectedIndices: number[] = [];
  const selectedPath = path.join(dir, 'selected_indices.json');
  if (fs.existsSync(selectedPath)) {
    selectedIndices = JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
  }

  const kept = autoSelected.filter(i => !selectedIndices.includes(i));
  const keptWords = kept
    .filter(i => i >= 0 && i < words.length && !words[i].isGap)
    .map(i => ({
      index: i,
      text: words[i].text,
      start: words[i].start,
      end: words[i].end,
    }));

  return {
    result: JSON.stringify({
      totalFlagged: flagged.length,
      flagged,
      selectedForRemoval: selectedIndices.length,
      keptDuringReview: keptWords.length,
      keptWords: keptWords.length > 0 ? keptWords : undefined,
    }, null, 2),
  };
}

async function executeRemoveWords(projectId: string, input: Record<string, unknown>): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const wordsPath = path.join(dir, project.subtitlesWords || 'subtitles_words.json');
  const autoSelectedPath = path.join(dir, project.autoSelected || 'auto_selected.json');

  if (!fs.existsSync(wordsPath) || !fs.existsSync(autoSelectedPath)) {
    return { result: 'No analysis data found. Run analyze_transcript first.' };
  }

  const words: SubtitleWord[] = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const autoSelected: number[] = JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8'));

  let indicesToRemove: number[];

  const mode = input.mode as string | undefined;
  const indices = input.indices as number[] | undefined;

  if (indices && Array.isArray(indices) && indices.length > 0) {
    indicesToRemove = indices.filter(i => Number.isInteger(i) && i >= 0 && i < words.length);
  } else if (mode === 'all_flagged') {
    indicesToRemove = [...autoSelected];
  } else if (mode === 'add_remaining') {
    const selectedPath = path.join(dir, 'selected_indices.json');
    const selectedIndices: number[] = fs.existsSync(selectedPath)
      ? JSON.parse(fs.readFileSync(selectedPath, 'utf8'))
      : [];
    const kept = autoSelected.filter(i => !selectedIndices.includes(i));
    indicesToRemove = [...new Set([...selectedIndices, ...kept])];
  } else {
    return { result: 'Provide indices array or mode: "all_flagged" | "add_remaining".' };
  }

  const deleteSegments = indicesToDeleteSegments(words, indicesToRemove);

  fs.writeFileSync(
    path.join(dir, 'selected_indices.json'),
    JSON.stringify(indicesToRemove, null, 2),
  );
  fs.writeFileSync(
    path.join(dir, 'delete_segments.json'),
    JSON.stringify(deleteSegments, null, 2),
  );

  updateProject(projectId, {
    status: 'reviewed',
    deleteSegments: 'delete_segments.json',
  });

  const removedText = indicesToRemove
    .filter(i => i >= 0 && i < words.length && !words[i].isGap)
    .map(i => words[i].text)
    .join(', ');

  return {
    result: `Set ${indicesToRemove.length} words for removal: ${removedText || '(indices: ' + indicesToRemove.join(', ') + ')'}. Call execute_cut to apply.`,
    emitEvent: {
      type: 'ui_panel',
      panel: 'word_preview',
      data: { words, selectedIndices: indicesToRemove },
    },
  };
}

async function executeShowReviewPanel(projectId: string): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const wordsPath = path.join(dir, project.subtitlesWords || 'subtitles_words.json');
  const autoSelectedPath = path.join(dir, project.autoSelected || 'auto_selected.json');

  if (!fs.existsSync(wordsPath) || !fs.existsSync(autoSelectedPath)) {
    return { result: 'No analysis data found. Run analyze_transcript first.' };
  }

  const words: SubtitleWord[] = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
  const autoSelected: number[] = JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8'));

  return {
    result: 'Review panel opened. Waiting for user to confirm word selections.',
    uiPanel: {
      panel: 'review',
      data: { words, autoSelected },
    },
  };
}

async function executeExecuteCut(
  projectId: string,
  toolCallId: string,
  onProgress?: ProgressCallback,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const videoPath = path.join(dir, project.videoFile);
  const deleteSegmentsPath = path.join(dir, project.deleteSegments || 'delete_segments.json');

  if (!fs.existsSync(deleteSegmentsPath)) {
    return { result: 'No delete segments found. Complete the review step first.' };
  }

  const deleteSegments: DeleteSegment[] = JSON.parse(fs.readFileSync(deleteSegmentsPath, 'utf8'));
  const baseName = path.basename(project.videoFile, '.mp4');
  const outputFile = `${baseName}_cut.mp4`;
  const outputPath = path.join(dir, outputFile);

  updateProject(projectId, { status: 'cutting' });
  onProgress?.({ id: toolCallId, percent: 0, message: 'Starting video cut...' });

  const result = await executeFFmpegCut(
    videoPath,
    deleteSegments,
    outputPath,
    (progress) => {
      onProgress?.({ id: toolCallId, percent: progress.percent, message: `Cutting... ${progress.percent}%` });
    },
  );

  if (result.success) {
    const originalDuration = getVideoDuration(videoPath);
    const newDuration = getVideoDuration(outputPath);
    const deletedDuration = originalDuration - newDuration;
    const savedPercent = ((deletedDuration / originalDuration) * 100).toFixed(1);

    // Extract audio from cut video for waveform display
    const cutAudioFile = `${baseName}_cut_audio.mp3`;
    const cutAudioPath = path.join(dir, cutAudioFile);
    try {
      extractAudio(outputPath, cutAudioPath);
    } catch {
      // Non-fatal: waveform just won't be available for cut video
    }

    updateProject(projectId, { 
      status: 'cut', 
      cutVideoFile: outputFile,
      cutAudioFile: fs.existsSync(cutAudioPath) ? cutAudioFile : undefined,
    });
    onProgress?.({ id: toolCallId, percent: 100, message: 'Cut complete' });

    // Trigger evolve if there are enough corrections
    try {
      const feedbackPath = path.join(dir, 'feedback.json');
      if (fs.existsSync(feedbackPath)) {
        const feedback = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
        if (feedback.length >= 2) {
          // Fire-and-forget evolve
          fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/evolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectId }),
          }).catch(() => {});
        }
      }
    } catch {
      // Ignore evolve errors
    }

    return {
      result: `Video cut complete. Removed ${deletedDuration.toFixed(1)}s (${savedPercent}% of original ${originalDuration.toFixed(1)}s). New duration: ${newDuration.toFixed(1)}s.`,
      // Emit event to refresh the video panel with the cut video
      emitEvent: {
        type: 'ui_panel',
        panel: 'video',
        data: { cutVideoFile: outputFile },
      },
    };
  }

  updateProject(projectId, { status: 'reviewed' });
  return { result: `Video cut failed: ${result.error}` };
}

async function executeShowSubtitleEditor(projectId: string): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const subtitlesPath = path.join(dir, project.subtitlesWithTime || 'subtitles_with_time.json');

  if (!fs.existsSync(subtitlesPath)) {
    return { result: 'No subtitles found. Use attach_subtitles to generate and burn subtitles, or run transcribe_video first if no transcription exists.' };
  }

  const subtitles: Subtitle[] = JSON.parse(fs.readFileSync(subtitlesPath, 'utf8'));

  return {
    result: 'Subtitle editor opened. Waiting for user to finish editing.',
    uiPanel: {
      panel: 'subtitle_editor',
      data: { subtitles },
    },
  };
}

async function executeAttachSubtitles(
  projectId: string,
  toolCallId: string,
  input: Record<string, unknown>,
  onProgress?: ProgressCallback,
): Promise<ToolResult> {
  let project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const videoFileName = project.cutVideoFile || project.videoFile;
  const videoPath = path.join(dir, videoFileName);

  // Generate subtitles first if they don't exist
  let subtitlesPath = path.join(dir, project.subtitlesWithTime || 'subtitles_with_time.json');
  if (!fs.existsSync(subtitlesPath)) {
    // Auto-generate subtitles
    const resultPath = path.join(dir, project.volcengineResult || 'volcengine_result.json');
    if (!fs.existsSync(resultPath)) {
      return { result: 'No transcription result found. Run transcribe_video first.' };
    }

    const volcResult: VolcengineResult = JSON.parse(fs.readFileSync(resultPath, 'utf8'));

    // Load delete segments if they exist
    let deleteSegments: DeleteSegment[] | undefined;
    const deleteSegmentsPath = path.join(dir, 'delete_segments.json');
    if (fs.existsSync(deleteSegmentsPath)) {
      deleteSegments = JSON.parse(fs.readFileSync(deleteSegmentsPath, 'utf8'));
    }

    const subtitles = groupIntoSubtitlesByUtterance(volcResult, deleteSegments);
    subtitlesPath = path.join(dir, 'subtitles_with_time.json');
    fs.writeFileSync(subtitlesPath, JSON.stringify(subtitles, null, 2));

    updateProject(projectId, {
      subtitlesWithTime: 'subtitles_with_time.json',
      status: 'subtitles_ready',
    });
    
    // Refresh project
    project = getProject(projectId)!;
  }

  const subtitles: Subtitle[] = JSON.parse(fs.readFileSync(subtitlesPath, 'utf8'));
  const baseName = path.basename(videoFileName, '.mp4');
  const srtPath = path.join(dir, `${baseName}.srt`);
  const outputPath = path.join(dir, `${baseName}_subtitled.mp4`);
  const outline = (input.outline as number) || 2;

  // Generate SRT
  const srt = generateSRT(subtitles);
  fs.writeFileSync(srtPath, srt);

  // Generate readable transcript
  const transcriptPath = path.join(dir, `${baseName}_transcript.md`);
  const transcript = generateReadableTranscript(subtitles);
  fs.writeFileSync(transcriptPath, transcript);

  updateProject(projectId, { status: 'burning', srtFile: `${baseName}.srt` });
  onProgress?.({ id: toolCallId, percent: 0, message: 'Burning subtitles...' });

  const result = await burnSubtitles(
    videoPath,
    srtPath,
    outputPath,
    outline,
    (progress) => {
      onProgress?.({ id: toolCallId, percent: progress.percent, message: `Burning... ${progress.percent}%` });
    },
  );

  if (result.success) {
    updateProject(projectId, {
      status: 'done',
      burnedVideoFile: `${baseName}_subtitled.mp4`,
    });
    onProgress?.({ id: toolCallId, percent: 100, message: 'Burn complete' });

    return { 
      result: `Subtitles burned into video. Output: ${baseName}_subtitled.mp4`,
      // Emit event to refresh the video panel to show the subtitled video
      emitEvent: {
        type: 'ui_panel',
        panel: 'video',
        data: { subtitlesAttached: true, burnedVideoFile: `${baseName}_subtitled.mp4` },
      },
    };
  }

  updateProject(projectId, { status: 'subtitles_ready' });
  return { result: `Subtitle burn failed: ${result.error}` };
}

async function executeProvideDownloadLinks(projectId: string): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  return {
    result: 'Download links are now available.',
    uiPanel: {
      panel: 'download',
      data: {
        projectId,
        videoFile: project.videoFile,
        cutVideoFile: project.cutVideoFile,
        burnedVideoFile: project.burnedVideoFile,
        srtFile: project.srtFile,
      },
    },
  };
}

// ===== Annotation Tools =====

function loadAnnotations(projectId: string): Annotation[] {
  const dir = getProjectDir(projectId);
  const annotationsPath = path.join(dir, 'annotations.json');
  if (fs.existsSync(annotationsPath)) {
    return JSON.parse(fs.readFileSync(annotationsPath, 'utf8'));
  }
  return [];
}

function saveAnnotations(projectId: string, annotations: Annotation[]): void {
  const dir = getProjectDir(projectId);
  const annotationsPath = path.join(dir, 'annotations.json');
  fs.writeFileSync(annotationsPath, JSON.stringify(annotations, null, 2));
  updateProject(projectId, { annotationsFile: 'annotations.json' });
}

async function executeAddAnnotation(
  projectId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const type = input.type as AnnotationType;
  const target = input.target as string;
  const autoSafePlacement = input.autoSafePlacement as boolean | undefined;
  const placementTimestamp = (input.placementTimestamp as number) ?? 0;
  
  let x: number;
  let y: number;
  let positionAdjusted = false;
  let safePlacementInfo = '';
  
  // If autoSafePlacement is enabled, analyze frame first to find safe position
  if (autoSafePlacement) {
    const dir = getProjectDir(projectId);
    const videoFileName = project.cutVideoFile || project.videoFile;
    const videoPath = path.join(dir, videoFileName);
    
    if (!fs.existsSync(videoPath)) {
      return { result: 'Video file not found for safe placement analysis.' };
    }
    
    // Extract frame for analysis
    const frameFileName = `safe_placement_${Date.now()}.jpg`;
    const framePath = path.join(dir, frameFileName);
    
    try {
      extractFrame(videoPath, placementTimestamp, framePath, 1280);
      
      if (!fs.existsSync(framePath)) {
        return { result: 'Failed to extract frame for safe placement analysis.' };
      }
      
      // Analyze for safe zones
      const safeZonesResult = await analyzeFrameForSafeZones(framePath);
      
      // Clean up frame file
      try { fs.unlinkSync(framePath); } catch { /* ignore */ }
      
      // Use recommended position if available, otherwise use first safe zone
      if (safeZonesResult.recommendedPosition) {
        x = safeZonesResult.recommendedPosition.x;
        y = safeZonesResult.recommendedPosition.y;
      } else if (safeZonesResult.safeZones.length > 0) {
        x = safeZonesResult.safeZones[0].x;
        y = safeZonesResult.safeZones[0].y;
      } else {
        // Fallback to upper-left corner if no safe zones found
        x = 15;
        y = 15;
      }
      
      // Build info about placement decision
      const avoidedZones = safeZonesResult.avoidZones
        .map(z => z.label)
        .join(', ');
      safePlacementInfo = avoidedZones 
        ? ` Avoided: ${avoidedZones}.`
        : ' No faces/obstacles detected.';
        
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // If analysis fails, fall back to safe corner position
      x = 15;
      y = 15;
      safePlacementInfo = ` (Safe placement analysis failed: ${errorMessage}. Using fallback position.)`;
    }
  } else {
    // Manual positioning - clamp to frame bounds
    const rawX = input.x as number;
    const rawY = input.y as number;
    
    if (rawX === undefined || rawY === undefined) {
      return { result: 'Please provide x and y positions, or set autoSafePlacement=true for automatic placement.' };
    }
    
    const clamped = clampPositionToFrame(rawX, rawY, 5);
    x = clamped.x;
    y = clamped.y;
    positionAdjusted = rawX !== x || rawY !== y;
  }
  const startTime = input.startTime as number | undefined;
  const endTime = input.endTime as number | undefined;
  const color = (input.color as string) || 'yellow';
  const size = (input.size as AnnotationSize) || 'medium';
  const animation = (input.animation as AnnotationAnimation) || 'none';
  const text = input.text as string | undefined;
  const arrowDirection = input.arrowDirection as ArrowDirection | undefined;
  
  // Custom SVG fields
  const svgContent = input.svgContent as string | undefined;
  const svgViewBox = (input.svgViewBox as string) || '0 0 100 100';
  
  // Size presets for custom SVG (if explicit width/height not provided)
  const SVG_SIZE_PRESETS = { small: 120, medium: 200, large: 320 };
  const sizePreset = SVG_SIZE_PRESETS[size] || 200;
  const svgWidth = (input.svgWidth as number) || sizePreset;
  const svgHeight = (input.svgHeight as number) || sizePreset;

  const annotation: Annotation = {
    id: randomUUID().slice(0, 8),
    type,
    position: { x, y },
    startTime,
    endTime,
    style: { color, size, animation },
    text,
    arrowDirection,
    target,
    // Include SVG fields only for custom_svg type
    ...(type === 'custom_svg' && {
      svgContent,
      svgViewBox,
      svgWidth,
      svgHeight,
    }),
  };

  const annotations = loadAnnotations(projectId);
  annotations.push(annotation);
  saveAnnotations(projectId, annotations);

  const timingDesc = startTime !== undefined
    ? endTime !== undefined
      ? `from ${startTime}s to ${endTime}s`
      : `starting at ${startTime}s`
    : 'for the whole video';

  const typeDesc = type === 'custom_svg' ? 'custom SVG' : type;
  const adjustmentNote = positionAdjusted 
    ? ` (Position adjusted to stay within frame bounds.)` 
    : '';
  const placementNote = autoSafePlacement
    ? ` Auto-placed using safe zone analysis.${safePlacementInfo}`
    : adjustmentNote;

  return {
    result: `Added ${typeDesc} annotation (ID: ${annotation.id}) at position (${x.toFixed(1)}%, ${y.toFixed(1)}%) ${timingDesc}. Target: "${target}".${placementNote}`,
    emitEvent: {
      type: 'ui_panel',
      panel: 'annotations_updated',
      data: { annotations },
    },
  };
}

async function executeListAnnotations(projectId: string): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const annotations = loadAnnotations(projectId);

  if (annotations.length === 0) {
    return { result: 'No annotations on this video.' };
  }

  const list = annotations.map(a => {
    const timing = a.startTime !== undefined
      ? a.endTime !== undefined
        ? `${a.startTime}s-${a.endTime}s`
        : `from ${a.startTime}s`
      : 'whole video';
    return `- ID: ${a.id}, Type: ${a.type}, Position: (${a.position.x}%, ${a.position.y}%), Timing: ${timing}, Target: "${a.target}"`;
  }).join('\n');

  return { result: `${annotations.length} annotation(s):\n${list}` };
}

async function executeRemoveAnnotation(
  projectId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const id = input.id as string;
  if (!id) return { result: 'Please provide the annotation ID to remove.' };

  const annotations = loadAnnotations(projectId);
  const index = annotations.findIndex(a => a.id === id);

  if (index === -1) {
    return { result: `Annotation with ID "${id}" not found.` };
  }

  const removed = annotations[index];
  annotations.splice(index, 1);
  saveAnnotations(projectId, annotations);

  return {
    result: `Removed ${removed.type} annotation (ID: ${id}).`,
    emitEvent: {
      type: 'ui_panel',
      panel: 'annotations_updated',
      data: { annotations },
    },
  };
}

async function executeUpdateAnnotation(
  projectId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const id = input.id as string;
  if (!id) return { result: 'Please provide the annotation ID to update.' };

  const annotations = loadAnnotations(projectId);
  const index = annotations.findIndex(a => a.id === id);

  if (index === -1) {
    return { result: `Annotation with ID "${id}" not found.` };
  }

  const annotation = annotations[index];
  const updates: string[] = [];

  // Update position
  if (input.x !== undefined) {
    annotation.position.x = input.x as number;
    updates.push(`x=${input.x}%`);
  }
  if (input.y !== undefined) {
    annotation.position.y = input.y as number;
    updates.push(`y=${input.y}%`);
  }

  // Update timing
  if (input.startTime !== undefined) {
    annotation.startTime = input.startTime as number;
    updates.push(`startTime=${input.startTime}s`);
  }
  if (input.endTime !== undefined) {
    annotation.endTime = input.endTime as number;
    updates.push(`endTime=${input.endTime}s`);
  }

  // Update style
  if (input.color !== undefined) {
    const newColor = input.color as string;
    annotation.style.color = newColor;
    
    // For custom_svg, also update colors in the SVG content itself
    if (annotation.type === 'custom_svg' && annotation.svgContent) {
      // Replace stroke and fill colors in SVG content
      // Match stroke="..." and fill="..." (but not fill="none")
      annotation.svgContent = annotation.svgContent
        .replace(/stroke="(?!none)[^"]+"/g, `stroke="${newColor}"`)
        .replace(/fill="(?!none|url)[^"]+"/g, `fill="${newColor}"`);
    }
    
    updates.push(`color=${input.color}`);
  }
  if (input.animation !== undefined) {
    annotation.style.animation = input.animation as AnnotationAnimation;
    updates.push(`animation=${input.animation}`);
  }

  // Update size (affects both style.size and SVG dimensions for custom_svg)
  const SVG_SIZE_PRESETS: Record<string, number> = { small: 120, medium: 200, large: 320 };
  if (input.size !== undefined) {
    const newSize = input.size as AnnotationSize;
    annotation.style.size = newSize;
    // Also update SVG dimensions if it's a custom_svg
    if (annotation.type === 'custom_svg') {
      const preset = SVG_SIZE_PRESETS[newSize] || 200;
      annotation.svgWidth = preset;
      annotation.svgHeight = preset;
    }
    updates.push(`size=${input.size}`);
  }

  // Update explicit SVG dimensions (overrides size preset)
  if (input.svgWidth !== undefined) {
    annotation.svgWidth = input.svgWidth as number;
    updates.push(`svgWidth=${input.svgWidth}px`);
  }
  if (input.svgHeight !== undefined) {
    annotation.svgHeight = input.svgHeight as number;
    updates.push(`svgHeight=${input.svgHeight}px`);
  }

  // Replace SVG content entirely (for custom_svg type)
  if (input.svgContent !== undefined && annotation.type === 'custom_svg') {
    annotation.svgContent = input.svgContent as string;
    updates.push('svgContent replaced');
  }

  if (updates.length === 0) {
    return { result: `No changes specified for annotation "${id}".` };
  }

  saveAnnotations(projectId, annotations);

  return {
    result: `Updated annotation "${id}": ${updates.join(', ')}.`,
    emitEvent: {
      type: 'ui_panel',
      panel: 'annotations_updated',
      data: { annotations },
    },
  };
}

// ===== Vision Analysis Tool =====

async function executeAnalyzeFrame(
  projectId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const timestamp = (input.timestamp as number) ?? 0;
  const query = input.query as string;

  if (!query) {
    return { result: 'Please provide a query describing what elements to find in the frame.' };
  }

  const dir = getProjectDir(projectId);
  
  // Determine which video to analyze (prefer cut video if available, else original)
  const videoFileName = project.cutVideoFile || project.videoFile;
  const videoPath = path.join(dir, videoFileName);

  if (!fs.existsSync(videoPath)) {
    return { result: 'Video file not found.' };
  }

  // Extract frame at the specified timestamp
  const frameFileName = `frame_${timestamp.toFixed(2).replace('.', '_')}.jpg`;
  const framePath = path.join(dir, frameFileName);

  try {
    // Extract frame with reasonable size for vision API (max 1280px width)
    extractFrame(videoPath, timestamp, framePath, 1280);

    if (!fs.existsSync(framePath)) {
      return { result: 'Failed to extract frame from video.' };
    }

    // Send to Gemini for analysis
    const result = await analyzeFrameForPositions({
      imagePath: framePath,
      query,
    });

    // Clean up frame file (optional - could keep for debugging)
    // fs.unlinkSync(framePath);

    if (result.positions.length === 0) {
      return {
        result: `Frame analysis at ${timestamp}s: Could not detect specific positions. ${result.description || 'Try being more specific about what to find.'}`,
      };
    }

    // Format positions for Claude to use
    const positionsList = result.positions
      .map(p => `- ${p.label}: x=${p.x.toFixed(1)}%, y=${p.y.toFixed(1)}% (confidence: ${p.confidence})`)
      .join('\n');

    return {
      result: `Frame analysis at ${timestamp}s:\n${positionsList}\n\nDescription: ${result.description || 'Elements detected successfully.'}\n\nUse these coordinates with add_annotation to create precise annotations.`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for common issues
    if (errorMessage.includes('OPENROUTER_API_KEY')) {
      return { result: 'OpenRouter API key not configured. Please add OPENROUTER_API_KEY to .env.local.' };
    }
    
    return { result: `Frame analysis failed: ${errorMessage}` };
  }
}

// ===== Find Safe Placement Tool =====

async function executeFindSafePlacement(
  projectId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const timestamp = (input.timestamp as number) ?? 0;
  const elementCount = (input.elementCount as number) ?? 1;

  const dir = getProjectDir(projectId);
  
  // Determine which video to analyze
  const videoFileName = project.cutVideoFile || project.videoFile;
  const videoPath = path.join(dir, videoFileName);

  if (!fs.existsSync(videoPath)) {
    return { result: 'Video file not found.' };
  }

  // Extract frame at the specified timestamp
  const frameFileName = `safe_zones_${timestamp.toFixed(2).replace('.', '_')}.jpg`;
  const framePath = path.join(dir, frameFileName);

  try {
    // Extract frame
    extractFrame(videoPath, timestamp, framePath, 1280);

    if (!fs.existsSync(framePath)) {
      return { result: 'Failed to extract frame from video.' };
    }

    // Analyze for safe placement zones
    const result = await analyzeFrameForSafeZones(framePath);

    // Clean up frame file
    // fs.unlinkSync(framePath);

    // Format avoid zones
    const avoidList = result.avoidZones.length > 0
      ? result.avoidZones
          .map(z => `- AVOID: ${z.label} at (${z.x.toFixed(0)}%, ${z.y.toFixed(0)}%) size ${z.width.toFixed(0)}%x${z.height.toFixed(0)}% - ${z.reason}`)
          .join('\n')
      : '- No critical avoid zones detected';

    // Format safe zones
    const safeList = result.safeZones.length > 0
      ? result.safeZones
          .map(z => `- SAFE: ${z.label} at (${z.x.toFixed(0)}%, ${z.y.toFixed(0)}%) size ${z.width.toFixed(0)}%x${z.height.toFixed(0)}% - ${z.reason}`)
          .join('\n')
      : '- Use corners and edges as safe areas';

    // Generate multiple recommended positions if needed
    let recommendations = '';
    if (result.recommendedPosition) {
      if (elementCount === 1) {
        recommendations = `\nRECOMMENDED POSITION: x=${result.recommendedPosition.x.toFixed(1)}%, y=${result.recommendedPosition.y.toFixed(1)}%`;
      } else {
        // For multiple elements, distribute across safe zones
        const positions: Array<{x: number; y: number}> = [];
        
        // Start with recommended position
        positions.push(result.recommendedPosition);
        
        // Add positions from safe zones, avoiding overlap
        for (const zone of result.safeZones) {
          if (positions.length >= elementCount) break;
          
          // Check this position doesn't overlap with existing ones
          const tooClose = positions.some(p => 
            Math.abs(p.x - zone.x) < 15 && Math.abs(p.y - zone.y) < 15
          );
          
          if (!tooClose) {
            positions.push({ x: zone.x, y: zone.y });
          }
        }
        
        // If we still need more positions, use corners that aren't near avoid zones
        const corners = [
          { x: 15, y: 15 }, { x: 85, y: 15 },
          { x: 15, y: 85 }, { x: 85, y: 85 },
          { x: 50, y: 15 }, { x: 50, y: 85 },
        ];
        
        for (const corner of corners) {
          if (positions.length >= elementCount) break;
          
          // Check if corner is far from avoid zones
          const nearAvoid = result.avoidZones.some(z => 
            Math.abs(corner.x - z.x) < z.width/2 + 10 && 
            Math.abs(corner.y - z.y) < z.height/2 + 10
          );
          
          const alreadyUsed = positions.some(p => 
            Math.abs(p.x - corner.x) < 15 && Math.abs(p.y - corner.y) < 15
          );
          
          if (!nearAvoid && !alreadyUsed) {
            positions.push(corner);
          }
        }
        
        recommendations = `\nRECOMMENDED POSITIONS for ${elementCount} elements:\n` +
          positions.slice(0, elementCount)
            .map((p, i) => `  ${i + 1}. x=${p.x.toFixed(1)}%, y=${p.y.toFixed(1)}%`)
            .join('\n');
      }
    }

    return {
      result: `Safe placement analysis at ${timestamp}s:\n\nAVOID ZONES (do not place elements here):\n${avoidList}\n\nSAFE ZONES (good for placement):\n${safeList}${recommendations}\n\nDescription: ${result.description || 'Analysis complete.'}\n\nUse these coordinates with add_annotation. All positions are guaranteed to be within frame bounds (5-95%).`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.includes('OPENROUTER_API_KEY')) {
      return { result: 'OpenRouter API key not configured. Please add OPENROUTER_API_KEY to .env.local.' };
    }
    
    return { result: `Safe placement analysis failed: ${errorMessage}` };
  }
}

// ===== Save Video Tool (Burn Annotations) =====

async function executeSaveVideo(
  projectId: string,
  toolCallId: string,
  onProgress?: (p: ProgressEvent) => void,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const dir = getProjectDir(projectId);
  const annotations = loadAnnotations(projectId);
  
  // For input, always use the cut video (or original if no cut exists)
  // Never use burnedVideoFile as input to avoid in-place editing issues
  const inputVideoFile = project.cutVideoFile || project.videoFile;
  const inputVideoPath = path.join(dir, inputVideoFile);
  
  if (!fs.existsSync(inputVideoPath)) {
    return { result: 'Video file not found.' };
  }
  
  if (annotations.length === 0) {
    // No annotations - provide download link for best available video
    const downloadFile = project.burnedVideoFile || project.cutVideoFile || project.videoFile;
    const downloadUrl = `/api/projects/${projectId}/download?file=${encodeURIComponent(downloadFile)}`;
    
    return {
      result: `No annotations to burn. Here's your video download link:\n\n**[Download Video](${downloadUrl})**`,
    };
  }

  // Output path - use a unique timestamp to avoid overwriting
  const baseName = path.basename(inputVideoFile, '.mp4');
  const timestamp = Date.now();
  const outputFileName = `${baseName}_annotated_${timestamp}.mp4`;
  const outputPath = path.join(dir, outputFileName);

  try {
    const result = await burnAnnotations(
      inputVideoPath,
      annotations,
      outputPath,
      (progress) => {
        if (onProgress) {
          onProgress({
            type: 'progress',
            toolCallId,
            data: { percent: progress.percent, stage: 'Burning annotations' },
          });
        }
      }
    );

    if (result.success) {
      // Update project with the annotated video
      updateProject(projectId, {
        burnedVideoFile: outputFileName,
      });

      const downloadUrl = `/api/projects/${projectId}/download?file=${encodeURIComponent(outputFileName)}`;

      return {
        result: `Video saved with ${annotations.length} annotation(s) burned in! (took ${result.elapsed}s)\n\n**[Download Video](${downloadUrl})**\n\nFile: ${outputFileName}`,
      };
    } else {
      return { result: `Video export failed: ${result.error}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { result: `Video export failed: ${errorMessage}` };
  }
}

// ===== Change Background Tool =====

async function executeChangeBackground(
  projectId: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const project = getProject(projectId);
  if (!project) return { result: 'Project not found.' };

  const timestamp = (input.timestamp as number) ?? 0;
  const newBackground = input.newBackground as string;

  if (!newBackground) {
    return { result: 'Please provide a description of the new background.' };
  }

  const dir = getProjectDir(projectId);
  
  // Determine which video to use (prefer cut video if available)
  const videoFileName = project.cutVideoFile || project.videoFile;
  const videoPath = path.join(dir, videoFileName);

  if (!fs.existsSync(videoPath)) {
    return { result: 'Video file not found.' };
  }

  // Extract frame at the specified timestamp
  const frameFileName = `bg_change_input_${timestamp.toFixed(2).replace('.', '_')}.jpg`;
  const framePath = path.join(dir, frameFileName);
  // Gemini returns PNG images
  const outputFileName = `bg_changed_${Date.now()}.png`;
  const outputPath = path.join(dir, outputFileName);

  try {
    // Extract frame
    extractFrame(videoPath, timestamp, framePath, 1280);

    if (!fs.existsSync(framePath)) {
      return { result: 'Failed to extract frame from video.' };
    }

    // Call Gemini to change the background
    const result = await changeImageBackground(framePath, newBackground, outputPath);

    if (!result.success) {
      return { result: `Background change failed: ${result.error}` };
    }

    // Return success with preview info
    const previewUrl = `/api/projects/${projectId}/download?file=${encodeURIComponent(outputFileName)}`;

    return {
      result: `Background changed successfully! Preview saved.\n\nOriginal frame extracted at ${timestamp}s.\nNew background: "${newBackground}"\n\n**[View Preview](${previewUrl})**\n\nNote: This is a single-frame preview. Full video background replacement would require processing each frame.`,
      emitEvent: {
        type: 'ui_panel',
        panel: 'background_preview',
        data: { 
          originalFrame: frameFileName,
          editedFrame: outputFileName,
          timestamp,
          newBackground,
        },
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { result: `Background change failed: ${errorMessage}` };
  }
}
