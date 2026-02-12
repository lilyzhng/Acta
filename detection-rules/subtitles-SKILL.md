---
name: acta:subtitles
description: Subtitle generation and burn-in. Volcengine transcription → dictionary correction → review → burn-in. Triggers: add subtitles, generate subtitles, subtitles
---

<!--
input: Video file
output: Video with subtitles
pos: Post-processing skill, called after cutting is done
-->

# Subtitles

> Transcription → Agent proofreading → Human review → Burn-in

## Core Flow (approx. 8-15 min total, including human review)

```
1. Extract audio + upload             ⏱ ~1min
    ↓
2. Volcengine transcription (w/ hot words) ⏱ ~2min
    ↓
3. Agent auto-proofreading            ⏱ ~3-5min
    ↓
4. Human review & confirmation        ⏱ Depends on user
    ↓
5. Burn subtitles                     ⏱ ~1-2min
```

---

## Step 1: Extract Audio and Upload

```bash
# Extract audio
ffmpeg -i "video.mp4" -vn -acodec libmp3lame -y audio.mp3

# Upload to uguu.se (temporary file hosting)
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
# Returns URL like: https://o.uguu.se/xxxxx.mp3
```

---

## Step 2: Volcengine Transcription (with Hot Words)

The transcription script **automatically reads the dictionary** as hot words to improve recognition accuracy:

```bash
# Dictionary location: ~/.claude/skills/acta/subtitles/dictionary.txt
# Script loads it automatically

bash ../cut/scripts/volcengine_transcribe.sh "https://o.uguu.se/xxxxx.mp3"
```

**Dictionary format** (one term per line):
```
skills
Claude
Agent
```

---

## Step 3: Agent Auto-Proofreading

### 3.1 Generate timestamped subtitles

```javascript
const result = JSON.parse(fs.readFileSync('volcengine_result.json'));
const subtitles = result.utterances.map((u, i) => ({
  id: i + 1,
  text: u.text,
  start: u.start_time / 1000,
  end: u.end_time / 1000
}));
fs.writeFileSync('subtitles_with_time.json', JSON.stringify(subtitles, null, 2));
```

### 3.2 Agent manual proofreading (no script)

**After transcription, the Agent must read every subtitle line and manually proofread for the following issues:**

#### Common Misrecognition Rules Table

| Misrecognized | Correct | Type |
|---------------|---------|------|
| cloud code | Claude Code | Similar pronunciation |
| Schill/skill | skills | Similar pronunciation |
| excuse | skills | Misrecognition |
| APIK / a p i t | API Key | Misrecognition |

#### Common Missing Word Issues

| Original | Corrected | Notes |
|----------|-----------|-------|
| step is to configure | second step is to configure | Missing "second" |
| 4 step is | step 4 is | Missing ordinal |

### 3.3 Proofread against original script (if available)

If an original script exists, use it as a reference, but **do not use automated script matching** (text differences will cause cumulative timestamp errors).

The Agent should:
1. Read the original script as a reference
2. Manually compare line by line, correcting differences
3. Mark uncertain areas for human review

---

## Step 4: Start Review Server

```bash
cd subtitles_dir/
node ~/.claude/skills/acta/subtitles/scripts/subtitle_server.js 8898 "video.mp4"
```

Visit http://localhost:8898

**Features:**
- Left side: video playback; Right side: subtitle list
- Auto-highlights current subtitle during playback
- Double-click subtitle text to edit (timestamps unchanged)
- Playback speed (1x/1.5x/2x/3x)
- Save subtitles / Export SRT / Burn subtitles
- Dictionary quick-insert at the bottom

---

## Step 5: Burn Subtitles

**Default style: Size 22, golden yellow bold, black outline 2px, bottom center**

```bash
ffmpeg -i "video.mp4" \
  -vf "subtitles='video.srt':force_style='FontSize=22,FontName=PingFang SC,Bold=1,PrimaryColour=&H0000deff,OutlineColour=&H00000000,Outline=2,Alignment=2,MarginV=30'" \
  -c:a copy \
  -y "video_subtitled.mp4"
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| FontSize | 22 | Font size |
| FontName | PingFang SC | PingFang font |
| Bold | 1 | Bold |
| PrimaryColour | &H0000deff | Golden yellow #ffde00 |
| OutlineColour | &H00000000 | Black outline |
| Outline | 2 | Outline width |
| Alignment | 2 | Bottom center |
| MarginV | 30 | Bottom margin |

---

## Directory Structure

```
output/YYYY-MM-DD_videoname/subtitles/
├── 1_transcription/
│   ├── audio.mp3
│   └── volcengine_result.json
├── subtitles_with_time.json    # Core file
└── 3_output/
    ├── video.srt
    └── video_subtitled.mp4
```

---

## Subtitle Guidelines

| Rule | Description |
|------|-------------|
| One line per screen | No line breaks, no stacking |
| No punctuation at end | `Hello` not `Hello.` |
| Keep mid-sentence punctuation | `Click here, then there` |

---

## Feedback Log

### 2026-01-31
- Volcengine supports hot words, integrated into transcription script
- Agent must auto-proofread after transcription, not hand off directly to user
- Subtitle style: golden yellow bold #ffde00, outline 2px
- "IT" is often misrecognized as "Agent", added to correction rules
- **Important**: Agent proofreading must be manual line-by-line, not automated script matching
- Added 17 common misrecognition rules (see section 3.2)
- Missing word issues are harder to catch than misrecognitions, need extra attention
