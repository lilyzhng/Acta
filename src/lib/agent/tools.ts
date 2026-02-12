import type { Tool } from '@anthropic-ai/sdk/resources/messages';

export const agentTools: Tool[] = [
  {
    name: 'get_project_status',
    description:
      'Get the current status of the project, including which processing steps have been completed and what files are available.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'auto_cut',
    description:
      'Run the full automatic pipeline: transcribe → analyze → remove all AI-flagged filler words → cut. Only use when the user explicitly asks for automatic processing (e.g. "autocut", "run the full pipeline", "auto process", "remove all filler words automatically"). Do NOT call this by default.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'transcribe_video',
    description:
      'Extract audio from the video, upload it, and submit for transcription. Then poll until transcription is complete. This is a long-running operation.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyze_transcript',
    description:
      'Run hybrid analysis (rule-based + Claude AI) on the transcript to detect filler words, stutters, and repeated phrases. Returns the number of words flagged for deletion.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_flagged_words',
    description:
      'Get the list of words flagged by AI analysis (filler words, stutters, repeats) with their indices, text, and timestamps. Also shows which were selected for removal if review was done. Use this to understand what words the user might refer to when they say "remove the um" or "remove the rest".',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'remove_words',
    description:
      'Set which words to remove via chat, without using the review panel. Use when the user specifies via chat (e.g. "remove all filler words", "remove the 3 remaining", "remove words 5 and 10"). After calling, use execute_cut to apply. Input: indices (specific word indices) OR mode: "all_flagged" (remove all AI-suggested words) or "add_remaining" (add the flagged words the user kept during review - use when user says "remove the rest").',
    input_schema: {
      type: 'object' as const,
      properties: {
        indices: {
          type: 'array',
          items: { type: 'number' },
          description: 'Specific word indices to remove (0-based). Omit if using mode.',
        },
        mode: {
          type: 'string',
          enum: ['all_flagged', 'add_remaining'],
          description:
            '"all_flagged": remove all AI-suggested words. "add_remaining": add the flagged words user kept during review (e.g. when user says "remove the rest of the filler words").',
        },
      },
      required: [],
    },
  },
  {
    name: 'show_review_panel',
    description:
      'Show the interactive review panel where the user can see all words with AI-suggested deletions highlighted, listen to audio playback, and adjust which words to cut. Use when the user wants to visually review and select words, or when they prefer the UI over chat.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'execute_cut',
    description:
      'Execute the video cut using FFmpeg, removing all segments the user selected for deletion. This is a long-running operation with progress updates.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'generate_subtitles',
    description:
      'Generate subtitle entries from the transcript, accounting for deleted segments. Returns the number of subtitle lines created.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'show_subtitle_editor',
    description:
      'Show the interactive subtitle editor where the user can review and edit subtitle text and timing. The agent MUST call this tool and wait for the user to confirm before proceeding to burn subtitles.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'burn_subtitles',
    description:
      'Burn the subtitles into the video using FFmpeg. This creates a final video file with hard-coded subtitles. This is a long-running operation with progress updates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        outline: {
          type: 'number',
          description: 'Subtitle outline width (1-5). Default is 2.',
        },
      },
      required: [],
    },
  },
  {
    name: 'provide_download_links',
    description:
      'Show download links for all available project files (original video, cut video, subtitled video, SRT file).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

export const UI_TOOLS = new Set(['show_review_panel', 'show_subtitle_editor']);
