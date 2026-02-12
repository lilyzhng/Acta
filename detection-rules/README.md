<!--
Architecture guardian: If any file in this folder changes, please update this file
-->

# User Preferences

User-specific preferences, referenced by AI during review.

## File List

| File | Type | Content |
|------|------|---------|
| 1-core-principle.md | Principle | Keep latter, delete former |
| 2-filler-word-detection.md | Preference | Um, uh, er + deletion boundaries |
| 3-silence-handling.md | Threshold | ≤0.5s ignore, 0.5-1s optional, >1s suggest delete |
| 4-repeated-sentence-detection.md | Preference | Adjacent sentences with ≥5 same starting chars, delete shorter |
| 5-stuttering-words.md | Preference | "that that", "I mean I mean" |
| 6-intra-sentence-repetition.md | Preference | A+middle+A pattern |
| 7-consecutive-fillers.md | Preference | Um uh, uh er |
| 8-restatement-correction.md | Preference | Partial repeat, negation correction, word interrupted |
| 9-fragment-detection.md | Preference | Incomplete sentence, cut off mid-way |

## AI Review Order (by priority)

1. **Silence >1s** → Suggest delete (split by 1-second blocks)
2. **Fragment** → Delete (incomplete sentence + silence)
3. **Repeated sentence** → Delete shorter (≥5 same starting chars)
4. **Intra-sentence repeat** → Delete A+middle (A+middle+A pattern)
5. **Stuttering words** → Delete front part ("that that", "I mean I mean")
6. **Restatement correction** → Delete front part (partial repeat, negation correction, word interrupted)
7. **Filler words** → Mark for human confirmation (um, uh, er)

## Core Principle

**Keep latter, delete former**: The later version is usually more complete—delete the earlier one, keep the later one.
