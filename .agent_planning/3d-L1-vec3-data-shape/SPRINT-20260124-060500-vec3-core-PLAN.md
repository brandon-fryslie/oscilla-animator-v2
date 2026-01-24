# Sprint: vec3-core - Position Fields to Stride-3

Generated: 2026-01-24T06:05:00
Confidence: HIGH: 5, MEDIUM: 1, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Change the core runtime pipeline so that position fields are `Float32Array` with stride 3 (vec3),
layout kernels write explicit z=0.0, and `executeFrame()` produces stride-3 position buffers
via the Materializer.

## Scope

**Deliverables:**
1. `vec3` payload type and buffer format support
2. Layout kernels produce stride-3 output
3. Position-constructing field expressions produce vec3
4. Integration test through real `executeFrame()` pipeline
5. All existing tests still pass (no regressions)

## Work Items

### P0: Add vec3 to type system and buffer pool

**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] `PayloadType` includes `'vec3'` (in canonical-types or types/index.ts)
- [ ] `BufferFormat` includes `'vec3f32'`
- [ ] `getBufferFormat('vec3')` returns `'vec3f32'`
- [ ] `allocateBuffer('vec3f32', N)` returns `Float32Array(N * 3)`

**Technical Notes:**
- `src/core/canonical-types.ts` or `src/types/index.ts` — add to PayloadType union
- `src/runtime/BufferPool.ts` — add to BufferFormat, getBufferFormat switch, allocateBuffer switch

### P1: Update layout kernels to stride-3

**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] `gridLayout` writes `outArr[i*3+0]`, `outArr[i*3+1]`, `outArr[i*3+2]=0.0`
- [ ] `circleLayout` writes stride-3 with z=0.0
- [ ] `lineLayout` writes stride-3 with z=0.0
- [ ] Output buffer is vec3f32 sized (N*3 floats)

**Technical Notes:**
- `src/runtime/FieldKernels.ts` — update all three layout kernels
- Must write z=0.0 EXPLICITLY (not rely on zero-initialization) per DoD hints
- The projection module's `layout-kernels.ts` already has the correct stride-3 logic;
  runtime kernels should match

### P2: Update position construction (makeVec2 → makeVec3 or add z)

**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] Position fields constructed from (x, y) components produce vec3 with z=0.0
- [ ] The `makeVec2` kernel either becomes `makeVec3` or a separate path handles position assembly
- [ ] Position broadcast (scalar→vec3) fills all 3 components

**Technical Notes:**
- `makeVec2` in FieldKernels.ts combines two float fields into vec2
- For positions, we need vec3 output. Options:
  A) Rename to makeVec3, write z=0 (breaks non-position vec2 uses if any)
  B) Keep makeVec2 for non-position uses, add makeVec3 for positions
  C) Add a separate `promoteVec2ToVec3` step
- Need to check if `makeVec2` is used for non-position fields (scale2 uses it? probably not)
- Materializer broadcast case (line 303) must handle vec3

### P3: Update position intrinsic to vec3

**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] `fillBufferIntrinsic('position', ...)` produces stride-3 Float32Array with z=0.0
- [ ] Instance layout types (grid, circular, linear) all produce vec3

**Technical Notes:**
- `src/runtime/Materializer.ts` — fillBufferIntrinsic position case
- Must verify the intrinsic type in block lowering emits `{ payload: 'vec3' }` not `'vec2'`

### P4: Update RenderAssembler buffer extraction

**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] `extractInstanceBuffers` handles stride-3 position correctly
- [ ] Contiguous subarray slicing uses stride-3 offset
- [ ] Non-contiguous copy loop uses stride-3

**Technical Notes:**
- `src/runtime/RenderAssembler.ts` lines 588-609 — `extractInstanceBuffers`
- Line 590: `subarray(start * 2, ...)` → `subarray(start * 3, ...)`
- Line 596: `new Float32Array(N * 2)` → `new Float32Array(N * 3)`
- Lines 603-604: copy loop stride 2 → stride 3

### P5: Integration test through executeFrame

**Confidence: MEDIUM**

**Acceptance Criteria:**
- [ ] Test compiles a minimal patch (Layout → RenderSink) using `compile()`
- [ ] Test runs `executeFrame()` on the compiled program
- [ ] Position buffer in resulting RenderPassIR is Float32Array with stride 3
- [ ] Position values are finite and z === 0.0 for all instances
- [ ] Test exercises the REAL Materializer path (not projection module helpers)

**Technical Notes:**
- Must use `buildPatch()` and `compile()` to create a real CompiledProgramIR
- Must use `createRuntimeState()`, `BufferPool`, and `executeFrame()`
- Check `frame.passes[0].position.length === N * 3`
- Verify z values are exactly 0.0
- This is the INVARIANT test — most important deliverable

#### Unknowns to Resolve (MEDIUM confidence)
- Block lowering for GridLayout/CircleLayout currently emits vec2 type. Need to verify
  exactly where the type annotation is set and change it to vec3.
- Need to verify that all blocks that produce position fields (not just layouts) are updated.

#### Exit Criteria
- Confidence raises to HIGH once block lowering code is confirmed to set vec3 type
  for position-producing expressions.

## Dependencies

- No external dependencies
- Existing projection module tests (level1-vec3-data.test.ts) must continue to pass
- Existing steel-thread tests may need position stride updates

## Risks

1. **Blast radius**: Changing position stride from 2→3 affects every consumer.
   Mitigated by: RenderAssembler already handles vec3, renderers use screenPosition.
2. **Block lowering**: Must verify all position-producing blocks emit vec3 type.
   Mitigated by: search for all vec2 position references in block lowering code.
3. **Non-position vec2 fields**: scale2, control points, etc. still need vec2.
   Mitigated by: only change position-specific paths, not the vec2 format itself.
