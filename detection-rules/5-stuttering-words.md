<!--
input: Full text
output: Stuttering word index list
pos: Rule, suggest-delete priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Stuttering Words

## Pattern

Same word said 2-3 times consecutively:

```javascript
const stutterPatterns = [
  'that that',
  'I mean I mean',
  'so so',
  'and and',
  'the the'
];
```

## Deletion Strategy

Delete the front, keep the last one.

```
Original: "that that I wanted to say"
Delete:   "that"
Keep:     "that I wanted to say"
```
