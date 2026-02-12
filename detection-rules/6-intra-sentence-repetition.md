<!--
input: Sentence list segmented by silence
output: Intra-sentence repetition index list
pos: Rule, suggest-delete priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Intra-Sentence Repetition Detection

## Definition

Within the same sentence, a phrase A appears twice with 1-3 words in between.

## Pattern

```
A + middle words + A
```

## Examples

| Original | Pattern | Delete |
|----------|---------|--------|
| "so then so" | so + then + so | "so then" |
| "and then it will and then" | and then + it will + and then | "and then it will" |
| "task 3 task 3" | task 3 + task 3 | first one |
| "what kind what" | what + kind + what | "what kind" |

## Not a Stutter

| Original | Reason |
|----------|--------|
| task 1 task 2 task 3 | Enumeration |
| to do | English phrase |
| one by one | Emphasis |
