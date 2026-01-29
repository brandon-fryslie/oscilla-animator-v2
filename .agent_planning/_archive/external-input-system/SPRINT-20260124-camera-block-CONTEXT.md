# Implementation Context: camera-block

## Files to Modify

### Block Registration

1. **`src/blocks/camera-block.ts`** (NEW)
   - Register `Camera` block
   - Inputs: isActive (port), projection, distance, tilt, yaw, fovY (config)
   - No outputs (render sink)
   - `lower()` emits camera declaration

### Compiler

2. **`src/compiler/ir/CompiledProgramIR.ts`** (or wherever program IR lives)
   - Add `cameraDecl?: CameraDeclIR` to CompiledProgramIR
   - Define `CameraDeclIR` interface

3. **`src/compiler/ir/IRBuilder.ts`** (interface)
   - Add method to declare camera (e.g., `declareCamera(slots: CameraDeclSlots): void`)

4. **`src/compiler/ir/IRBuilderImpl.ts`** (implementation)
   - Implement camera declaration

5. **`src/compiler/Compiler.ts`** (or schedule compilation)
   - Collect camera declaration from block lowering results
   - Attach to program IR

### Runtime

6. **`src/runtime/RenderAssembler.ts`**
   - Remove `camera?: CameraParams` from `AssemblerContext`
   - Add camera resolution from `program.cameraDecl`:
     ```typescript
     function resolveCameraFromProgram(
       program: CompiledProgramIR,
       state: RuntimeState
     ): CameraParams | undefined {
       if (!program.cameraDecl) return undefined;
       const isActive = readSlot(state, program.cameraDecl.isActiveSlot);
       if (isActive < 0.5) return undefined; // Not active
       // Read remaining slots, build CameraParams
       const projection = readSlot(state, program.cameraDecl.projectionSlot);
       const distance = readSlot(state, program.cameraDecl.distanceSlot);
       // ... etc
       return { mode: projection > 0.5 ? 'perspective' : 'orthographic', params: { ... } };
     }
     ```

7. **`src/runtime/ScheduleExecutor.ts`**
   - Remove `camera?: CameraParams` from `executeFrame` signature
   - Remove camera pass-through to assembler context
   - Assembler resolves camera internally from program

8. **`src/main.ts`**
   - Remove camera construction logic (`const camera: CameraParams | undefined = ...`)
   - Add: `currentState.externalChannels.stage('camera.isActive', store!.camera.isActive ? 1 : 0);`
   - Shift key handler: writes to channel map (already does via store, but verify flow)

### Default Program

9. **Default patch/layout** (wherever the default program is defined)
   - Include a Camera block node
   - Include an ExternalInput('camera.isActive') block node
   - Wire: ExternalInput.value → Camera.isActive

## Architecture: Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│ UI Layer                                                      │
│                                                               │
│ Shift key → store.camera.isShiftHeld                          │
│ Toolbar  → store.camera.isToggled                             │
│            ↓                                                  │
│ store.camera.isActive (computed: shift || toggled)             │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ main.ts animate loop                                          │
│                                                               │
│ state.externalChannels.stage('camera.isActive',               │
│   store.camera.isActive ? 1 : 0)                              │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ executeFrame                                                  │
│                                                               │
│ Step 1: state.externalChannels.commit()                       │
│ Step 2: resolveTime(...)                                      │
│ Step 3: Execute schedule (blocks run)                         │
│         ├─ ExternalInput('camera.isActive') → sigExternal()   │
│         │   → reads committed channel → outputs 0 or 1       │
│         └─ Camera block → reads isActive input               │
│              → writes CameraDeclIR slots                      │
│ Step 4: Assemble render                                       │
│         └─ RenderAssembler reads cameraDecl slots             │
│            → if isActive > 0.5: build CameraParams            │
│            → projectInstances(...)                            │
└──────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Camera Block is a Render Sink (No Outputs)

Unlike most blocks that produce signals for downstream wiring, Camera writes to a special program-level declaration. This is similar to how render blocks work — they produce render steps, not signals. Camera produces a camera declaration that the assembler consumes.

### isActive as Float (0/1), Not Boolean

The signal system deals in floats. `isActive` is a float where `< 0.5 = inactive`, `>= 0.5 = active`. This allows future animation of the value (smooth transitions, etc.).

### Camera Parameters are Config with Default Values

All camera parameters (distance, tilt, yaw, fovY, projection) start as config-only (`exposedAsPort: false`) with sensible defaults. Users can later expose them as ports to animate camera movement. The block works immediately with just `isActive` wired.

### Single Camera Block Per Program

If multiple Camera blocks exist, the compiler should warn and use the first encountered. This avoids undefined behavior with conflicting camera declarations.

## Slot Reading Pattern

The assembler needs to read signal slots after schedule execution:

```typescript
function readSlot(state: RuntimeState, slot: Slot): number {
  // Slots point into the signal value buffer
  return state.values.f64[slot.offset];
}
```

This pattern already exists for render step resolution — verify the exact accessor.
