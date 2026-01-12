# Paths2D Dependency Plan (IR-Only)

This plan enumerates all dependency work required for full Paths2D support, in priority order.

## P0: Path Field Operations
- **Goal:** Support Field<path> beyond consts.
- **Dependencies:**
  - Runtime FieldOp entries for path transforms (translate/scale/rotate).
  - Optional PathZip op for morphing.
  - IR lowering for each op.
- **Files:**
  - `src/editor/runtime/field/types.ts`
  - `src/editor/runtime/field/FieldHandle.ts`
  - `src/editor/runtime/field/Materializer.ts`
  - `src/editor/compiler/ir/opcodes.ts` (if using opcode kernels)

## P1: Path Source Blocks
- **Goal:** Provide blocks to produce Field<path> values.
- **Dependencies:**
  - PathConst block (simple const PathExpr).
  - Optional PathFromPoints block (Field<vec2> → Field<path>).
- **Files:**
  - `src/editor/blocks/domain.ts`
  - `src/editor/compiler/blocks/domain/*.ts`

## P2: Scheduler & Runtime Glue
- **Goal:** Ensure materializePath and render assembly are fully wired.
- **Dependencies:**
  - `processPaths2DSink` emits steps and path batches.
  - `executeMaterializePath` resolves path field expressions.
  - `executeRenderAssemble` builds Paths2D pass.
- **Files:**
  - `src/editor/compiler/ir/buildSchedule.ts`
  - `src/editor/runtime/executor/steps/executeMaterializePath.ts`
  - `src/editor/runtime/executor/steps/executeRenderAssemble.ts`

## P3: Renderer Verification
- **Goal:** Confirm Canvas renderer honors geometry + styles.
- **Dependencies:**
  - `renderPaths2DPass` correctly decodes commands and applies styles.
- **Files:**
  - `src/editor/runtime/renderPassExecutors.ts`

