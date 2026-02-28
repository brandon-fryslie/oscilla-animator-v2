# One True Emitter: Scoped IR -> Naga Arena

## Purpose
This module defines the canonical lowering boundary from compiler opcode instructions into GPU-facing Naga Arena IR handles. It is a strict architectural firewall that lowers a recursive, hierarchical IR into hardware-safe AST data structures without raw WGSL string construction.

The emitter is implemented in:
- `src/compiler/ir/naga-emitter/naga-types.ts`
- `src/compiler/ir/naga-emitter/NagaBuilder.ts`
- `src/compiler/ir/naga-emitter/NagaValidator.ts`
- `src/compiler/ir/naga-emitter/WgslNagaCompiler.ts`
- `src/compiler/ir/naga-emitter/ScopeEnvironment.ts`

## Architectural Contract
- **[LAW:one-source-of-truth]** Opcode -> GPU construction is centralized in `WgslNagaCompiler` + `NagaBuilder`.
- **[LAW:single-enforcer]** Type and memory safety rules are enforced at one boundary (`NagaBuilder` + `NagaValidator`).
- **[LAW:dataflow-not-control-flow]** Lowering executes deterministically; variability is encoded in handles and data values.
- **[LAW:lexical-scoping]** Handles created in a child block are destroyed on block exit and are unavailable to siblings/parents.
- **[LAW:bounds-clamping]** Dynamic memory reads inject `min(index, arrayLength - 1)` before access.
- **[LAW:no-string-math]** Expression lowering is AST-only; string interpolation for WGSL math emission is forbidden.

## Constrained Builder API
`NagaBuilder` exposes typed construction primitives grouped by capability:

1. Pure ALU and coercion
- `add`, `sub`, `mul`, `min`, `max`, `lerp`, `select`
- `cast`

2. State and memory
- `readState`, `writeState`
- `arrayLength`, `bufferRead`, `bufferWrite`, `atomicAdd`

3. Hierarchical control flow
- `buildBlock`
- `loopStatement`, `ifStatement`
- `breakStatement`, `continueStatement`

Every method requires `BlockContext` with `visualBlockId`, allowing `NagaHandle -> visualBlockId` source mapping.

## Execution Architecture
1. **Recursive evaluation:** `WgslNagaCompiler` recursively compiles `body`, `acceptBody`, and `rejectBody` blocks.
2. **Lexical scope chain:** `ScopeEnvironment` push/pop isolates output IDs per block scope.
3. **Hardware safety injection:** `bufferReadDynamic` emits `arrayLength`, `sub`, and `min` before `bufferRead`.

## Debugging Flow
1. Emitter appends expressions/statements/blocks into arenas and records source-map metadata.
2. `NagaValidator` validates arena semantics and throws typed errors with expression handles.
3. The handle resolves to `visualBlockId`, allowing precise node-level diagnostics.

## Acceptance Criteria Coverage
Implemented in `src/compiler/ir/__tests__/naga-emitter.test.ts`:

### Phase 1: Arena and validator baseline
- **AC1:** Arena push verification for ALU operations.
- **AC2:** Validator trap with handle -> visualBlockId resolution.
- **AC3:** Static string-exclusion check (`'${'` forbidden) for emitter implementation files.

### Phase 2: Scopes and control flow
- **AC4:** Recursive block emission for `loop`/`if` statements.
- **AC5:** Variable scope leakage trap on out-of-scope ID access.

### Phase 3: Hardware safety
- **AC6:** Automatic bounds clamping on `bufferReadDynamic`.
- **AC7:** Atomic type rejection when `atomicAdd` receives non-integer value operands.
