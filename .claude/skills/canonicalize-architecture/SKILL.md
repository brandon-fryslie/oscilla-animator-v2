---
name: canonicalize-architecture
description: Analyze architecture/spec documents for contradictions, ambiguities, and inconsistencies. Produces an encyclopedia-style canonical specification series. Use when user asks to canonicalize docs, find contradictions in specs, create a canonical spec, or consolidate design documents. Input is a directory or file list (e.g., "design-docs/" or "spec.md arch.md api.md").
---

# Architecture Document Canonicalization

You are analyzing architecture and technical specification documents to surface contradictions, inconsistencies, and consequential ambiguities. The ultimate goal is to compile a comprehensive **canonical specification encyclopedia**—a three-tiered collection of documents organized by change cost.

## Purpose of the Canonical Specification

**What it IS:**
- Alignment of high-level ideas
- Reduction of contradictions and ambiguities
- A way to verify plans and implementations against goals and strategy
- The **ideas** matter, not the examples (examples help explain, but ideas are what's important)

**What it is NOT:**
- A complete encoding of every implementation detail
- A replacement for actual code or comprehensive documentation
- An attempt to specify everything exhaustively

## Three-Tier Organization

The canonical specification organizes content by answering: **"How expensive would this be to change?"**

| Tier | File Prefix | Meaning | Contents |
|------|-------------|---------|----------|
| **T1** | `t1_*.md` | Cannot change. Would make this a different application. | Core invariants, fundamental principles |
| **T2** | `t2_*.md` | Can change, but it's work. Affects many other things. | Architecture, type system, core topology |
| **T3** | `t3_*.md` | Use it or don't. Change freely if something works better. | Examples, implementation notes, details |

### Conflict Resolution

**Lower number wins.**

If content in `t3_*.md` conflicts with `t1_*.md`, the foundational tier wins. No exceptions.

### Agent Reading Pattern

- **Always read**: `**/t1_*.md` (small and critical)
- **Usually read**: `**/t2_*.md` (core architecture context)
- **Consult as needed**: `**/t3_*.md` (reference material)

## Critical Context: Documents Represent Historical Systems

**IMPORTANT**: Source documents may have been written for previous versions of the system and contain outdated assumptions, terminology, and architectural patterns that no longer apply.

The canonicalization process must:

1. **Extract architectural intent** where it aligns with current canonical spec
2. **Reject outdated assumptions** from previous system iterations
3. **Identify useful patterns** (UI flows, interaction models) that can be adapted to current architecture
4. **Not treat every detail as authoritative** just because it's written down

### Integration Priority

When integrating source documents into the canonical spec:

- **Canonical spec wins** - Always prefer existing canonical definitions over source document claims
- **Verify alignment** - Before accepting any architectural statement, verify it against existing canonical topics
- **Flag misalignment** - Clearly mark where source documents contradict or invent concepts not in canonical spec
- **Extract value** - Focus on what's useful (UI patterns, interaction flows, user needs) rather than treating docs as ground truth
- **Question authority** - Source documents describing "how X works" have NO authority over canonical spec's definition of X

### Example

If a UI spec document says "Domain blocks have jitter, spacing, and origin parameters," but the canonical spec defines `DomainDecl` with only `shape` parameters, the canonical spec wins. The UI spec's claims about domain parameters are rejected as outdated speculation from a previous system iteration.

## Output Contract (Locked)

**Contract**: `topic_dirs_with_tiers`  
**Status**: LOCKED (do not change unless the user explicitly opts in)

The canonical output organizes content by **topic** (directories) and **tier** (file prefixes):

```
CANONICAL-<topic>-<timestamp>/
├── INDEX.md                       # Master navigation and overview (derived)
├── TIERS.md                       # Tier system (derived)
├── ESSENTIAL-SPEC.md              # Minimal baseline (derived, required)
├── <topic-1>/                     # Topic directory
│   ├── t1_<slug>.md               # Foundational content
│   ├── t2_<slug>.md               # Structural content
│   └── t3_<slug>.md               # Optional content
├── <topic-2>/                     # Not all topics need all tiers
│   ├── t1_<slug>.md
│   └── t2_<slug>.md
├── GLOSSARY.md                    # Authoritative terminology
├── RESOLUTION-LOG.md              # Decision history with rationale
└── appendices/
    ├── source-map.md              # Which sources contributed to what
    └── superseded-docs.md         # List of archived originals
```

### Why This Organization

- **Topics stay cohesive**: All type-system content in one directory
- **Tiers easily filterable**: `**/t1_*.md`, `**/t2_*.md`, `**/t3_*.md`
- **Conflict resolution**: Lower tier number wins - simple and unambiguous
- **Agent filtering**: Load all t1 files always, t2 for context, t3 on-demand
- **Flexibility**: Not every topic needs all three tiers
- **Purpose alignment**: Separates "cannot change" from "implementation details"

## Input

The user has provided: $ARGUMENTS

This may be:
- A directory path (analyze all markdown/text files within)
- A space-separated list of file paths
- A glob pattern
- An description of where to write your output
- A combination of these

First determine where to write your output.  Then determine which files to use as input.

## Step 0: Determine Output Contract + Run Type (DISPATCHER)

Before reading any source files, determine the **output contract** and run type.

### Output Contract Detection (LOCKED)

The contract defines the canonical directory structure and cannot change mid-stream unless the user explicitly opts in.

Detection order:
1. If a `CANONICAL-<topic>-*/` directory exists, **detect the on-disk contract**.
2. If the on-disk contract is not `topic_dirs_with_tiers`, **pause and ask the user whether to migrate**. Do not proceed silently.
3. If no canonical directory exists, default to **`topic_dirs_with_tiers`**.

**UPDATE runs must never change contracts unless the user explicitly opts in.**

**Output Directory**: Determine the common ancestor directory of all input files.

Check for existing files/directories:
- `CANONICAL-<topic>-*/` directory (completed encyclopedia)
- `CANONICALIZED-QUESTIONS-*.md`
- `CANONICALIZED-GLOSSARY-*.md`
- `CANONICALIZED-TOPICS-*.md` (topic breakdown)
- `EDITORIAL-REVIEW-*.md` (editorial review)
- `USER-APPROVAL-*.md` (user approval record)

**Decision table:**

| Condition | Run Type | Action |
|-----------|----------|--------|
| `CANONICAL-<topic>-*/` directory exists AND user chooses "update existing" | UPDATE | Load `references/run-update.md` |
| `CANONICAL-<topic>-*/` directory exists AND user chooses "start fresh" | FIRST | Archive old, load `references/run-first.md` |
| `CANONICAL-<topic>-*/` directory exists AND user chooses "abort" | ABORT | Exit without changes |
| No `CANONICALIZED-*` files exist | FIRST | Load `references/run-first.md` |
| `CANONICALIZED-*` exist with `indexed: true`, progress < 100% | MIDDLE | Load `references/run-middle.md` |
| `CANONICALIZED-*` exist, progress = 100%, no `EDITORIAL-REVIEW-*.md` exists | REVIEW | Load `references/run-review.md` |
| `EDITORIAL-REVIEW-*.md` exists, no `USER-APPROVAL-*.md` exists | APPROVAL | Load `references/run-approval.md` |
| `USER-APPROVAL-*.md` exists with `approved: true` | FINAL | Load `references/run-final.md` |

**Print the detected run type**, then load and follow the appropriate reference file.

---

## Shared Context

These rules apply to all run types:

### Precedence Rules for Prior Outputs

1. **Prior resolutions take precedence over source documents** - If a QUESTIONS file contains a `RESOLVED` item, that resolution is authoritative
2. **Carry forward all resolutions** - Every `RESOLVED` item from prior QUESTIONS files must appear in the new output
3. **Migrate resolved ambiguous terms** - When a term in the Ambiguous Terms table is marked resolved, move it to the GLOSSARY file in the next run

### Authoritative vs Derived Content

**Authoritative (source of truth):**
- All `**/t1_*.md`, `**/t2_*.md`, `**/t3_*.md` topic files
- `GLOSSARY.md`
- `RESOLUTION-LOG.md`
- `appendices/source-map.md`

**Derived (regenerate every run or omit if unnecessary):**
- `INDEX.md`
- `TIERS.md`
- `ESSENTIAL-SPEC.md` (required minimal baseline)
- Any extra summary or index files (e.g., `*.INDEX.md`, `SUMMARY.md`) only if the user opts in

**Rule**: Derived files must be regenerated from authoritative content on each run. If efficiency is a concern, prefer **smaller authoritative files** over larger derived summaries.

**ESSENTIAL-SPEC.md Rules (Required)**
- Purpose: a **minimal baseline** for any agent or implementer.
- Content: T1 content plus the **smallest necessary** T2 content for core flows (type system, compilation, runtime, renderer).
- Must exclude T3/UI/implementation examples.
- Must be short, consistent, and **never introduce new concepts** not in authoritative files.

### QUESTIONS File Handling (User Preference)

- **FIRST/MIDDLE runs**: Use `CANONICALIZED-QUESTIONS-*.md` working files.
- **UPDATE runs**: Use the existing canonical `QUESTIONS.md` in-place. Append new sections; do not create a new questions file.

### Progressive Disclosure for Agents (Required)

The tier system exists to let agents load **a slim foundation** and only the topic-specific details they need.

Requirements:
- **T1 files must be small and critical** (no examples, no implementation details).
- **Each T2 file must start with a "Prerequisites" section** listing the minimal T1 files and any cross-topic dependencies.
- **Each T2 file must include a "Touchpoints" section** listing other topics/systems it interacts with.

This replaces the need for heavy derived summaries while still enabling efficient, targeted loading.

### Pruning & Signal Discipline (Required)

Remove or avoid generating anything that is:
- **Distracting**: process reports, compression stats, or workflow artifacts
- **Vague**: non-actionable principles without constraints or enforcement
- **Redundant**: indexes of indexes, duplicate summaries

If a document is not authoritative or directly useful for implementation, it should not be generated by default.

### Topic Identification and Tier Classification

During analysis, identify distinct topics that warrant separate documents AND classify them into tiers.

**Topic Boundaries:**
- Different architectural layers (type system, compiler, runtime, renderer)
- Distinct subsystems with clear interfaces
- Separable concerns (state management, time handling, error handling)
- Different user-facing concepts (blocks, wires, buses, domains)

**Tier Classification:**

For each topic, ask: **"How expensive would this be to change?"**

- **T1 (Foundational)**: "Cannot change" / "Would make this a different application"
  - Example: Core invariants, fundamental principles defining what this app IS

- **T2 (Structural)**: "Can change, but it's work" / "Touches many other things"
  - Example: Type system architecture, core topology, data flow patterns

- **T3 (Optional)**: "Use it or don't" / "Change freely"
  - Example: Implementation examples, detailed specifications, code patterns

**Naming Convention**: Use kebab-case slugs:
- `principles` (tier 1)
- `type-system` (tier 2)
- `examples/basic-flow` (tier 3)

### Timestamp Format

All timestamps: `YYYYMMDD-HHMMSS`

### Front-matter (all output files)

```yaml
---
command: /canonicalize-architecture $ARGUMENTS
files: [space-separated list of files processed this run]
indexed: true
source_files:
  - [path/to/source1.md]
  - [path/to/source2.md]
topics:
  - [topic-slug-1]
  - [topic-slug-2]
---
```

### Cross-Linking Convention

Within the encyclopedia, use relative links:
- `[Foundational Rules](../<topic>/t1_<slug>.md)`
- `[Type System](../type-system/t2_<slug>.md)`
- `[Glossary: SignalType](../GLOSSARY.md#signaltype)`

### Encyclopedia Index Requirements

The INDEX.md must include:

1. **Status badge**: CANONICAL / UPDATING / DRAFT / SUPERSEDED
2. **Quick navigation**: Links to all major sections
3. **Topic map**: Visual or tabular overview of all topics
4. **Reading order**: Suggested sequence for newcomers
5. **Search hints**: Key terms and where to find them
6. **Version info**: When generated, from what sources, approval status

### Canonical Integrity Gate (Required)

After generating or updating outputs, run an integrity check. If any check fails, add a **blocking item** to the QUESTIONS file (existing canonical `QUESTIONS.md` for UPDATE runs; `CANONICALIZED-QUESTIONS-*.md` for FIRST/MIDDLE runs).

Minimum checks:
- **Contract conformity**: Output matches `topic_dirs_with_tiers` (topic dirs + `t1_/t2_/t3_` files).
- **No deprecated tokens in derived files** (e.g., known deprecated terms that were explicitly replaced).
- **Counts are computed, not handwritten** (sources, topics, resolutions).
- **Cross-link validity**: All links resolve to existing files/anchors.
- **Tier sanity**: T1 is small and critical; T3 is non-critical; flag any misclassification.
