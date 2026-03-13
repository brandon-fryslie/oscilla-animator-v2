# Context: P2-4 - ScopeEnvironment Dead Code and Scope Isolation

## Target State
`ScopeEnvironment` enforces lexical scope isolation for expression IDs. IDs created inside a loop or if body are inaccessible outside that scope. This prevents scope leaks by construction.

## Current State
`ScopeEnvironment` at `src/compiler/ir/naga-emitter/ScopeEnvironment.ts` is fully implemented (22 lines) with parent-chain lookup and block-local ID storage. However, it has zero imports — no code uses it.

Both active lowering paths use simple block stacking instead:
- `NagaBuilder.buildBlock()` at `NagaBuilder.ts:133-146` — pushes/pops an `activeBlock` array but does not restrict expression handle visibility
- `LoweringCtx.withBlock()` at `ScheduleNagaLowering.ts:257-267` — identical pattern, pushes/pops `activeBlock` for statement list nesting

Neither system prevents an expression handle created in a child block from being referenced in a parent block. The scope isolation property is maintained by convention (lowering code doesn't reference handles across boundaries) rather than by construction.

## Files Involved
- `src/compiler/ir/naga-emitter/ScopeEnvironment.ts` — dead code, should be removed or integrated
- `src/compiler/ir/naga-emitter/NagaBuilder.ts` — needs scope integration if kept
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` — needs scope integration if kept

## Suggested Approach
### Option A: Remove ScopeEnvironment
If scope isolation is not causing bugs in practice (which it hasn't been — the lowering is deterministic), remove the dead file and note that scope isolation is maintained by code structure rather than by enforcement.

### Option B: Integrate ScopeEnvironment into active lowering
Wrap `LoweringCtx.withBlock()` to use `ScopeEnvironment` for ID lookup. This would add mechanical enforcement matching the spec.

## Risks
- Option A acknowledges a spec deviation
- Option B adds complexity without clear bug-prevention value if the lowering is already correct by construction
