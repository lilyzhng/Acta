# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Acta** is a Next.js web application for intelligent video editing: transcribe videos, detect and remove filler words/stutters using AI, edit subtitles, and export clean videos with burned-in captions.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, Anthropic Claude API, FFmpeg, Volcengine Transcription API, WaveSurfer.js

## Development Commands

```bash
# Development server (http://localhost:3000)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Run tests
npm test

# Run specific test file
npx jest test/analysis-rules.test.ts
```

## Architecture

### Workflow Stages

Projects progress through these states (tracked in `Project.status`):

1. **uploaded** → Video uploaded to server
2. **extracting_audio** → FFmpeg extracts MP3 from video
3. **audio_ready** → Audio extraction complete
4. **transcribing** → Volcengine processes audio
5. **transcribed** → Word-level transcription received
6. **analyzing** → Hybrid analysis (rules + Claude) detects issues
7. **analyzed** → Ready for human review
8. **reviewed** → User confirmed deletions
9. **cutting** → FFmpeg removes segments
10. **cut** → Video cut complete
11. **subtitles_ready** → SRT file generated
12. **burning** → FFmpeg burns subtitles into video
13. **done** → Final video ready for download

### Project Storage System

- **Location:** `projects/[project-id]/` directory (git-ignored)
- **Metadata:** `projects/[project-id]/meta.json` stores Project object
- **File references:** Project object stores filenames, not full paths
- **Management:** All I/O goes through `src/lib/project-store.ts`

Key functions:
- `createProject()` - Initialize project with UUID
- `getProject(id)` - Load metadata
- `updateProject(id, updates)` - Merge updates
- `getProjectFilePath(id, filename)` - Resolve full path

### Hybrid Analysis System

Located in `src/lib/analysis/`:

1. **Rule-based detection** (`rules.ts`):
   - Silence gaps ≥0.5s
   - Exact repeats ("that that")
   - Stuttering patterns
   - Consecutive fillers ("um uh")

2. **Claude API analysis** (`claude.ts`):
   - Processes transcript in 300-line chunks
   - Loads detection rules from `detection-rules/` directory
   - System prompt from `detection-rules/SKILL.md`
   - User preferences from numbered `.md` files
   - Returns additional stutter indices
   - Safety: rejects if marking >30% of words

3. **Orchestrator** (`index.ts`):
   - Runs rules first, then Claude
   - Deduplicates indices
   - Returns merged AnalysisResult

### FFmpeg Integration

Located in `src/lib/ffmpeg.ts`:

- **Hardware encoder detection:** Auto-detects VideoToolbox (macOS), NVENC (NVIDIA), QSV (Intel), AMF (AMD), falls back to libx264
- **Smart cutting:** Builds filter_complex with trim/concat, adds 50ms buffer + 30ms audio crossfade
- **Segment merging:** Merges overlapping deletions before cutting
- **Progress streaming:** Parses FFmpeg stderr for real-time progress
- **Subtitle burning:** Uses `subtitles` filter with custom styling (yellow text, PingFang SC font)

### Detection Rules System

Located in `detection-rules/`:

- **SKILL.md** - Main Claude analysis prompt
- **self-evolve-SKILL.md** - Instructions for Claude to update rules based on user feedback
- **subtitles-SKILL.md** - Subtitle generation guidelines
- **1-9 numbered files** - User preferences loaded as context
- **README.md** - Human documentation (not loaded by AI)

Rules are automatically loaded by `src/lib/analysis/claude.ts` and included in Claude's system prompt.

## Critical API Routes

```
POST /api/projects              - Create project
POST /api/projects/[id]/upload  - Upload video
POST /api/transcribe/submit     - Start Volcengine job
GET  /api/transcribe/poll       - Check transcription status
POST /api/analyze               - Run hybrid analysis
POST /api/review/save           - Save user review edits
POST /api/cut                   - Execute FFmpeg cut (SSE stream)
POST /api/subtitles/generate    - Generate SRT from segments
POST /api/burn                  - Burn subtitles (SSE stream)
POST /api/evolve                - Claude self-improves rules from feedback
```

**SSE Routes:** `/api/cut` and `/api/burn` stream progress using Server-Sent Events. Connect with EventSource, listen for `progress` events.

## Important Conventions

### TypeScript Paths

- Use `@/` alias for `src/` directory (configured in tsconfig.json)
- Example: `import { Project } from '@/types'`

### Server vs Client Components

- **Default:** Server Components (no 'use client')
- **Client required for:**
  - `useState`, `useEffect`, hooks
  - Event handlers (onClick, onChange)
  - Browser APIs (EventSource, Audio)
- Mark with `'use client'` directive at top of file

### File Upload Limits

- Configured in `next.config.ts`: `serverActions.bodySizeLimit: '500mb'`
- Frontend accepts only `.mp4` files
- Backend stores in project directory, not database

### Transcription Format

Volcengine returns word-level data:
```typescript
{
  utterances: [{
    text: string,
    start_time: number,  // seconds
    end_time: number,
    words: [{ text, start_time, end_time }]
  }]
}
```

This is converted to `SubtitleWord[]` with gap detection (see `src/lib/subtitles.ts`).

## Testing

- **Framework:** Jest with ts-jest
- **Test location:** `test/` directory
- **Path mapping:** Configured in jest.config.js to resolve `@/` imports
- **Example:** `test/analysis-rules.test.ts` tests rule-based detection

## Environment Variables

Required in `.env.local`:

```bash
ANTHROPIC_AUTH_TOKEN=...             # Claude Max plan auth token (preferred)
# ANTHROPIC_API_KEY=sk-ant-...      # Claude API (fallback, pay-per-token)
VOLC_ACCESS_KEY=...                 # Volcengine transcription
VOLC_SECRET_KEY=...
VOLC_APP_ID=...
```

## FFmpeg Requirement

- Must be installed on system (not in package.json)
- Verify: `ffmpeg -version` and `ffprobe -version`
- Used for: audio extraction, video cutting, subtitle burning

## Development Notes

- Projects are stored locally in `projects/` directory (git-ignored) - do not commit user data
- Video processing is CPU/GPU intensive - encoder detection optimizes performance
- Claude analysis costs scale with transcript length (chunked to manage costs)
- Waveform visualization uses WaveSurfer.js - audio files must be accessible via HTTP
