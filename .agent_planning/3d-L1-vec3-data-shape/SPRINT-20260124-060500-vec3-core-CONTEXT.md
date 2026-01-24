# Implementation Context: vec3-core

## Files to Modify

| File | Change |
|------|--------|
| `src/core/canonical-types.ts` (or `src/types/index.ts`) | Add `'vec3'` to PayloadType |
| `src/runtime/BufferPool.ts` | Add `'vec3f32'` format, allocation |
| `src/runtime/FieldKernels.ts` | Layout kernels → stride-3 |
| `src/runtime/Materializer.ts` | Position intrinsic → vec3, broadcast → vec3 |
| `src/runtime/RenderAssembler.ts` | extractInstanceBuffers → stride-3 |
| Block lowering files (TBD) | Position type → vec3 |

## Files to Create/Update (Tests)

| File | What |
|------|------|
| `src/projection/__tests__/level1-vec3-data.test.ts` | Update integration test (checkbox 9) to use real pipeline |

## Key Code Locations

### PayloadType definition
Search for `PayloadType` in types — likely a union of string literals.

### BufferPool (src/runtime/BufferPool.ts)
- `BufferFormat` type: line 21
- `getBufferFormat()`: line 30
- `allocateBuffer()`: line 165

### FieldKernels layout kernels (src/runtime/FieldKernels.ts)
- `circleLayout`: line 453
- `lineLayout`: line 563
- `gridLayout`: line 591

### Materializer (src/runtime/Materializer.ts)
- `fillBufferIntrinsic()` — position case
- Broadcast case: line 303

### RenderAssembler (src/runtime/RenderAssembler.ts)
- `extractInstanceBuffers()`: line ~580
- Contiguous subarray: line 590
- Non-contiguous copy: lines 596-604

### Block Lowering
- Search for blocks that emit position fields (GridLayout, CircleLayout, LineLayout blocks)
- These are in `src/blocks/` — likely `layout-blocks.ts` or similar

## Existing Tests to Verify

```bash
npm run test                                          # Full suite
npx vitest run src/projection/__tests__/level1-*     # L1 projection tests
npx vitest run src/runtime/__tests__/                # Runtime tests
npx vitest run src/__tests__/steel-thread*           # Steel thread integration
```

## Architecture Constraints

1. **vec2 must remain** — scale2, control points, and other non-position vec2 fields still exist
2. **Position fields specifically** become vec3 — not all vec2 fields
3. **z=0.0 explicitly written** — per DoD hints, don't rely on Float32Array zero-init
4. **Kernels remain pure** — no state, no imports from runtime
5. **RenderAssembler already handles vec3** — projectInstances path at line 186 already works
6. **Renderers unchanged** — they use screenPosition (stride-2) from projection
