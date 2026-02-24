# Packet Plan: compiledir-hybrid-foundation

## Packet 1: W11 Public API Surface Cut (Deprecated IRBuilder Export Removal)

## Authority Being Replaced
Deprecated public builder surface (`IRBuilder` export path) -> canonical public builder surface (`BlockIRBuilder`, `OrchestratorIRBuilder`).

## Scope
- In:
  - `src/compiler/ir/index.ts`
  - `src/compiler/index.ts`
  - `src/__tests__/compiledir-foundation-gates.test.ts` (threshold updates)
- Out:
  - runtime/evaluator/addressing/binder internals

## Delete Now
- `export type { IRBuilder } from './IRBuilder';` from `src/compiler/ir/index.ts`
- `IRBuilder` from `src/compiler/index.ts` public type export list

## Blocking Gates
- G1: `src/__tests__/compiledir-foundation-gates.test.ts` (no-growth + explicit K-W11 assertions)
- G2: `src/__tests__/forbidden-patterns.test.ts`
- G3: `src/compiler/__tests__/no-legacy-types.test.ts`

## Expected Breakages + Lane Movement
- Expected breakage: external/internal consumers importing `IRBuilder` from compiler entrypoints may fail typecheck.
- Lane movement:
  - If breakages occur in non-test production imports, move none; fix immediately or quarantine in allowlist for Packet 2.

## Counter Deltas (expected)
- K-W11-1: 1 -> 0
- K-W11-2: 1 -> 0
- K-W11-3: 2 -> 2 (unchanged this packet)
- A-W11-1: 2 -> 2 (unchanged this packet)

## Execution Status
- Executed: yes
- Actual deltas:
  - K-W11-1: 1 -> 0
  - K-W11-2: 1 -> 0
  - K-W11-3: 2 -> 2
  - A-W11-1: 2 -> 2
- Gate run note: Vitest unavailable in local environment (`ERR_MODULE_NOT_FOUND: vitest`), so packet used static counter verification and code diff verification.

## Packet 2: W5 Effects-As-Data Enforcement Core (Remove Binder Fallbacks)

## Authority Being Replaced
Dual-path binder behavior -> effects-as-data single binder authority.

## Scope
- In:
  - `src/blocks/registry.ts`
  - `src/compiler/backend/binding-pass.ts`
  - affected block lowering callsites if required
- Out:
  - evaluator/addressing/ABI workstreams

## Delete Now
- `Optional during migration` contract language and semantics for effects in block contracts.
- `Pure block fallback - allocate slot now` branch.
- `builder.findStateSlot` fallback lookup calls in binder state resolution.

## Blocking Gates
- G1: `src/__tests__/compiledir-foundation-gates.test.ts` (K-W5-* counts)
- G2: `src/__tests__/forbidden-patterns.test.ts`

## Expected Breakages + Lane Movement
- Likely breakages in blocks that omit required effects.
- Lane movement:
  - Add/adjust compiler-block lowering tests in Lane A for explicit diagnostics.
  - Keep runtime lanes unchanged.

## Counter Deltas (expected)
- K-W5-1: 1 -> 0
- K-W5-2: 1 -> 0
- K-W5-3: 3 -> 0

## Packet 3: W6 Evaluator Unification Surface Cleanup

## Authority Being Replaced
Shadow-mode evaluator parity surfaces -> single evaluator family.

## Scope
- In:
  - `src/runtime/ValueExprScalarEvaluator.ts`
  - `src/runtime/ValueExprEventEvaluator.ts`
  - `src/runtime/RuntimeState.ts`
- Out:
  - W2 addressing rewrite internals (except minimal compatibility updates)

## Delete Now
- Shadow-mode migration markers in scalar/event evaluators.
- Legacy predicate-buffer surface (`eventPrevPredicate`).

## Blocking Gates
- G1: `src/__tests__/compiledir-foundation-gates.test.ts` (K-W6-* counts)
- G2: runtime evaluator and event suites

## Expected Breakages + Lane Movement
- Potential runtime test breakage in event/state temporal suites.
- Lane movement:
  - Move adjusted evaluator/state tests to Lane A once canonical semantics are re-established.

## Counter Deltas (expected)
- K-W6-1: 1 -> 0
- K-W6-2: 1 -> 0
- K-W6-3: 8 -> 0

// [LAW:verifiable-goals] Each packet defines measurable counter deltas.
// [LAW:dataflow-not-control-flow] Packet scope replaces one authority path at a time.
