---
topic: 01
name: Principles - Single Type Authority
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/principles/t1_single-authority.md
category: critical
audited: 2026-01-29
item_count: 3
priority_reasoning: >
  The spec's foundational invariant I3 (axis enforcement is centralized) requires a single
  enforcement gate in the compilation pipeline. The gate module exists but is dead code.
  Additionally, LoweredOutput/ValueRefPacked store kind discriminants that duplicate
  what deriveKind() computes, violating I1 (no field duplicates type authority).
---

# Topic 01: Principles — Critical Gaps

## Items

### C-1: Axis enforcement gate exists but is never called
**Problem**: `axis-validate.ts` implements `validateTypes()` and `validateType()` but no module in the entire `src/` tree imports it. The single enforcement gate required by invariant I3 is dead code.
**Evidence**: `src/compiler/frontend/axis-validate.ts` — fully implemented. `src/compiler/compile.ts` — no import of axis-validate. Global grep for `import.*axis-validate` returns zero hits.
**Obvious fix?**: Yes. Wire `validateTypes()` into the compilation pipeline between type resolution (pass 1-2) and backend lowering (pass 6).

### C-2: LoweredOutput/ValueRefPacked store `kind` that duplicates deriveKind()
**Problem**: `LoweredSignal` has `kind: 'signal'`, `LoweredField` has `kind: 'field'`, `ValueRefPacked` has `k: 'sig' | 'field' | 'event'`. These are stored discriminants that duplicate what `deriveKind(type)` would compute from the `.type: CanonicalType` also present on each variant. Spec invariant I1 says "No field, property, or data structure may store information that duplicates what CanonicalType already expresses."
**Evidence**: `src/compiler/ir/lowerTypes.ts:80` (`kind: 'signal'`), `src/compiler/ir/lowerTypes.ts:90` (`kind: 'field'`), `src/compiler/ir/lowerTypes.ts:32-64` (`ValueRefPacked` with `k: 'sig'|'field'|'event'`).
**Obvious fix?**: No. These discriminants serve as TypeScript discriminated union tags for ergonomic pattern matching. Removing them would require restructuring the union or using a different pattern. However, `ValueRefPacked` also includes `k: 'instance'` and `k: 'scalar'` variants which have NO `.type` field, so the discriminant is structurally necessary there. This may be TO-REVIEW rather than strictly critical — the duplication is constrained to compiler internals and the discriminant is never mutated independently of `.type`.

### C-3: DebugService stores `kind: 'signal' | 'field'` as stored discriminant
**Problem**: `SignalValueResult` and `FieldValueResult` store `kind: 'signal'` / `kind: 'field'` as literal discriminants alongside `type: CanonicalType`. This is a stored classification that should be derived.
**Evidence**: `src/services/DebugService.ts:24` (`kind: 'signal'`), `src/services/DebugService.ts:34` (`kind: 'field'`).
**Obvious fix?**: Yes, but low urgency — these are UI-facing result types, not type authority. The `kind` field serves as a TypeScript union discriminant. Could be replaced with a computed getter or `deriveKind(type)` at use sites.
