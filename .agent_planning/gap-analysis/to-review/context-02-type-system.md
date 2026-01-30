---
topic: 02
name: Type System
spec_file: |
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t1_canonical-type.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_derived-classifications.md
category: to-review
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
priority: P3
---

# Context: Topic 02 — Type System (To-Review)

## What the Spec Requires

1. PayloadType is a closed set of 7 concrete kinds (no variable variant mentioned)
2. AxisTag<T> is deprecated and MUST NOT be used
3. `deriveKind()` is total — handles all possible CanonicalType inputs

## Current State (Topic-Level)

### How It Works Now

PayloadType includes a `{ kind: 'var'; id: string }` variant for type inference, analogous to Axis variables. This is used during compilation to represent polymorphic ports before type resolution. Guard functions (`isPayloadVar`, `isConcretePayload`) prevent variable payloads from reaching backend code.

`AxisTag<T>` appears once in `src/compiler/ir/bridges.ts` as a local type alias defined as `Axis<T, never>`. This is semantically different from the old AxisTag (which had default/instantiated branches) — it's just a convenience alias for "always instantiated axis."

`deriveKind()` throws on uninstantiated axes. This makes it safe only in post-inference contexts.

### Patterns to Follow

- Payload variables are guarded at every function that requires concrete payloads
- Type inference runs in `src/compiler/frontend/analyze-type-constraints.ts`
- Post-inference code can assume all axes/payloads are instantiated

## Work Items

### WI-1: Review AxisTag<T> alias in bridges.ts
**Category**: TO-REVIEW
**Priority**: P5
**Spec requirement**: AxisTag<T> deprecated and must not be used
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/bridges.ts` | Local type alias | 36 |

**Current state**: `type AxisTag<T> = Axis<T, never>` — a local alias
**Required state**: Either remove the alias (use `Axis<T, never>` directly) or confirm this is a different AxisTag from the deprecated one
**Suggested approach**: Check if the alias is actually used in bridges.ts. If so, inline it. If not, delete it.
**Depends on**: none
**Blocks**: nothing

### WI-2: Confirm payload variables in spec or document divergence
**Category**: TO-REVIEW
**Priority**: P4
**Spec requirement**: PayloadType is a closed set of 7 kinds
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | PayloadType union | 231-233 |

**Current state**: PayloadType includes `{ kind: 'var'; id: string }` for inference
**Required state**: Either (a) spec is updated to include payload variables as inference-only, or (b) payload variables are moved to a separate InferencePayload type
**Suggested approach**: Discuss with spec author. Payload variables serve the same role as axis variables and seem to be a legitimate inference mechanism.
**Depends on**: none
**Blocks**: nothing

### WI-3: Consider tryDeriveKind() for inference-time contexts
**Category**: TO-REVIEW
**Priority**: P4
**Spec requirement**: deriveKind() is total
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | deriveKind() | 698-716 |

**Current state**: Throws on uninstantiated axes
**Required state**: Either total (returns undefined for uninstantiated) or documented as post-inference only
**Suggested approach**: Add `tryDeriveKind(): DerivedKind | null` that returns null for uninstantiated axes. Keep `deriveKind()` as the strict variant for backend use.
**Depends on**: none
**Blocks**: nothing
