---
name: refresh-indexes
description: Refresh INDEX.md files for documents that have changed. Use after editing canonical spec documents to keep indexes up-to-date. Can refresh specific files or auto-detect stale indexes.
model: claude-haiku-4-5
allowed-tools: Read, Write, Bash, Glob
---

# Refresh Document Indexes

After editing canonical specification documents, detect which indexes are stale and refresh them.

## Your Task

1. **Detect stale indexes**: Use `scripts/validate-indexes.sh` to find which indexes are out of date
2. **Report which need refreshing**: List the stale indexes and the `/doc-index` commands needed to refresh them
3. **User runs the refresh commands**: User invokes `/doc-index` for each stale source file

## How It Works

You edit a document, then invoke this skill:
```
User: [edits design-docs/.../time-system.md]
User: /refresh-indexes
```

The skill:
1. Detects that time-system.INDEX.md is stale (source_hash mismatch)
2. Reports: "Run `/doc-index design-docs/.../time-system.md`"
3. User runs that command to regenerate the index

This keeps the workflow transparent - you see exactly what's stale and what needs to be refreshed.

## When to Use This Skill

**Always invoke after editing canonical spec documents:**
- After editing any `.md` file in `design-docs/CANONICAL-oscilla-v2.5-20260109/`
- After modifying INVARIANTS.md
- After adding/modifying topics
- After resolving contradictions or clarifying definitions

**Example workflow:**
```bash
# You edit a file
$ nano design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md
$ # (make changes, save)

# Then invoke refresh-indexes to detect what's stale
$ /refresh-indexes

# Output tells you to run:
# /doc-index design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md

# Run that command to regenerate the index
$ /doc-index design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md

# Verify with validate-indexes
$ scripts/validate-indexes.sh
```

## How Staleness Detection Works

`scripts/validate-indexes.sh`:
- Compares `source_hash` in INDEX.md frontmatter to current source file hash (SHA256)
- Reports FRESH (hashes match) or STALE (mismatch)
- Returns non-zero exit code if ANY stale indexes exist

This is why we must run `/doc-index` after editing - it regenerates the index with updated source_hash.

## Output

When you run `/refresh-indexes`:

```
🔍 Detecting stale indexes...

Stale indexes found:
  - 03-time-system.INDEX.md
  - INVARIANTS.INDEX.md

════════════════════════════════════════
Ready to refresh: 2 indexes

📋 To complete the refresh, run these commands:
   /doc-index design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md
   /doc-index design-docs/CANONICAL-oscilla-v2.5-20260109/INVARIANTS.md
════════════════════════════════════════
```

You then copy/paste those `/doc-index` commands to regenerate the indexes.
