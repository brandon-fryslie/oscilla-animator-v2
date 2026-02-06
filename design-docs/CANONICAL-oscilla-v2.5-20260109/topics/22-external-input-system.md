---
parent: INDEX.md
tier: T2 (Structural)
---

# Topic 22: External Input System

> **Tier**: T2 (Structural)
> **Prerequisites**: [01-type-system](./01-type-system.md) (PayloadType, CanonicalType), [05-runtime](./05-runtime.md) (RuntimeState, frame execution)
> **Touchpoints**: Type System (I32), Runtime (frame boundary), IR (SigExpr), Blocks (ExternalInput), Diagnostics (W_UNKNOWN_CHANNEL)

## Overview

The External Input System provides a unified channel-based interface for MIDI, OSC, audio (FFT/RMS), keyboard, and mouse inputs. All external inputs are sampled once per frame into an immutable snapshot, read as pure signals during evaluation, with no device-specific logic in the IR or runtime.

**Core Principle**: External inputs are frame-boundary-committed channels with deterministic snapshot semantics.

---

## Invariants

### Frame-Boundary Commit

Once `commit()` is called at frame start, the ExternalChannelSnapshot is immutable for the entire frame. No mid-frame writes are visible to evaluation. (See [INVARIANTS.md I37](../INVARIANTS.md))

### Read-Only During Execution

The runtime only reads from the snapshot during frame execution. All writes go to a separate write-side staging structure that is swapped atomically at commit.

### Deterministic

Given the same input events and frame boundary, the snapshot is identical. Smoothing and filtering occur on the write side only, preserving determinism. (Aligns with I21)

---

## Architecture

### Two-Layer Model

**Write Side** → **Sampler/Aggregator** → **Read Side (Snapshot)**

```
┌─────────────────┐
│ ExternalWriteBus│  ← UI thread, audio thread, MIDI handler, OSC listener
│  - set()        │
│  - pulse()      │
│  - add()        │
└────────┬────────┘
         │ drain()
         ↓
┌─────────────────┐
│ Staging         │  ← Fold writes by channel kind
│  (per-channel)  │
└────────┬────────┘
         │ commit() → swap atomically
         ↓
┌─────────────────┐
│ ExternalChannel │  ← Immutable per-frame snapshot
│ Snapshot        │
│  - getFloat()   │
│  - getVec2()    │
└─────────────────┘
         ↑
         │ read during evaluation
         │
    Runtime (SigExpr { kind: 'external', which: string })
```

### Write-Side Operations

```typescript
class ExternalWriteBus {
  // For 'value' channels: last write wins
  set(name: string, v: number): void;

  // For 'pulse' channels: marks event occurred
  pulse(name: string): void;

  // For 'accum' channels: sum deltas
  add(name: string, dv: number): void;
}
```

### Read-Side API

```typescript
class ExternalChannelSnapshot {
  getFloat(name: string): number;       // returns 0 if absent
  getVec2(name: string): { x: number; y: number }; // returns {0,0} if absent
}
```

### Commit Algorithm

At frame start (in `executeFrame()`):
1. Drain write bus → list of WriteRecord
2. Apply records into staging according to each channel's ChannelKind
3. Swap staging into committed snapshot atomically
4. Clear pulse/accum channels in staging (preserve value channels)

---

## Channel Kinds

Each channel has a `ChannelKind` that defines how writes are folded into the snapshot:

| Kind | Semantics | Use Cases |
|------|-----------|-----------|
| `value` | Sample-and-hold, last write wins. Persists across frames. | mouse.x, mouse.y, MIDI CC, keyboard.axis.wasd.x |
| `pulse` | 1 for exactly one frame if any event occurred, then 0. | mouse.button.left.down, keyboard.key.space.down, MIDI noteOn |
| `accum` | Sums deltas/counts since last commit, then clears. | mouse.wheel.dy, scroll delta |
| `latch` | *(optional)* Holds nonzero until explicitly cleared. | Persistent state triggers |

**Clearing policy**:
- `value`: persists across frames until overwritten
- `pulse`: resets to 0 every commit
- `accum`: resets to 0 every commit
- `latch`: persists until explicit clear

---

## Channel Types

**Resolution (Q1)**: External channels use PayloadType with an allowed whitelist.

### Allowed Payloads

| PayloadType | Transport Encoding | Notes |
|-------------|-------------------|-------|
| `float` | IEEE 754 float | Primary scalar type |
| `int` | 32-bit signed int | Counts, indices, MIDI note numbers |
| `bool` | 0/1 as float | Encoded as float at transport, typed as bool in CanonicalType |
| `vec2` | {x: float, y: float} | mouse position, joystick |
| `vec3` | {x,y,z: float} | 3D input devices (future) |
| `color` | RGBA packed | Color pickers, palette inputs (future) |

### Forbidden Payloads

Handle types produce **compile error** if used with external channels:
- `shape2d`
- `shape3d`
- `cameraProjection`

**Rationale**: External channels transport numeric data, not geometry or projection handles. Aligns with I32 (Single Type Authority).

---

## Channel Registry

**Resolution (Q2)**: Hybrid registry — known channels + prefix rules + diagnostic for unknown.

### Registry Structure

```typescript
type ChannelDef = {
  name: string;              // exact channel name
  kind: ChannelKind;
  type: PayloadType;
  defaultValue?: number | {x:number,y:number};
};

type ChannelDefResolver = (name: string) => ChannelDef | null;
```

### Resolution Behavior

1. **Exact match**: Static registry for well-known channels
2. **Prefix match**: Family rules for dynamic channels (e.g., `audio.fft.bin.*`)
3. **Unknown channel**: Return `{kind: 'value', type: float}` default **AND** emit diagnostic `W_UNKNOWN_CHANNEL` once per patchRevision

**Rationale**: Provides flexibility while catching configuration errors early (typo detection).

### Diagnostic Example

```typescript
{
  code: 'W_UNKNOWN_CHANNEL',
  severity: 'warn',
  message: 'Unknown external channel "mous.x" (did you mean "mouse.x"?)',
  target: { kind: 'block', blockId: '...' },
  actions: [
    { kind: 'suggestChannel', suggestions: ['mouse.x', 'mouse.y'] }
  ]
}
```

---

## IR Integration

### SigExpr Variant

```typescript
type SigExpr =
  | ...
  | { kind: 'external'; which: string };
```

### IRBuilder API

```typescript
class IRBuilder {
  sigExternal(channel: string, type: CanonicalType): SigExprId;
}
```

**Lowering rule**: The type is for the compiler/type checker; runtime reads numeric. For vec2 channels, either:
- Encode vec2 as packed payload in signal layer (requires support), or
- Restrict sigExternal to scalars and use block-level packing (recommended initially)

### Evaluator Integration

```typescript
// In SignalEvaluator
case 'external':
  return state.externalSnapshot.getFloat(expr.which);
```

**No switch statements per device. Ever.**

---

## Block Surface

### ExternalInput (Scalar)

**Category**: io
**Capability**: io
**Cardinality**: preserve
**Payload**: float (or int/bool via whitelist)
**Config**: `channel: string`

**Lowering**:
```typescript
ctx.b.sigExternal(channel, canonicalType('float'))
```

### ExternalGate (Convenience)

**Config**: `channel: string`, `threshold: float` (default 0.5)
**Output**: bool (or float)

**Lowering**:
```typescript
const val = sigExternal(channel);
const gate = opcode('gt', [val, threshold]);
```

### ExternalVec2 (Convenience)

**Config**: `channelBase: string` (e.g., "mouse")
**Reads**: `channelBase + '.x'`, `channelBase + '.y'`
**Output**: vec2

**Lowering**:
```typescript
const x = sigExternal(channelBase + '.x');
const y = sigExternal(channelBase + '.y');
const vec = makeVec2(x, y);
```

**Rationale**: Prevents every user patch from manually wiring x/y.

---

## Canonical Namespace

### Mouse

| Channel | Kind | Type | Range |
|---------|------|------|-------|
| `mouse.x` | value | float | [0,1] |
| `mouse.y` | value | float | [0,1] |
| `mouse.over` | value | float | {0,1} |
| `mouse.button.left.down` | pulse | float | 1 or 0 |
| `mouse.button.left.up` | pulse | float | 1 or 0 |
| `mouse.button.right.down` | pulse | float | 1 or 0 |
| `mouse.button.right.up` | pulse | float | 1 or 0 |
| `mouse.wheel.dx` | accum | float | delta |
| `mouse.wheel.dy` | accum | float | delta |

### Keyboard

| Channel | Kind | Type | Range |
|---------|------|------|-------|
| `key.<code>.held` | value | float | {0,1} |
| `key.<code>.down` | pulse | float | 1 or 0 |
| `key.<code>.up` | pulse | float | 1 or 0 |
| `key.axis.wasd.x` | value | float | [-1,1] |
| `key.axis.wasd.y` | value | float | [-1,1] |

Examples: `key.space.down`, `key.arrowup.held`

### MIDI

| Channel | Kind | Type | Range |
|---------|------|------|-------|
| `midi.<dev>.ch<1-16>.cc.<0-127>` | value | float | [0,1] |
| `midi.<dev>.chN.note.<note>.on` | pulse | float | 1 or 0 |
| `midi.<dev>.chN.note.<note>.off` | pulse | float | 1 or 0 |
| `midi.<dev>.chN.note.<note>.gate` | value | float | {0,1} |
| `midi.<dev>.chN.note.<note>.vel` | value | float | [0,1] |
| `midi.<dev>.chN.pitchbend` | value | float | [-1,1] |

Examples: `midi.default.ch1.cc.74`, `midi.default.ch1.note.C4.gate`

### OSC

| Channel | Kind | Type | Notes |
|---------|------|------|-------|
| `osc.<path>` | value | float | Normalized by writer |
| `osc.<path>` | pulse | float | If messages are events |

Examples: `osc./1/fader1`, `osc./trigger`

**Canonicalization**: OSC paths may use dots instead of slashes: `osc.1.fader1`

### Audio / FFT

| Channel | Kind | Type | Range |
|---------|------|------|-------|
| `audio.rms` | value | float | [0,1] |
| `audio.fft.band.low` | value | float | [0,1] |
| `audio.fft.band.mid` | value | float | [0,1] |
| `audio.fft.band.high` | value | float | [0,1] |
| `audio.fft.bin.<0-511>` | value | float | [0,1] |
| `audio.onset` | pulse | float | 1 or 0 |

**Bin strategy**: Many named channels via naming (e.g., `audio.fft.bin.0` through `audio.fft.bin.511`) rather than arrays.

---

## Smoothing and Filtering

**All smoothing is write-side. The reader is pure.**

- UI thread maintains `mouseSmoothX/Y`
- Audio thread maintains smoothing and writes final channels
- MIDI smoothing (if any) done at write side

**Rationale**: Keeps evaluation deterministic and avoids "hidden state in reads." Aligns with I21 (Deterministic Replay).

---

## Roadmap (Phase-Based Implementation)

### Phase 0 — Lock the Contract (1–2 PRs)

**Goal**: Everyone agrees on what "external input" is in this system.

- Spec doc (authoritative): `docs/specs/external-input-channels.md`
- Frame boundary snapshot (commit-at-frame-start)
- Read-only during frame
- Unknown channel returns default (0 / zero vector)
- Channel kinds: value | pulse | accum (optionally latch)
- No device-specific switches in SignalEvaluator / IR
- Naming + namespaces: reserve canonical prefixes (mouse.*, key.*, midi.*, osc.*, audio.*)

**Deliverable**: merged spec + naming registry skeleton.

---

### Phase 1 — Minimal Infrastructure (2–4 PRs)

**Goal**: Runtime has a real channel system with deterministic sampling, even if only float channels exist at first.

- `ExternalWriteBus`
  - `set(name, v)` / `pulse(name)` / `add(name, dv)`
  - Internal queue of write records (simple, correct)
- `ExternalChannelSnapshot`
  - `getFloat(name): number`
  - Returns 0 if missing
- `ExternalChannelSystem`
  - Owns staging + committed + writeBus
  - `commit()` drains bus → folds into staging → swaps to committed
  - Clears pulse/accum each commit, preserves value channels
- `executeFrame()` calls `external.commit()` as first operation

**Deliverable**: Channels exist, deterministic, no block integration yet.

---

### Phase 2 — IR Support (1–2 PRs)

**Goal**: The compiler and runtime can express "read channel X" as a first-class signal.

- IR: add `SigExpr { kind:'external', which:string }`
- IRBuilder: `sigExternal(channel: string, type: CanonicalType)`
- SignalEvaluator: `external` case is a single line: `return state.external.snapshot.getFloat(expr.which)`

**Deliverable**: IR can represent external reads; runtime reads from snapshot only.

---

### Phase 3 — Block Surface (2–3 PRs)

**Goal**: Users can actually use it in patches without bespoke blocks per device.

- `ExternalInput` block
  - config-only `channel: string`
  - output `value: float`
  - `lower()` emits `sigExternal(channel)`
- Convenience blocks (only if they reduce patch boilerplate materially):
  - `ExternalGate(channel, threshold)` → float/bool
  - `ExternalLatch` (if you include latch semantics)
  - `ExternalVec2(channelBase)` (if you don't want users wiring x/y manually)

**Deliverable**: Complete end-to-end "write channel in app → read in patch".

---

### Phase 4 — Migrate Existing Hardcoded Externals (2–4 PRs)

**Goal**: Delete legacy "external inputs" fields and switches, replace with channels.

- Main/app layer writes:
  - `mouse.x`, `mouse.y`, `mouse.over` as value
  - `mouse.button.left.down/up` as pulse
  - `mouse.wheel.dy/dx` as accum
- Smoothing is write-side only
  - Keep `smoothX/smoothY` local to app loop
  - Stage the smoothed values into channels
- Remove:
  - Old ExternalInputs interface / `updateSmoothing()` in RuntimeState
  - Any evaluator switch statements for mouse

**Deliverable**: Mouse is 100% channelized and legacy code is gone.

---

### Phase 5 — Device Adapters (3–6 PRs)

**Goal**: External devices feed channels; patch surface stays generic.

- MIDI writer module:
  - CC → `midi.<dev>.chN.cc.K` normalized [0,1]
  - Note on/off → pulse channels
  - Gate/vel as value channels
- OSC writer module:
  - Map OSC address to canonical channel names (stable transform)
  - Numeric payload normalized at writer
- Add a lightweight "channel mapping config" file format:
  - JSON/YAML: input event → channel + scaling + clamp + smoothing
  - Hot-reload optional later

**Deliverable**: MIDI/OSC events appear as channels without compiler changes.

---

### Phase 6 — Audio Analysis Integration (3–8 PRs)

**Goal**: Audio/FFT becomes just another writer producing channels.

- Audio writer module:
  - `audio.rms`
  - `audio.fft.band.low/mid/high`
  - Optional `audio.fft.bin.N`
  - Optional `audio.onset` as pulse
- Decide bin strategy:
  - Either many named channels (`audio.fft.bin.0..511`)
  - Or a separate "FFTBuffer" system (only if you need high throughput; otherwise channels are fine)

**Deliverable**: Common audio-reactive workflows work through channels.

---

### Phase 7 — Type Tightening + Registry (2–5 PRs)

**Goal**: Avoid "stringly-typed" chaos while keeping flexibility.

- ChannelDefRegistry / resolver:
  - Define known channels and families (prefix match)
  - Specify kind + type + default
- Diagnostics:
  - Unknown channel read: warn once (dev builds)
  - Unknown channel write: warn once (optional)
  - Channel kind/type mismatch: warn or assert (dev builds)
- Optional optimization:
  - String → stable channel id table
  - Committed values in typed arrays for perf

**Deliverable**: Robust system with guardrails and predictable behavior.

---

### Phase 8 — Higher-Level UX (Later)

**Goal**: Non-engineers can wire devices without editing code.

- UI: "External Channels" panel
  - Live view of committed snapshot
  - Search + pin channels
  - "Learn" mode for MIDI/OSC
- UI: mapping editor
  - Bind an incoming event to a channel
  - Scaling/smoothing/curve
- Patch UX:
  - Autocomplete channel names in ExternalInput config

**Deliverable**: Full product-level usability.

---

## Related Topics

- [01-type-system](./01-type-system.md) - PayloadType whitelist, CanonicalType (I32)
- [04-compilation](./04-compilation.md) - SigExpr { kind: 'external' }
- [05-runtime](./05-runtime.md) - RuntimeState.externalSnapshot, executeFrame()
- [07-diagnostics-system](./07-diagnostics-system.md) - W_UNKNOWN_CHANNEL
- [INVARIANTS](../INVARIANTS.md) - I37 (External Inputs Are Snapshot-Immutable), I21 (Deterministic Replay), I8 (Slot-Addressed Execution)
- [GLOSSARY](../GLOSSARY.md) - ExternalChannelSnapshot, ExternalWriteBus, ChannelKind

---

## Source Documents

Integrated from:
- `design-docs/external-input/01-External-Input-High-Level.md`
- `design-docs/external-input/02-External-Input-Spec.md`
- `design-docs/external-input/03-External-Input-Roadmap-Phase-1.md`
- `design-docs/external-input/04-External-Input-Roadmap-Phase-2.md`

Resolutions:
- Q1: Use PayloadType with allowed whitelist (no separate ChannelType)
- Q2: Hybrid registry (static + prefix + diagnostic for unknown)
- Q3: T2 (Structural) tier classification
