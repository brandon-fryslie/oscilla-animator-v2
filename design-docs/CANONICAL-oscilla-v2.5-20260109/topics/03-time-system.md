---
parent: ../INDEX.md
topic: time-system
order: 3
---

# Time System

> Time is the heartbeat of Oscilla. Everything flows from the single time authority.

**Related Topics**: [02-block-system](./02-block-system.md), [05-runtime](./05-runtime.md)
**Key Terms**: [TimeRoot](../GLOSSARY.md#timeroot), [Rail](../GLOSSARY.md#rail), [tMs](../GLOSSARY.md#tms)
**Relevant Invariants**: [I1](../INVARIANTS.md#i1-time-is-monotonic-and-unbounded), [I2](../INVARIANTS.md#i2-transport-continuity-across-hot-swap), [I5](../INVARIANTS.md#i5-single-time-authority)

---

## Overview

Oscilla is a **looping, interactive visual instrument**. Time is not a timeline with a beginning and end - it's a continuous flow that never stops. The time system provides:

1. **Single time authority** - One source of truth for time
2. **Monotonic time** - Never wraps, resets, or clamps
3. **Phase rails** - Convenient cyclic values for animation
4. **Hot-swap continuity** - Recompilation doesn't reset time

---

## Time Invariants

### Invariant: Time is Monotonic and Unbounded

`tMs` never wraps, resets, or clamps. Time always increases.

**Rationale**: Monotonic time is required for:
- Deterministic phase calculations
- Accurate replay
- State continuity

### Invariant: Single Time Authority

One authority produces time; everything else derives.

**No competing loops**: There are no "player loops" competing with patch loops. The TimeRoot is the single source of time for the entire patch.

### Invariant: Transport Continuity

When recompiling (hot-swap), `tMs` continues. Derived rails continue unless explicitly reset.

**Rationale**: Live editing must feel responsive, not like restarting.

---

## TimeRoot Block

The single authoritative time source. Exactly one per patch. **System-managed** - not user-placeable.

### TimeRoot Outputs

| Output | Cardinality | Temporality | Payload | Description |
|--------|-------------|-------------|---------|-------------|
| `tMs` | one | continuous | int | Monotonic time in milliseconds |
| `dt` | one | continuous | float | Delta time since last frame (ms) |
| `phaseA` | one | continuous | phase | Primary phase (0..1) |
| `phaseB` | one | continuous | phase | Secondary phase (0..1) |
| `pulse` | one | discrete | unit | Frame tick trigger |
| `palette` | one | continuous | color | Default color atmosphere (HSV rainbow) |
| `energy` | one | continuous | float | Animation intensity (0..1, audio-reactive ready) |

### TimeRoot Kinds

Only one TimeRoot kind exists:

| Kind | Description                | `progress` Output |
|------|----------------------------|-------------------|
| `infinite` | Runs forever               | Constant 0 |

Note: finite timeroot was removed from spec. 

### TimeRoot SignalTypes (v2.5)

```typescript
const tMsType: SignalType = {
  payload: 'int',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};

const phaseType: SignalType = {
  payload: 'float',
  unit: 'phase01',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};

const pulseType: SignalType = {
  payload: 'unit',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'discrete' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};

const dtType: SignalType = {
  payload: 'float',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};

const paletteType: SignalType = {
  payload: 'color',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};

const energyType: SignalType = {
  payload: 'float',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'one' } },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};
```

---

## Rails

Rails are immutable system-provided buses. They cannot be deleted or renamed.

### MVP Rails

| Rail | Output Type | Source |
|------|-------------|--------|
| `time` | `one + continuous + int` | TimeRoot.tMs |
| `phaseA` | `one + continuous + phase` | TimeRoot.phaseA |
| `phaseB` | `one + continuous + phase` | TimeRoot.phaseB |
| `pulse` | `one + discrete + unit` | TimeRoot.pulse |
| `palette` | `one + continuous + color` | System color reference |

### Rails Are Blocks

Rails are derived blocks with role:
```typescript
{
  kind: 'derived',
  meta: { kind: 'rail', target: { kind: 'bus', busId: 'time' } }
}
```

**Important**: Rails can have inputs overridden and be driven by feedback like any other block. They are not read-only.

### Palette Rail

The `palette` rail is the **chromatic reference frame** - a time-indexed color signal that provides the default color atmosphere for a patch.

- Exists whether or not the patch references it
- Default value is a smooth color cycle
- Can be overridden by connecting to it
- Used as default source for color inputs

---

## Phase System

### Phase as PayloadType

Phase is `float` with `unit: 'phase01'`:

```typescript
type PayloadType = 'float' | 'int' | 'vec2' | 'vec3' | 'color' | 'bool' | 'unit' | 'shape2d';
```

### Phase Wrap Semantics

Phase values are always in the range [0, 1) with automatic wrap:
- `0.9 + 0.2 = 0.1` (wrapped)
- `1.0 → 0.0` (normalized)
- `-0.1 → 0.9` (wrapped)

### Phase Arithmetic Rules

| Operation | Result | Notes |
|-----------|--------|-------|
| `phase + float` | `phase` | Offset (with wrap) |
| `phase * float` | `phase` | Scale (with wrap) |
| `phase + phase` | **TYPE ERROR** | Invalid! |
| `phase - phase` | `float` | Distance (unwrapped) |

### Phase Continuity

When changing speed/period, phase must be matched to avoid discontinuities:

```
new_phase = old_phase + (new_speed - old_speed) * elapsed_time
```

This is the "phase continuity / retiming" requirement from the core laws.

---

## Phase Unwrap

For operations that need the actual phase distance (not wrapped), explicit unwrap is required:

### PhaseToFloat

```typescript
// Unwrap phase to float in [0, 1)
function PhaseToFloat(p: phase): float {
  return p.value;
}
```

### FloatToPhase

```typescript
// Wrap float to phase in [0, 1)
function FloatToPhase(f: float): phase {
  return { value: f - Math.floor(f) };
}
```

### Phase Distance

```typescript
// Signed distance between phases (shortest path)
function PhaseDistance(a: phase, b: phase): float {
  const diff = b.value - a.value;
  if (diff > 0.5) return diff - 1.0;
  if (diff < -0.5) return diff + 1.0;
  return diff;
}
```

---

## Time Variables

### tMs

Simulation time in milliseconds.

- **Type**: `int`
- **SignalType**: `one + continuous + int`
- **Monotonic**: Always increasing
- **Unbounded**: Never wraps

### dt

Delta time since last frame in milliseconds.

- **Type**: `float`
- **SignalType**: `one + continuous + float`
- **Semantics**: Time elapsed since previous frame
- **Use case**: Frame-rate independent animation, physics integration

### phaseA / phaseB

Primary and secondary phase rails:

- **Type**: `phase`
- **SignalType**: `one + continuous + phase`
- **Range**: [0, 1)
- **Semantics**: Cyclic, wrapping

### pulse

Frame tick trigger:

- **Type**: `unit`
- **SignalType**: `one + discrete + unit`
- **Semantics**: Event fires every frame

### palette

Default color atmosphere for the patch.

- **Type**: `color`
- **SignalType**: `one + continuous + color`
- **Default**: HSV rainbow cycling with phaseA (hue = phaseA, saturation = 1.0, value = 0.5)
- **Semantics**: Provides ambient color reference; can be overridden

### energy

Animation intensity signal (audio-reactive ready).

- **Type**: `float`
- **SignalType**: `one + continuous + float`
- **Range**: [0, 1]
- **Default**: Sine wave derived from phaseA (0.5 + 0.5 * sin(phaseA * 2π))
- **Semantics**: Overall animation "energy" level; designed for future audio reactivity

---

## Hot-Swap Behavior

### Preserved Across Hot-Swap

- `tMs` continues unchanged
- All rail values continue
- State cells (if StateId matches)

### Reset on Hot-Swap

- State cells with changed StateId
- Caches (invalidated and rebuilt)

### Atomic Swap

Old program renders until new program is ready. Swap is atomic. No flicker or blank frames during compile/swap.

---

## Per-Lane Time (Future)

v0 keeps time rails as `one` signals. If per-lane phase is needed later:

```typescript
// Per-lane phasor (NOT a separate concept of "field time")
const perLanePhasor: SignalType = {
  payload: 'float',
  unit: 'phase01',
  extent: {
    cardinality: { kind: 'instantiated', value: { kind: 'many', domain: domainRef } },
    temporality: { kind: 'instantiated', value: { kind: 'continuous' } },
    binding: { kind: 'default' },
    perspective: { kind: 'default' },
    branch: { kind: 'default' },
  }
};
```

This is expressed by composing a `many(domain)` phasor inside the field loop - there is no separate concept of "field time." This avoids conflating time and domain.

---

## Scheduling Model

### One Tick Model (v0)

Every tick (render frame):

1. Sample external inputs (UI, MIDI-like controls)
2. Update time rails (`tMs`, `phaseA`, `phaseB`, `progress`)
3. Execute continuous subgraph
4. Apply discrete events occurring in this tick
5. Produce render outputs

### Continuous Values

A value with `temporality = continuous` exists every tick:
- Scalars (`one`): compute once per tick
- Fields (`many(domain)`): compute by looping lanes

### Discrete Values (Events)

A value with `temporality = discrete` exists as a set of occurrences per tick:
- `one + discrete`: single event stream per tick
- `many(domain) + discrete`: per-lane event stream

---

## Event Payload

Events carry structured data:

```typescript
interface EventPayload {
  key: string;
  value: float | int;
}
```

- **Versioned**: Schema can evolve
- **No optional fields**: Required structure
- **No `any` types**: Strictly typed
- **Block interpretation**: Blocks interpret events as they see fit

---

## Determinism

### No Math.random() at Runtime

All randomness is seeded and deterministic. Given:
- Patch revision
- Seed
- External inputs record

Output is identical (replay is exact).

### Order-Dependent Combine is Deterministic

Writer ordering is stable and explicit. Events are ordered deterministically.

---

## See Also

- [02-block-system](./02-block-system.md) - TimeRoot and rail blocks
- [05-runtime](./05-runtime.md) - Execution model
- [Glossary: TimeRoot](../GLOSSARY.md#timeroot)
- [Glossary: Rail](../GLOSSARY.md#rail)
- [Invariant: I1](../INVARIANTS.md#i1-time-is-monotonic-and-unbounded)
