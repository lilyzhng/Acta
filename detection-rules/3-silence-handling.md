<!--
input: subtitles_words.json (elements where isGap=true)
output: Long silence index list
pos: Rule, must-delete priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Silence Handling

## Threshold Rules

| Silence Duration | Action |
|-----------------|--------|
| ≤ 0.5s | **Ignore** — natural pause |
| 0.5-1s | **Optional delete** — inter-sentence pause |
| > 1s | **Suggest delete** — obvious stutter or screen display |

## Output Format

**Mark entire segment, don't split**

Example: 3.2s silence → output 1 entry
```
| 64-66 | 12.86-15.80 | silence 3.2s | | Delete |
```

User can uncheck unwanted deletions in the review web page.

## Special Cases

### Long Silence
Continuous 5s+ silence marked as a whole, pre-selected for deletion:
```
| 323-371 | 71.38-131.38 | silence 60s | | Delete |
```

### Opening Silence
Silence at the beginning of the video must be deleted:
```
| 0 | 0.00-1.00 | silence 1s | Opening silence | Delete |
```
