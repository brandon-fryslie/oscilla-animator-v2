---
name: gap-analysis
description: This skill should be used when the user asks to "run a gap analysis", "compare implementation to spec", "what's missing from the spec", "bring the app up to spec", "audit against spec", "find spec gaps", or wants to understand what work remains to make an implementation match its specification. Produces a structured delta document with dependency ordering.
---

# Gap Analysis: Spec vs Implementation

Produce a structured delta between a specification and its implementation. Output is a dependency-ordered work backlog with per-topic status, not a vague summary.

## When to Use

- Before starting implementation work against a specification
- After major spec updates, to identify new gaps
- When prioritizing what to build next
- When onboarding to understand current state vs target state

## Process

### Phase 1: Scope Discovery

1. Identify the spec source (canonical spec directory, specific topics, or user-provided path)
2. Identify the implementation source (src/ directory, specific modules, or user-provided path)
3. Determine analysis scope:
   - **Full**: All spec topics against entire codebase
   - **Focused**: Specific topics or modules only
   - **Delta**: Only topics changed since last analysis
4. Create the output directory: `.agent_planning/gap-analysis/`

### Phase 2: Per-Topic Audit

Spawn `general-purpose` Task agents to perform the audit work. Each agent:

1. **Reads the spec topic(s)** assigned to it
2. **Searches the implementation** using Grep/Glob/Read to find code that implements each requirement
3. **Classifies each requirement** into exactly one category:

| Status | Meaning |
|--------|---------|
| **DONE** | Implemented correctly, matches spec |
| **PARTIAL** | Implemented but incomplete or divergent |
| **WRONG** | Implemented but violates spec |
| **MISSING** | Not implemented at all |
| **N/A** | Not applicable at current tier (T2/T3 future work) |

4. **Writes findings** to `.agent_planning/gap-analysis/topic-NN-<name>.md` using the per-topic format from `references/output-format.md`
5. **Writes a context file** to `.agent_planning/gap-analysis/context-NN-<name>.md` for any topic with gaps (PARTIAL/WRONG/MISSING items). This file is designed to be loaded by an implementer agent so it can start working immediately without re-exploring. See `references/output-format.md` for the context file format.

#### Batching Strategy

- **Small projects** (1-5 topics): Single agent handles all topics, writes one file
- **Medium projects** (5-15 topics): Batch 2-3 related topics per agent, run agents in parallel where topics are independent
- **Large projects** (15+ topics): Batch 3-5 related topics per agent, run in parallel

When batching, group topics that share implementation concerns (e.g., type system + compilation together, runtime + renderer together). Write one file per topic even when batched.

#### Agent Prompt Template

When spawning audit agents, provide:
- The spec topic path(s) to read
- The implementation root to search
- The output file path(s) to write (both topic-NN and context-NN files)
- The classification criteria (reference this skill or paste the table above)
- Instruction to write context files for topics with gaps

### Phase 3: Synthesis

After all per-topic audit files are written:

1. **Read all per-topic files** from `.agent_planning/gap-analysis/`
2. **Build dependency graph**: Which gaps block other gaps?
3. **Topologically sort** work items
4. **Write the summary document**: `.agent_planning/gap-analysis/SUMMARY.md` using the full format from `references/output-format.md`

This phase can be done by the orchestrating agent (no subagent needed) since it's reading already-written files.

### Phase 4: Present to User

After each phase completes, print a summary using the format below.

## Output Format

After Phase 2 (each batch of topics audited):

```
═══════════════════════════════════════════════════════
Audited: [topic names]

  DONE: X  PARTIAL: Y  WRONG: Z  MISSING: W  N/A: V

Files written:
  .agent_planning/gap-analysis/
  ├── topic-NN-name.md
  ├── context-NN-name.md  (Y+Z+W work items)
  └── ...

Remaining: [N topics not yet audited]
═══════════════════════════════════════════════════════
```

After Phase 3 (synthesis complete):

```
═══════════════════════════════════════════════════════
Gap Analysis Complete

Topics audited: N
Topics with gaps: M
Work items found: W
├─ PARTIAL: X (fix existing code)
├─ WRONG: Y (correct spec violations)
└─ MISSING: Z (build new)

Work queue (dependency order):
  1. Topic NN — [Name] (X work items)
  2. Topic NN — [Name] (X work items, blocked by #1)
  3. ...

Files:
  .agent_planning/gap-analysis/
  ├── SUMMARY.md
  ├── topic-*.md (N files)
  └── context-*.md (M files)

Next steps:
  Review: Read SUMMARY.md for full work queue
  Plan:   /do:plan [first unblocked topic/WI]
  Rerun:  /gap-analysis [specific topic] (for focused re-audit)
═══════════════════════════════════════════════════════
```

## Handoff to Planning

The gap analysis output is designed to feed directly into `/do:plan`:

1. Read SUMMARY.md → pick next unblocked work item from Work Queue
2. Read that item's section in the context file (topic-level context + specific WI section)
3. Plan designs the sprint from the WI's "required state" and "suggested approach"
4. Implementer uses the WI's "files involved" and topic-level "patterns to follow"

**Granularity**: A spec topic (e.g., "Renderer") may produce 5-10 work items (e.g., "Implement PathTopologyDef registry", "Fix RenderAssembler compose stage"). Each WI is a plannable unit — small enough for one sprint, self-contained in the context file.

No spec re-reading. No codebase re-exploration. The context file IS the briefing.

## Incremental Updates

When running a delta analysis (scope changed since last run):

1. Check timestamps on existing `.agent_planning/gap-analysis/topic-*.md` files
2. Re-audit only topics whose spec file is newer than the audit file
3. Re-run Phase 3 synthesis to update SUMMARY.md with new dependency ordering

## Token Efficiency

- Read the spec topic ONCE per agent, extract requirements as a compact list
- Search implementation with targeted grep/glob, not exhaustive file reads
- For large source files, read only relevant sections (use line offsets after grep finds matches)
- Topic audit files are lean (classifications + evidence only, no prose)
- Context files are self-sufficient: a planner reads ONLY the context file, never the spec topic
- The SUMMARY.md links directly to context files — no intermediate lookups needed

### The Self-Sufficiency Payoff

The audit agent reads the spec and explores the codebase once. It writes context files that capture everything learned. Downstream agents (planners, implementers) load a single context file and have:
- Complete requirements (target state)
- File map with line ranges (no re-exploration)
- Patterns to follow (no convention discovery)
- Exact gaps with suggested approaches (no re-classification)
- Risks and gotchas (no surprise discovery)

This means: **one exploration pass pays for all subsequent planning and implementation passes.**

## Key Principles

- **Requirements must be concrete**: "implements PayloadType union" not "handles types correctly"
- **Evidence-based**: Every classification cites specific file:line or absence thereof
- **No speculation**: If uncertain whether something is implemented, search more before classifying
- **Spec is truth**: When code disagrees with spec, code is WRONG (unless spec explicitly marks something as aspirational/future)
- **Tier-aware**: T2/T3 items in spec are classified N/A unless user requests otherwise
- **Write everything down**: Agents write findings to files. No analysis should exist only in agent return messages.

## Additional Resources

### Reference Files

- **`references/output-format.md`** — Templates for per-topic and summary documents
