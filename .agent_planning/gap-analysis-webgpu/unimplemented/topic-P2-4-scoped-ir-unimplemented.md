# P2-4: Scoped Naga IR Control Flow and Memory Model - UNIMPLEMENTED Items

## Item 1: Atomics in Active Lowering Path
**Spec says**: "Atomic operations are expression-level (AtomicResult) and return the prior value. Integer payload constraints are mandatory."
**Implementation**: `AtomicResult` exists only in `NagaBuilder` (Family A IR at `naga-types.ts:78`). The active `ScheduleNagaLowering` IR (Family B) has no atomic expression kind. The Rust shim has no atomic WGSL emission code.
**Gap**: Atomics are defined but not wired into the active compilation path. When graph blocks requiring atomic GPU operations are added, the lowering pipeline will need an `'atomic_add'` (or similar) expression kind in `NagaExpressionIR`, plus Rust shim emission support.
**Classification**: UNIMPLEMENTED

## Item 2: zip/reduction Loop Emission
**Spec says**: "When cardinality requires iterative reduction, lowering may emit explicit loops instead of assuming implicit element-wise execution."
**Implementation**: Reduction in the current GPU compute path is not explicitly lowered as loops. The ScheduleNagaLowering handles field operations via per-lane compute dispatch. Reductions would need explicit loop emission via the `'loop'`/`'break'` statement kinds which exist in the IR but are not used by any reduction lowering path.
**Gap**: Reduction operations on the GPU path would need loop-based lowering. The IR supports it (loop/break/continue exist) but no lowering logic produces these patterns for reductions.
**Classification**: UNIMPLEMENTED

## Item 3: Verification Gate Tests for Emitter Module Invariants
**Spec says**: "Emitter tests verify: recursive block emission, lexical scope isolation failures are caught, dynamic-read clamp injection is present, atomic non-integer payload rejection, string interpolation exclusion in emitter lowering files."
**Implementation**: Tests exist at `src/compiler/__tests__/naga-lowering.test.ts` and `src/compiler/__tests__/naga-compile.test.ts` but do not cover all five verification gate items. Specifically:
  - Recursive block emission: likely covered
  - Lexical scope isolation: NOT testable since ScopeEnvironment is dead code
  - Dynamic-read clamp injection: NOT tested (and not implemented)
  - Atomic non-integer payload rejection: covered by `NagaValidator` tests
  - String interpolation exclusion: NOT tested as a gate
**Gap**: Full verification gate test suite as specified does not exist as a cohesive test group.
**Classification**: UNIMPLEMENTED
