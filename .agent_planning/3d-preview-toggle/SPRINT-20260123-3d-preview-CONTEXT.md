# Implementation Context: 3d-preview-toggle

**Sprint:** 3d-preview-toggle
**Generated:** 2026-01-23

## Architecture Overview

The 3D preview is a **viewer-only transform** applied between `executeFrame()` and `renderFrame()`. It does not touch compilation, IR, or runtime state.

```
executeFrame() → RenderFrameIR (position: vec2, stride 2)
       ↓
applyViewerProjection() ← only when camera.isActive
       ↓
RenderFrameIR (screenPosition: vec2 stride 2, screenRadius, depth, visible added)
       ↓
renderFrame() → uses screenPosition if present, else position
```

## File Locations & Integration Points

### New Files

| File | Purpose |
|------|---------|
| `src/stores/CameraStore.ts` | MobX store: isShiftHeld, isToggled, isActive |
| `src/render/viewerProjection.ts` | vec2→vec3 promotion + projectInstances call |

### Modified Files

| File | Location | Change |
|------|----------|--------|
| `src/stores/RootStore.ts` | constructor | Add `camera: CameraStore` |
| `src/main.ts` | ~line 1054 | After executeFrame, call applyViewerProjection |
| `src/main.ts` | init section | Add keydown/keyup listeners for Shift |
| `src/render/Canvas2DRenderer.ts` | ~line 179-181 | Use screenPosition/screenRadius when present |
| `src/render/SVGRenderer.ts` | ~line 228-229 | Use screenPosition/screenRadius when present |
| `src/ui/components/app/Toolbar.tsx` | ~line 169 | Add 3D toggle button in action buttons |

## Key Code Patterns

### CameraStore Pattern (follows DebugStore/PlaybackStore)
```typescript
import { makeAutoObservable, computed } from 'mobx';

export class CameraStore {
  isShiftHeld = false;
  isToggled = false;

  constructor() {
    makeAutoObservable(this, {
      isActive: computed,
    });
  }

  get isActive(): boolean {
    return this.isShiftHeld || this.isToggled;
  }

  setShiftHeld(held: boolean): void { this.isShiftHeld = held; }
  toggle(): void { this.isToggled = !this.isToggled; }
}
```

### Viewer Projection (uses existing projectInstances)
```typescript
import { projectInstances, type CameraParams } from '../runtime/RenderAssembler';
import type { RenderFrameIR } from '../runtime/ScheduleExecutor';

export function applyViewerProjection(frame: RenderFrameIR, camera: CameraParams): void {
  for (const pass of frame.passes) {
    const pos2d = pass.position as Float32Array;
    const count = pass.count;

    // Promote vec2 → vec3 (z=0)
    const worldPos3 = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      worldPos3[i * 3]     = pos2d[i * 2];
      worldPos3[i * 3 + 1] = pos2d[i * 2 + 1];
      // worldPos3[i * 3 + 2] = 0; // already 0 from Float32Array init
    }

    const projection = projectInstances(worldPos3, pass.scale, count, camera);
    pass.screenPosition = projection.screenPosition;
    pass.screenRadius = projection.screenRadius;
    pass.depth = projection.depth;
    pass.visible = projection.visible;
  }
}
```

### Renderer Change Pattern (Canvas2DRenderer)
```typescript
// Before the instance loop (line ~178):
const useScreenSpace = !!pass.screenPosition;
const posSource = useScreenSpace ? pass.screenPosition! : position;
const perInstanceRadius = useScreenSpace ? pass.screenRadius : undefined;

// In the loop (line ~180):
const x = posSource[i * 2] * width;
const y = posSource[i * 2 + 1] * height;

// For sizing:
const sizePx = perInstanceRadius
  ? perInstanceRadius[i] * Math.min(width, height)
  : scale * Math.min(width, height);
```

### main.ts Wiring (line ~1054)
```typescript
import { PERSP_CAMERA_DEFAULTS } from './projection/perspective-kernel';
import { applyViewerProjection } from './render/viewerProjection';
import type { CameraParams } from './runtime/RenderAssembler';

// After executeFrame:
const frame = executeFrame(currentProgram, currentState, pool, tMs);

if (store!.camera.isActive) {
  const camera: CameraParams = {
    mode: 'perspective',
    params: PERSP_CAMERA_DEFAULTS,
  };
  applyViewerProjection(frame, camera);
}
```

### Shift Key Listener (in init section of main.ts)
```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Shift') store!.camera.setShiftHeld(true);
};
const handleKeyUp = (e: KeyboardEvent) => {
  if (e.key === 'Shift') store!.camera.setShiftHeld(false);
};
window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
```

### Toolbar Button (in action buttons Group)
```tsx
<Tooltip label="3D Preview (hold Shift)" position="bottom" withArrow>
  <Button
    variant={store.camera.isActive ? 'gradient' : 'subtle'}
    gradient={{ from: 'violet', to: 'grape', deg: 90 }}
    color="gray"
    size="xs"
    onClick={() => store.camera.toggle()}
    styles={{
      root: {
        border: store.camera.isActive
          ? 'none'
          : '1px solid rgba(139, 92, 246, 0.2)',
      },
    }}
  >
    3D
  </Button>
</Tooltip>
```

## Dependencies & Imports

### Projection Kernel (already exists, no changes)
- `src/projection/perspective-kernel.ts` — `PERSP_CAMERA_DEFAULTS`, `PerspectiveCameraParams`
- `src/runtime/RenderAssembler.ts` — `projectInstances()`, `CameraParams` type

### Camera Defaults (from spec)
- `tiltAngle = 35°` → `camPos ≈ (0.94, 1.15, 1.64)` via `deriveCamPos()`
- `camTarget = (0.5, 0.5, 0.0)`
- `fovY = 45°` (in radians: ~0.785)
- `near = 0.01`, `far = 100.0`

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Performance: vec2→vec3 copy each frame | Float32Array init is fast; 5000 elements = 60KB copy |
| screenRadius interpretation | Use `radius * min(width,height)` for pixel conversion |
| Shift key stuck (window blur) | Add blur listener to reset isShiftHeld |
| Toolbar needs store access | Pass store via React context or prop drilling |
