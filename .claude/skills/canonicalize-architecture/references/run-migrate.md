# MIGRATE RUN - Enforce `topic_dirs_with_tiers`

This is a MIGRATE run. A canonical directory exists, but it uses a forbidden legacy layout (flat topic files under `topics/`).

**Goal**: deterministically convert the canonical directory to the single allowed contract: `topic_dirs_with_tiers`.

## Preconditions

- You MUST operate in-place in the existing `CANONICAL-<topic>-*/` directory.
- Do not ask the user to opt in. Do not present options. Just migrate.
- If any step cannot be completed deterministically, STOP and report the blocking ambiguity (file paths + what data is missing).

## Step 1: Load Canonical Index (Source of Mapping Truth)

1. Read `INDEX.md`.
2. Locate the Topics table rows and extract, for each topic id/slug:
   - The current legacy link target (e.g. `./topics/01-type-system.md`)
   - Any explicit tier hints in the description (e.g. `(T3)`, `UI only`, `post-MVP`)

This table is the migration map. Do not invent topic ids/slugs.

## Step 2: Migrate Flat Topic Files to Topic Directories

For each legacy topic file under `topics/`:

- Legacy topic file pattern (forbidden): `topics/<topic-id>-<slug>.md`
- Legacy topic index pattern (forbidden): `topics/<topic-id>-<slug>.INDEX.md`

### 2.1 Create the topic directory

Create: `topics/<topic-id>-<slug>/`

### 2.2 Choose tier deterministically

Default tier is `t2` unless the Topics table row for this topic contains an explicit hint:

- If the row contains `(T3)` OR `UI only` OR `post-MVP` → tier = `t3`
- Otherwise → tier = `t2`

Do NOT guess `t1` during migration unless the Topics table explicitly indicates it.

### 2.3 Move the topic file

Move `topics/<topic-id>-<slug>.md` → `topics/<topic-id>-<slug>/<tier>_<slug>.md`

Also:
- If the file contains YAML frontmatter with a `parent:` field, update it to `../INDEX.md`.
- If the file contains obvious self-links to `./topics/<topic-id>-<slug>.md`, update them to the new path.

### 2.4 Move the topic index file (derived)

Move `topics/<topic-id>-<slug>.INDEX.md` → `topics/<topic-id>-<slug>/index.md`

Treat this `index.md` as derived/navigation-only.

## Step 3: Rewrite Links Across the Canonical Directory

Rewrite all canonical internal links that reference the forbidden legacy paths:

- Replace `./topics/<topic-id>-<slug>.md` with `./topics/<topic-id>-<slug>/<tier>_<slug>.md`
- Replace `./topics/<topic-id>-<slug>.INDEX.md` with `./topics/<topic-id>-<slug>/index.md`

Minimum files to update:
- `INDEX.md` (topics table + reading order + search hints tables)
- `ESSENTIAL-SPEC.md` (if it links to topics)
- `TIERS.md` (if it links to topics)
- `GLOSSARY.md` (if it links to topics)
- Any topic docs that cross-link to other topics

## Step 4: Enforce Contract (No Legacy Files)

After migration, the canonical directory MUST NOT contain:

- Any files matching `topics/*.md`
- Any files matching `topics/*.INDEX.md`

If any remain, the migration is incomplete. Fix until none remain.

## Step 5: Integrity Gate (Required)

Run the canonical integrity checks and add blocking items to `QUESTIONS.md` under `## Integrity <timestamp>` if any fail:

- Contract conformity: only `topics/<topic>/<t1|t2|t3>_*.md` for canonical topic content
- Cross-link validity: links resolve to existing files/anchors
- Tier sanity: migrated `t3` only when explicitly indicated by the Topics table hints

## Step 6: Continue the Intended Run

After migration succeeds, re-dispatch based on inputs:

- If there are new non-canonical sources → proceed as UPDATE run.
- If there are no new sources → stop after confirming integrity gate passes.

