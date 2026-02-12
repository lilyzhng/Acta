<!--
input: subtitles_words.json
output: Restatement correction index list
pos: Rule, suggest-delete priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Restatement Correction

## Pattern

Speaker makes a mistake and immediately corrects — delete the earlier incorrect part.

### 1. Partial Repeat

Preceding and following words overlap but aren't identical:

| Original | Delete |
|----------|--------|
| "you re-clo you close it" | "you re-clo" |
| "how to make it have a bigger" | "how to make it" |

### 2. Negation Correction

Using a negation word to correct what was just said:

| Original | Delete |
|----------|--------|
| "it is it isn't" | "it is" |
| "you can you can't" | "you can" |

### 3. Word Interrupted

Word cut off mid-way + silence + re-said in full:

| Original | Delete |
|----------|--------|
| "dependen[silence]dependency" | "dependen[silence]" |

## Detection Logic

```javascript
// Find common prefix between adjacent words
if (word[i].text.startsWith(prefix) && word[i+n].text.startsWith(prefix)) {
  // And the latter is more complete → delete the former
}
```
