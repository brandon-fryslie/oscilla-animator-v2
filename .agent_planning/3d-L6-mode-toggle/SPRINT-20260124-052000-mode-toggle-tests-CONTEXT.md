# Implementation Context: mode-toggle-tests
Generated: 2026-01-24T05:20:00

## Key Files

### Source (already implemented — no changes needed)
- `src/runtime/RenderAssembler.ts` — ProjectionMode type (L56), CameraParams (L61-63), projectInstances (L92-117)
- `src/runtime/ScheduleExecutor.ts` — executeFrame (L195-200) accepts camera as argument
- `src/projection/ortho-kernel.ts` — ORTHO_CAMERA_DEFAULTS
- `src/projection/perspective-kernel.ts` — PERSP_CAMERA_DEFAULTS

### Test File to Create
- `src/projection/__tests__/level6-mode-toggle.test.ts`

### Reference Tests (patterns to follow)
- `src/projection/__tests__/level5-assembler-projection.test.ts` — uses real compile + executeFrame

## Architecture Context

Camera flows as a pure argument:
```
executeFrame(program, state, pool, tAbsMs, camera)
  → assemblerContext = { signals, instances, state, camera }
  → assembleRenderPass(step, assemblerContext)
    → projectInstances(worldPos, radius, count, camera)
      → if (camera.mode === 'orthographic') { orthoKernel } else { perspKernel }
```

**Critical invariant**: `program` (CompiledProgramIR) is never mutated by executeFrame. It's read-only schedule data. `state` (RuntimeState) is mutated by signal evaluation and materialization, but NOT by projection. Projection produces NEW output buffers.

## CameraParams Construction

```typescript
import { ORTHO_CAMERA_DEFAULTS } from '../projection/ortho-kernel';
import { PERSP_CAMERA_DEFAULTS } from '../projection/perspective-kernel';
import type { CameraParams } from '../runtime/RenderAssembler';

const orthoCamera: CameraParams = { mode: 'orthographic', params: ORTHO_CAMERA_DEFAULTS };
const perspCamera: CameraParams = { mode: 'perspective', params: PERSP_CAMERA_DEFAULTS };
```

## How to Get Off-Center Instances at Non-Zero Z
Use the same compile approach as Level 5 tests (compile a real patch with GridLayout), then verify the world positions have z components. If positions are all z=0 (default for 2D layouts), the perspective projection will still differ from ortho (because perspective divides by viewZ which is `camPos.z - worldPos.z`).

For the sine-modulated test, either:
1. Use a time-varying signal that modulates z (if the compiler supports it)
2. Or manually write z values into the position buffer each frame (simpler, still proves world-space is unaffected by camera)

Option 2 is more practical — it directly tests the invariant without needing complex compilation support.

## Bitwise Comparison Strategy
For Float32Array bitwise equality:
```typescript
// Byte-level comparison
const bytesA = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const bytesB = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
expect(bytesA).toEqual(bytesB);

// Or just use .toEqual on Float32Arrays (vitest handles typed arrays)
expect(a).toEqual(b);
```
