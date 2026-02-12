<!--
input: subtitles_words.json
output: Consecutive filler index list
pos: Rule, suggest-delete priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Consecutive Fillers

## Pattern

Two filler words appearing back to back:

```
um uh, uh er, oh um, er ah
```

## Detection

```javascript
const fillerWords = ['um', 'uh', 'er', 'ah', 'eh', 'oh', 'hmm', 'huh'];

if (fillerWords.includes(curr) && fillerWords.includes(next)) {
  markAsError(curr, next);
}
```

## Deletion Strategy

Delete all.
