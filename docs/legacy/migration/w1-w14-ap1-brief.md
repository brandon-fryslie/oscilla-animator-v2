# W1/W14 Ap1 Brief (Class-2 Resolution)

// [LAW:one-source-of-truth] This brief is the single execution contract for the first W1/W14 cycle.
// [LAW:verifiable-goals] Every deliverable below has deterministic pass/fail checks.

## Cycle ID
- `W1W14-Ap1`

## Seam Batch
- `S6` `src/runtime/ArenaValueStore.ts:8`
- `S7` `src/compiler/ir/program.ts:347`
- `S8` `src/runtime/RuntimeState.ts:665`

## Objective
- Resolve class-2 unknowns into one canonical SoA contract so class-1 migrations (`S1..S5`) can proceed without dual execution paths.

## Canonical Decisions To Lock In This Cycle
- Numeric runtime layout is component-major SoA (`component plane` + `lane index`) for GPU-targeted multi-component payloads.
- Runtime addressing contract carries canonical SoA descriptors as operational source; legacy storage vocabulary is metadata-only.
- Persistent state ownership moves to explicit arena segment semantics (read/write banks), not a standalone `state` store.

## Exact Files In Scope
- `src/runtime/ArenaValueStore.ts`
- `src/compiler/ir/storage-class.ts`
- `src/compiler/ir/program.ts`
- `src/compiler/compile.ts`
- `src/runtime/ExprAddressTable.ts`
- `src/runtime/RuntimeState.ts`
- `src/runtime/ScheduleExecutor.ts`
- `src/runtime/__tests__/ArenaValueStore.test.ts`
- `src/runtime/__tests__/project-policy-domain-change.test.ts`
- `src/runtime/__tests__/continuity-integration.test.ts`
- `src/__tests__/forbidden-patterns.test.ts`

## Work Order
1. Define canonical SoA descriptor shape and access helpers in runtime (`ArenaValueStore`) and compiler derivation (`storage-class`).
2. Update compiled runtime address contract (`program.ts`, `compile.ts`) so runtime consumers can resolve SoA addresses without stride math inference.
3. Define state-in-arena segment ownership contract in `RuntimeState` and wire frame semantics in `ScheduleExecutor` (no dual write ownership).
4. Add static guards in `forbidden-patterns` to block reintroduction of AoS hot-path formulas in W1/W14 modules.

## Non-Goals (This Cycle)
- Full materializer/continuity/render SoA migration (`S1/S2/S3`) is not executed here.
- WebGPU shader/kernel design work is out of scope.

## Completion Proof (Ap1)
- Type-level contract is canonicalized and compilable:
  - `pnpm run typecheck`
- Existing runtime suites for continuity/state still pass with new contracts:
  - `pnpm test -- src/runtime/__tests__/project-policy-domain-change.test.ts src/runtime/__tests__/continuity-integration.test.ts src/runtime/__tests__/ArenaValueStore.test.ts`
- Static guards added and green:
  - `pnpm test -- src/__tests__/forbidden-patterns.test.ts`

## Baseline Seam Scan (Before Ap1 Execution)
- `ArenaValueStore` AoS access formulas (`lane * desc.stride + component`): `4` matches
- Materializer/Continuity direct AoS index formulas (`i * stride + ...` set): `6` matches
- RenderAssembler interleaved/fixed-stride shape/color index signatures: `41` matches

## Exit Criteria
- `S6/S7/S8` reclassified to class-1 in `.migration/seams.md` with concrete replacement patterns and no unresolved design unknowns.

## Next Planned Cycles (After Ap1)
- `Ae1`: implement the locked SoA/address/state contracts and guardrails from this brief.
- `Ap2`: plan class-1 migration batch for `S4 + S1` (compile/address table + materializer plane reads/writes).
- `Ae2`: execute `S4 + S1` and prove parity with targeted runtime suites.
- `Ap3/Ae3`: execute `S2 + S3 + S5` (continuity/render SoA alignment + static bans tightening).
