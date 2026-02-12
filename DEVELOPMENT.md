# acta Web — Development Notes

## Overview

A Next.js web application that provides the full video cutting pipeline in a browser UI. Converts the original CLI-based acta-skills workflow into an interactive web app running locally.

**Pipeline:** Upload → Transcribe → AI Analysis → Review & Select → Cut → Subtitles → Burn → Download

## Tech Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4** (dark theme)
- **wavesurfer.js v7** (audio waveform visualization)
- **FFmpeg** (system binary via `child_process.spawn`)
- **Anthropic SDK** (`@anthropic-ai/sdk`) for Claude API stutter analysis
- **Volcengine** speech recognition API for transcription

## Project Structure

```
acta-web/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Upload / project list
│   │   ├── project/[id]/
│   │   │   ├── layout.tsx                    # Step nav bar
│   │   │   ├── transcribe/page.tsx           # Step 1: transcription + analysis
│   │   │   ├── review/page.tsx               # Step 2: waveform + word selector
│   │   │   ├── subtitles/page.tsx            # Step 3: subtitle editor + burn
│   │   │   └── download/page.tsx             # Step 4: download results
│   │   └── api/
│   │       ├── projects/route.ts             # CRUD
│   │       ├── projects/[id]/upload/route.ts # Video upload
│   │       ├── transcribe/submit/route.ts    # Audio extract + Volcengine submit
│   │       ├── transcribe/poll/route.ts      # Poll Volcengine status
│   │       ├── analyze/route.ts              # Hybrid analysis (rules + Claude)
│   │       ├── review/data/route.ts          # Load words + auto_selected
│   │       ├── review/save/route.ts          # Save user selections
│   │       ├── cut/route.ts                  # FFmpeg cut (SSE progress)
│   │       ├── subtitles/route.ts            # Subtitle CRUD
│   │       ├── subtitles/generate/route.ts   # Generate from Volcengine result
│   │       ├── burn/route.ts                 # FFmpeg burn (SSE progress)
│   │       ├── video/[id]/route.ts           # Stream video (Range support)
│   │       └── audio/[id]/route.ts           # Stream audio (Range support)
│   ├── lib/
│   │   ├── project-store.ts                  # File-system project CRUD
│   │   ├── ffmpeg.ts                         # FFmpeg wrapper (cut, burn, encoder detection)
│   │   ├── volcengine.ts                     # Volcengine API (submit + poll)
│   │   ├── subtitles.ts                      # Volcengine result → subtitle words
│   │   ├── srt.ts                            # SRT generation
│   │   ├── upload.ts                         # uguu.se upload
│   │   ├── segment-merger.ts                 # Buffer + merge overlapping segments
│   │   └── analysis/
│   │       ├── rules.ts                      # Rule-based detection
│   │       ├── claude.ts                     # Claude API analysis
│   │       └── index.ts                      # Orchestrator
│   ├── components/
│   │   ├── review/                           # WaveformPlayer, WordSelector, ReviewControls, ReviewStats
│   │   ├── subtitles/                        # SubtitleEditor, SubtitleItem, DictionaryPanel
│   │   └── ui/                               # ProgressBar, LoadingOverlay, StepNav
│   ├── hooks/                                # useSSE, usePolling, useWaveSurfer, useWordSelection
│   └── types/index.ts
├── detection-rules/                          # SKILL.md + user-preference .md files (Claude context)
├── dictionary.txt                            # Hot words for transcription
├── projects/                                 # Local storage (gitignored)
├── test/
│   ├── data/subtitles_words.json             # Real test data
│   └── analysis-rules.test.ts                # 11 unit tests
├── jest.config.js
└── .env.local                                # VOLCENGINE_API_KEY, ANTHROPIC_API_KEY
```

## Hybrid AI Analysis

### Rule-based (deterministic, runs first)

Implemented in `src/lib/analysis/rules.ts`:

| Rule | Detection | Source |
|------|-----------|--------|
| `detectSilence` | Gaps ≥ 0.5s | user-preferences/3 |
| `detectFillerWords` | Standalone "um", "uh", "er", "嗯", "啊", etc. | user-preferences/2 |
| `detectStutteringWords` | Consecutive duplicates ("that that") | user-preferences/5 |
| `detectConsecutiveFillers` | Adjacent fillers ("um uh") | user-preferences/7 |
| `detectRepeatedSentences` | Adjacent sentences with ≥5 same starting chars | user-preferences/4 |

### Claude API (nuanced, runs on remainder)

Implemented in `src/lib/analysis/claude.ts`:

- Uses original `SKILL.md` as system prompt + all 9 user-preference files + self-evolve + subtitles SKILL.md
- Same data format as original CLI workflow: `readable.txt` (`idx|content|time`) and `sentences.txt`
- Processes in 300-line chunks
- Safety guard: rejects if >30% of non-gap words marked
- Model: `claude-sonnet-4-5-20250929`

## Critical Parameters (preserved from original)

| Parameter | Value | Used In |
|-----------|-------|---------|
| Buffer | 50ms each side | ffmpeg.ts `buildFilterComplex` |
| Crossfade | 30ms triangular | ffmpeg.ts `buildFilterComplex` |
| Gap threshold | 0.5s | rules.ts, subtitles.ts |
| Gap splitting | >0.5s → 1s blocks | subtitles.ts |
| Subtitle style | FontSize=22, PingFang SC, Bold, #ffde00, outline 2px | ffmpeg.ts `burnSubtitles` |

## Environment Setup

### Prerequisites

```bash
# FFmpeg with libass (required for subtitle burning)
brew tap homebrew-ffmpeg/ffmpeg
brew install homebrew-ffmpeg/ffmpeg/ffmpeg

# Node.js
brew install node
```

**Important:** The default Homebrew FFmpeg does NOT include `libass`. You must use the `homebrew-ffmpeg/ffmpeg` tap.

### API Keys

```bash
cp .env.example .env.local
# Fill in:
# VOLCENGINE_API_KEY=your_key
# ANTHROPIC_API_KEY=your_key
```

### Running

```bash
npm install
npm run dev    # http://localhost:3000
npm test       # 11 unit tests
```

## Bugs Found & Fixed

### 1. Inverted Selection (Critical)

**Symptom:** Normal words selected for deletion, filler words kept.

**Root causes:**
- Missing `detectFillerWords()` — only had `detectConsecutiveFillers()` for pairs. Standalone "Uh" was never caught by rules.
- Claude API with a custom prompt marked ALL normal words as "fragments" because the prompt lacked proper context.

**Fix:**
- Added `detectFillerWords()` to `rules.ts` and included in `runAllRules()`
- Rewrote `claude.ts` to use original SKILL.md as system prompt with all user-preference files, matching the exact data format and 300-line chunking of the original CLI workflow

### 2. No Post-Cut Navigation

**Symptom:** After clicking "Execute Cut", only a browser `alert()` shown, user left on review page.

**Fix:** Auto-navigate to subtitles page after cut completes, and to download page after burn completes.

### 3. Subtitle Burn Failure (Silent)

**Symptom:** Burn silently failed, project status stuck at "burning", no subtitled video generated.

**Root causes:**
- FFmpeg `subtitles` filter requires `libass` which wasn't in default Homebrew FFmpeg
- SRT filename was wrapped in single quotes in the `-vf` argument, breaking FFmpeg's filter parser when using `spawn()` (no shell interpolation)

**Fix:**
- Reinstalled FFmpeg from `homebrew-ffmpeg/ffmpeg` tap (includes libass by default)
- Removed single quotes around SRT path, escape special chars (`:\\'[]`) with backslash instead
- Added status rollback on burn/cut failure (reset to previous step instead of staying stuck)

### 4. Video Route Serving Wrong File

**Symptom:** After cutting, subtitles page showed original video instead of cut video.

**Fix:** Video API now defaults to `project.cutVideoFile || project.videoFile`.

## Test Suite

```bash
npm test
```

11 tests using real data from `PXL_20260130_022652193.mp4`:

- `detectSilence` — silences ≥ 0.5s detected, short gaps excluded
- `detectFillerWords` — "Uh" at indices 3 and 25 detected, normal words excluded
- `runAllRules` — fillers + silences selected, normal speech NOT selected, <30% total
- `detectStutteringWords` — no false positives
- `detectConsecutiveFillers` — no false positives
- `detectRepeatedSentences` — no false positives
- `splitIntoSentences` — correct splitting by ≥0.5s gaps

## Data Flow

```
Upload (.mp4)
  → projects/<uuid>/video.mp4
  → Extract audio → audio.mp3
  → Upload to uguu.se → public URL
  → Volcengine transcribe → volcengine_result.json
  → Generate words → subtitles_words.json
  → Rule-based analysis → auto_selected.json (silence + filler indices)
  → Claude API analysis → append to auto_selected.json (stutters + fragments)
  → User review in browser (waveform + word grid)
  → Save selections → selected_indices.json, delete_segments.json
  → FFmpeg cut → video_cut.mp4
  → Generate subtitles (timestamp remapping) → subtitles_with_time.json
  → User edits subtitles in browser
  → Generate SRT → video_cut.srt
  → FFmpeg burn → video_cut_subtitled.mp4
  → Download
```

## Known Limitations

- Subtitle generation reuses original Volcengine transcription with timestamp remapping (doesn't re-transcribe the cut video)
- No WebSocket support yet — uses polling for transcription and SSE for cut/burn
- Local-first only — Vercel deployment is Phase 2
- Hardware encoder detection caches globally (restart server to re-detect)
