# Demo Patches

A catalog of example patches for the new block library. Each patch is chosen to exercise a specific architectural claim of the 4-Pillar design. Together they form a specification test suite — if all of these can be expressed cleanly, the block system is sound.

Every patch lists its **primary exercise** (the architectural claim it validates) and its **constraints** (what it must NOT require, to keep the design honest).

---

## 1. Field Math & Instance Domain

These patches use only math nodes, an InstanceDomain, a topology source, a material, and a render intent. No modifiers. They establish that the basic Pillar 1 → 3 → 4 path works and that complex visual results emerge from composition alone.

---

### Grid of Squares

A 10×10 grid of squares. Each square has a unique rotation and color that varies across the grid, animated over time.

**Primary exercise:** `rank` and `index` as Field intrinsics; per-instance uniqueness from pure math; Scalar (time) mixing with a Field.

**Patch:**
- `InstanceDomain(count: 100)` → `index`, `rank`
- Grid layout: `col = mod(index, 10)`, `row = floor(index / 10)`, `pos_x = col * 0.1`, `pos_y = row * 0.1`
- Rotation: `rotation = index * 0.5 + time * 2.0`
- Color: `hue = rank + time * 0.2` → `ColorHSL(h: hue, s: 0.8, l: 0.6)` → `UnlitMaterial`
- `RectangleTopology` → `TransformInstances(pos_x, pos_y, rotation)` → `DrawInstances`

**Constraints:** No GridLayout block. Layout is pure index arithmetic. Rotation speed is constant (one global rate), but the *angle* is unique per instance.

---

### Spirograph Trace

A dense ring of points tracing a Lissajous figure. Two oscillators at slightly different frequencies, with `rank` used as a phase offset so each instance represents a different moment on the curve.

**Primary exercise:** `rank` as phase delay rather than spatial position; emergent complex geometry from two simple oscillators; no geometry source needed beyond a point primitive.

**Patch:**
- `InstanceDomain(count: 600)` → `rank`
- `phase = rank * TAU`
- `x = sin(freq_a * time + phase)`, `y = cos(freq_b * time + phase)`
- Color: `hue = rank` → `ColorHSL` → `UnlitMaterial`
- `PointTopology` → `TransformInstances(x, y)` → `DrawInstances`

**Constraints:** `freq_a` and `freq_b` are constants (no per-instance frequency variation). The entire figure comes from the phase offset encoded in `rank`.

---

### Kaleidoscope

A single source shape drawn N times, each copy rotated by `index * (TAU / N)` around the origin. Pure rotational symmetry with no specialized mirror block.

**Primary exercise:** N-fold symmetry from index math alone; TransformInstances with rotation as the only varying field; demonstrating that geometric symmetry needs no new primitives.

**Patch:**
- `InstanceDomain(count: 12)`
- `rotation = index * (TAU / 12.0)`
- `StarTopology(points: 5, radius: 0.3)` → `TransformInstances(pos_x: 0, pos_y: 0, rotation)` → `DrawInstances`
- Color: constant or slowly drifting with time, same for all instances

**Constraints:** All instances share the same position (origin). The only per-instance variation is rotation angle.

---

### Conditional Visibility

A field of points where only those in high-noise regions are visible. A single threshold slider controls apparent density.

**Primary exercise:** Boolean-style per-instance evaluation as a material binding; Scalar (threshold) mixing into a per-instance Field expression; demonstrating that show/hide is opacity=0, not a new block type.

**Patch:**
- `InstanceDomain(count: 500)` → `rank`, `index`
- Position: `ScatterUV(index)` (Halton sequence) → `pos_x`, `pos_y`
- `opacity = step(noise(pos_x, pos_y, time * 0.3), threshold)` where `threshold` is a global Scalar
- `PointTopology` → `TransformInstances(pos_x, pos_y)` → `UnlitMaterial(opacity)` → `DrawInstances`

**Constraints:** No instances are removed from the domain. Visibility is purely a material decision. `index` is used for scatter (not `rank`) because the Halton sequence requires an integer seed.

---

## 2. Scalar ↔ Field Interactions

These patches specifically test the boundary between values that are uniform across all instances (Scalar) and values that vary per instance (Field). This distinction maps directly to uniforms vs. varyings in GPU execution.

---

### Mouse-Reactive Field

Dots whose size and brightness increase as they get closer to the mouse cursor.

**Primary exercise:** A Scalar (mouse position, uniform across all threads) flowing into a per-instance math expression and producing a Field output; the promotion rule that Scalar becomes ambient when used inside per-instance math.

**Patch:**
- `InstanceDomain(count: 300)` → `rank`, `index`
- Position: `ScatterUV(index)` → `pos_x`, `pos_y`
- `dist = length(vec2(pos_x, pos_y) - mouse_pos)` — `mouse_pos` is a Scalar, `pos` is a Field, result is a Field
- `brightness = 1.0 - clamp(dist * 3.0, 0.0, 1.0)`
- `size = brightness * 0.04 + 0.005`
- `PointTopology` → `TransformInstances(pos_x, pos_y, scale: size)` → `UnlitMaterial(brightness)` → `DrawInstances`

**Constraints:** Mouse position is a single Scalar — it does not vary per instance. The per-instance variation emerges from the distance calculation.

---

### Additive Ripple Rings

Concentric rings that expand outward and fade like water ripples. The additive blend mode causes overlapping rings to accumulate brightness.

**Primary exercise:** `blendMode: additive` as a RenderIntent binding; per-instance scale and opacity from a time + rank expression; visual complexity from blend mode rather than additional geometry.

**Patch:**
- `InstanceDomain(count: 12)` → `rank`, `index`
- `phase = rank * 4.0` (stagger the rings in time)
- `t = fract(time * 0.5 + phase)` — normalized 0→1 lifecycle per ring
- `scale = t * 2.0 + 0.1`
- `opacity = (1.0 - t) * 0.6`
- `CircleTopology(segments: 64)` → `TransformInstances(scale)` → `UnlitMaterial(opacity)` → `DrawInstances(blendMode: additive)`

**Constraints:** No post-processing. The glow effect comes purely from additive blending of semi-transparent rings.

---

### Color Ramp Palette

Instances colored by sampling a 1D gradient texture at their `rank` position — a user-editable palette applied across a field of shapes.

**Primary exercise:** `TextureView` as a Material binding (distinct from math-driven color); `rank` as a texture coordinate; demonstrating that palette-based coloring requires no math nodes in the color path.

**Patch:**
- `InstanceDomain(count: 200)` → `rank`, `index`
- Position: any layout (e.g., a simple horizontal line)
- `color = textureSample(palette_tex, rank)` — palette_tex is a TextureView bound on the Material
- `RectangleTopology` → `TransformInstances(pos_x, pos_y)` → `UnlitMaterial(baseColor: color)` → `DrawInstances`

**Constraints:** No HSL math nodes in the color path. Color comes entirely from the texture sample. The palette itself is the modulatable parameter — swap the texture, change the look.

---

## 3. Modifier Pipeline (Pillar 2)

These patches require at least one Modifier block between the Generator and the RenderIntent, exercising the full Pillar 1 → 2 → 3 → 4 chain.

---

### Twisted Parametric Ribbon

A bezier ribbon with a twist applied along its length, colored with a gradient along `rank`.

**Primary exercise:** `ParametricTemplate` source (not a topology); Pillar 1 → 2 chain (Generator → Modifier → Material → Intent); Material receiving `rank` from the source rather than from InstanceDomain.

**Patch:**
- `CubicBezierTemplate(p0, p1, p2, p3, resolution: 128)` → `ResourceProxy`
- `TwistModifier(target: proxy, angle: time * 1.5, axis: Z)` → modified proxy
- Material: `hue = rank`, `ColorHSL(h: hue, s: 0.9, l: 0.55)` → `UnlitMaterial`
- `DrawInstances`

**Constraints:** The bezier control points are constants (no per-instance variation of the curve shape). The only animation is the twist angle driven by time.

---

### Velocity-Stretched Particles

Points moving along curved paths, each stretched along its direction of travel to simulate motion blur without post-processing.

**Primary exercise:** Modifier accepting multiple independent Field inputs simultaneously (position and stretch axis); motion blur as a modifier-layer concern rather than a material concern.

**Patch:**
- `InstanceDomain(count: 400)` → `rank`, `index`
- Position: `x = sin(freq * time + rank * TAU)`, `y = cos(freq * time * 0.7 + rank * TAU)`
- Velocity (derivative of position): `vx = cos(freq * time + rank * TAU) * freq`, `vy = -sin(freq * time * 0.7 + rank * TAU) * freq * 0.7`
- `PointTopology` → `StretchModifier(target: proxy, velocity_x: vx, velocity_y: vy, stretch_scale: 0.04)` → `UnlitMaterial` → `DrawInstances`

**Constraints:** No post-processing pass. The stretch is applied in the modifier layer by transforming the point into a short oriented quad. The velocity is derived from the same math as the position — not stored state.

---

### Noise-Displaced Grid

A regular grid of points where each point's position is nudged by a 2D noise field sampled at its base position.

**Primary exercise:** A `FieldSource` (noise) used as an input to a Modifier rather than a standalone generator; Field consuming another Field as input (noise evaluated at a per-instance position).

**Patch:**
- `InstanceDomain(count: 400)` → `index`
- Base grid: `col = mod(index, 20)`, `row = floor(index / 20)`, `base_x = col * 0.05`, `base_y = row * 0.05`
- `NoiseField(freq: 2.0, seed: 0)` → `noise_source` (FieldSource)
- `DisplaceModifier(target: point_proxy, field: noise_source, scale: 0.03 * sin(time))` → displaced proxy
- `PointTopology` → displaced proxy → `UnlitMaterial` → `DrawInstances`

**Constraints:** The base grid is perfectly regular — all irregularity comes from the displacement. The displacement magnitude is animated with `sin(time)` so it breathes in and out.

---

## 4. Multi-Domain & Multi-Intent

These patches have more than one InstanceDomain or more than one RenderIntent consuming from the same source. They verify that the compiler handles multiple independent pipelines in a single frame.

---

### Two-Domain Scene

Large slow-moving background shapes and a dense foreground particle field coexisting in the same frame.

**Primary exercise:** Two separate InstanceDomains with different counts and math, compiled into a single pass roster without interference; background/foreground layering as a compositional pattern.

**Patch:**
- Domain A: `InstanceDomain(count: 20)` → slow drifting large circles, `blendMode: normal`
- Domain B: `InstanceDomain(count: 600)` → fast dense particles, `blendMode: additive`
- Each domain has its own Generator, TransformInstances, Material, and RenderIntent
- No shared proxies between the two domains

**Constraints:** The two domains never share data. Domain B renders on top of Domain A via draw order in the pass roster, not Z-depth.

---

### Fill and Outline

A set of shapes drawn twice from the same source — once as filled solids, once as thin outlines — layered on top of each other.

**Primary exercise:** A single `ResourceProxy` fanning out to two RenderIntents with different Materials; demonstrating proxy fan-out without duplication of geometry computation.

**Patch:**
- `InstanceDomain(count: 30)` → layout math → `TransformInstances` → `proxy`
- Intent A: `proxy` → `SolidMaterial(color: fill_color)` → `DrawInstances(blendMode: normal)`
- Intent B: `proxy` → `OutlineMaterial(color: outline_color, thickness: 0.002)` → `DrawInstances(blendMode: normal)`
- The outline renders after the fill in the pass roster

**Constraints:** The transform math runs once. Both render passes consume the same transformed proxy — no re-evaluation of positions.

---

## 5. Solver Path

These patches use a `SolverResourceSource` — a simulation that produces textures or buffers rather than geometry. They exercise the path that has no InstanceDomain at all.

---

### Reaction-Diffusion Surface

A fullscreen quad whose color is driven entirely by a Gray-Scott reaction-diffusion simulation running on a 2D texture grid.

**Primary exercise:** `SolverResourceSource` → `DrawFullScreenQuad` path end-to-end; the simplest possible pass roster with no instances; demonstrating that the architecture works without any InstanceDomain.

**Patch:**
- `ReactionDiffusionSolver(width: 512, height: 512, feed: 0.055, kill: 0.062)` → `solver_proxy`
- `GradientMaterial(source: solver_proxy, color_ramp: palette_tex)` → `mat_proxy`
- `DrawFullScreenQuad(source: solver_proxy, material: mat_proxy)`

**Constraints:** No InstanceDomain. No geometry. The only modulation is the `feed` and `kill` parameters on the solver — these are Scalars and can be wired to oscillators.

---

### Strange Attractor

A dense cloud of points tracing a Clifford attractor. `rank` encodes how far along the trajectory each point is. Color is driven by local velocity magnitude at that position.

**Primary exercise:** Mathematical dynamical systems as a pure Field expression; color derived from a *computed* per-instance quantity (velocity) rather than position or rank directly; high visual complexity from four scalar constants.

**Patch:**
- `InstanceDomain(count: 2000)` → `rank`
- `t = rank * 20.0` (map rank to trajectory parameter)
- `x`, `y` from Clifford iteration unrolled into a closed-form expression over `t`
- `vx`, `vy` = partial derivatives at `t` (same math, offset by small epsilon)
- `speed = length(vec2(vx, vy))`
- Color: `hue = speed * 0.3`, `brightness = 0.6 + speed * 0.4` → `UnlitMaterial`
- `PointTopology` → `TransformInstances(x, y)` → `DrawInstances(blendMode: additive)`

**Constraints:** Attractor constants (`a`, `b`, `c`, `d`) are Scalars — wiring an oscillator to any one of them morphs the shape continuously. The color is derived from velocity, not from rank or position directly.

---

## Coverage Summary

| Patch | Pillar 2 | Scalar↔Field | TextureView | Multi-domain | Multi-intent | SolverResource | index vs rank |
|---|---|---|---|---|---|---|---|
| Grid of Squares | | x | | | | | x |
| Spirograph Trace | | | | | | | x |
| Kaleidoscope | | | | | | | |
| Conditional Visibility | | x | | | | | x |
| Mouse-Reactive Field | | x | | | | | |
| Additive Ripple Rings | | x | | | | | |
| Color Ramp Palette | | | x | | | | |
| Twisted Ribbon | x | | | | | | |
| Velocity-Stretched Particles | x | | | | | | |
| Noise-Displaced Grid | x | | | | | | |
| Two-Domain Scene | | | | x | | | |
| Fill and Outline | | | | | x | | |
| Reaction-Diffusion Surface | | | | | | x | |
| Strange Attractor | | x | | | | | |
