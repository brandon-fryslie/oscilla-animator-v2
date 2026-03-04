# Adding Additional Specs

This document defines how to add new documents to the WebGPU-Complete specification set.

## Goals

1. Keep specs implementation-independent.
2. Preserve single-owner contracts.
3. Keep new docs easy for implementers to execute.

// [LAW:one-source-of-truth] New docs must attach to one owning contract boundary.
// [LAW:single-enforcer] Cross-cutting rules should be owned once and referenced elsewhere.
// [LAW:dataflow-not-control-flow] Use explicit dependency order (workstreams/slices), not ad-hoc sequencing.

## When To Add A New Doc

Add a new doc only if at least one is true:

1. A new contract needs a clear owner and no existing owner doc fits.
2. A new implementation unit (functional slice) is needed.
3. A new logical collection of docs needs an index (workstream).

If existing docs can absorb the change cleanly, edit those instead of adding a new file.

## Doc Types

1. **Owner spec doc**
   - Use when introducing/changing a contract boundary.
   - Lives in `docs/WebGPU-Complete/` (or `shapes/` for taxonomy-class docs).

2. **Workstream index**
   - Use for a logical collection implemented as a unit.
   - File pattern: `workstreams/WS-##-<name>.index.md`.

3. **Functional slice**
   - Use for a vertical feature increment (for example: first Type 1 render).
   - File pattern: `workstreams/slices/S##-<name>.md`.

## Required Process

1. Pick exactly one owner workstream and one functional slice for the new scope.
2. Create/update the target doc.
3. Add a `Related Contracts` section with direct links to owner/dependency docs.
4. Update the owning `WS-*` index:
   - add the new doc to scope
   - update dependencies/consumers if needed
5. Update the relevant `S*` slice(s) if functional scope changed.
6. Update `IMPLEMENTATION-INDEX.md` only if:
   - ownership changed, or
   - dependency/read order changed.
7. Keep dependent docs as references only; do not duplicate full contract text.

## Writing Rules

1. Describe intended architecture/behavior, not current completion status.
2. Do not add completion checklists or "done" state tracking inside spec docs.
3. Prefer explicit contracts:
   - **Owns**
   - **Consumes**
   - **Produces**
4. Use concrete terms already defined in canonical docs (`ShapeHeaderV1`, indexed/non-indexed ABI, draw-prep sink metadata, etc.).

## Naming Rules

1. Keep names short and searchable.
2. Maintain existing numbering style:
   - `P#-#` for top-level spec docs
   - `WS-##` for workstreams
   - `S##` for slices
3. Avoid ambiguous names like `new-spec.md` or `notes.md`.

## Anti-Patterns (Do Not Do)

1. Adding a new doc without assigning an owner workstream.
2. Duplicating canonical schema/ABI definitions across multiple docs.
3. Adding status language ("complete", "currently done", "master is aligned").
4. Creating one doc that spans multiple workstreams/slices.
5. Introducing fallback/alternate modes in docs without explicit policy ownership.

## Quick Template

Use this top section in new docs:

```md
# <Title>

## Related Contracts

- `docs/WebGPU-Complete/IMPLEMENTATION-INDEX.md`
- `<owner/dependency docs>`

## Purpose

<one-paragraph purpose>
```

