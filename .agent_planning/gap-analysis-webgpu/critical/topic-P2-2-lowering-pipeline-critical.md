# P2-2: Naga Compiler Lowering Pipeline - CRITICAL Items

## Item 1: Two Parallel IR Hierarchies (NagaBuilder vs ScheduleNagaLowering)
**Spec says**: "We generate a Tree of Objects. This tree mirrors the Rust structs found in the naga crate." One canonical IR format.
**Implementation**: There are TWO complete type hierarchies:
  1. `NagaBuilder` types in `src/compiler/ir/naga-emitter/naga-types.ts:1-137` — `NagaExpression`, `NagaStatement`, `NagaType` with PascalCase enum discriminants (`'Binary'`, `'Store'`, `'Scalar'`).
  2. `ScheduleNagaLowering` types in `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:23-172` — `NagaExpressionIR`, `NagaStatementIR`, `NagaTypeIR` with snake_case discriminants (`'binary'`, `'store'`, `'scalar'`).

  Only the `ScheduleNagaLowering` types are used by the actual lowering pipeline and consumed by the Rust shim. The `NagaBuilder` types are used by `NagaBuilder` and `NagaValidator` but never flow into the Rust shim or actual WGSL emission.

**Gap**: [LAW:one-source-of-truth] violation. Two parallel Naga IR type systems exist in the same module. The `NagaBuilder`+`NagaValidator` operate on one IR family; `ScheduleNagaLowering` operates on a different one. The `NagaBuilder` IR appears to be an older or alternative API that is not on the active lowering path.
**Classification**: CRITICAL — this creates maintenance burden and confusion about which IR is canonical. The `NagaBuilder` types should either be removed or unified with the `ScheduleNagaLowering` types.
