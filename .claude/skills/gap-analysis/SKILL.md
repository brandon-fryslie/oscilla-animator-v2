---
name: gap-analysis
description: This skill should be used when the user asks to "run a gap analysis", "compare implementation to spec", "what's missing from the spec", "bring the app up to spec", "audit against spec", "find spec gaps", or wants to understand what work remains to make an implementation match its specification. Produces a structured delta document with dependency ordering and priority categories.
---

# Gap Analysis: Spec vs Implementation

Produce a structured delta between a specification and its implementation. Output is a priority-categorized, dependency-ordered work backlog — not a vague summary.

## Process

### Phase 0: Detect Existing Analysis

Before doing anything, check if `.agent_planning/gap-analysis/` already exists.

**If it exists**: This is an UPDATE run.
1. Read the existing `SUMMARY.md` to understand prior state
2. Read existing topic/context files to understand prior classifications
3. Proceed with Phase 1-4 but UPDATE existing files rather than creating new ones
4. Preserve user annotations (`<!-- USER: ... -->` comments are kept verbatim)
5. Track classification changes — items may move between categories or become DONE
6. Items now DONE are removed from subdirectories and noted in SUMMARY.md under "Resolved Since Last Run"
7. Log all changes in SUMMARY.md's "Changes Since Last Run" section

**If it doesn't exist**: This is a FRESH run. Proceed normally.

### Phase 1: Scope Discovery

1. Identify the spec source (canonical spec directory, specific topics, or user-provided path)
2. Identify the implementation source (src/ directory, specific modules, or user-provided path)
3. Determine analysis scope:
   - **Full**: All spec topics against entire codebase
   - **Focused**: Specific topics or modules only
   - **Delta**: Only topics changed since last analysis (for updates)
4. Create the output directory structure:
   ```
   .agent_planning/gap-analysis/
   ├── SUMMARY.md
   ├── trivial/        # Naming differences, minor formatting, cosmetic
   ├── critical/       # Broken, wrong, hacky MVPs, half-finished migrations
   ├── to-review/      # Better-than-spec, evolved designs, unclear items
   └── unimplemented/  # Simply not built yet
   ```

### Phase 2: Per-Topic Audit

Spawn `general-purpose` Task agents to perform the audit work (if agent spawning is unavailable, perform the audit sequentially in the current context). Each agent:

1. **Reads the spec topic(s)** assigned to it
2. **Searches the implementation** using Grep/Glob/Read to find code that implements each requirement
3. **Classifies each requirement** using the priority categories below
4. **Writes findings** to the appropriate subdirectory

#### Priority Categories

Each gap item is classified into exactly one priority category:

| Category | Subdirectory | Meaning | Examples |
|----------|-------------|---------|----------|
| **TRIVIAL** | `trivial/` | Cosmetic divergence, different names for same concept | Spec says `AnimBlock`, code uses `AnimationBlock`. Slightly different enum member names. Formatting differences. |
| **CRITICAL** | `critical/` | Wrong, broken, hacky, or blocking the roadmap | Fake stubs left in place. MVPs that violate invariants. Half-finished migrations. Broken functionality. Spec violations that affect correctness. |
| **TO-REVIEW** | `to-review/` | Implemented differently but possibly better, or unclear | Code evolved past spec. Implementation found a better pattern. Spec ambiguity led to a reasonable alternative. Anything where the right answer isn't obvious. |
| **UNIMPLEMENTED** | `unimplemented/` | Simply not built yet | Entire features from spec with no code at all. New modules that don't exist. |

**Classification rules**:
- If it's just a name difference or cosmetic → **TRIVIAL**
- If something is broken, wrong, or a known hack → **CRITICAL**
- If the implementation is different but might be better → **TO-REVIEW**
- If it doesn't exist at all → **UNIMPLEMENTED**
- **When uncertain, classify as TO-REVIEW** — the user will decide

Items that are fully DONE (match spec correctly) are noted in the topic file but not placed in any subdirectory.

5. **Writes to subdirectory**: `gap-analysis/<category>/topic-NN-<name>.md`
6. **Writes context file**: `gap-analysis/<category>/context-NN-<name>.md` (one per topic per category, only for non-trivial items)

**Cardinality**: One topic file AND one context file per topic per category. If topic 03 has both critical and unimplemented items, it gets:
- `critical/topic-03-foo.md` + `critical/context-03-foo.md`
- `unimplemented/topic-03-foo.md` + `unimplemented/context-03-foo.md`

Each file contains ONLY items of that category. Trivial items get topic files but NO context files.

#### Batching Strategy

- **Small projects** (1-5 topics): Single agent handles all topics
- **Medium projects** (5-15 topics): Batch 2-3 related topics per agent, run agents in parallel
- **Large projects** (15+ topics): Batch 3-5 related topics per agent, run in parallel

When batching, group topics that share implementation concerns. Write one file per topic per category even when batched.

#### Agent Instructions

When spawning audit agents, provide:
- The spec topic path(s) to read
- The implementation root to search
- The priority category definitions (paste the table above)
- The output subdirectory structure
- Instruction to classify each gap into exactly one category
- Instruction to write context files for non-trivial gaps

### Phase 3: Synthesis & Dependency Analysis

After all per-topic audit files are written:

1. **Read all files** from the category subdirectories
2. **Discard trivial items from dependency analysis** — they cannot block anything, mention them briefly in SUMMARY.md but otherwise ignore
3. **Build dependency graph** across the three main categories:
   - CRITICAL, TO-REVIEW, and UNIMPLEMENTED items can block each other
   - An UNIMPLEMENTED item is only relevant if it blocks a CRITICAL or TO-REVIEW item
4. **Apply priority ordering**:

#### Priority Rules

```
Priority 1: CRITICAL items with NO dependencies
             → Obvious fixes (stubs, broken code). Start immediately.

Priority 2: CRITICAL items with dependencies
             → Resolve their blockers first, then fix.

Priority 3: TO-REVIEW items (all blocked on user review)
             → User must decide: accept current impl, update spec, or fix code.

Priority 4: UNIMPLEMENTED items that block CRITICAL or TO-REVIEW
             → Must be done to unblock higher-priority work.

Priority 5: UNIMPLEMENTED items with no blockers (standalone)
             → Do AFTER all critical and to-review items are resolved.

NEVER: Do standalone UNIMPLEMENTED work before CRITICAL/TO-REVIEW is clear.
```

5. **Topologically sort** within each priority tier
6. **Write SUMMARY.md** to `.agent_planning/gap-analysis/SUMMARY.md`

### Phase 4: Present to User

After Phase 2 and Phase 3, print progress summaries. See `references/output-format.md` for templates and complete file format specifications.

## Handoff to Planning

The gap analysis output feeds directly into `/do:plan`:

1. Read SUMMARY.md → pick next item from Priority Work Queue
2. Read that item's context file from the appropriate category subdirectory
3. Plan designs the sprint from the context file's "required state" and "suggested approach"
4. Implementer uses the context file's "files involved" and "patterns to follow"

**Priority enforcement**: Never plan P5 work while P1-P3 items exist. P4 work is only planned when it unblocks a P1-P3 item.

## Token Efficiency

- Read the spec topic ONCE per agent, extract requirements as a compact list
- Search implementation with targeted grep/glob, not exhaustive file reads
- For large source files, read only relevant sections (use line offsets after grep finds matches)
- Topic audit files are lean (classifications + evidence only, no prose)
- Context files are self-sufficient: a planner reads ONLY the context file, never the spec topic
- SUMMARY.md links directly to context files in subdirectories — no intermediate lookups

### The Self-Sufficiency Payoff

The audit agent reads the spec and explores the codebase once. It writes context files that capture everything learned. Downstream agents (planners, implementers) load a single context file and have:
- Complete requirements (target state)
- File map with line ranges (no re-exploration)
- Patterns to follow (no convention discovery)
- Exact gaps with suggested approaches (no re-classification)
- Risks and gotchas (no surprise discovery)

**One exploration pass pays for all subsequent planning and implementation passes.**

## Key Principles

- **Requirements must be concrete**: "implements PayloadType union" not "handles types correctly"
- **Evidence-based**: Every classification cites specific file:line or absence thereof
- **No speculation**: If uncertain whether something is implemented, search more before classifying
- **Spec is truth**: When code disagrees with spec, code is WRONG — unless the implementation is genuinely better (→ TO-REVIEW)
- **Future/aspirational items**: Spec items explicitly marked as future work or lower-priority tiers are classified as UNIMPLEMENTED unless user requests otherwise
- **When in doubt, TO-REVIEW**: If you can't decide between categories, use TO-REVIEW — the user will decide
- **Trivial items don't block**: Never add a trivial item as a dependency for anything
- **Critical before unimplemented**: Never schedule standalone unimplemented work while critical items exist
- **Write everything down**: Agents write findings to files. No analysis should exist only in agent return messages.

## Additional Resources

### Reference Files

- **`references/output-format.md`** — Templates for per-topic and summary documents
