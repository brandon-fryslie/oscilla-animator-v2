# Transforms (Lens/Adapter Blocks)

## Core Principle

All transforms are blocks. The UI may show lens/adapter controls on wires or bus bindings, but GraphNormalization replaces those controls with explicit derived blocks in the graph.

Edges are pure connections; all transformation behavior is expressed by blocks.

## Terminology

- **Adapter block**: changes TypeDesc (world and/or domain) to make a connection legal.
- **Lens block**: type-preserving shaping for expressive control.

Both are derived blocks and are compiled like any other block.

Constraints:
- Adapter and lens steps are unary (one input, one output).
- Adapters are type-safe and deterministic.
- Lenses are type-preserving and deterministic.
- Neither adapters nor lenses may change domain identity; identity semantics are carried by domains and fields.

## Normalization Rules

The UI may expose two transform stacks per binding:

- **Adapter chain** (compatibility, may be auto-suggested by UI but must be explicit in the stored graph)
- **Lens stack** (user-authored shaping)

GraphNormalization expands these into a block chain with stable IDs derived from the original edge or binding.

Each transform step is unary (one input, one output). Any transform that needs additional inputs must be expressed as an explicit block in the graph and is not valid as a lens/adapter step.

## Transform Block Catalog

This catalog is derived from historical lens/adapter plans and is reconciled with the unified spec. It is the default set of transform blocks that the UI lens/adapter stacks map onto.

### Adapter Blocks (Type/World Changes)

These blocks change TypeDesc. They are legal only when explicitly present in the graph.

- **PhaseToNumber**: phase -> number (unwrap in [0,1) or configured range)
- **NumberToPhase**: number -> phase (wrap/normalize)
- **UnitToNumber**: unit -> number
- **NumberToUnit**: number -> unit (clamp or wrap based on policy)
- **PhaseToPulse**: phase -> event (wrap trigger)
- **SignalToFieldBroadcast**: signal<T> -> field<T> (requires Domain input; heavy)
- **FieldReduceSum / Mean / Min / Max**: field<T> -> signal<T> (heavy)

World-changing adapters that require extra inputs (for example, Signal->Field broadcast requiring a Domain) must be explicit blocks and are not valid inside a lens stack.

### Lens Blocks (Type-Preserving)

Lens blocks are available per domain and world (signal/field/scalar). The UI chooses the correct variant based on the port TypeDesc. Implementations may use a single parameterized block or per-world block types; behavior must be equivalent.

#### Numeric (number, unit)

- **GainBias** (scale + offset)
- **Polarity / Invert**
- **Clamp** (min, max)
- **MapRange** (inMin, inMax, outMin, outMax, clamp)
- **Ease** (curve: linear, smoothstep, expo, etc.)
- **Quantize** (step, mode: round/floor/ceil)
- **Deadzone** (width)
- **Softclip** (shape: tanh/sigmoid)
- **Wavefold** (fold amount)
- **Slew / Lag** (stateful; riseMs, fallMs)
- **Hysteresis** (stateful; low, high)
- **SampleHold** (stateful; holdMs)
- **Dither** (deterministic, optional)

#### Phase

Phase lenses must preserve phase semantics.

- **PhaseOffset** (offset in turns)
- **PhaseScale** (scale in turns)
- **PingPong** (triangle fold)
- **WrapMode** (wrap/clamp/pingpong)
- **PhaseQuantize** (steps per cycle)
- **PhaseWindow** (start, end, softness)
- **PhaseWarp** (curve: ease/power/skew)
- **PhaseJitter** (deterministic)

#### Vec2

- **Vec2GainBias** (scale + translate)
- **Rotate2D** (radians or turns)
- **Translate2D** (delta)
- **ClampBounds** (min, max)
- **Normalize**
- **ClampLength**
- **Swirl** (strength, center)
- **SmoothPath** (stateful smoothing)

#### Color

- **ColorGain** (brightness + alpha gain)
- **HueShift**
- **Saturate**
- **Contrast**
- **ClampGamut**
- **MixWith** (constant color mix)

#### Boolean

- **Invert**
- **Debounce** (stateful)
- **Hold** (stateful)

#### Event / Trigger

- **Debounce** (stateful)
- **PulseStretch** (stateful)
- **Divide** (every Nth pulse)
- **Delay** (stateful)
- **GateProbability** (deterministic)

## Determinism

Any transform that uses randomness must be deterministic and seeded (for example, phase jitter or dither). Runtime use of Math.random() is forbidden.
