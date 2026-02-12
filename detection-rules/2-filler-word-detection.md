<!--
input: subtitles_words.json
output: Filler word index list
pos: Rule, human confirmation priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Filler Word Detection

## Filler Word List

```javascript
const fillerWords = ['um', 'uh', 'er', 'ah', 'eh', 'oh', 'hmm', 'huh', 'like', 'you know', 'I mean'];
```

## Deletion Boundaries

```
Wrong: Delete filler word's own timestamp (filler.start - filler.end)
       → May clip the tail of the preceding word

Correct: From the previous word's end to the next word's start
         → (prevWord.end - nextWord.start)
```

## User Preference

Keep some filler words as natural transitions — don't delete all of them.
