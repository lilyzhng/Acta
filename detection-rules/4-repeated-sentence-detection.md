<!--
input: Sentence list segmented by silence
output: Repeated sentence index list
pos: Rule, suggest-delete priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Repeated Sentence Detection

## Definition

Adjacent sentences (separated by silence) sharing ≥5 identical starting characters — usually a re-take after making a mistake.

## Core Principle

**Segment first, then compare**: Must split into sentences by silence first, then compare adjacent sentences.

## Correct Analysis Method

```
✓ Correct: Split by silence → compare adjacent sentence starts → delete full sentence
✗ Wrong: Scan char by char → find repeated fragment → only delete fragment
```

### Steps

1. **Split into sentences by silence** (silence ≥0.5s as separator)
2. **Compare adjacent sentences** (start ≥5 chars same → delete the shorter full sentence)
3. **Compare skip-one sentences** (when middle is a fragment, also check if surrounding sentences repeat)

## Detection Logic

```javascript
// Adjacent sentence comparison
if (curr.text.slice(0, 5) === next.text.slice(0, 5)) {
  const shorter = curr.text.length <= next.text.length ? curr : next;
  markAsError(shorter);  // Delete full sentence, not just the repeated part
}

// Skip-one comparison (when middle is a short/fragment sentence)
if (mid.text.length <= 5) {  // Middle is a fragment
  if (curr.text.slice(0, 5) === next.text.slice(0, 5)) {
    markAsError(curr);   // Delete previous sentence
    markAsError(mid);    // Delete fragment
  }
}
```

## Examples

| Previous Sentence | Next Sentence | Delete |
|-------------------|---------------|--------|
| "So I used cloud code's excuse feature to make an editing agent" | "So I used cloud code's excuse feature to make an editing agent" | Previous (exact repeat) |
| "The second one is the skill system the second" | "The second one is the skill system" | Previous |
| "Okay let's start how to" | "Okay let's start how to make a talking head cut" | Previous |
| "We can see here the new video" | "We can see here the new video now" | Previous |

## Skip-One Repeat (Fragment in Between)

When there's a short fragment between two sentences, also detect:

```
Sentence A: "This is an example I edited"
Fragment: "it's"                    ← fragment in between
Sentence B: "This is an example I edited"

→ Delete Sentence A + Fragment
```

| Previous | Middle Fragment | Next | Delete |
|----------|----------------|------|--------|
| "This is an example I edited" | "it's" | "This is an example I edited" | Previous + fragment |
| "How do we do this first download this" | "prompt" | "How do we do this first copy this prompt" | Previous + fragment |
| "Open our AI" | "Open our" | "Open our AI and then tell it to download" | Previous + fragment |

## Multiple Repeats

When said 3+ times in a row, delete all incomplete versions, keep the last complete one:

```
"Before I used to put all the skills"         → Delete
"Before I used to put all the features into"  → Delete
"Before I used to put all the features into a" → Delete
"Before I used to put all the features into one big skill" → Keep
```

## Common Mistakes

```
✗ Scanning char by char, only finding local repeated fragments
✓ Segment first, compare full sentence starts, delete full sentence

✗ Only comparing adjacent sentences
✓ Also compare skip-one sentences (middle may be a fragment)
```
