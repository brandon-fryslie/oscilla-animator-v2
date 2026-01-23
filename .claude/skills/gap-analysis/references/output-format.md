# Gap Analysis Output Formats

Three file types, each with a distinct audience:

| File | Audience | Purpose |
|------|----------|---------|
| `topic-NN-*.md` | Human reviewer | Classification + evidence (lean) |
| `context-NN-*.md` | Planner/implementer agent | Self-sufficient briefing (no spec re-read needed) |
| `SUMMARY.md` | Orchestrator | Dependency order + next actions |

---

## Per-Topic Audit File

Written to `.agent_planning/gap-analysis/topic-NN-<name>.md`.
**Audience**: Human reviewing gap analysis results.
**Goal**: Concise, scannable, evidence-linked.

```markdown
---
topic: NN
name: [Topic Name]
spec_file: [path to spec topic]
audited: [ISO timestamp]
has_gaps: [true|false]
counts: { done: N, partial: N, wrong: N, missing: N, na: N }
---

# Topic NN: [Name]

## DONE
- [Requirement]: [file:line]

## PARTIAL
- [Requirement]: [file:line] — [what's missing]

## WRONG
- [Requirement]: [file:line] — [how it differs from spec]

## MISSING
- [Requirement] — [scope: new file | new function | refactor | new module]

## N/A
- [Requirement]: [tier] — [reason]
```

No prose, no architecture notes, no context dump. Just classifications and evidence.

---

## Context File (Implementer Briefing)

Written to `.agent_planning/gap-analysis/context-NN-<name>.md`.
**Only created when `has_gaps: true`.**
**Audience**: Planner or implementer agent.
**Goal**: Everything needed to plan and execute work WITHOUT re-reading the spec topic or re-exploring the codebase.

```markdown
---
topic: NN
name: [Topic Name]
spec_file: [path to spec topic]
generated: [ISO timestamp]
purpose: implementer-context
self_sufficient: true
blocked_by: [list of topic NNs, or empty]
blocks: [list of topic NNs, or empty]
---

# Context: Topic NN — [Name]

## What the Spec Requires

[Complete requirements for this topic — not just the gaps, but ALL requirements
including what's already done. This provides the "target state" picture so the
planner understands the full shape of the system, not just the holes.

Write as a compact numbered list. Each item is a concrete, testable requirement.
Include types, interfaces, behaviors, and invariants. Enough detail that a planner
can design work items without opening the spec topic.]

1. [Requirement — concrete, testable]
2. [Requirement — with type signatures if relevant]
3. ...

## Current State (Topic-Level)

### How It Works Now
[2-5 sentences: data flow, key abstractions, entry points.
Shared context that applies to ALL work items below.]

### Patterns to Follow
- [Naming: FooBar for types, fooBar for functions]
- [File placement: src/domain/ for this concern]
- [Testing: tests live in __tests__/, use vitest, mock pattern X]

## Work Items

[Each work item is a self-contained plannable unit. A planner working on
item #2 reads the topic-level context above, then ONLY their item below.

Items are ordered by internal dependency (do #1 before #2 if #2 depends on #1).]

### WI-1: [Short imperative title, e.g., "Implement PathTopologyDef registry"]

**Status**: [PARTIAL | WRONG | MISSING]
**Spec requirement**: [What the spec says, concrete and testable]

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| [path] | [role for THIS work item] | [L45-80] |

**Current state**: [What exists now — 1-2 sentences, or "nothing" for MISSING]
**Required state**: [What it should look like when done]
**Suggested approach**: [1-3 sentences — how to get from current to required]
**Reference**: [Similar existing code at path:line, if any]

**Risks**:
- [Specific to this work item — shared files, test updates, ordering]

**Depends on**: [other WI-N within this topic, or "none"]

---

### WI-2: [Next work item title]

[Same structure as above]

---

[Repeat for each gap]
```

### Self-Sufficiency Criteria

The context file is self-sufficient when a planner can answer ALL of these from it alone:
- What does "done" look like? (requirements list)
- What exists today? (file map + current state)
- What needs to change? (work required)
- How should changes be structured? (patterns to follow)
- What could go wrong? (risks)

If any of these would require reading the spec topic or exploring the codebase, the context file is incomplete.

---

## Summary Document

Written to `.agent_planning/gap-analysis/SUMMARY.md` after all per-topic audits complete.
**Audience**: Orchestrator deciding what to plan/implement next.

```markdown
---
scope: [full | focused | delta]
spec_source: [path to spec root]
impl_source: [path to implementation root]
generated: [ISO timestamp]
topics_audited: [count]
topics_with_gaps: [count]
totals: { done: N, partial: N, wrong: N, missing: N, na: N }
---

# Gap Analysis: [Scope Description]

## Executive Summary

[2-3 sentences: overall state, biggest gaps, recommended starting point]

## Work Queue

Topologically sorted at topic level, with work items listed per topic.
A planner picks a specific work item and reads its section in the context file.

| Order | Topic | Work Items | Blocked By | Context File |
|-------|-------|------------|------------|--------------|
| 1 | NN — [Name] | WI-1: [title], WI-2: [title] | — | [context-NN-name.md](./context-NN-name.md) |
| 2 | NN — [Name] | WI-1: [title] | Topic NN | [context-NN-name.md](./context-NN-name.md) |
| ... |

Parallelizable (no cross-topic dependencies):
| Topic | Work Items | Context File |
|-------|------------|--------------|
| NN — [Name] | WI-1: [title] | [link] |

## Cross-Cutting Concerns

[Themes that span multiple topics — shared modules, systemic patterns, things
that should be addressed once rather than per-topic rather than repeated in each WI]
```

---

## Classification Guidelines

### DONE
- Code implements the requirement
- Behavior matches spec
- No known divergence

### PARTIAL
- Some implementation exists but incomplete
- Missing members, edge cases, or branches

### WRONG
- Code contradicts spec
- Uses deprecated patterns spec replaces
- Violates declared invariants

### MISSING
- No code addresses this requirement
- Concept doesn't exist in codebase yet

### N/A
- Spec marks as T2, T3, or "future"
- Depends on unbuilt infrastructure
- User excluded this scope

## Evidence Format

Cite as `path/to/file.ts:123`. For absence: "No matches for [pattern] in [scope]."
