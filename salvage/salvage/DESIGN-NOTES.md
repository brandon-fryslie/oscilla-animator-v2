# Oscilla Design Notes

Salvaged concepts and designs worth keeping for the rewrite.

---

## Core Philosophy

> **Animations are not timelines. They are living systems observed over time.**

Looping is the organizing principle, not a feature. Time is unbounded - never wrap `t`. Looping emerges from the topology of signal flow.

---

## Type Hierarchy (Worlds)

| World | Evaluation | Description |
|-------|------------|-------------|
| **Scalar** | Compile-time | Constants, configuration. Evaluated once. |
| **Signal** | Per-frame | Time-indexed values `(t) => A`. Evaluated every frame. |
| **Field** | Per-element, lazy | `(i, n) => A`. Evaluated only at render sinks. |
| **Event** | Edge-triggered | Discrete triggers. Edge detection on signal changes. |

Key insight: **Fields are lazy.** They're recipes, not materialized arrays. Only render sinks force evaluation.

---

## Capability System

Blocks have capabilities that restrict what they can do:

| Capability | Description | Examples |
|------------|-------------|----------|
| `pure` | No side effects, no state, no authority | Oscillator, AddSignal, FieldMap |
| `time` | Creates the time axis (exactly one per patch) | , InfiniteTimeRoot |
| `identity` | Creates domains (per-element identity spaces) | DomainN, GridDomain, SVGSampleDomain |
| `state` | Allocates mutable state | Integrate, History, PulseDivider, EnvelopeAD |
| `render` | Emits render trees (final output) | RenderInstances2D, RenderPaths2D |
| `io` | External resources, side effects | TextSource, ImageSource, DebugDisplay |

Pure blocks are the default. Kernel primitives (non-pure) are on an allowlist.

---

## Block Catalog (77 blocks)

### Time (2)
- `InfiniteTimeRoot` - Unbounded looping time with period

### Domain/Identity (3)
- `DomainN` - N elements with auto-generated IDs
- `GridDomain` - 2D grid of elements with positions
- `SVGSampleDomain` - Sample points from SVG paths

### Signal Generators (4)
- `Oscillator` - Waveforms (sine, cosine, triangle, saw) from phase
- `Shaper` - Shape signals (tanh, sigmoid, smoothstep, power)
- `ColorLFO` - Generate color from phase (hue rotation)
- `ViewportInfo` - Viewport dimensions as signals

### Signal Math (6)
- `AddSignal` - Add two signals
- `MulSignal` - Multiply two signals
- `MinSignal` - Minimum of two signals
- `MaxSignal` - Maximum of two signals
- `ClampSignal` - Clamp signal to range
- `BroadcastSignalColor` - Broadcast signal as color

### Rhythm/State (2)
- `PulseDivider` - Divide phase into pulses
- `EnvelopeAD` - Attack-decay envelope from trigger

### Field Generators (5)
- `FieldConstNumber` - Constant number field
- `FieldConstColor` - Constant color field
- `FieldFromExpression` - Field from JS expression
- `FieldHash01ById` - Deterministic hash per element
- `FieldHueGradient` - Hue gradient across elements

### Field Transforms (8)
- `FieldMapNumber` - Map function over number field
- `FieldMapVec2` - Map function over vec2 field
- `FieldZipNumber` - Combine two number fields
- `FieldZipSignal` - Combine signal with field
- `FieldAddVec2` - Add vec2 fields
- `JitterFieldVec2` - Add noise to vec2 field
- `FieldColorize` - Apply color to field
- `FieldOpacity` - Apply opacity to field

### Field Converters (3)
- `FieldStringToColor` - Parse color strings
- `FieldFromSignalBroadcast` - Broadcast signal to all elements
- `StableIdHash` - Hash element ID to number

### Position Generators (3)
- `PositionMapGrid` - Grid layout
- `PositionMapCircle` - Circular layout
- `PositionMapLine` - Linear layout

### Render Sinks (3)
- `RenderInstances2D` - Render circles/shapes
- `RenderPaths2D` - Render SVG paths
- `Render2dCanvas` - Raw canvas access

### Debug (1)
- `DebugDisplay` - Show values in UI

### Default Source Providers (13)
Hidden blocks for undriven inputs:
- `DSConstSignal*` (Float, Int, Color, Point, Phase, Time)
- `DSConstField*` (Float, Vec2, Color)
- `DSConstScalar*` (Float, Int, String, Waveform)

### Macros (16)
Composites that expand to block networks:
- `rainbow` - Rainbow color cycling grid
- `breathing` - Pulsing opacity
- `wave` - Wave propagation
- `spiral` - Spiral motion
- `orbit` - Orbital motion
- `stagger` - Staggered timing
- `trails` - Motion trails
- `constellation` - Starfield
- `flicker` - Random flickering
- `elastic` - Springy motion
- `bloom` - Glow effect
- `flocking` - Boid-like behavior
- `particleSystem` - Particle effects
- `slice*Demo` (1-8) - Tutorial slices

---

## Key Design Decisions

### 1. No Math.random() at Runtime
All randomness is seeded at compile time. This enables:
- Deterministic replay
- Scrubbing without artifacts
- Testable animations

### 2. Exactly One TimeRoot per Patch
Time authority is singular. No conflicting time sources.

### 3. Fields are Lazy
Never prematerialize fields. They're evaluated at render sinks only. This enables:
- Infinite element counts (in theory)
- Composition without allocation

### 4. Buses for Implicit Connections
Named buses (like `phaseA`, `energy`) allow blocks to communicate without explicit wires:
- Publishers write to buses
- Subscribers read from buses
- Combine mode handles multiple publishers

### 5. Default Sources are Blocks
Every undriven input gets a hidden provider block. This means:
- All values flow through the graph
- No special-casing for "parameters vs inputs"
- Users can swap constants for oscillators

### 6. World Mismatches are Compile Errors
Signal can't flow to Field input. Scalar can't flow to Signal. Caught at compile time.

---

## Invariants (Non-Negotiable)

1. **Player time is unbounded** - Never wrap `t`. Looping is topological.
2. **No `Math.random()` at runtime** - Seed all randomness at compile.
3. **Fields are lazy** - Evaluate only at render sinks.
4. **Exactly one TimeRoot per patch** - Compile error otherwise.
5. **World/domain mismatches are compile errors** - Not runtime.
6. **Pure blocks cannot allocate state** - Only kernel primitives can.

---

## Bus System

Standard buses:
- `phaseA` - Primary phase signal [0, 1]
- `phaseB`, `phaseC` - Additional phase channels
- `energy` - Global intensity/energy level
- `trigger` - Discrete trigger events

Blocks can auto-subscribe: `autoBusSubscriptions: { phase: 'phaseA' }`

---

## Scrub Policy (State Blocks)

How state blocks behave during timeline scrubbing:
- `hold` - Freeze at current value (most common)
- `reset` - Reset to initial value
- `interpolate` - Attempt to interpolate
- `recompute` - Recompute from t=0 (expensive)

---

## Port Types

Ports have:
- `id` - Unique within block
- `label` - Human-readable name
- `type` - TypeDesc (world + domain)
- `tier` - `primary` (always visible) or `secondary` (collapsed by default)
- `defaultSource` - What to use when unconnected
- `optional` - Whether connection is required

---

## What Worked

1. **TypeDesc with world/domain** - Clean type hierarchy
2. **Capability allowlist** - Prevents capability creep
3. **Seeded randomness** - Deterministic, scrubbable
4. **Buses** - Implicit connections reduce wiring
5. **Lazy fields** - Composition without allocation
6. **Macros** - User-defined composites

## What Didn't Work

1. **Block definitions in 3 places** - Drift, confusion
2. **params vs defaultSource** - Never fully resolved
3. **Multiple type representations** - SlotType, IRTypeDesc, TypeDesc
4. **GraphNormalizer ignoring the attachment system** - Dead code
5. **DSConst blocks with inputs** - Infinite regress
6. **Optional fields everywhere** - Should be required with explicit defaults
