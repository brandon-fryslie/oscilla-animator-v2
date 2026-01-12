---
name: doc-index
description: Generate dense, token-efficient indexes of documents for fast contradiction detection. Use when indexing docs for canonicalize-architecture, compressing specs for analysis, or creating navigable summaries. Works on any markdown documents.
model: claude-haiku-4-5
allowed-tools: Read, Write, Glob, Bash
---

# Document Indexing Skill

Create a compressed index of a markdown document that captures high-signal content for contradiction detection.

## Your Task

Given a source file, create an index file alongside it (same name with `.INDEX.md` extension).

## What to Extract

Scan the source document and extract:

1. **Key Assertions** - Normative statements with line references:
   - MUST/MUST NOT/SHALL/SHALL NOT (RFC 2119 style)
   - REQUIRED/FORBIDDEN/MANDATORY
   - Imperative assertions ("all signals flow through...", "execution order is...")
   - **Bold requirements** or numbered requirements

2. **Definitions** - Bold terms (just the term name and line number, no descriptions)

3. **Invariants** - Numbered rules like I1, I2, etc. (keep the full rule text INCLUDING critical examples)
   - If examples define the rule's meaning, include them
   - If rationale is one sentence, include it
   - Keep consequences if they're critical to understanding

4. **Data Structures** - Interface/type names with field count and line reference

5. **Dependencies** - What this doc references and what references it

6. **Decisions** - Lines starting with "DECISION:" (just the decision title, no rationale)

7. **Tier Suggestion** - Is this T1 (foundational), T2 (structural), or T3 (optional)?

## Line References

Use format: `[L123]` for single line, `[L123-130]` for ranges.

## Output Format

```yaml
---
indexed: true
source: {relative_path}
source_hash: {first 12 chars of sha256}
source_mtime: {ISO timestamp}
original_tokens: ~{word_count * 1.3}
index_tokens: ~{index_word_count * 1.3}
compression: {percentage}%  # Percentage of original RETAINED (not reduced)
index_version: 1.0
---

# Index: {filename}

## Key Assertions
- MUST: {assertion} [L{num}]

## Definitions
- **{Term}** [L{num}]

## Invariants
- **{ID}**: {full rule text} [L{num}]

## Data Structures
- **{Name}** ({N} fields) [L{num}]

## Dependencies
- **Depends on**: {list or "none"}
- **Referenced by**: {list}

## Decisions
- DECISION: {title only} [L{num}]

## Tier Classification
- **Suggested**: T{1|2|3}
- **Rationale**: {1-2 sentences}
```

## Target

Compress to 20-25% of original size. Drop verbose descriptions - keep only names, IDs, and line references for targeted lookup.

## Calculate Metadata

```bash
SOURCE_FILE="$1"
INDEX_FILE="${SOURCE_FILE}.INDEX.md"

# Hash and metadata
source_hash=$(shasum -a 256 "$SOURCE_FILE" | cut -c1-12)
source_mtime=$(stat -f "%Sm" -t "%Y-%m-%dT%H:%M:%SZ" "$SOURCE_FILE" 2>/dev/null || date -Iseconds)
word_count=$(wc -w < "$SOURCE_FILE" | tr -d ' ')
original_tokens=$((word_count * 13 / 10))
```
