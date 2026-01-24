# Definition of Done: vec3-core

## Acceptance Criteria

### Type System
- [ ] `PayloadType` union includes `'vec3'`
- [ ] `BufferFormat` union includes `'vec3f32'`
- [ ] `getBufferFormat('vec3')` → `'vec3f32'`
- [ ] `allocateBuffer('vec3f32', N)` → `new Float32Array(N * 3)`

### Layout Kernels (FieldKernels.ts)
- [ ] `gridLayout` writes stride-3 (x, y, z=0.0)
- [ ] `circleLayout` writes stride-3 (x, y, z=0.0)
- [ ] `lineLayout` writes stride-3 (x, y, z=0.0)
- [ ] z is written EXPLICITLY to 0.0 (not relying on zero-initialization)

### Position Construction
- [ ] `makeVec2` still works for non-position vec2 fields (scale2, etc.)
- [ ] Position-producing paths use vec3 output
- [ ] Materializer broadcast handles vec3 (fills x, y, z)

### Position Intrinsic
- [ ] `fillBufferIntrinsic('position', ...)` produces stride-3 Float32Array
- [ ] All layout types (grid, circular, linear, unordered) produce z=0.0

### RenderAssembler
- [ ] `extractInstanceBuffers` handles stride-3 positions
- [ ] Contiguous slice: `subarray(start * 3, (start + N) * 3)`
- [ ] Non-contiguous copy: stride-3 copy loop

### Block Lowering
- [ ] Position-producing field expressions have type `{ payload: 'vec3' }`
- [ ] Layout blocks emit vec3 type for their position output

### Integration (INVARIANT)
- [ ] `executeFrame()` with a compiled GridLayout patch produces stride-3 Float32Array
- [ ] Position buffer has length === `instanceCount * 3`
- [ ] All z values === 0.0 (exact equality)
- [ ] All x, y values are finite
- [ ] Buffer is produced by Materializer (not manually constructed)

### No Regressions
- [ ] All existing tests pass (npm run test)
- [ ] Existing projection module tests pass
- [ ] App renders correctly (visual verification via Chrome DevTools if applicable)
