# Implementation Context: Sprint validation-gate

## File Map

| Item | Primary File | Lines | Secondary Files |
|------|-------------|-------|-----------------|
| #14 deriveKind zero | `src/core/canonical-types.ts` | 696-715 | all DerivedKind consumers |
| #22 canonicalConst | `src/core/canonical-types.ts` | ~680 | `src/types/index.ts` |
| #15 validation gate | `src/compiler/frontend/index.ts` | 102-194 | `axis-validate.ts`, `analyze-type-graph.ts` |
| #21 var escape | `src/compiler/frontend/axis-validate.ts` | new function | `canonical-types.ts:425-427` (isAxisVar) |
| #17 BindingMismatchError | `src/compiler/frontend/` | TBD | type solver unification code |
| #20 AxisInvalid | `src/compiler/frontend/axis-validate.ts` + diagnostics | TBD | `src/diagnostics/DiagnosticHub.ts` |

## Execution Order (required — dependency chain)

1. **#14** deriveKind zero handling (unblocks #15)
2. **#22** canonicalConst constructor (supports #14 testing)
3. **#15** Wire validation gate (unblocks #17, #20, #21)
4. **#21** Var escape check (part of validation gate)
5. **#17** BindingMismatchError (structured diagnostics)
6. **#20** AxisInvalid diagnostic (structured diagnostics)

## Key Patterns

- Frontend pipeline: `compileFrontend()` in `src/compiler/frontend/index.ts`
- Pipeline steps captured via `compilationInspector.capturePass(name, data)`
- Errors collected as `FrontendError[]` with `kind`, `message`, `blockId?`, `portId?`
- `backendReady` flag gates backend compilation
- Validation module: `src/compiler/frontend/axis-validate.ts`

## Research Needed Before Implementation

1. **TypedPatch output format**: Read `analyze-type-graph.ts` to understand how resolved port types are exposed. This determines how to collect types for validation.
2. **Binding mismatch location**: Trace `unifyAxis()` in type inference to find where binding mismatches currently throw. This determines where to emit BindingMismatchError.
3. **DiagnosticHub API**: Read `DiagnosticHub.ts` to understand how to add a new diagnostic category.
