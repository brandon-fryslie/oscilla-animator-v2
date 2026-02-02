# Definition of Done: Expression Swizzle via Extract/Construct IR Ops

**Generated:** 2026-02-02
**Status:** APPROVED FOR IMPLEMENTATION
**Prerequisite:** SPRINT-2026-01-27-180000-component-access (partially completed — type utilities, type checker, field kernels done)

## Context

The expression compiler's `compileMemberAccess` currently throws because it tries to use removed named kernels (`vec3ExtractX`, `makeVec2Sig`, etc.). The generic `extract`/`construct` ValueExpr IR ops exist and work at field level. This sprint wires them up for expression DSL swizzle.

## Architecture Decision

Following the Multi-Component Signal spec (`design-docs/_new/P0-Multi-Component-Signals.md`):
- Signal evaluation stays scalar (`evaluateSignal() -> number`)
- Multi-component signal values live in Value Slots (consecutive f64 entries)
- Expression compiler emits semantic `extract`/`construct` IR ops
- Block lowering decomposes `construct` into strided slot writes
- Signal evaluator `extract` reads from slot offsets

## Acceptance Criteria

### 1. Fix Expression Compiler (`src/expr/compile.ts`)

- [ ] `compileMemberAccess` emits `builder.extract(input, componentIndex, canonicalType(FLOAT))` for single-component access (`.x`, `.r`, etc.)
- [ ] `compileMemberAccess` emits `builder.construct([extract0, extract1, ...], resultType)` for multi-component swizzle (`.xy`, `.rgb`, etc.)
- [ ] Delete `getExtractionKernel` and `getCombineKernel` dead functions
- [ ] `v.x` compiles successfully (no throw)
- [ ] `v.xy` compiles successfully (no throw)
- [ ] `color.rgb` compiles successfully (no throw)

### 2. Fix Expression Block Lowering (`src/blocks/math/expression.ts`)

- [ ] When expression output has stride > 1 and the result ValueExprId is a `construct` node, decompose into component signals
- [ ] Allocate strided slot via `ctx.b.allocSlot(stride)`
- [ ] Emit `ctx.b.stepSlotWriteStrided(slot, components)` for multi-component results
- [ ] Return `{ id: firstComponent, slot, type, stride, components }` matching the pattern used by Const block

### 3. Fix Signal Evaluator Extract (`src/runtime/ValueExprSignalEvaluator.ts`)

- [ ] `extract` case handles componentIndex > 0 by resolving the input expression's base slot and reading `state.values.f64[baseSlot + componentIndex]`
- [ ] Single-component extraction (`.x`) works for signal-extent expressions
- [ ] The evaluator does NOT need to handle `construct` (lowering decomposes it)

### 4. Update Tests

- [ ] Change `integration.test.ts` "multi-component swizzle fails" test → test that `.xy` compilation succeeds
- [ ] Add test: `v.x` compiles and the IR contains an `extract` node with componentIndex 0
- [ ] Add test: `v.xy` compiles and the IR contains a `construct` node with 2 extract inputs
- [ ] Add test: `color.rgb` compiles and IR contains construct with 3 extract inputs
- [ ] Add test: single-component swizzle works in signal evaluation context
- [ ] All 2094+ existing tests still pass
- [ ] `npm run typecheck` passes

### 5. Update Documentation

- [ ] Update `src/expr/FUNCTIONS.md` with component access syntax documentation

## Exit Criteria

1. Expression `v.x` where v is vec3 compiles to extract IR op and evaluates correctly
2. Expression `v.xy` where v is vec3 compiles to construct(extract, extract) IR ops
3. Expression `color.rgb` compiles correctly
4. All existing tests pass, no type errors
5. `npm run test` exits 0

## Verification Command

```bash
npm run typecheck && npm run test
```
