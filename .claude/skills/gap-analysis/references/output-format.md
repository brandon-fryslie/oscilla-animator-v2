# Gap Analysis Output Formats

## Console Output (Phase 4)

After Phase 2 (each batch of topics audited):

```
═══════════════════════════════════════════════════════
Audited: [topic names]

  TRIVIAL: T  CRITICAL: C  TO-REVIEW: R  UNIMPLEMENTED: U  DONE: D

Files written:
  .agent_planning/gap-analysis/
  ├── trivial/topic-NN-name.md        (T items, no action needed)
  ├── critical/topic-NN-name.md       (C items, fix immediately)
  ├── to-review/topic-NN-name.md      (R items, user must decide)
  └── unimplemented/topic-NN-name.md  (U items, build later)

Remaining: [N topics not yet audited]
═══════════════════════════════════════════════════════
```

After Phase 3 (synthesis complete):

```
═══════════════════════════════════════════════════════
Gap Analysis Complete

Topics audited: N
Total gaps: G
├─ TRIVIAL: T (cosmetic, ignored for planning)
├─ CRITICAL: C (fix now — broken/wrong/hacky)
├─ TO-REVIEW: R (user decides — may be better than spec)
└─ UNIMPLEMENTED: U (build after critical/to-review resolved)

Priority Work Queue:
  P1 (critical, no deps):
    1. [WI title] — [1-line description]
    2. ...
  P2 (critical, has deps):
    3. [WI title] — blocked by #1
  P3 (to-review, needs user decision):
    4. [WI title] — [question for user]
  P4 (unimplemented, blocks higher-priority):
    5. [WI title] — unblocks #3
  P5 (unimplemented, standalone):
    6. [WI title] — after P1-P4 resolved

Files:
  .agent_planning/gap-analysis/
  ├── SUMMARY.md
  ├── trivial/       (T items — cosmetic only)
  ├── critical/      (C items — top priority)
  ├── to-review/     (R items — user review needed)
  └── unimplemented/ (U items — build last)

Next steps:
  Fix:     Start with P1 items (obvious fixes, no blockers)
  Review:  Read to-review/ items and decide disposition
  Plan:    /do:plan [first P1 item]
  Rerun:   /gap-analysis (updates existing analysis)
═══════════════════════════════════════════════════════
```

---

## Directory Structure

```
.agent_planning/gap-analysis/
├── SUMMARY.md              # Priority work queue + dependency graph
├── trivial/                # Cosmetic gaps (naming, formatting)
│   └── topic-NN-*.md      # Lean listing, no context files needed
├── critical/               # Broken, wrong, hacky, blocking
│   ├── topic-NN-*.md      # Classification + evidence
│   └── context-NN-*.md    # Self-sufficient implementer briefing
├── to-review/              # Possibly better, unclear, user decides
│   ├── topic-NN-*.md      # Classification + evidence + question for user
│   └── context-NN-*.md    # Context for user review
└── unimplemented/          # Not built yet
    ├── topic-NN-*.md      # Classification + evidence
    └── context-NN-*.md    # Self-sufficient implementer briefing
```

## File Types by Audience

| File | Location | Audience | Purpose |
|------|----------|----------|---------|
| `topic-NN-*.md` | Category subdirectory | Human reviewer | Classification + evidence (lean) |
| `context-NN-*.md` | Category subdirectory | Planner/implementer agent | Self-sufficient briefing |
| `SUMMARY.md` | Root | Orchestrator | Priority queue + dependencies + next actions |

---

## Per-Topic Audit File (all categories)

Written to `.agent_planning/gap-analysis/<category>/topic-NN-<name>.md`.

**Audience**: Human reviewing gap analysis results.
**Goal**: Concise, scannable, evidence-linked.

### Trivial Items

```markdown
---
topic: NN
name: [Topic Name]
spec_file: [path to spec topic]
category: trivial
audited: [ISO timestamp]
item_count: N
---

# Topic NN: [Name] — Trivial Gaps

These are cosmetic divergences. No action needed unless doing a cleanup pass.

- [Spec term] → [Code term]: [file:line] — [brief note]
- [Spec term] → [Code term]: [file:line]
- ...
```

No context files for trivial items. No dependency analysis. Just a reference list.

### Critical Items

```markdown
---
topic: NN
name: [Topic Name]
spec_file: [path to spec topic]
category: critical
audited: [ISO timestamp]
item_count: N
priority_reasoning: [Why these are critical — broken, blocking, violating invariants]
---

# Topic NN: [Name] — Critical Gaps

## Items

### C-1: [Short imperative title]
**Problem**: [What's wrong — stub, hack, broken, violation]
**Evidence**: [file:line] — [what the code does vs what spec requires]
**Obvious fix?**: [yes/no — if yes, this is P1; if no, needs investigation]

### C-2: [Next item]
...
```

### To-Review Items

```markdown
---
topic: NN
name: [Topic Name]
spec_file: [path to spec topic]
category: to-review
audited: [ISO timestamp]
item_count: N
---

# Topic NN: [Name] — Items for Review

These items diverge from spec but may represent improvements or valid alternatives.
User must decide: accept current approach (update spec), or fix code (revert to spec).

## Items

### R-1: [Short descriptive title]
**Spec says**: [What the spec requires]
**Code does**: [What the implementation actually does] — [file:line]
**Why it might be better**: [Reasoning for the alternative]
**Question for user**: [Specific yes/no question about disposition]

### R-2: [Next item]
...
```

### Unimplemented Items

```markdown
---
topic: NN
name: [Topic Name]
spec_file: [path to spec topic]
category: unimplemented
audited: [ISO timestamp]
item_count: N
blocks_critical: [list of critical item IDs this unblocks, or empty]
---

# Topic NN: [Name] — Unimplemented

## Items

### U-1: [Short imperative title]
**Spec requirement**: [What needs to be built]
**Scope**: [new file | new function | new module | refactor existing]
**Blocks**: [List of critical/to-review items that depend on this, or "nothing — standalone"]
**Evidence of absence**: No matches for [pattern] in [scope]

### U-2: [Next item]
...
```

---

## Context File (Implementer Briefing)

Written to `.agent_planning/gap-analysis/<category>/context-NN-<name>.md`.
**Only for critical, to-review, and unimplemented categories** (never trivial).
**Audience**: Planner or implementer agent.
**Goal**: Everything needed to plan and execute work WITHOUT re-reading the spec or re-exploring the codebase.

```markdown
---
topic: NN
name: [Topic Name]
spec_file: [path to spec topic]
category: [critical | to-review | unimplemented]
generated: [ISO timestamp]
purpose: implementer-context
self_sufficient: true
blocked_by: [list of item IDs from any category, or empty]
blocks: [list of item IDs from any category, or empty]
priority: [P1 | P2 | P3 | P4 | P5]
---

# Context: Topic NN — [Name] ([Category])

## What the Spec Requires

[Complete requirements for this topic — not just the gaps, but ALL requirements
including what's already done. Compact numbered list. Each item concrete and testable.]

1. [Requirement]
2. [Requirement]
3. ...

## Current State (Topic-Level)

### How It Works Now
[2-5 sentences: data flow, key abstractions, entry points.]

### Patterns to Follow
- [Naming conventions]
- [File placement]
- [Testing patterns]

## Work Items

[Ordered by internal dependency. Each is a self-contained plannable unit.]

### WI-1: [Short imperative title]

**Category**: [CRITICAL | TO-REVIEW | UNIMPLEMENTED]
**Priority**: [P1-P5 with brief reason]
**Spec requirement**: [Concrete and testable]

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| [path] | [role] | [L45-80] |

**Current state**: [What exists now, or "nothing" for unimplemented]
**Required state**: [What it should look like when done]
**Suggested approach**: [1-3 sentences]

**Depends on**: [other WI-N or item IDs, or "none"]
**Blocks**: [what this unblocks]

---

### WI-2: [Next work item]
[Same structure]
```

### Self-Sufficiency Criteria

The context file is self-sufficient when a planner can answer ALL of these from it alone:
- What does "done" look like? (requirements list)
- What exists today? (file map + current state)
- What needs to change? (work items)
- How should changes be structured? (patterns to follow)
- What could go wrong? (risks in work items)
- What priority is this? (priority field)
- What blocks this / what does this block? (dependency fields)

---

## Summary Document

Written to `.agent_planning/gap-analysis/SUMMARY.md`.
**Audience**: Orchestrator deciding what to plan/implement next.

```markdown
---
scope: [full | focused | delta | update]
spec_source: [path to spec root]
impl_source: [path to implementation root]
generated: [ISO timestamp]
previous_run: [ISO timestamp of last run, or "none — fresh analysis"]
topics_audited: [count]
totals: { trivial: N, critical: N, to-review: N, unimplemented: N, done: N }
---

# Gap Analysis: [Scope Description]

## Executive Summary

[2-3 sentences: overall state, biggest gaps, recommended starting point]

## Changes Since Last Run

[Only present on UPDATE runs. Shows what moved between categories or was resolved.]

| Item | Was | Now | Reason |
|------|-----|-----|--------|
| [title] | CRITICAL | DONE | [Fixed in commit abc123] |
| [title] | UNIMPLEMENTED | CRITICAL | [Now blocking X] |

## Priority Work Queue

### P1: Critical — No Dependencies (start immediately)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 1 | C-1 | [Topic] | [1-line] | [link to context file] |

### P2: Critical — Has Dependencies (resolve blockers first)
| # | Item | Topic | Blocked By | Context File |
|---|------|-------|------------|--------------|
| 2 | C-3 | [Topic] | #1 | [link] |

### P3: To-Review — User Must Decide
| # | Item | Topic | Question | File |
|---|------|-------|----------|------|
| 3 | R-1 | [Topic] | [question] | [link to to-review/ file] |

### P4: Unimplemented — Blocks Higher Priority
| # | Item | Topic | Unblocks | Context File |
|---|------|-------|----------|--------------|
| 4 | U-2 | [Topic] | #3 | [link] |

### P5: Unimplemented — Standalone (after P1-P4 resolved)
| # | Item | Topic | Description | Context File |
|---|------|-------|-------------|--------------|
| 5 | U-5 | [Topic] | [1-line] | [link] |

### Trivial (cosmetic, no action unless cleanup pass)
[Brief bullet list — no dependency analysis]
- [N items in trivial/topic-NN-*.md]

## Dependency Graph

[ASCII or markdown representation of which items block which.
Only includes critical, to-review, and unimplemented items.
Trivial items are NEVER in this graph.]

```
C-1 (critical, P1) ──blocks──> C-3 (critical, P2)
U-2 (unimplemented, P4) ──blocks──> R-1 (to-review, P3)
```

## Cross-Cutting Concerns

[Themes spanning multiple topics — shared modules, systemic patterns,
things that should be addressed once rather than per-topic]
```

---

## Classification & Evidence

Classification definitions and priority rules are defined in `SKILL.md` (the canonical source). This file only documents file formats.

**Evidence format**: Cite as `path/to/file.ts:123`. For absence: "No matches for [pattern] in [scope]."
