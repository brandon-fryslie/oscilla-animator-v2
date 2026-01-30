# Implementation Context: Sprint p1-independent-fixes

## File Map

| Item | Primary File | Lines | Secondary Files |
|------|-------------|-------|-----------------|
| #1 Tests | `src/core/__tests__/canonical-types.test.ts` | 190, 290-291, 328-329, 353, 359, 365, 367, 382, 388, 404 | — |
| #2 DEFAULTS_V0 | `src/core/canonical-types.ts` | 890-905 | `src/ui/reactFlowEditor/typeValidation.ts:78-79,110-111,199-202`, `src/compiler/frontend/analyze-type-graph.ts:56-59,183-186` |
| #3 constValueMatchesPayload | `src/compiler/ir/IRBuilderImpl.ts` | 118, 282 | `src/core/canonical-types.ts:315-320` |
| #4 payloadStride | `src/core/canonical-types.ts` | 815-826 | — |
| #5 AxisTag | `src/compiler/ir/bridges.ts` | 36 | grep for all usages |
| #6 stride field | `src/core/canonical-types.ts` | 163-171, 382-389 | all consumers of `.stride` |
| #7 shape | `src/core/canonical-types.ts` | 170, 195 | `src/blocks/render-blocks.ts` |
| #8 cameraProjection | `src/core/canonical-types.ts` | 298, 369-371 | — |
| #9 tryDeriveKind | `src/core/canonical-types.ts` | near 696-715 | `src/types/index.ts` (re-export) |
| #10 eventRead | `src/compiler/ir/IRBuilderImpl.ts` | 869 | all callers of `sigEventRead` |
| #11 AxisViolation | `src/compiler/frontend/axis-validate.ts` | 26-30 | — |
| #12 deriveKind asserts | lowering boundary + debug service | TBD | `src/compiler/ir/lowerTypes.ts`, `src/services/` |
| #13 CI test | new file: `src/__tests__/forbidden-patterns.test.ts` | new | — |

## Execution Order (suggested, not required)

These are all independent. Suggested order minimizes cascading type errors:

1. #6 (remove stride field) — changes ConcretePayloadType shape
2. #7 (remove shape) — removes a PayloadType variant
3. #4 (fix payloadStride) — depends on knowing final PayloadType variants
4. #8 (cameraProjection enum) — changes ConstValue shape
5. #5 (delete AxisTag) — isolated deletion
6. #1 (fix tests) — can be done alongside other changes
7. #2 (DEFAULTS_V0) — isolated fix
8. #3 (wire constValueMatchesPayload) — needs final ConstValue shape from #8
9. #9 (tryDeriveKind) — isolated addition
10. #10 (lock eventRead) — isolated API change
11. #11 (rename AxisViolation) — isolated rename
12. #12 (deriveKind asserts) — needs tryDeriveKind from #9
13. #13 (CI test) — do last, verifies all other fixes

## Key Patterns

- Canonical constructors in `canonical-types.ts` return frozen objects
- PayloadType singletons: `FLOAT`, `INT`, `BOOL`, `VEC2`, `VEC3`, `COLOR`
- Re-exports go through `src/types/index.ts`
- IR builder is the construction boundary for IR nodes
- Test pattern: test the interface, not the implementation

## Handling Out-of-Scope Failures

If a test fails due to causes NOT in the gap analysis (e.g., `unitVar()` crash, adapter pass changes):
1. Comment out the failing test
2. Add `// TODO: Re-enable after [cause] is resolved`
3. Do NOT fix the underlying cause — it is out of scope
