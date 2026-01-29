# Implementation Context: Mouse Migration

Generated: 2026-01-25
Plan: SPRINT-20260125-mouse-migration-PLAN.md

## Key Files

### Files to Modify

| File | Change |
|------|--------|
| `src/services/AnimationLoop.ts` | Write mouse to channels, smoothing |
| `src/runtime/RuntimeState.ts` | Remove ExternalInputs, use ExternalChannelSystem |
| `src/runtime/SignalEvaluator.ts` | Verify generic channel read (done in Sprint 1) |
| App entry / Canvas setup | Add button and wheel event handlers |

### Files to Search for Mouse References

```bash
grep -r "mouseX\|mouseY\|mouseOver\|smoothX\|smoothY" src/
grep -r "ExternalInputs" src/
grep -r "updateSmoothing" src/
```

## Existing Patterns

### Current Mouse Handling (RuntimeState.ts lines 222-262)
```typescript
// TO BE REMOVED
export interface ExternalInputs {
  mouseX: number;
  mouseY: number;
  mouseOver: boolean;
  smoothX: number;
  smoothY: number;
}

export function createExternalInputs(): ExternalInputs {
  return {
    mouseX: 0.5,
    mouseY: 0.5,
    mouseOver: false,
    smoothX: 0.5,
    smoothY: 0.5,
  };
}

export function updateSmoothing(ext: ExternalInputs, lerpFactor: number = 0.05): void {
  ext.smoothX += (ext.mouseX - ext.smoothX) * lerpFactor;
  ext.smoothY += (ext.mouseY - ext.smoothY) * lerpFactor;
}
```

### Current Evaluator (SignalEvaluator.ts lines 175-181)
```typescript
// TO BE SIMPLIFIED (should already be done in Sprint 1)
case 'external': {
  const ext = expr as { which: 'mouseX' | 'mouseY' | 'mouseOver' };
  if (ext.which === 'mouseX') return state.external.smoothX;
  if (ext.which === 'mouseY') return state.external.smoothY;
  if (ext.which === 'mouseOver') return state.external.mouseOver ? 1 : 0;
  throw new Error(`Unknown external signal: ${ext.which}`);
}
```

## Spec References

- design-docs/external-input/02-External-Input-Spec.md
  - Section 7.1: Mouse channel namespace
  - Section 8: Smoothing lives on write-side

## Code Snippets

### New Mouse Event Handlers in App Layer
```typescript
// Add to wherever canvas events are set up (likely main.ts or a React component)

interface MouseState {
  // Raw position (for events)
  rawX: number;
  rawY: number;
  // Smoothed position (for writing to channels)
  smoothX: number;
  smoothY: number;
  // Button state
  leftHeld: boolean;
  rightHeld: boolean;
  // Canvas reference for normalization
  canvas: HTMLCanvasElement | null;
}

const mouseState: MouseState = {
  rawX: 0.5,
  rawY: 0.5,
  smoothX: 0.5,
  smoothY: 0.5,
  leftHeld: false,
  rightHeld: false,
  canvas: null,
};

function normalizeMousePosition(e: MouseEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}

function setupMouseHandlers(canvas: HTMLCanvasElement, writeBus: ExternalWriteBus): void {
  mouseState.canvas = canvas;

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = normalizeMousePosition(e, canvas);
    mouseState.rawX = x;
    mouseState.rawY = y;
  });

  canvas.addEventListener('mouseenter', () => {
    writeBus.set('mouse.over', 1);
  });

  canvas.addEventListener('mouseleave', () => {
    writeBus.set('mouse.over', 0);
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left button
      mouseState.leftHeld = true;
      writeBus.pulse('mouse.button.left.down');
      writeBus.set('mouse.button.left.held', 1);
    } else if (e.button === 2) { // Right button
      mouseState.rightHeld = true;
      writeBus.pulse('mouse.button.right.down');
      writeBus.set('mouse.button.right.held', 1);
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      mouseState.leftHeld = false;
      writeBus.pulse('mouse.button.left.up');
      writeBus.set('mouse.button.left.held', 0);
    } else if (e.button === 2) {
      mouseState.rightHeld = false;
      writeBus.pulse('mouse.button.right.up');
      writeBus.set('mouse.button.right.held', 0);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    // Normalize wheel delta (browsers report different units)
    // deltaMode: 0 = pixels, 1 = lines, 2 = pages
    let dx = e.deltaX;
    let dy = e.deltaY;
    if (e.deltaMode === 1) { // lines
      dx *= 20;
      dy *= 20;
    } else if (e.deltaMode === 2) { // pages
      dx *= 400;
      dy *= 400;
    }
    // Scale to reasonable range (divide by canvas size for normalization)
    dx /= canvas.width;
    dy /= canvas.height;

    writeBus.add('mouse.wheel.dx', dx);
    writeBus.add('mouse.wheel.dy', dy);
  });

  // Prevent context menu on right click
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
```

### Frame Update with Smoothing
```typescript
// Called each frame before executeFrame()
function updateMouseChannels(writeBus: ExternalWriteBus, lerpFactor: number = 0.05): void {
  // Apply smoothing
  mouseState.smoothX += (mouseState.rawX - mouseState.smoothX) * lerpFactor;
  mouseState.smoothY += (mouseState.rawY - mouseState.smoothY) * lerpFactor;

  // Write smoothed position to channels
  writeBus.set('mouse.x', mouseState.smoothX);
  writeBus.set('mouse.y', mouseState.smoothY);
}
```

### Updated RuntimeState (after migration)
```typescript
// src/runtime/RuntimeState.ts

// REMOVED: ExternalInputs interface
// REMOVED: createExternalInputs() function
// REMOVED: updateSmoothing() function

// SessionState.external is now ExternalChannelSystem
export interface SessionState {
  timeState: TimeState;
  external: ExternalChannelSystem;  // Was: ExternalInputs
  health: HealthMetrics;
  continuity: ContinuityState;
  continuityConfig: ContinuityConfig;
  tap?: DebugTap;
}

export function createSessionState(): SessionState {
  return {
    timeState: createTimeState(),
    external: new ExternalChannelSystem(),  // Was: createExternalInputs()
    health: createHealthMetrics(),
    continuity: createContinuityState(),
    continuityConfig: createContinuityConfig(),
  };
}
```

### Updated AnimationLoop Integration
```typescript
// src/services/AnimationLoop.ts

export function executeAnimationFrame(
  tMs: number,
  deps: AnimationLoopDeps,
  state: AnimationLoopState
): void {
  const currentState = deps.getCurrentState();
  if (!currentState) return;

  // Update mouse channels (smoothing + write)
  updateMouseChannels(currentState.external.writeBus);

  // Frame delta recording...
  recordFrameDelta(currentState, tMs);

  // Execute frame (commit happens inside executeFrame)
  const frame = executeFrame(currentProgram, currentState, pool, tMs);

  // ... render ...
}
```

## Migration Notes

### Gradual Migration Strategy

If needed for safety, can do gradual migration:

1. **Phase A**: Add channel writes alongside old system
   - Keep ExternalInputs
   - Write to both ExternalInputs AND writeBus
   - Evaluator still uses old path

2. **Phase B**: Switch evaluator to channels
   - Evaluator reads from snapshot
   - Old writes can be removed

3. **Phase C**: Remove old system
   - Delete ExternalInputs
   - Delete updateSmoothing
   - Full migration complete

### Testing Strategy

1. Before any changes, record baseline behavior (screenshot/video)
2. After each phase, compare visually
3. Run existing tests at each phase
4. Add new tests for button/wheel channels

### Finding All Mouse References

```bash
# Find all files referencing mouse state
grep -rn "external\." src/ | grep -E "mouseX|mouseY|mouseOver|smoothX|smoothY"

# Find updateSmoothing calls
grep -rn "updateSmoothing" src/

# Find ExternalInputs type usage
grep -rn "ExternalInputs" src/
```
