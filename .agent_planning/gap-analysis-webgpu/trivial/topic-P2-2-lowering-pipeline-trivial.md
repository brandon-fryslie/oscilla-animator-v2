# P2-2: Naga Compiler Lowering Pipeline - TRIVIAL Items

## Item 1: LoweringCtx class name and API shape
**Spec says**: `class LoweringCtx` with `types: Interner<NagaType>`, `constants: Interner<NagaConstant>`, `addGlobal()`, `addExpr()`, `addStmt()`.
**Implementation**: Two `LoweringCtx` implementations exist:
  1. `NagaBuilder` at `src/compiler/ir/naga-emitter/NagaBuilder.ts:97` — the constrained builder API with type-safe expression emission and validation.
  2. `LoweringCtx` at `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:231` — the actual IR lowering context with `types: Interner<NagaTypeIR>`, `constants: Interner<NagaConstantIR>`, `addExpression()`, `addStatement()`.
**Gap**: Naming is slightly different (`addExpression` vs `addExpr`, `addStatement` vs `addStmt`) but semantics match exactly. The split into two layers (constrained builder + lowering context) is actually more robust than the spec's single-class design.
**Classification**: TRIVIAL

## Item 2: Entry point function naming
**Spec says**: Function named `"main"` in the entry point.
**Implementation**: Function named `"compute_main"` at `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:2328`.
**Gap**: Different name, no functional difference. `compute_main` is more descriptive for a compute shader.
**Classification**: TRIVIAL

## Item 3: NagaModule interface field naming
**Spec says**: `NagaModule { types, constants, global_variables, functions, entry_points }`
**Implementation**: `NagaModuleIR` at `src/compiler/ir/naga-emitter/ScheduleNagaLowering.ts:166-172` with identical fields: `types`, `constants`, `global_variables`, `functions`, `entry_points`.
**Gap**: Type name uses `IR` suffix per project convention. Fields are identical.
**Classification**: TRIVIAL
