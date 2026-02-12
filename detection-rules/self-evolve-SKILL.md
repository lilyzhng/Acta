---
name: acta:self-evolve
description: Self-evolving skills. Record user feedback, update methodology and rules. Triggers: update rules, record feedback, improve skill
---

<!--
input: User feedback, error corrections
output: Updated documents (CLAUDE.md or tips/*.md)
pos: Meta skill, lets the Agent learn from mistakes

Architecture guardian: If this file is modified, please also update:
1. ../README.md Skill Reference
2. /CLAUDE.md routing table
-->

# Self-Evolve

> Let the Agent learn from mistakes and continuously improve

## Quick Usage

```
User: Record that issue from just now
User: Update the stutter detection rules
User: Remember this lesson
```

## Update Locations

| Content Type | Target File | Example |
|-------------|-------------|---------|
| User profile | `CLAUDE.md` | Preferences, habits |
| Methodology + feedback | `*/tips/*.md` | Rules, lessons |

## Flow

```
User triggers ("that just failed", "record this")
    ↓
【Auto】Trace back context, find the issue
    ↓
【Auto】Read entire target file, understand existing structure
    ↓
【Auto】Integrate into the appropriate section (don't just append!)
    ↓
【Auto】Feedback log records events only, doesn't duplicate rules
    ↓
Report update results
```

**Key**: Don't ask "what's the problem" — analyze directly from context!

## Update Principles

### Wrong: Append to the end

```markdown
## Feedback Log
### 2026-01-14
- Lesson: Review page must generate a deletion task list at the end
- Lesson: User confirmation should separately confirm stutters and silences
```

Only appending to the feedback log = rules scattered at the bottom, will repeat mistakes next time

### Correct: Integrate into the body

1. **Read the entire file**, understand the section structure
2. **Find the appropriate location**, integrate the rule
3. **Feedback log records events only**: `- Review page marked silences, but cutting missed them`

```markdown
## Section 4: Review Page Format
(Added deletion task list template)

## Section 5: Confirmation & Execution Flow  ← Add this section if missing
(Added flow for separately confirming stutters and silences)

## Feedback Log
### 2026-01-14
- Review page marked silences, but cutting only removed stutters
```

## Trigger Conditions

- User corrects an AI error
- User says "remember this", "be careful about this next time"
- A new general pattern is discovered

## Anti-Patterns

### 2026-01-13
```
Wrong:
User: That just failed, update the skills
AI: What problem did you find?  ← Should not ask!

Correct:
AI: [Auto trace back context, find the failure point]
AI: [Execute update]
```

### 2026-01-14
```
Wrong:
AI: Updated, added 3 lessons to the feedback log  ← Only appended!

Correct:
AI: [Read entire file, understand structure]
AI: [Integrate into the appropriate section]
AI: [Feedback log records events only]
AI: Updated: Added Section 5 "Confirmation & Execution Flow", updated Section 4 template
```

**Principle**: Rules must be integrated into the body; the feedback log is just an event journal
