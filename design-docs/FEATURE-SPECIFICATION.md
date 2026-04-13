# Oscilla Animator v2 — Feature Specification

## What Oscilla Is

Oscilla is a **looping, interactive visual instrument** compiled from a typed reactive graph. Users build procedural animations by connecting blocks in a node graph. The system compiles those graphs into GPU programs that execute at 120fps. The animation runs continuously and responds to time, user input, and external devices — and the user can edit the graph mid-playback without the animation ever stopping or glitching.

The fundamental promise: **editing a running visual instrument, not restarting a program.**

---

## Core User Experience

### 1. Graph Authoring

The user works in a **node-based patch editor** where they place blocks and connect them with wires. Each block performs one job — generate a shape, apply math, define a color, render to screen. The graph flows left-to-right: data sources on the left, visual output on the right.

The editor uses **automatic linear layout** — blocks are positioned algorithmically, not dragged by hand. The user navigates by selecting a block and the editor focuses on its upstream/downstream chain, dimming everything unrelated. At branch points, the user can **rotate perspective** (right-click) to follow a different path through the graph. This eliminates the "spaghetti graph" problem that plagues traditional node editors.

**Key interactions:**
- Click to select, arrow keys to traverse the chain
- Double-click to open block parameters
- Right-click at pivot blocks to rotate perspective
- Dimming hides complexity — unrelated blocks fade to 30% opacity

### 2. Live Editing with Signal Continuity

The single most distinctive feature. When the user changes the graph during playback:

- Oscillators continue at their current phase, not from zero
- Smoothing filters carry their state across
- Accumulators keep accumulating from their current value
- Time-driven signals are continuous by construction (they're pure functions of a monotonic frame counter)
- The animation flows through the recompile without visible discontinuity

This works because signal continuity is split into tiers:
- **Time-pure signals** (oscillators, LFOs, scrolling patterns) are already continuous — `sys:time` is deterministic from a persistent frame counter
- **Scalar state** (delay lines, lag filters, accumulators) is migrated GPU-side via buffer copy operations during pipeline install
- **Per-instance state** (per-particle smoothing, per-element accumulators) with lane remapping when instance counts change

State migration is GPU-native: no CPU readback, no frame gaps, deterministic and bit-verifiable.

### 3. The Modulation Table

An alternative to the graph view. A **spreadsheet-style table** where:
- Rows = input ports (things that receive values)
- Columns = output ports (things that produce values)
- Cells = connections, optionally with transform chains (scale, offset, clamp, etc.)

This gives power users a compact, scannable view of all modulation routing in the patch.

---

## The 4-Pillar Block Architecture

Every block in the system belongs to one of four categories, each with strict ownership of its parameters:

### Pillar 1: Generators (Sources)

Produce the raw data that enters the pipeline. A generator owns its structural parameters exclusively.

**Block types:**
- **Topology Sources** — static geometry primitives: rectangle, star, point, circle
- **Parametric Templates** — continuous mathematical shapes: cubic bezier ribbons, closed blobs
- **Field Sources** — mathematical fields sampled at runtime: SDF volumes, noise fields
- **Solver Resource Sources** — simulation products: Eulerian fluid textures, pressure grids, reaction-diffusion surfaces

### Pillar 2: Modifiers (Processors)

Transform a generator's output without knowing what kind of data it is. A modifier takes a resource proxy, applies math, outputs a modified proxy.

**Examples:** twist geometry, advect fluid, remap via lookup table, transform instance positions, inject fluid spray, apply wind field, stretch along velocity vector, displace by noise.

The **Expression block** is the universal Modifier — a user-authored math expression that reads fields from its input and writes modified fields to its output. Sin, Cos, Add, Multiply, etc. are preset Expressions.

### Pillar 3: Materials (Surface Evaluators)

Define visual surface properties. A material is completely agnostic to what geometry it paints — it works on a mesh, a ribbon, a fluid quad, or a particle cloud without knowing which.

**Examples:** unlit solid color, matcap 2.5D, fluid color warp, gradient mapped from scalar field.

### Pillar 4: Render Sinks (Intents)

The thin terminal block that combines a source and a material into a draw command. It owns only presentation state (blend mode, depth testing).

**Examples:** draw instanced geometry, draw fullscreen quad, draw to texture.

**Key property:** One `DrawInstances` block accepts any source and any material. There are no parallel renderers — no `DrawFluid`, `DrawRibbon`, `DrawMesh`. Everything compiles to the same pass execution model.

---

## The Type System

Every value in the system has exactly one type: `CanonicalType = { payload, unit, extent }`.

### Payload Types

What the value contains:

| Type | Description |
|------|-------------|
| `float` | Scalar number |
| `int` | Integer |
| `bool` | True/false |
| `vec2` | 2D vector |
| `vec3` | 3D vector |
| `color` | RGBA (internally OKLab) |
| `shape2d` | Handle to 2D shape geometry |
| `shape3d` | Handle to 3D shape geometry |
| `cameraProjection` | Orthographic or perspective |

### Unit Types

Physical meaning: `none`, `count`, `angle(radians|degrees|phase01)`, `time(ms|seconds)`, `space(ndc|world|view)`, `color(oklch|rgba01)`.

Units prevent nonsensical operations (adding radians to meters) and enable automatic adapter insertion when types don't match.

### Extent (Five-Axis Coordinate)

Where/when/about-what a value exists:

1. **Cardinality** — `zero` (compile-time constant), `one` (scalar, same for all instances), `many(instance)` (per-instance field)
2. **Temporality** — `continuous` (every frame) or `discrete` (events only)
3. **Binding**, **Perspective**, **Branch** — reserved for future extensions

The critical distinction is **Scalar vs. Field**: a Scalar is one value per frame (time, a slider position), a Field varies per instance (each particle's position). When a Scalar enters a per-instance expression, it is automatically promoted — it becomes ambient context for the per-instance math.

---

## SourceBundle: The Data Flow Unit

A **SourceBundle** is the compound value flowing between blocks. It is a named record of typed fields — position X, position Y, color, scale, rotation, etc. Generators produce bundles, Modifiers transform them, Sinks consume them.

**Key design properties:**
- Functional semantics — each modifier produces a new bundle; the input is never mutated
- Expression chains **fuse to zero intermediate cost** — chained math blocks compile into a single expression tree, no GPU memory reads/writes between them
- The only materialization points are at sinks and cross-domain boundaries
- A small graph change cannot silently introduce a 10x performance cliff — VRAM access patterns are determined by bundle wiring, not expression depth

---

## Instance Domains

An **InstanceDomain** establishes how many things exist. It allocates GPU memory for N instances and emits two zero-cost hardware intrinsics:

- **`index`** — integer thread ID, for hash functions and integer-seeded algorithms
- **`rank`** — normalized `[0,1]` position, for phase-based math and interpolation

This separates **cardinality** (how many) from **geometry** (where). 64 dots arranged in a circle, a line, a grid, or scattered randomly all share the same InstanceDomain — only the layout math changes. The "Grid Trap" (hard-coding layout into the count mechanism) is structurally impossible.

**Dynamic count:** The maximum is set at compile time (determines memory allocation). The active count is a per-frame scalar — a slider wired to `active_lanes` controls how many instances render, with the GPU's indirect draw mechanism handling the rest.

---

## The Color System

The engine works in **OKLab** end-to-end. OKLab is a perceptually uniform color space where:
- Equal-distance steps look like equal visual changes
- Hue stays stable when lightness changes (no "blue shifts to purple")
- Interpolation produces clean gradients without muddy midtones

**Color is opaque to the user.** There is no "extract red channel" block. No "set L to 0.7" block. Users work with color blocks that express intent:

**Color sources:** ColorPicker, Palette, Gradient

**Per-instance color:** ColorByIndex (palette lookup by instance), ColorFromGradient (scalar-to-gradient mapping), ColorByPosition

**Color adjustments:** Brighten/Darken, MoreVivid/LessVivid, HueShift, Tint (push toward a target color), Contrast, Invert (perceptual, not naive RGB), Posterize

**Color selection/filtering:** HueFilter, BrightnessFilter, VividnessFilter, ColorMatte — output scalar masks, not colors

**Color combining:** Mix (perceptually uniform interpolation), Overlay, PickLighter/PickDarker

**Conditional:** ColorIf, ReplaceColor

The only file that knows about OKLab channel names is a single color helper module. Every material converts from OKLab to display sRGB via a single shared WGSL function at the fragment stage. Gamut mapping uses chroma-clipping (CSS Color Level 4 standard).

---

## External Input System

A unified channel-based interface for all external input. Every device writes to named channels; the patch reads from those channels without knowing which device produced the data.

### Supported Inputs

- **Mouse** — position, buttons (click/release as pulses), scroll wheel
- **Keyboard** — key held/pressed/released, WASD axis mapping
- **MIDI** — CC values (normalized), note on/off/gate/velocity, pitch bend
- **OSC** — arbitrary numeric channels from external applications
- **Audio** — RMS level, FFT bands (low/mid/high), individual FFT bins, beat onset detection

### Channel Semantics

- **Value** — sample-and-hold, persists until overwritten (mouse position, MIDI CC)
- **Pulse** — fires for exactly one frame (key press, MIDI note on)
- **Accumulate** — sums deltas since last frame (scroll wheel)

All smoothing and filtering happens on the write side. The read side is a pure, deterministic snapshot committed once per frame. No device-specific switch statements anywhere in the evaluator or IR.

### Channel Registry

Known channels are registered with their type, kind, and default value. Unknown channels resolve with a default (float, value kind, zero) and emit a diagnostic with typo suggestions. This provides flexibility while catching configuration errors.

---

## Continuity System (Anti-Jank)

The **gauge invariance** that makes Oscilla usable. Prevents visual discontinuities across:

- **Time discontinuities** — scrubbing, looping, seeking, rate changes
- **Patch edits** — hot-swap, parameter changes, topology changes
- **Domain changes** — element count changes, reordering

This is entirely invisible to the user. They edit, scrub, and loop freely without ever noticing the system exists.

**Core mechanism:** Phase offsets. When a time discontinuity occurs, the system computes an offset that makes the effective phase continuous. Every oscillator, every envelope, every scrolling pattern transitions smoothly.

**Determinism guarantee:** Given the same inputs and frame boundary, output is bit-identical between live playback and export. No drift permitted. Export matches playback exactly.

---

## Camera and Coordinate System

### Coordinate Spaces

1. **Local** — geometry definition and SDF math
2. **World** — absolute instance placement (unbounded R3, but [0,1]3 for 2.5D)
3. **View** — camera-relative
4. **Clip** — hardware normalized device coordinates
5. **Viewport** — rasterized pixel output

### Camera

The camera is **global context**, not a pillar block. The user places a camera block, wires modulators to its ports (position, FOV, etc.), and the compiler maps outputs to a global uniform buffer. During the first compute pass, the GPU calculates the view/projection matrix.

**Patch profiles** constrain authoring:
- **2D** — orthographic only, no depth
- **2.5D** — depth ordering with constrained camera (tilt-only)
- **3D** — full camera freedom (future)

---

## Layout System

Layouts are **computation-based positioning**, not a special subsystem. Layout blocks are pure math that maps `rank` and `index` to positions:

- **Circle layout** — `rank * 2pi` mapped through cos/sin
- **Line layout** — lerp between two endpoints
- **Grid layout** — modular arithmetic on `index`
- **Scatter** — Halton sequence from `index`
- **Path sampling** — normalized position along a curve

Because layouts are just math blocks, they compose freely. A circle layout with noise displacement is just two blocks chained.

---

## Diagnostics and Debugging

### Structured Diagnostics

Every diagnostic has a code, severity, source attribution (which block/port caused it), and suggested fixes. The system catches:
- Type mismatches between connected ports
- Unknown external channel names (with typo suggestions)
- Invalid axis combinations
- Unresolvable polymorphic types

### Probe Mode

A hover-to-inspect debug tool. Enable probe mode, hover over any port, bus, or binding to see:
- Current value (scalar or array)
- Type information
- Where the value comes from (trace upstream)
- One-click fixes for diagnosed issues

### Observation System

Runtime state capture: snapshots of current values, port states, and signal flow for live inspection. A debug graph mirrors the patch graph with annotated values.

### Diagnostic Rules Engine

Heuristic rules that detect non-obvious problems: performance hotspots, likely user errors, suboptimal configurations. Rules produce evidence-backed suggestions, not warnings.

---

## Demo Patches (Validation Targets)

These patches define the feature surface the system must support. Each exercises a specific architectural claim:

### Basic (Field Math + Instancing)
- **Grid of Squares** — 100 squares, each with unique rotation/color from pure index arithmetic
- **Spirograph Trace** — 600 points tracing a Lissajous figure using `rank` as phase delay
- **Kaleidoscope** — N-fold rotational symmetry from index math alone
- **Conditional Visibility** — density controlled by noise threshold and opacity, not by removing instances

### Scalar-to-Field Interaction
- **Mouse-Reactive Field** — dots that brighten near the cursor (scalar mouse + per-instance distance)
- **Additive Ripple Rings** — concentric rings with additive blending for glow
- **Color Ramp Palette** — palette texture sampled at `rank` position

### Modifier Pipeline
- **Twisted Ribbon** — parametric bezier with twist modifier along length
- **Velocity-Stretched Particles** — motion blur via stretch modifier
- **Noise-Displaced Grid** — regular grid nudged by a noise field source

### Multi-Domain / Multi-Intent
- **Two-Domain Scene** — background shapes + foreground particles, independent domains
- **Fill and Outline** — same source drawn twice with different materials (proxy fan-out)

### Solver Path
- **Reaction-Diffusion Surface** — fullscreen quad driven by simulation textures (no InstanceDomain)
- **Strange Attractor** — dynamical system with velocity-derived coloring

---

## Hard Boundaries (What the System Cannot Do)

These are deliberate architectural limits, not missing features:

1. **No dynamic topology resolution.** Shape resolution is set at compile time. Changing segment count requires a full pipeline rebuild.

2. **No data-dependent spawning.** Particle A cannot emit N new particles based on collision. Instance counts are fixed at compile time with deterministic pooling as the workaround (all threads run every frame; "dead" particles randomly check for respawn conditions).

3. **No runtime graph topology changes.** You cannot dynamically bypass or inject blocks. The workaround is modulating a `mix` or `strength` parameter to zero.

These boundaries exist because the system guarantees **predictable, zero-allocation, 120fps execution**. Predictable dispatch sizes, predictable memory access patterns, no atomics, no staging buffers.

---

## Deterministic Object Pooling

For effects like fluid-to-particle spray: allocate the maximum pool at compile time. Every thread runs every frame. Dead particles randomly sample the source for respawn conditions. Alive particles follow physics until they expire.

**Why:** Zero atomics, stable framerate regardless of active count, fully composable (stack more modifiers after the spray).

---

## Rendering Architecture Direction

The rendering backend is transitioning from a custom Rust/WASM/WebGPU renderer to a **forked Three.js WebGPURenderer + TSL** stack.

**What Oscilla keeps:** patch graph authoring, domain concepts (instance domains, generators, modifiers, intents), modulation routing, compilation from user graph to execution plan, runtime lifecycle, persistence.

**What Three.js provides:** scene graph and render object lifecycle, WebGPU pipeline construction, TSL material/postprocessing/compute node graphs, geometry/material/effect ecosystem, asset loaders.

The Three.js internal node graph is used as the execution engine, not as the user-facing patch model. Oscilla's authored graph compiles into a Three-native runtime plan. Three classes, node IDs, and scene objects never become authored graph state.

---

## Asset System (Future)

A project-level asset registry with stable IDs:
- **Categories:** image, texture, palette, geometry, model, material, node material, audio source, video source
- **Authoring store:** stable IDs, labels, import metadata, tags, patch references
- **Runtime cache:** loaded Three.js runtime objects keyed by asset ID

Blocks reference assets by ID. No block creates ad-hoc loader instances.

---

## Export

Export produces output that is **bit-identical** to live playback. Same schedule, same continuity system, same time model. The export path runs the same compiled program with the same frame stepping — the only difference is the output sink.

---

## Summary: What Makes Oscilla Different

1. **Live editing of a running instrument** — not restart-on-change, not preview-then-apply. The animation never stops.
2. **Signal continuity** — phase, state, and timing are preserved across every edit, invisibly.
3. **Perceptually correct color** — OKLab end-to-end, color-as-opaque-value, no channel footguns.
4. **Total modulation** — every parameter can be driven by any signal. The compiler resolves it.
5. **Automatic layout, focus-based navigation** — no spaghetti graphs, no manual positioning.
6. **GPU-native execution** — 120fps with zero-allocation hot path, predictable costs, no silent performance cliffs.
7. **Unified external input** — MIDI, OSC, audio, keyboard, mouse all as named channels. No device-specific code paths.
8. **Deterministic** — export matches playback. Seeded randomness only. Bit-reproducible within a session.
