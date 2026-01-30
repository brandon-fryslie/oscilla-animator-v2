---
topic: 01
name: Principles - Single Type Authority
spec_file: design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/principles/t1_single-authority.md
category: critical
generated: 2026-01-29
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: [topic-02-type-system]
priority: P1
---

# Context: Topic 01 — Principles (Critical)

## What the Spec Requires

1. CanonicalType = { payload, unit, extent } is the ONLY type authority for all values
2. Signal/field/event classifications are DERIVED via `deriveKind()`, never stored as authoritative data (I1)
3. No parallel type systems (no `SignalType`, `PortType`, `FieldType`, `EventType`)
4. Only explicit ops change extent axes (I2)
5. Exactly one centralized enforcement gate validates axis invariants (I3)
6. No scattered ad-hoc axis checks

## Current State (Topic-Level)

### How It Works Now

CanonicalType is correctly defined in `src/core/canonical-types.ts` with the full triple { payload, unit, extent }. The `deriveKind()` function exists and works correctly. Old parallel type systems (`SignalType`, `ResolvedExtent`) have been removed. The axis-validate enforcement gate module is fully implemented but is dead code — nothing in the compilation pipeline calls it. Compiler-internal IR types (`LoweredOutput`, `ValueRefPacked`, `DebugService` results) store discriminant fields that duplicate what `deriveKind()` computes.

### Patterns to Follow

- All type construction goes through canonical constructors (`canonicalSignal`, `canonicalField`, `canonicalEventOne`, etc.)
- `deriveKind(type)` is the approved way to determine signal/field/event classification
- The compilation pipeline is a sequence of passes in `src/compiler/compile.ts`
- The frontend validation pass lives in `src/compiler/frontend/axis-validate.ts`

## Work Items

### WI-1: Wire axis-validate into compilation pipeline
**Category**: CRITICAL
**Priority**: P1
**Spec requirement**: I3 — exactly one enforcement gate validates axis invariants before backend compilation
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/compiler/frontend/axis-validate.ts` | The gate module (exists, complete) | 1-93 |
| `src/compiler/compile.ts` | Pipeline entry (must call gate) | ~57-63 |
| `src/compiler/passes-v2/index.ts` | Pass exports | all |

**Current state**: `axis-validate.ts` is complete but not imported anywhere
**Required state**: Called between type resolution and backend lowering in the compile pipeline; violations abort compilation with diagnostics
**Suggested approach**: Import `validateTypes` in `compile.ts`. After pass1/pass2 resolves types, collect all resolved CanonicalTypes and run `validateTypes()`. Convert violations to `CompileError[]` and return early if any found.
**Depends on**: none
**Blocks**: Full type soundness guarantee for backend

### WI-2: Evaluate stored kind discriminants in compiler IR types
**Category**: CRITICAL (borderline TO-REVIEW)
**Priority**: P3
**Spec requirement**: I1 — no stored field duplicates CanonicalType authority
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/lowerTypes.ts` | LoweredOutput, ValueRefPacked | 32-109 |
| `src/services/DebugService.ts` | SignalValueResult, FieldValueResult | 23-42 |

**Current state**: `kind: 'signal'`/`kind: 'field'`/`k: 'sig'`/etc. stored alongside `type: CanonicalType`
**Required state**: Either (a) remove `kind` and derive at use-sites, or (b) document as a justified waiver since these serve as TypeScript union discriminants and never diverge from `type`
**Suggested approach**: For `ValueRefPacked`, the discriminant is structurally necessary (some variants have no `.type`). For `LoweredOutput`, consider whether the discriminant can be removed or formally waived. For `DebugService`, the discriminant is UI-facing and low risk.
**Depends on**: none
**Blocks**: nothing directly
