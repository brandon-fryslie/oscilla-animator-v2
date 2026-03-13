# Context: P2-2 - Dual Naga IR Type Hierarchies

## Target State
One canonical Naga IR type hierarchy that is used by the builder, validator, lowering pipeline, and Rust shim.

## Current State
Two complete, parallel type families exist in the same `naga-emitter/` module:

### Family A (NagaBuilder types) - `naga-types.ts`
- `NagaExpression` — PascalCase discriminants (`'Binary'`, `'Select'`, `'Constant'`)
- `NagaStatement` — PascalCase discriminants (`'Store'`, `'Loop'`, `'If'`)
- `NagaType` — PascalCase discriminants (`'Scalar'`, `'Vector'`, `'Matrix'`)
- Used by: `NagaBuilder.ts`, `NagaValidator.ts`
- NOT used by: actual lowering or Rust shim

### Family B (ScheduleNagaLowering types) - `ScheduleNagaLowering.ts`
- `NagaExpressionIR` — snake_case discriminants (`'binary'`, `'constant'`, `'buffer_load'`)
- `NagaStatementIR` — snake_case discriminants (`'store'`, `'loop'`, `'if'`)
- `NagaTypeIR` — snake_case discriminants (`'scalar'`, `'vector'`, `'array'`, `'struct'`)
- Used by: actual lowering pipeline, `compile.worker.ts`, Rust shim (`lib.rs`)
- Is the canonical active type family

### Usage chain
- `lowerScheduleToNagaModule()` produces `NagaLoweringProgramIR` (Family B)
- Compile worker sends this to Rust shim via `compile_ir()`
- Rust shim deserializes with `serde(rename_all = "snake_case")` matching Family B
- `NagaBuilder` (Family A) is only consumed by `NagaValidator` for pre-flight checks

### Evidence of drift
- Family A has `NagaExpression.type: 'AtomicResult'` — Family B has no atomic expression kind
- Family A has `NagaExpression.type: 'ArrayLength'` — Family B has no array length expression
- Family A has no `'array'` or `'struct'` NagaType kinds — Family B does
- Family A uses `NagaScalarKind` enum — Family B uses `NagaScalarKindIR` string union
- Family A has `NagaArena<T>` — Family B uses `Interner<T>`
- `ScopeEnvironment.ts` is imported by `NagaBuilder` but has zero import sites in the codebase

## Files Involved
- `src/compiler/ir/naga-emitter/naga-types.ts` — Family A types
- `src/compiler/ir/naga-emitter/NagaBuilder.ts` — Family A builder
- `src/compiler/ir/naga-emitter/NagaValidator.ts` — Family A validator
- `src/compiler/ir/naga-emitter/ScopeEnvironment.ts` — Family A scope (unused)
- `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts` — Family B types + lowering

## Suggested Approach
1. Determine if `NagaBuilder` + `NagaValidator` are still needed. They appear to be a pre-existing API that was superseded by `ScheduleNagaLowering`.
2. If `NagaBuilder` is needed: unify its types with `NagaTypeIR`/`NagaExpressionIR`/`NagaStatementIR`.
3. If `NagaBuilder` is not needed: remove `naga-types.ts`, `NagaBuilder.ts`, `NagaValidator.ts`, `ScopeEnvironment.ts` and their exports from `index.ts`.
4. `ScopeEnvironment` has zero consumer imports — it is dead code and should be removed regardless.

## Risks
- `NagaBuilder` may have test coverage that would need migrating.
- If the intent was to eventually use `NagaBuilder` as the constrained lowering API (replacing raw `LoweringCtx`), the merge should preserve its validation logic.
