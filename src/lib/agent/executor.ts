import fs from 'fs';
import path from 'path';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { extractAudio, executeFFmpegCut, burnSubtitles, getVideoDuration } from '@/lib/ffmpeg';
import { uploadToUguu } from '@/lib/upload';
import { submitTranscription, queryTranscription } from '@/lib/volcengine';
import { generateSubtitleWords, groupIntoSubtitlesByUtterance } from '@/lib/subtitles';
import { generateSRT, generateReadableTranscript } from '@/lib/srt';
import { runHybridAnalysis } from '@/lib/analysis';
import { indicesToDeleteSegments } from '@/lib/segment-merger';
import type { VolcengineResult, SubtitleWord, Subtitle, DeleteSegment, SubtaskStatus } from '@/types';

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
    reviewed: 'User review complete, ready to cut video',
    cutting: 'Video cut in progress',
    cut: 'Video cut complete, ready for subtitle generation',
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
    return { result: 'No subtitles found. Subtitles are auto-generated after cut completes.' };
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
