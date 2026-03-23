# W1/W14 Ae2 Brief (Class-1 Migration Batch)

// [LAW:one-source-of-truth] This brief is the single execution contract for the next W1/W14 implementation cycle.
// [LAW:verifiable-goals] Batch closure is defined by deterministic checks and seam shrink counts.

## Cycle ID
- `W1W14-Ae2`

## Seam Batch
- `S4` runtime address-table consumer migration
- `S1` materializer AoS indexing consolidation
- `S5` guard tightening for canonical addressing usage

## Objective
- Move runtime reads from offset-only maps toward canonical descriptor/address metadata.
- Reduce AoS index expression spread in materializer hot path to a single helper boundary.

## Exact Files In Scope
- `src/runtime/ValueExprMaterializer.ts`
- `src/runtime/ValueExprScalarEvaluator.ts`
- `src/runtime/RenderAssembler.ts`
- `src/runtime/ScheduleExecutor.ts`
- `src/runtime/executeFrameStepped.ts`
- `src/runtime/RuntimeState.ts`
- `src/runtime/__tests__/construct-one.test.ts`
- `src/runtime/__tests__/RenderAssembler.test.ts`
- `src/__tests__/forbidden-patterns.test.ts`

## Work Order
1. Consolidate materializer lane/component indexing behind one helper used by construct/extract and key multi-component writes.
2. Prefer `scalarExprToArenaAddress` in runtime scalar/render paths; keep offset map only as compatibility fallback.
3. Add/expand static guards for legacy offset-only usage growth in runtime hot paths.

## Completion Proof
- `pnpm run typecheck`
- `pnpm exec vitest run src/runtime/__tests__/construct-one.test.ts src/runtime/__tests__/RenderAssembler.test.ts src/__tests__/forbidden-patterns.test.ts`
- `pnpm test`

## Exit Criteria
- No new direct `offset + componentIndex` scalar extract reads are introduced outside the compatibility fallback boundary.
- Materializer index math seam count decreases from current baseline (`S1`) with behavior parity preserved.
