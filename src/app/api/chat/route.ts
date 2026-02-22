import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';
import { getProject, getProjectDir, updateProject } from '@/lib/project-store';
import { loadConversation, saveConversation } from '@/lib/agent/conversation';
import { agentTools, UI_TOOLS } from '@/lib/agent/tools';
import { executeTool } from '@/lib/agent/executor';
import { SYSTEM_PROMPT } from '@/lib/agent/system-prompt';
import { splitIntoSentences } from '@/lib/analysis/rules';
import type { ChatRequest, ChatSSEEvent, ConversationState } from '@/types';
import type { SubtitleWord, AnalysisResult } from '@/types';
import fs from 'fs';
import path from 'path';

const MAX_AGENT_ITERATIONS = 10;

function encodeSSE(event: ChatSSEEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body: ChatRequest = await req.json();
  const { projectId, message, panelData } = body;

  const project = getProject(projectId);
  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const conversation = loadConversation(projectId);

  // Handle panel data submission (user completed a UI interaction)
  if (panelData && conversation.pendingToolCall) {
    const toolResult = await handlePanelSubmission(
      projectId,
      conversation.pendingToolCall,
      panelData,
    );

    // Add the tool result to conversation
    conversation.messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: conversation.pendingToolCall.id,
          content: toolResult,
        },
      ],
    });
    conversation.pendingToolCall = undefined;
  } else if (message && conversation.pendingToolCall) {
    // User sent a new message instead of completing the panel.
    // API requires tool_result after tool_use, so add a synthetic one first.
    conversation.messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: conversation.pendingToolCall.id,
          content: `User skipped the panel and sent a new message instead.`,
        },
      ],
    });
    conversation.pendingToolCall = undefined;
  }

  // Handle new user message
  if (message) {
    conversation.messages.push({
      role: 'user',
      content: message,
    });
  }

  // Stream the agent loop
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runAgentLoop(projectId, conversation, (event) => {
          controller.enqueue(encoder.encode(encodeSSE(event)));
        });
      } catch (err) {
        const errorEvent: ChatSSEEvent = {
          type: 'error',
          message: (err as Error).message,
        };
        controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function runAgentLoop(
  projectId: string,
  conversation: ConversationState,
  emit: (event: ChatSSEEvent) => void,
): Promise<void> {
  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
    // Call Claude with streaming
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: agentTools,
      messages: conversation.messages as Anthropic.Messages.MessageParam[],
    });

    // Collect the full response
    const contentBlocks: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    > = [];
    stream.on('text', (text) => {
      emit({ type: 'text_delta', delta: text });
    });

    const finalMessage = await stream.finalMessage();

    // Build content blocks from the final message
    for (const block of finalMessage.content) {
      if (block.type === 'text') {
        contentBlocks.push({ type: 'text', text: block.text });
      } else if (block.type === 'tool_use') {
        contentBlocks.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    // Add assistant response to conversation
    conversation.messages.push({
      role: 'assistant',
      content: contentBlocks,
    });

    // Check if Claude wants to use any tools
    const toolUseBlocks = contentBlocks.filter(
      (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls - Claude is done responding
      emit({ type: 'done' });
      saveConversation(projectId, conversation);
      return;
    }

    // Process each tool call
    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

    for (const toolUse of toolUseBlocks) {
      emit({ type: 'tool_call', id: toolUse.id, name: toolUse.name });

      if (UI_TOOLS.has(toolUse.name)) {
        // UI tool: execute to get data, emit panel, save pending state, and close
        const result = await executeTool(projectId, toolUse.name, toolUse.id, toolUse.input);

        if (result.uiPanel) {
          emit({
            type: 'ui_panel',
            panel: result.uiPanel.panel as 'review' | 'subtitle_editor',
            data: result.uiPanel.data,
          });
        }

        emit({ type: 'tool_result', id: toolUse.id, name: toolUse.name, summary: result.result });

        // Save conversation with pending tool call - don't add tool_result yet
        conversation.pendingToolCall = {
          id: toolUse.id,
          name: toolUse.name,
          input: toolUse.input,
        };
        emit({ type: 'done', pendingToolCallId: toolUse.id });
        saveConversation(projectId, conversation);
        return;
      }

      // Autonomous tool: execute and continue the loop
      const result = await executeTool(
        projectId,
        toolUse.name,
        toolUse.id,
        toolUse.input,
        (progress) => {
          emit({
            type: 'tool_progress',
            id: progress.id,
            percent: progress.percent,
            message: progress.message,
            subtasks: progress.subtasks,
          });
        },
      );

      emit({ type: 'tool_result', id: toolUse.id, name: toolUse.name, summary: result.result });

      // Handle download panel (provide_download_links emits a panel but isn't a "UI tool" that blocks)
      if (result.uiPanel) {
        emit({
          type: 'ui_panel',
          panel: result.uiPanel.panel as 'download',
          data: result.uiPanel.data,
        });
      }

      // Emit word_preview or other extra events (e.g. after analyze or remove_words)
      if (result.emitEvent) {
        emit(result.emitEvent as Parameters<typeof emit>[0]);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.result,
      });
    }

    // Add all tool results to conversation
    conversation.messages.push({
      role: 'user',
      content: toolResults,
    });

    // Continue the loop - Claude will see tool results and decide next action
  }

  // Max iterations reached
  emit({ type: 'done' });
  saveConversation(projectId, conversation);
}

async function handlePanelSubmission(
  projectId: string,
  pendingToolCall: { id: string; name: string; input: Record<string, unknown> },
  panelData: NonNullable<ChatRequest['panelData']>,
): Promise<string> {
  const dir = getProjectDir(projectId);

  if (panelData.type === 'review_complete') {
    const { selectedIndices, deleteSegments } = panelData;

    // Save selected indices
    fs.writeFileSync(
      path.join(dir, 'selected_indices.json'),
      JSON.stringify(selectedIndices, null, 2),
    );

    // Save delete segments
    fs.writeFileSync(
      path.join(dir, 'delete_segments.json'),
      JSON.stringify(deleteSegments, null, 2),
    );

    updateProject(projectId, {
      status: 'reviewed',
      deleteSegments: 'delete_segments.json',
    });

    // Compute feedback
    let correctionCount = 0;
    try {
      const autoSelectedPath = path.join(dir, 'auto_selected.json');
      const wordsPath = path.join(dir, 'subtitles_words.json');
      const analysisPath = path.join(dir, 'analysis_result.json');

      if (fs.existsSync(autoSelectedPath) && fs.existsSync(wordsPath)) {
        const autoSelected: number[] = JSON.parse(fs.readFileSync(autoSelectedPath, 'utf8'));
        const words: SubtitleWord[] = JSON.parse(fs.readFileSync(wordsPath, 'utf8'));
        const autoSet = new Set(autoSelected);
        const userSet = new Set(selectedIndices);

        const falsePositives = autoSelected.filter(i => !userSet.has(i));
        const falseNegatives = selectedIndices.filter(i => !autoSet.has(i));

        if (falsePositives.length > 0 || falseNegatives.length > 0) {
          let analysisResult: AnalysisResult | null = null;
          if (fs.existsSync(analysisPath)) {
            analysisResult = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
          }

          const sentences = splitIntoSentences(words);
          const corrections = [];

          for (const i of falsePositives) {
            const w = words[i];
            if (!w) continue;
            let sentenceContext = w.text;
            for (const s of sentences) {
              if (i >= s.startIdx && i <= s.endIdx) {
                sentenceContext = s.text;
                break;
              }
            }
            let source = 'unknown';
            if (analysisResult) {
              for (const r of analysisResult.ruleResults) {
                if (r.indices.includes(i)) { source = `rule:${r.rule}`; break; }
              }
              if (source === 'unknown') {
                for (const c of analysisResult.claudeResults) {
                  if (c.indices.includes(i)) { source = `claude:${c.type}`; break; }
                }
              }
            }
            corrections.push({ index: i, type: 'false_positive', word: w.text, start: w.start, end: w.end, sentenceContext, source });
          }

          for (const i of falseNegatives) {
            const w = words[i];
            if (!w) continue;
            let sentenceContext = w.text;
            for (const s of sentences) {
              if (i >= s.startIdx && i <= s.endIdx) {
                sentenceContext = s.text;
                break;
              }
            }
            corrections.push({ index: i, type: 'false_negative', word: w.text, start: w.start, end: w.end, sentenceContext, source: 'user-added' });
          }

          fs.writeFileSync(path.join(dir, 'feedback.json'), JSON.stringify(corrections, null, 2));
          correctionCount = corrections.length;
        }
      }
    } catch {
      // Ignore feedback errors
    }

    return `User confirmed review. ${selectedIndices.length} words selected for deletion (${correctionCount} corrections from AI suggestions).`;
  }

  if (panelData.type === 'subtitles_complete') {
    const { subtitles } = panelData;

    fs.writeFileSync(
      path.join(dir, 'subtitles_with_time.json'),
      JSON.stringify(subtitles, null, 2),
    );

    updateProject(projectId, { subtitlesWithTime: 'subtitles_with_time.json' });

    return `User confirmed ${subtitles.length} subtitle entries.`;
  }

  return 'Unknown panel submission type.';
}
