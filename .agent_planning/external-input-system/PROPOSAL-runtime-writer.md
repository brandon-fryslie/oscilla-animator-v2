# External Input System: Runtime Writer Proposals

## Context

The external input infrastructure is partially built:
- `ExternalInputs` interface exists in `RuntimeState.ts:187-202` (mouse fields)
- `state.external` is part of `SessionState` (persists across recompiles)
- `SignalEvaluator.ts:175-182` handles `kind: 'external'` signal expressions
- **Nobody writes the values.** The fields exist but are never updated.

The question: **who writes `state.external.*` each frame, and what is the shape of that system?**

---

## Option A: InputSampler Module Called by executeFrame

### Concept

A dedicated `InputSampler` module owns the sampling step. `executeFrame` calls it as its first action. Input sources are registered as closures that return the current value.

### Implementation

```typescript
// src/runtime/InputSampler.ts
export type InputSource = () => number;
export type InputSourceMap = ReadonlyMap<string, InputSource>;

export function sampleInputs(
  state: RuntimeState,
  sources: InputSourceMap
): void {
  for (const [name, source] of sources) {
    state.external.channels.set(name, source());
  }
}

// src/runtime/ScheduleExecutor.ts (executeFrame)
export function executeFrame(
  program: CompiledProgramIR,
  state: RuntimeState,
  pool: BufferPool,
  tAbsMs: number,
  inputSources?: InputSourceMap,  // replaces `camera?: CameraParams`
): RenderFrameIR {
  // Step 1: Sample inputs (spec: "Sample external inputs")
  if (inputSources) {
    sampleInputs(state, inputSources);
  }
  // Step 2: Resolve time...
}

// src/main.ts (registration, done once)
const inputSources = new Map<string, InputSource>([
  ['camera.isActive', () => store!.camera.isActive ? 1 : 0],
  ['mouse.x', () => lastMouseX],
  ['mouse.y', () => lastMouseY],
]);

// In animate loop:
const frame = executeFrame(program, state, pool, tMs, inputSources);
```

### SignalEvaluator Change

```typescript
case 'external': {
  const ext = expr as { which: string };
  const value = state.external.channels.get(ext.which);
  if (value === undefined) return 0; // unconnected channel
  return value;
}
```

### Pros

- **Matches spec exactly**: "Step 1: Sample inputs" is a named phase in executeFrame
- **Testable**: InputSampler is a pure function, easy to unit test
- **Source closures are flexible**: Can read from DOM, MobX, WebMIDI, Web Audio — anything
- **No coupling**: executeFrame doesn't know what the sources are, just that they're `() => number`
- **Registration is explicit**: You see exactly what inputs exist

### Cons

- **Another parameter to executeFrame**: The signature is growing (`program, state, pool, t, sources`)
- **Closures capture scope**: Sources registered in main.ts close over `store`, DOM state, etc. — implicit dependencies
- **Channel names are stringly-typed**: `'camera.isActive'` is just a string, typos compile fine
- **Map allocation per-frame?** No — the map is created once and reused. But the closures are called every frame regardless of whether the channel is used.

### Complexity: Low-Medium

---

## Option B: state.external Written Directly Before executeFrame

### Concept

The animate loop (or whatever owns the frame) writes directly to `state.external.*` fields before calling `executeFrame`. No abstraction layer.

### Implementation

```typescript
// src/runtime/RuntimeState.ts
export interface ExternalInputs {
  mouseX: number;
  mouseY: number;
  mouseOver: boolean;
  smoothX: number;
  smoothY: number;
  cameraActive: boolean;  // ADD
  // Future: midiCC: Float32Array, audioRMS: number, etc.
}

// src/main.ts animate loop:
function animate(tMs: number) {
  // Step 1: Sample inputs (manual)
  currentState.external.mouseX = lastMouseX;
  currentState.external.mouseY = lastMouseY;
  currentState.external.cameraActive = store!.camera.isActive;

  // Step 2: Execute
  const frame = executeFrame(currentProgram, currentState, pool, tMs);
}
```

### SignalEvaluator Change

```typescript
case 'external': {
  const ext = expr as { which: string };
  switch (ext.which) {
    case 'mouseX': return state.external.smoothX;
    case 'mouseY': return state.external.smoothY;
    case 'mouseOver': return state.external.mouseOver ? 1 : 0;
    case 'cameraActive': return state.external.cameraActive ? 1 : 0;
    default: throw new Error(`Unknown external: ${ext.which}`);
  }
}
```

### Pros

- **Dead simple**: No abstractions, no closures, no registries
- **Fully explicit**: Reading the animate loop tells you exactly what happens
- **Type-safe**: ExternalInputs is a typed interface, typos are compile errors
- **Zero overhead**: Direct property writes, no map lookups

### Cons

- **Every new input requires touching main.ts AND RuntimeState.ts AND SignalEvaluator.ts**: Three files for every new external input (violates Single Enforcer)
- **Hardcoded switch in evaluator**: Not extensible without code changes
- **main.ts grows**: The animate loop accumulates more and more sampling logic
- **ExternalInputs interface explodes**: Every possible MIDI CC, every audio band, every button — all declared statically?
- **Doesn't scale to dynamic inputs**: What if you plug in a MIDI controller with 128 CCs? Can't declare 128 fields.

### Complexity: Very Low (but doesn't scale)

---

## Option C: ExternalInputRegistry with Push Semantics

### Concept

A registry object holds current values. Event handlers push updates when things change. executeFrame reads the registry snapshot at frame start.

### Implementation

```typescript
// src/runtime/ExternalInputRegistry.ts
export class ExternalInputRegistry {
  private values = new Map<string, number>();

  /** Called by event handlers when input changes */
  set(channel: string, value: number): void {
    this.values.set(channel, value);
  }

  /** Called once per frame by executeFrame to snapshot into state */
  sampleInto(state: RuntimeState): void {
    for (const [name, value] of this.values) {
      state.external.channels.set(name, value);
    }
  }

  /** Get current value (for UI display, debugging) */
  get(channel: string): number {
    return this.values.get(channel) ?? 0;
  }
}

// src/main.ts (setup, once)
const inputs = new ExternalInputRegistry();

// Event handlers push values (fire-and-forget)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') inputs.set('camera.isActive', 1);
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') inputs.set('camera.isActive', 0);
});
canvas.addEventListener('mousemove', (e) => {
  inputs.set('mouse.x', e.offsetX / canvas.width);
  inputs.set('mouse.y', e.offsetY / canvas.height);
});

// In animate loop:
function animate(tMs: number) {
  inputs.sampleInto(currentState);  // Snapshot at frame boundary
  const frame = executeFrame(program, state, pool, tMs);
}
```

### Pros

- **Push semantics match DOM events**: Keyboard, mouse, MIDI events fire asynchronously. Registry absorbs them. Frame boundary reads the latest.
- **Decoupled producers**: Any code can call `inputs.set()` without knowing about the frame loop
- **Dynamic**: New channels appear automatically, no interface changes
- **Single snapshot point**: All inputs are sampled atomically at frame start
- **Debuggable**: Registry can log changes, show all active channels in UI

### Cons

- **Mutable shared state**: The registry is a mutable singleton that multiple event handlers write to concurrently (safe because JS is single-threaded, but conceptually messy)
- **Stringly-typed channels**: Same as Option A
- **Registry lifecycle**: Who creates it? Where does it live? If it's on RootStore, that's another store. If it's standalone, it's a floating singleton.
- **Not compile-time verifiable**: No way to know at compile time if a channel will actually be written by anyone

### Complexity: Medium

---

## Option D: Channels on RuntimeState (Map<string, number>)

### Concept

Replace the `ExternalInputs` interface with a simple `Map<string, number>`. Blocks reference channels by name. Any code can write to the map at any time. Maximum flexibility.

### Implementation

```typescript
// src/runtime/RuntimeState.ts
export interface SessionState {
  // ...
  /** External input channels: name → current value */
  externalChannels: Map<string, number>;
}

export function createSessionState(): SessionState {
  return {
    // ...
    externalChannels: new Map(),
  };
}

// src/runtime/SignalEvaluator.ts
case 'external': {
  const ext = expr as { which: string };
  return state.externalChannels.get(ext.which) ?? 0;
}

// src/main.ts (anywhere, anytime)
currentState.externalChannels.set('camera.isActive', store!.camera.isActive ? 1 : 0);
currentState.externalChannels.set('mouse.x', normalizedX);

// Or from event handlers:
window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') currentState.externalChannels.set('camera.isActive', 1);
});
```

### IRBuilder + Block

```typescript
// src/compiler/ir/IRBuilderImpl.ts
sigExternal(channel: string, type: SignalType): SigId {
  return this.addSigExpr({ kind: 'external', which: channel, type });
}

// src/blocks/external-blocks.ts
registerBlock({
  type: 'ExternalInput',
  capability: 'io',
  inputs: {
    channel: { type: signalType('float'), value: 'mouse.x', exposedAsPort: false },
  },
  outputs: {
    value: { type: signalType('float') },
  },
  lower: ({ ctx, config }) => {
    const channel = config?.channel as string;
    const sig = ctx.b.sigExternal(channel, signalType('float'));
    return { outputsById: { value: { k: 'sig', id: sig, slot: ctx.b.allocSlot() } } };
  },
});
```

### Pros

- **Minimum ceremony**: It's just a Map. Write to it, read from it.
- **Fully dynamic**: 128 MIDI CCs? Just `state.externalChannels.set('midi.cc.42', value)`. No interface changes ever.
- **No additional types or modules**: RuntimeState already has the map, evaluator already has the case
- **Matches the time system pattern**: `state.time.*` ↔ `state.externalChannels.get(name)`
- **Hot-swap safe**: Channels persist in SessionState, survive recompiles
- **ExternalInput block is trivial**: Just calls `sigExternal(channelName)`

### Cons

- **No typing on channel values**: Everything is `number`. Boolean is 0/1, vec2 is two channels ('mouse.x', 'mouse.y'). No way to express vec2 as a single channel.
- **Stringly-typed**: Channel names are strings. Typo in the block config = silent zero.
- **No write discipline**: Any code anywhere can write any channel anytime. No clear "sampling point". Could lead to mid-frame writes.
- **No discoverability**: What channels are available? Nothing tells you unless you grep the codebase.
- **Ordering concern**: If event handlers write directly to the map during a frame (between two signal evaluations), you get inconsistent reads within a single frame.

### Mitigation for ordering concern

Add a simple double-buffer:
```typescript
// Write to staging, read from committed
state.externalChannels.stage('camera.isActive', 1); // Anytime
state.externalChannels.commit(); // Once at frame start, atomically swaps
state.externalChannels.get('camera.isActive'); // Reads committed snapshot
```

### Complexity: Very Low (but needs discipline)

---

## Comparison Table

| Criterion | A: InputSampler | B: Direct Write | C: Registry | D: Channels Map |
|-----------|----------------|-----------------|-------------|-----------------|
| **Scales to 128 MIDI CCs** | ✓ closures | ✗ 128 fields | ✓ dynamic | ✓ dynamic |
| **Type-safe channel names** | ✗ strings | ✓ interface | ✗ strings | ✗ strings |
| **Single place to add input** | ✓ one closure | ✗ 3 files | ✓ one set() | ✓ one set() |
| **Compile-time verifiable** | ✗ | ✓ | ✗ | ✗ |
| **Frame-boundary atomicity** | ✓ sampled in executeFrame | ⚠️ manual | ✓ sampleInto() | ⚠️ needs commit() |
| **Testability** | ✓ pure function | ✓ direct | ✓ mock registry | ✓ pre-fill map |
| **Complexity** | Low-Medium | Very Low | Medium | Very Low |
| **Matches spec "Sample inputs"** | ✓ explicit step | ⚠️ implicit | ✓ explicit step | ⚠️ implicit |
| **Avoids mid-frame inconsistency** | ✓ | ✗ | ✓ | ⚠️ needs double-buffer |

---

## Recommendation

**Option D (Channels Map) with a commit step** is the sweet spot:

- Minimum code (it's literally just a Map on state that already exists conceptually)
- Maximum flexibility (MIDI, audio, mouse, camera, any future input)
- The commit step (double-buffer) prevents mid-frame inconsistency without the ceremony of a full Registry class
- The ExternalInput block is trivial to implement
- Channel names can be validated at compile time (the compiler can warn if a channel name isn't in a known set) without blocking unknown channels

The main risk (stringly-typed) is acceptable because:
1. The block config UI can provide a dropdown of known channels
2. Unknown channels return 0 (safe default, not a crash)
3. A lint pass can warn about orphaned channels (channels referenced but never written)

Option A is the runner-up if you want more ceremony and explicit sampling semantics.

---

## Impact on Camera

With Option D, the camera cleanup becomes:

```typescript
// main.ts animate loop (or an InputSampler if we want):
currentState.externalChannels.set('camera.isActive', store!.camera.isActive ? 1 : 0);

// CameraBlock (new block):
// Reads 'camera.isActive' via ExternalInput, produces CameraParams
// The assembler reads CameraParams from the render step, not from executeFrame args
```

The `camera?: CameraParams` parameter on `executeFrame` goes away entirely. Camera becomes a normal signal flow through the block graph.
