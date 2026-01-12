# Paths2D Pipeline Completion Plan (IR-Only)

This document is a detailed, step-by-step plan to finish the Paths2D render pipeline using the new IR compiler only. It is written to be executable by a junior engineer without internet access. It includes parallelizable workstreams and precise file targets.

**Scope:**
- End-to-end IR-only Paths2D pipeline: editor blocks → IR lowering → schedule → runtime materialization → renderer.
- No legacy/closure compiler support.

**Non-goals:**
- Do not add fallbacks or defaults beyond existing defaultSources.
- Do not touch old renderer or legacy compiler paths.
- Do not introduce network or external dependencies.

---

## Workstreams Overview (Parallelizable)

**Workstream A — Editor & Block Definitions**
- Define UI-level blocks for Path generation (Field<path>) and rendering.

**Workstream B — IR Lowering & Compiler Wiring**
- Implement lowering for path blocks (Field<path> generation, Path transforms, and RenderPaths2D).
- Ensure schedule builder emits materializePath steps and correct slots.

**Workstream C — Runtime Path Field Evaluation**
- Implement evaluation for Field<path> operations (map/zip/transform/broadcast/inputSlot) and materialization.

**Workstream D — Renderer Integration & Validation**
- Verify Paths2D pass assembly and Canvas draw are correct and match IR expectations.

You can work on A/B/C/D in parallel; they should converge on consistent data structures and types.

---

## Workstream A — Editor & Block Definitions

### A1) Add UI block definitions for Path primitives
**Goal:** Provide blocks that output `Field<path>` so users can wire into RenderPaths2D.

**Files:**
- `src/editor/blocks/domain.ts`
- `src/editor/blocks/field-primitives.ts` (if appropriate for domain/field primitives)

**Actions:**
1. Define a **PathConst** block:
   - Inputs: none (or optional config for a PathExpr JSON)
   - Outputs: `Field<path>`
   - defaultSource should provide a simple path (e.g. rectangle or triangle)
   - This should emit a const path per element unless otherwise configured.
2. Define a **PathFromPoints** block (optional but recommended):
   - Inputs: `Field<vec2>` points, optional `Signal<number>` closed? or config
   - Outputs: `Field<path>`
   - This creates a path with `M` then repeated `L` and optional `Z`.
3. Define a **PathTransform2D** block (if transforms are implemented in Workstream C):
   - Inputs: `Field<path>` + `Signal<number>` translate/rotate/scale or config
   - Outputs: `Field<path>`

**Notes:**
- Keep defaultSource values simple and deterministic.
- Use existing `createBlock` helper and match the style of `RenderInstances2D`/`FieldMapNumber` blocks.

### A2) Ensure RenderPaths2D is in the palette
**Goal:** Make RenderPaths2D visible to users.

**Files:**
- `src/editor/blocks/domain.ts` (already added)
- `src/editor/blocks/registry.ts` (uses exports from `domain.ts`)

**Check:**
- Confirm `RenderPaths2D` appears in the block list via `domain.ts` export.

---

## Workstream B — IR Lowering & Compiler Wiring

### B1) Add compiler block for RenderPaths2D (IR-only)
**Goal:** Ensure IR lowering emits a `paths2d` sink with required inputs.

**Files:**
- `src/editor/compiler/blocks/domain/RenderPaths2D.ts` (already created)
- `src/editor/compiler/blocks/domain/index.ts`
- `src/editor/compiler/blocks/index.ts`

**Check:**
- The IR lowering must map inputs to slots:
  - `domain` → domain slot
  - `paths` → field slot
  - `fillColor`, `strokeColor`, `strokeWidth` → field slots
  - `opacity` → signal slot
- Legacy compile should throw (IR-only).

### B2) Add compiler blocks for Path primitives
**Goal:** Lower `Field<path>` blocks to IR nodes.

**Files:**
- `src/editor/compiler/blocks/domain/PathConst.ts` (new)
- `src/editor/compiler/blocks/domain/PathFromPoints.ts` (new, optional)
- `src/editor/compiler/blocks/domain/index.ts`

**Actions:**
1. **PathConst** lowering:
   - Use `ctx.b.fieldConst(pathExpr, { world: 'field', domain: 'path' })`.
2. **PathFromPoints** lowering (optional):
   - This requires a field op or kernel for path construction (Workstream C).
   - If not implemented, throw a clear error in lowering indicating dependency.

### B3) Ensure schedule builder handles `paths2d` sinks
**Goal:** The schedule emits materializePath steps, sets path buffer slots, and builds PathBatch entries.

**Files:**
- `src/editor/compiler/ir/buildSchedule.ts`

**Check:**
- `processPaths2DSink` should:
  - Register `pathExprSlot` with `{ kind: 'fieldExpr', exprId: <id> }` in `initialSlotValues`.
  - Emit `materializePath` step.
  - Allocate `cmdStart`, `cmdLen`, `pointStart`, `pointLen` slots.
  - Materialize styles (color/width/opacity) from field slots if provided.

### B4) Ensure defaultSource values are lowered for path fields
**Goal:** If a `Field<path>` input has defaultSource, the compiler should create a `fieldConst`.

**Files:**
- `src/editor/compiler/passes/pass8-link-resolution.ts`

**Actions:**
- Confirm `createDefaultRef` handles `Field:Path` (it does via valueKindToTypeDesc + fieldConst).
- If path defaultSource is a JSON object, it should be emitted into const pool.

---

## Workstream C — Runtime Path Field Evaluation

### C1) Define PathExpr runtime format
**Goal:** Standardize the runtime representation for `Field<path>` values.

**Suggested type:**
```ts
interface PathExpr {
  commands: Array<
    | { kind: 'M'; x: number; y: number }
    | { kind: 'L'; x: number; y: number }
    | { kind: 'Q'; cx: number; cy: number; x: number; y: number }
    | { kind: 'C'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
    | { kind: 'Z' }
  >;
}
```

**Files:**
- `src/editor/runtime/executor/steps/executeMaterializePath.ts` (already uses this shape)
- `src/editor/runtime/field/types.ts` (optional type alias)

### C2) Implement `Field<path>` ops in runtime field system
**Goal:** Allow `Field<path>` expressions to be evaluated, not only const.

**Files:**
- `src/editor/runtime/field/types.ts`
- `src/editor/runtime/field/FieldHandle.ts`
- `src/editor/runtime/field/Materializer.ts`
- `src/editor/compiler/ir/opcodes.ts` (if using opcodes)

**Actions:**
1. Add **path-specific FieldOp** entries if needed (e.g., `PathTransform2D`, `PathTranslate`, `PathScale`).
2. Extend `FieldHandle` evaluation to support new ops for `type.domain === 'path'`.
3. Extend `materialize()` to apply ops to each element’s path:
   - For `map`: apply a pure transform to every PathExpr.
   - For `zip`: combine paths if needed (e.g., interpolate between two paths).
   - For `transform`: apply TransformChain semantics to PathExprs (if needed).
   - For `broadcast`: allow signal → path if a spec exists; otherwise block with explicit error.

**Minimum viable path ops:**
- `PathTranslate` (offset x/y)
- `PathScale` (scale around origin)
- `PathRotate` (around origin)
- `PathMorph` or `PathLerp` (optional, for blending two paths)

**If ops are not implemented yet, add explicit errors** to indicate missing dependency.

### C3) Update `executeMaterializePath` to evaluate non-const field exprs
**Goal:** The `fieldExpr` handle should evaluate to PathExpr/PathExpr[] by traversing field IR.

**Files:**
- `src/editor/runtime/executor/steps/executeMaterializePath.ts`

**Actions:**
1. Replace the current const-only resolution with evaluation logic that:
   - Reads program field IR node
   - Evaluates a field handle to PathExpr/PathExpr[] via materializer or a dedicated path evaluator
2. If no evaluator exists, throw a clear error mentioning missing path ops.

---

## Workstream D — Renderer Integration & Validation

### D1) Validate RenderAssemble → Paths2D pass
**Goal:** RenderAssemble must build valid `Paths2DPassIR` using slots from the batch descriptor.

**Files:**
- `src/editor/runtime/executor/steps/executeRenderAssemble.ts`

**Checks:**
- `buildPathsPass` reads:
  - `cmdsSlot`: Uint16Array
  - `paramsSlot`: Float32Array
  - `cmdStartSlot/cmdLenSlot/pointStartSlot/pointLenSlot`: Uint32Array
- Style slots are scalar or buffers (u8 for colors, f32 for widths/opacity).
- Draw flags match available style slots.

### D2) Validate Canvas renderer implementation
**Goal:** The Canvas renderer can draw Paths2D with fill/stroke/dash.

**Files:**
- `src/editor/runtime/renderPassExecutors.ts`

**Checks:**
- Path decoding uses `PathEncodingIR` v1 semantics.
- `pathPointLen` is currently read but not used; confirm indexing logic is correct.
- Style attributes (fillColorRGBA, strokeColorRGBA, strokeWidth, opacity) are applied per path or scalar.

---

## Integration Milestones

### Milestone 1: Paths2D renders const paths
**Definition of Done:**
- RenderPaths2D block renders a const path with defaultSources only.
- Pipeline: block → IR → materializePath → renderPass → Canvas output.

### Milestone 2: Path fields support transforms
**Definition of Done:**
- Introduce at least one path transform op (e.g., PathTranslate), works per element.
- Can animate via signals if path op supports signal parameters.

### Milestone 3: Path morphing or blending
**Definition of Done:**
- Zip two Field<path> inputs (PathLerp) driven by Signal<number>.
- Paths re-materialize deterministically per frame.

---

## Testing & Debugging Guidance (No Tests)

- Use DevTools and inspect compiled IR:
  - Confirm `renderSinks` includes a `paths2d` sink.
  - Confirm `schedule.steps` includes `materializePath` with expected slots.
  - Confirm `RenderFrameIR` contains a `paths2d` pass.
- Use debug probes (if enabled) to inspect slot contents.

---

## Known Risk Areas

- **Type mismatches:** Path fields must be `world: 'field', domain: 'path'` end‑to‑end.
- **Buffer size heuristics:** `materializePath` must allocate enough command/point buffers. If not, extend capacity or add resizing.
- **Per‑path indexing:** Ensure `cmdStart/Len` and `pointStart/Len` match actual encoded output.
- **Unsupported ops:** Explicitly throw errors instead of silently falling back.

---

## Suggested Work Order

1. Workstream A (PathConst block) + B (PathConst compiler) → unlock end‑to‑end minimal rendering.
2. Workstream C (path ops) → unlock dynamic and procedural paths.
3. Workstream D validation → ensure correctness and performance.

---

## Appendix: Files to Touch Summary

- Editor blocks:
  - `src/editor/blocks/domain.ts`
  - `src/editor/blocks/field-primitives.ts`

- Compiler blocks:
  - `src/editor/compiler/blocks/domain/RenderPaths2D.ts`
  - `src/editor/compiler/blocks/domain/PathConst.ts` (new)
  - `src/editor/compiler/blocks/domain/PathFromPoints.ts` (new, optional)
  - `src/editor/compiler/blocks/domain/index.ts`
  - `src/editor/compiler/blocks/index.ts`

- Schedule/IR:
  - `src/editor/compiler/ir/buildSchedule.ts`

- Runtime:
  - `src/editor/runtime/executor/steps/executeMaterializePath.ts`
  - `src/editor/runtime/field/Materializer.ts`
  - `src/editor/runtime/field/FieldHandle.ts`
  - `src/editor/runtime/field/types.ts`
  - `src/editor/runtime/renderPassExecutors.ts`

