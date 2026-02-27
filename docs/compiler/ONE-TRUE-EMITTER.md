# One True Emitter: Opcode -> Naga Arena

## Purpose
This module defines the canonical lowering boundary from compiler opcode instructions into GPU-facing Naga Arena IR handles.

The emitter is implemented in:
- `src/compiler/ir/naga-emitter/naga-types.ts`
- `src/compiler/ir/naga-emitter/NagaBuilder.ts`
- `src/compiler/ir/naga-emitter/NagaValidator.ts`
- `src/compiler/ir/naga-emitter/WgslNagaCompiler.ts`

## Architectural Contract
- [LAW:one-source-of-truth] Opcode->GPU expression construction is centralized in `WgslNagaCompiler` + `NagaBuilder`.
- [LAW:single-enforcer] Type validation is centralized in `NagaValidator`.
- [LAW:dataflow-not-control-flow] Lowering executes deterministic instruction order; variability is in handles/data, not dynamic code generation.

## Constrained Builder API
`NagaBuilder` exposes typed operations:
- `add`, `mul`, `lerp`
- `select`
- `readState`, `writeState`
- `cast`

Every operation requires `BlockContext` with `visualBlockId`.
The builder records a source map from expression handle to originating visual block context.

## Debugging Flow
1. Emitter appends expressions into `NagaArena` and records source map metadata.
2. `NagaValidator` scans expressions and throws typed validation errors with expression handle.
3. Error handle resolves through `sourceMap` to `visualBlockId` for UI-level diagnostics.

## Acceptance Criteria Coverage
Implemented in `src/compiler/ir/__tests__/naga-emitter.test.ts`:
- AC1: Arena push verification for `add()`
- AC2: Validator trap with handle->visualBlockId resolution
- AC3: Static string-exclusion check (`'${'` forbidden) in emitter implementation files
