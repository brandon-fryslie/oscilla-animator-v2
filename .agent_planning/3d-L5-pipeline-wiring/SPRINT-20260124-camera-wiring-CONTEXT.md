# Implementation Context: camera-wiring

## Files to Modify

### Production Code (1 file, 1 line)

**`src/runtime/ScheduleExecutor.ts`** — Line 291-295

Current:
```typescript
const assemblerContext: AssemblerContext = {
  signals,
  instances: instances as ReadonlyMap<string, InstanceDecl>,
  state,
};
```

Target:
```typescript
const assemblerContext: AssemblerContext = {
  signals,
  instances: instances as ReadonlyMap<string, InstanceDecl>,
  state,
  camera,
};
```

### Test Code (1 file, 1 test rewrite)

**`src/projection/__tests__/level5-assembler-projection.test.ts`** — Lines 215-268

Replace the spy-based ordering test with a real-pipeline test:
- Compile a patch (reuse the GridLayout+CircleShape+RenderSink pattern from tests above)
- Call `executeFrame(program, state, pool, tMs, orthoCamera)`
- Verify the returned RenderPassIR has populated screen-space fields
- Assert identity property (ortho + z=0 → screenPos === worldPos.xy, screenRadius === 0.03)

## Key Types

```typescript
// From RenderAssembler.ts
interface AssemblerContext {
  signals: readonly SigExpr[];
  instances: ReadonlyMap<string, InstanceDecl>;
  state: RuntimeState;
  camera?: CameraParams;  // Already defined, just not populated
}

// CameraParams (from projection kernels)
type CameraParams =
  | { mode: 'orthographic'; params: OrthoCameraDefaults }
  | { mode: 'perspective'; params: PerspCameraDefaults };
```

## Test Pattern Reference

The other two integration tests in the same file use this pattern:
1. Define block nodes (GridLayout, CircleShape, RenderSink)
2. Connect them via edges
3. Compile with `compile()`
4. Create RuntimeState and BufferPool
5. Call `executeFrame(program, state, pool, 0)`
6. Extract RenderPassIR from frame.passes[0]
7. Assert properties

The new test adds `orthoCamera` as the 5th argument and asserts screen-space fields.

## Existing Camera Constants

```typescript
// Already imported in test file
import { ORTHO_CAMERA_DEFAULTS } from '../../projection/projectionKernels';

const orthoCam: CameraParams = {
  mode: 'orthographic',
  params: ORTHO_CAMERA_DEFAULTS,
};
```
