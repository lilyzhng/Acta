---
name: acta:cut
description: Talking head video transcription and stutter detection. Generates review page and deletion task list. Triggers: cut, process video, detect stutters
---

<!--
input: Video file (*.mp4)
output: subtitles_words.json, auto_selected.json, review.html
pos: Transcription + detection, up to user web review

Architecture guardian: If this file is modified, please also update:
1. ../README.md Skill Reference
2. /CLAUDE.md routing table
-->

# Cut v2

> Volcengine transcription + AI stutter detection + web review

## Quick Usage

```
User: Help me cut this talking head video
User: Process this video
```

## Output Directory Structure

```
output/
└── YYYY-MM-DD_videoname/
    ├── cut/
    │   ├── 1_transcription/
    │   │   ├── audio.mp3
    │   │   ├── volcengine_result.json
    │   │   └── subtitles_words.json
    │   ├── 2_analysis/
    │   │   ├── readable.txt
    │   │   ├── auto_selected.json
    │   │   └── stutter_analysis.md
    │   └── 3_review/
    │       └── review.html
    └── subtitles/
        └── ...
```

**Rule**: Reuse existing folders; create new ones only if missing.

## Flow

```
0. Create output directory
    ↓
1. Extract audio (ffmpeg)
    ↓
2. Upload to get public URL (uguu.se)
    ↓
3. Volcengine API transcription
    ↓
4. Generate character-level subtitles (subtitles_words.json)
    ↓
5. AI analyzes stutters/silence, generates pre-selected list (auto_selected.json)
    ↓
6. Generate review web page (review.html)
    ↓
7. Start review server, user confirms in browser
    ↓
【Wait for user confirmation】→ Click "Execute cut" in web page or manually /cut
```

## Steps

### Step 0: Create output directory

```bash
# Set variables (adjust for your actual video)
VIDEO_PATH="/path/to/video.mp4"
VIDEO_NAME=$(basename "$VIDEO_PATH" .mp4)
DATE=$(date +%Y-%m-%d)
BASE_DIR="output/${DATE}_${VIDEO_NAME}/cut"

# Create subdirectories
mkdir -p "$BASE_DIR/1_transcription" "$BASE_DIR/2_analysis" "$BASE_DIR/3_review"
cd "$BASE_DIR"
```

### Steps 1-3: Transcription

```bash
cd 1_transcription

# 1. Extract audio (filenames with colons need the file: prefix)
ffmpeg -i "file:$VIDEO_PATH" -vn -acodec libmp3lame -y audio.mp3

# 2. Upload to get public URL
curl -s -F "files[]=@audio.mp3" https://uguu.se/upload
# Returns: {"success":true,"files":[{"url":"https://h.uguu.se/xxx.mp3"}]}

# 3. Call Volcengine API
SKILL_DIR="~/.claude/skills/acta/cut"
"$SKILL_DIR/scripts/volcengine_transcribe.sh" "https://h.uguu.se/xxx.mp3"
# Output: volcengine_result.json
```

### Step 4: Generate subtitles

```bash
node "$SKILL_DIR/scripts/generate_subtitles.js" volcengine_result.json
# Output: subtitles_words.json

cd ..
```

### Step 5: Analyze stutters (script + AI)

#### 5.1 Generate readable format

```bash
cd 2_analysis

node -e "
const data = require('../1_transcription/subtitles_words.json');
let output = [];
data.forEach((w, i) => {
  if (w.isGap) {
    const dur = (w.end - w.start).toFixed(2);
    if (dur >= 0.5) output.push(i + '|[silence' + dur + 's]|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  } else {
    output.push(i + '|' + w.text + '|' + w.start.toFixed(2) + '-' + w.end.toFixed(2));
  }
});
require('fs').writeFileSync('readable.txt', output.join('\\n'));
"
```

#### 5.2 Read user preferences

First read all rule files from the `user-preferences/` directory.

#### 5.3 Generate sentence list (key step)

**Must segment into sentences first, then analyze**. Split into sentences by silence:

```bash
node -e "
const data = require('../1_transcription/subtitles_words.json');
let sentences = [];
let curr = { text: '', startIdx: -1, endIdx: -1 };

data.forEach((w, i) => {
  const isLongGap = w.isGap && (w.end - w.start) >= 0.5;
  if (isLongGap) {
    if (curr.text.length > 0) sentences.push({...curr});
    curr = { text: '', startIdx: -1, endIdx: -1 };
  } else if (!w.isGap) {
    if (curr.startIdx === -1) curr.startIdx = i;
    curr.text += w.text;
    curr.endIdx = i;
  }
});
if (curr.text.length > 0) sentences.push(curr);

sentences.forEach((s, i) => {
  console.log(i + '|' + s.startIdx + '-' + s.endIdx + '|' + s.text);
});
" > sentences.txt
```

#### 5.4 Script auto-marks silence (must run first)

```bash
node -e "
const words = require('../1_transcription/subtitles_words.json');
const selected = [];
words.forEach((w, i) => {
  if (w.isGap && (w.end - w.start) >= 0.5) selected.push(i);
});
require('fs').writeFileSync('auto_selected.json', JSON.stringify(selected, null, 2));
console.log('Silences >=0.5s:', selected.length);
"
```

→ Outputs `auto_selected.json` (silence indices only)

#### 5.5 AI analyzes stutters (appends to auto_selected.json)

**Detection rules (by priority)**:

| # | Type | Method | Delete Range |
|---|------|--------|-------------|
| 1 | Repeated sentence | Adjacent sentences with ≥5 same starting chars | Shorter **full sentence** |
| 2 | Skip-one repeat | Middle is a fragment; compare surrounding sentences | Previous sentence + fragment |
| 3 | Fragment | Incomplete sentence + silence | **Entire fragment** |
| 4 | Intra-sentence repeat | A+middle+A pattern | Front part |
| 5 | Stuttering words | "that that", "I mean I mean" | Front part |
| 6 | Restatement correction | Partial repeat / negation correction | Front part |
| 7 | Filler words | um, uh, er | Mark but don't auto-delete |

**Core principles**:
- **Segment first, then compare**: Use sentences.txt to compare adjacent sentences
- **Delete full sentences**: Fragments and repeated sentences should be deleted in full, not just the anomalous characters

**Segment-by-segment analysis (loop)**:

```
1. Read readable.txt offset=N limit=300
2. Analyze these 300 lines using sentences.txt
3. Append stutter indices to auto_selected.json
4. Record in stutter_analysis.md
5. N += 300, go to step 1
```

**Critical warning: line number ≠ idx**

```
readable.txt format: idx|content|time
                     ↑ use this value

Line 1500 → "1568|[silence1.02s]|..."  ← idx is 1568, not 1500!
```

**stutter_analysis.md format:**

```markdown
## Segment N (line range)

| idx | Time | Type | Content | Action |
|-----|------|------|---------|--------|
| 65-75 | 15.80-17.66 | Repeated sentence | "This is an example I edited" | Delete |
```

### Steps 6-7: Review

```bash
cd ../3_review

# 6. Generate review web page
node "$SKILL_DIR/scripts/generate_review.js" ../1_transcription/subtitles_words.json ../2_analysis/auto_selected.json ../1_transcription/audio.mp3
# Output: review.html

# 7. Start review server
node "$SKILL_DIR/scripts/review_server.js" 8899 "$VIDEO_PATH"
# Open http://localhost:8899
```

User actions in the web page:
- Play video segments to confirm
- Check/uncheck deletion items
- Click "Execute cut"

---

## Data Formats

### subtitles_words.json

```json
[
  {"text": "H", "start": 0.12, "end": 0.2, "isGap": false},
  {"text": "", "start": 6.78, "end": 7.48, "isGap": true}
]
```

### auto_selected.json

```json
[72, 85, 120]  // Pre-selected indices generated by Claude
```

---

## Configuration

### Volcengine API Key

```bash
cd ~/.claude/skills/acta
cp .env.example .env
# Edit .env and fill in VOLCENGINE_API_KEY=xxx
```
