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
    name: 'attach_subtitles',
    description:
      'Burn/attach subtitles onto the video. Subtitles are auto-generated after cut completes; this tool burns them into the video file. This is a long-running operation with progress updates.',
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
    name: 'show_subtitle_editor',
    description:
      'Show the interactive subtitle editor where the user can review and edit subtitle text and timing. Only use this if the user explicitly wants to edit subtitle text before burning. Otherwise, call attach_subtitles directly.',
    input_schema: {
      type: 'object' as const,
      properties: {},
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
  {
    name: 'add_annotation',
    description:
      'Add a visual annotation overlay to the video. Supports predefined shapes (arrow, circle, box, text, spotlight) OR custom SVG for any arbitrary graphics. For custom_svg type, generate raw SVG elements that will be rendered directly. Use position inference based on the user\'s description.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['arrow', 'circle', 'box', 'text', 'spotlight', 'custom_svg'],
          description: 'Type of annotation. Use "custom_svg" for curved arrows, complex shapes, or any custom graphics.',
        },
        target: {
          type: 'string',
          description:
            'Original user description of what to annotate (e.g., "curved arrow from finger to background"). Stored for reference.',
        },
        x: {
          type: 'number',
          description:
            'X position as percentage (0-100). For custom_svg, this is the center position of the SVG container.',
        },
        y: {
          type: 'number',
          description:
            'Y position as percentage (0-100). For custom_svg, this is the center position of the SVG container.',
        },
        startTime: {
          type: 'number',
          description: 'When annotation appears (seconds). Omit for whole video.',
        },
        endTime: {
          type: 'number',
          description: 'When annotation disappears (seconds). Omit for persistent.',
        },
        color: {
          type: 'string',
          description: 'Annotation color (default: "yellow"). Can be hex or named color.',
        },
        size: {
          type: 'string',
          enum: ['small', 'medium', 'large'],
          description: 'Annotation size. For custom_svg: small=120px, medium=200px, large=320px. Default: "medium".',
        },
        animation: {
          type: 'string',
          enum: ['none', 'pulse', 'bounce', 'fade-in'],
          description: 'Animation effect (default: "none").',
        },
        text: {
          type: 'string',
          description: 'Label text (required for text type, optional for others).',
        },
        arrowDirection: {
          type: 'string',
          enum: ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right'],
          description:
            'Direction the arrow points (for arrow type only).',
        },
        svgContent: {
          type: 'string',
          description:
            'Raw SVG elements for custom_svg type. Generate valid SVG path/shape elements. Use percentage coordinates relative to viewBox. Example for curved arrow: \'<path d="M 10,80 Q 50,10 90,30" stroke="yellow" stroke-width="3" fill="none" marker-end="url(#arrowhead)"/><defs><marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill="yellow"/></marker></defs>\'',
        },
        svgViewBox: {
          type: 'string',
          description: 'ViewBox for custom SVG (default: "0 0 100 100"). Defines the coordinate system.',
        },
        svgWidth: {
          type: 'number',
          description: 'Width of SVG container in pixels (default: 200).',
        },
        svgHeight: {
          type: 'number',
          description: 'Height of SVG container in pixels (default: 200).',
        },
      },
      required: ['type', 'target', 'x', 'y'],
    },
  },
  {
    name: 'list_annotations',
    description:
      'List all annotations currently on the video with their IDs, types, positions, and timing.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'remove_annotation',
    description:
      'Remove an annotation from the video by its ID. Use list_annotations first to see available IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the annotation to remove.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'analyze_frame',
    description:
      'Extract a frame from the video at a specific timestamp and analyze it using vision AI (Gemini) to detect positions of elements. Use this BEFORE add_annotation when the user refers to specific visual elements like "my finger", "the guy in the background", "the left person", etc. Returns precise x,y percentages for each detected element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        timestamp: {
          type: 'number',
          description: 'Time in seconds to extract the frame (e.g., 0 for start, 1.5 for 1.5 seconds in).',
        },
        query: {
          type: 'string',
          description:
            'What elements to find in the frame. Be specific. Examples: "the fingertip and the person in the background", "the left person and the right person", "the pointing hand".',
        },
      },
      required: ['timestamp', 'query'],
    },
  },
  {
    name: 'update_annotation',
    description:
      'Update an existing annotation by ID. Use this to resize, reposition, change timing, or modify any property of an annotation without recreating it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the annotation to update.',
        },
        x: {
          type: 'number',
          description: 'New X position as percentage (0-100).',
        },
        y: {
          type: 'number',
          description: 'New Y position as percentage (0-100).',
        },
        size: {
          type: 'string',
          enum: ['small', 'medium', 'large'],
          description: 'New size. For custom_svg: small=120px, medium=200px, large=320px.',
        },
        svgWidth: {
          type: 'number',
          description: 'Explicit width in pixels (overrides size preset).',
        },
        svgHeight: {
          type: 'number',
          description: 'Explicit height in pixels (overrides size preset).',
        },
        svgContent: {
          type: 'string',
          description: 'New SVG content to replace the existing graphic entirely (for custom_svg type). Use this when the user wants a different shape/design.',
        },
        startTime: {
          type: 'number',
          description: 'New start time (seconds).',
        },
        endTime: {
          type: 'number',
          description: 'New end time (seconds).',
        },
        color: {
          type: 'string',
          description: 'New color.',
        },
        animation: {
          type: 'string',
          enum: ['none', 'pulse', 'bounce', 'fade-in'],
          description: 'New animation effect.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'save_video',
    description:
      'Burn all annotations into the video and provide a download link. Use this when the user says "save the video", "download", "export", or wants to finalize with annotations burned in. Returns a download URL.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

export const UI_TOOLS = new Set(['show_review_panel']);
