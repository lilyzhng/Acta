<!--
input: Sentence list segmented by silence
output: Fragment index list
pos: Rule, suggest-delete priority

Architecture guardian: If this file is modified, please also update:
1. The README.md in this folder
-->

# Fragment Detection

## Definition

Sentence cut off mid-way, followed by silence or a restart.

## Core Principle

**Delete full sentence**: Once a fragment is identified, delete from sentence start to sentence end — not just the trailing words.

## Correct Analysis Method

```
✓ Correct: Segment first → check completeness → delete full sentence
✗ Wrong: Scan char by char → find abnormal ending → only delete ending
```

### Steps

1. **Split into sentences by silence** (silence ≥0.5s as separator)
2. **Check if each sentence is complete** (semantically and grammatically natural)
3. **Mark entire fragment for deletion** (from startIdx to endIdx)

## Pattern

```
Fragment (full sentence) + [silence] + Complete sentence
    ↓
  Delete all
```

## Examples

| Fragment | Following | Delete Range |
|----------|-----------|-------------|
| "it's" | [silence] + "This is an example I edited..." | "it's" full sentence |
| "why make this thing well one" | [silence] + "The reason for making this is" | **Full sentence** (not just "well one") |
| "the difference is that CapCut although" | [silence 3s] + "CapCut doesn't have learning capability" | Full sentence + silence |
| "let's first type how do we do this" | "first" | Full sentence |
| "open our AI" | [silence] + "open our AI and then..." | Full sentence (earlier incomplete version) |

## Criteria

1. **Sentence is incomplete**: Missing object, verb, or unnatural ending
2. **Followed by silence**: Fragments usually have an obvious pause after
3. **Followed by restart**: Speaker restarts with similar content

## vs Repeated Sentence

- **Repeated sentence**: Both sentences are complete, just share the same start → delete shorter
- **Fragment**: Previous sentence is clearly incomplete, cut off → delete the incomplete full sentence

## Common Fragment Characteristics

- Ends with function words (like "the", "a", "to") but doesn't form a complete sentence
- Ends with numbers/quantifiers but missing the noun
- Sentence abruptly stops, semantically incomplete
- Cut off mid-way, speaker restarts

## Common Mistakes

```
✗ Only delete "well one" (abnormal ending)
✓ Delete "why make this thing well one" (entire fragment)
```

**Remember**: The problem with a fragment isn't just the ending — the entire sentence is incomplete, so delete the whole thing.
