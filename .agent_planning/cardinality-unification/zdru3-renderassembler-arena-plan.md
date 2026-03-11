# Ticket: oscilla-animator-v2-zdru.3
# Title: Migrate RenderAssembler to read from arena

## Objective
Move RenderAssembler read paths from legacy value stores (`state.values.f64`, `state.values.objects`) to the canonical arena (`state.arena` + `program.arenaLayout`).

## Architectural constraints
- [LAW:one-source-of-truth] Arena is the numeric read authority for render assembly.
- [LAW:single-enforcer] Keep OKLCH->RGBA conversion at render boundary unchanged.
- [LAW:dataflow-not-control-flow] Preserve existing render execution order and optional-slot semantics; only change data source.

## Scope
In scope:
- `src/runtime/RenderAssembler.ts`
- `src/runtime/ScheduleExecutor.ts` (AssemblerContext population)
- `src/runtime/executeFrameStepped.ts` (AssemblerContext population)
- `src/runtime/executor-init.ts` (reusable assembler context shape)
- Existing RenderAssembler tests that construct `AssemblerContext`

Out of scope:
- Full address-table redesign (`zdru.5`) beyond minimum data needed for this ticket.
- Deleting legacy stores (`zdru.7`).

## Exact read sites to migrate in RenderAssembler
Legacy scalar reads:
- line ~470 (`resolveScale`: `state.values.f64[slotIndex]`)
- line ~521 (`resolveShape`: param signal reads from f64)

Legacy objects map reads:
- line ~501 (`resolveShape`, slot shape buffer)
- line ~545 (`resolveControlPoints`)
- line ~920 (`assemblePerInstanceShapes`, optional rotation)
- line ~924 (`assemblePerInstanceShapes`, optional scale2)
- lines ~1012-1013 (`assemblePerInstanceShapes`, path control points)
- line ~1306 (`assembleDrawPathInstancesOp`, position buffer)
- line ~1319 (`assembleDrawPathInstancesOp`, color buffer)
- line ~1363 (`assembleDrawPathInstancesOp`, optional rotation)
- line ~1367 (`assembleDrawPathInstancesOp`, optional scale2)

## Implementation plan
1. Extend `AssemblerContext` in `src/runtime/RenderAssembler.ts` to include:
   - `program: CompiledProgramIR`
   - `sigToSlot` as signal-id -> ValueSlot (or add additional mapping needed for direct arena indexing without f64 offsets)

2. Add private helpers in `src/runtime/RenderAssembler.ts`:
   - `readArenaScalarForSignal(...)`
   - `readArenaBufferForSlot(...)`
   - `readOptionalArenaBufferForSlot(...)`
   These helpers must:
   - resolve descriptor from `program.arenaLayout[slot]`
   - throw clear errors for missing descriptors when required
   - return `undefined` for optional slots with missing/sentinel descriptors
   - enforce typed buffer views via `arenaSlice` + typed coercion checks where needed

3. Migrate scalar reads:
   - `resolveScale(...)` reads from arena using descriptor offset (component 0)
   - `resolveShape(...)` param signal loop reads from arena using signal->slot mapping

4. Migrate field/object buffer reads:
   - Replace each `state.values.objects.get(...)` read site with arena helper calls.
   - Preserve existing behavior and error messages as closely as possible.
   - Preserve optional behavior for `rotationSlot` and `scale2Slot`.

5. Thread new context fields from callers:
   - `src/runtime/ScheduleExecutor.ts`
   - `src/runtime/executeFrameStepped.ts`
   - `src/runtime/executor-init.ts`
   Ensure context object is fully populated every frame.

6. Update tests that build `AssemblerContext` literals:
   - `src/runtime/__tests__/RenderAssembler.test.ts`
   - `src/runtime/__tests__/RenderAssembler-per-instance-shapes.test.ts`
   Keep tests focused; prefer updating existing fixtures/context builders over adding broad new suites.

7. Add one targeted assertion path (in existing RenderAssembler tests) that proves data is read from arena values (not f64/objects).

## Required no-regression checks
Run these and ensure zero matches after migration:
- `rg -n "state\.values\.f64" src/runtime/RenderAssembler.ts`
- `rg -n "state\.values\.objects\.get\(" src/runtime/RenderAssembler.ts`

Ensure these are unchanged by this ticket:
- render frame output slot object handling outside RenderAssembler
- OKLCH/RGBA conversion boundary behavior

## Verification commands
- `pnpm exec vitest run src/runtime/__tests__/RenderAssembler.test.ts src/runtime/__tests__/RenderAssembler-per-instance-shapes.test.ts src/runtime/__tests__/executeFrameStepped.test.ts`
- `just check`

## Commit
- Commit message: `[zdru.3] Migrate RenderAssembler reads to arena`
