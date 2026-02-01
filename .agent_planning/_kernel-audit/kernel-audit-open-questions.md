# Kernel Audit: Open Questions

> **Goal**: Reduce the kernel layer to irreducible primitives. Everything else should be expressible by composing primitives through the graph. This document covers every kernel outside the fundamental set (`map`, `zip`, `broadcast`, `zipSig`, `reduce`, `pathDerivative`, camera, external IO).
>
> **Decision framework**: A kernel belongs in the primitive layer if and only if it cannot be expressed as a composition of other primitives through the existing graph wiring, OR if removing it would make the system unable to express a class of animations.

---

## Opcodes (Scalar Math via OpcodeInterpreter)

These are dispatched through `map`/`zip` and operate on scalars. They are candidates for the irreducible primitive set.

### Q1: Core arithmetic — `add`, `sub`, `mul`, `div`, `mod`, `pow`, `neg`, `abs`

**Context**: Standard arithmetic. `add` and `mul` are variadic (take N inputs). All others are unary or binary. These form the basis of every numeric computation.

- **Pro keep**: Irreducible. You cannot build `add` from anything simpler.
- **Con**: None. These are axiomatically primitive.

**Recommendation**: Keep all.

---

### Q2: Trigonometry — `sin`, `cos`, `tan`

**Context**: Operate on radians. These are the mathematical functions, not the oscillator wrappers (those are `oscSin` etc. in Q12). Used directly in coordinate transforms, wave generation, and projection math.

- **Pro keep**: Irreducible transcendental functions. Foundation of all wave/rotation math.
- **Con**: `tan` is rarely used in animation and has singularities. Could defer it.

**Recommendation**: Keep `sin` and `cos`. **Question**: Is `tan` needed now, or can it wait?

---

### Q3: Range operations — `min`, `max`, `clamp`, `lerp`

**Context**: `min`/`max` are variadic. `clamp(x, lo, hi)` is ternary. `lerp(a, b, t)` is ternary. All are used extensively in the runtime for blending, bounding, and interpolation.

- **Pro keep**: `lerp` is the fundamental interpolation primitive — without it, no blending. `clamp` prevents out-of-range values. `min`/`max` are used in reduce ops and per-element bounding.
- **Con**: `clamp(x, lo, hi)` = `max(lo, min(hi, x))` — technically composable from min/max. But clamp is so universal that decomposing it adds noise.

**Recommendation**: Keep all four.

---

### Q4: Comparison — `eq`, `lt`, `gt`

**Context**: Return 0.0 or 1.0 (no boolean type at scalar level — everything is float). Used for conditional logic: `step`, branching via `lerp(a, b, condition)`.

- **Pro keep**: Without comparisons, you can't express any conditional behavior. `step(edge, x)` = `lt(edge, x)`. Branching = `lerp(a, b, gt(x, threshold))`.
- **Con**: Could start with just `lt` and derive `gt(a,b)` = `lt(b,a)`, `eq(a,b)` = `mul(lt(a, b+ε), lt(b, a+ε))`. But that's ugly and lossy.

**Recommendation**: Keep all three. **Question**: Do we also need `lte`, `gte`, `neq`? Or is the current set sufficient?

---

### Q5: Rounding — `floor`, `ceil`, `round`, `fract`

**Context**: Discretization and fractional extraction. `fract(x)` = `x - floor(x)`. Used in phase wrapping, grid snapping, and index computation.

- **Pro keep**: `floor` and `fract` are heavily used in phase/index math. `ceil` and `round` are less common but still standard.
- **Con**: `fract` = `sub(x, floor(x))` — composable. `ceil(x)` = `neg(floor(neg(x)))` — composable. `round(x)` = `floor(add(x, 0.5))` — composable.

**Recommendation**: Keep `floor` as the primitive. **Question**: Keep `fract`, `ceil`, `round` as convenience, or remove and compose?

---

### Q6: Exponential/logarithmic — `sqrt`, `exp`, `log`, `sign`

**Context**: `sqrt` is used in distance calculations. `exp`/`log` are used in exponential decay (slew, easing). `sign` extracts direction.

- **Pro keep**: `sqrt` is irreducible (no composition from other ops). `exp`/`log` are irreducible transcendentals. `sign` could technically be composed from comparisons but is a standard math primitive.
- **Con**: `exp` and `log` may not be needed in the near term if easing functions are removed. `sign(x)` = `sub(gt(x, 0), lt(x, 0))` — ugly but possible.

**Recommendation**: Keep `sqrt`. **Question**: Are `exp`, `log`, `sign` needed now, or can they wait until we have a use case?

---

### Q7: Phase wrapping — `wrap01`

**Context**: `wrap01(x)` = `((x % 1) + 1) % 1`, wrapping to [0, 1). This is the fundamental phase operation — phasors, oscillators, and cyclic animations all depend on it.

- **Pro keep**: Phase wrapping is the heart of the oscillator model. It's technically composable from `mod` + `add` + `mod`, but the double-mod pattern is a correctness trap (negative inputs) that should be encapsulated.
- **Con**: Could be composed from `fract` if `fract` handles negatives correctly (it does: `fract` already uses the same pattern).

**Recommendation**: Keep. The negative-input correctness concern alone justifies a named primitive.

---

### Q8: Hash — `hash(value, seed) → [0, 1)`

**Context**: Deterministic pseudo-random number generation. Given the same (value, seed) pair, always returns the same result. Used for noise, jitter, and any non-deterministic-looking behavior that must be reproducible.

- **Pro keep**: Irreducible — you can't build a hash function from arithmetic ops alone (you need the specific bit-manipulation pattern). This is the only source of controlled randomness in the system.
- **Con**: The current implementation (`fract(sin(x * K) * L)`) is a well-known GPU hack, not a proper hash. May want to replace with a better algorithm later.

**Recommendation**: Keep. Without this, no procedural variation is possible.

---

## Component Access & Construction

### Q9: Vector extraction — `vec3ExtractX/Y/Z`, `colorExtractR/G/B/A`

**Context**: Extract a single scalar component from a multi-component value. Signal-level (`SignalKernelLibrary`) and field-level (`fieldExtractX/Y/Z`, `fieldExtractR/G/B/A`) variants both exist.

- **Pro keep**: You cannot decompose a vec3 into its parts without extraction. This is a type-system necessity — it bridges multi-component and scalar domains.
- **Con**: Seven named operations for what is conceptually one operation parameterized by (type, index). Could be a single `extract(value, componentIndex)` generic.

**Recommendation**: Keep the capability. **Question**: Should this be 7 named kernels or 1 generic `extract` parameterized by component index? The generic form would be cleaner and prevent the enum from growing when new payload types are added.

---

### Q10: Vector/color construction — `makeVec2`, `makeVec3`, `makeVec2Sig`, `makeVec3Sig`, `makeColorSig`

**Context**: Compose scalars into a multi-component value. Field-level (`makeVec2`, `makeVec3`) works today. Signal-level (`makeVec2Sig`, `makeVec3Sig`, `makeColorSig`) throw "not yet supported".

- **Pro keep**: Inverse of extraction. You need both directions. Without construction, you can't create a vec3 from computed x/y/z.
- **Con**: Signal-level variants are broken. Same question as Q9 — should these be named per-type or generic?

**Recommendation**: Keep the capability, fix signal-level. **Question**: Same as Q9 — generic `construct(componentType, ...scalars)` vs named per-type?

---

### Q11: Format conversion — `vec2ToVec3`, `fieldSetZ`, `fieldSwizzle_xy`, `fieldSwizzle_rgb`

**Context**: Type-level conversions between payload shapes. `vec2ToVec3` lifts 2D to 3D (z=0). `fieldSetZ` replaces the Z component. `fieldSwizzle_xy` drops Z from vec3. `fieldSwizzle_rgb` drops A from color.

- **Pro keep (vec2ToVec3)**: If we're 3D-native, every 2D computation needs to be lifted to 3D. This is a type bridge.
- **Pro keep (fieldSetZ)**: Needed to assign Z after independent computation.
- **Con (swizzles)**: `fieldSwizzle_xy` = `extractX` + `extractY` + `makeVec2`. `fieldSwizzle_rgb` = `extractR` + `extractG` + `extractB` + `makeVec3`. Both are pure compositions.
- **Con (vec2ToVec3)**: If Q10 has a generic `construct`, then `vec2ToVec3(v)` = `construct(vec3, extractX(v), extractY(v), 0)`. But that's 4 operations for what should be a trivial lift.

**Recommendation**: Keep `vec2ToVec3` and `fieldSetZ` as primitives (3D-native design choice). Remove `fieldSwizzle_xy` and `fieldSwizzle_rgb` — compose from extract+construct. **Question**: Agree with this split?

---

## Signal Kernel Library (named kernels dispatched via map/zip)

### Q12: Oscillators — `oscSin`, `oscCos`, `oscTan`, `triangle`, `square`, `sawtooth`

**Context**: Take phase [0, 1) as input, produce [-1, 1] output. These are the signature operations of the application — "Oscilla" is literally named after oscillators.

- **Pro keep**: Brand identity. These are the first thing a user reaches for. Providing them as primitives means the common case is a single node, not a chain of `mul(phase, 2π) → sin`.
- **Pro remove**: Every one of these is a trivial composition:
  - `oscSin(p)` = `sin(mul(p, TAU))`
  - `triangle(p)` = `sub(mul(4, abs(sub(p, 0.5))), 1)`
  - `square(p)` = `lt(p, 0.5) ? 1 : -1`
  - `sawtooth(p)` = `sub(mul(2, p), 1)`
- **Con keep**: If these are blocks (not kernels), the user builds `Const(TAU) → Mul → Sin` which is 3 blocks for one oscillator. That's hostile UX.
- **Con remove**: These are currently kernel-level, but the argument for them is UX, which is a block/graph concern. The kernel layer should be agnostic to UX.

**Recommendation**: Remove from kernel layer. Express as **composite blocks** that expand to primitive ops during compilation. The user sees "Sine Oscillator" as a single block; the compiler sees `mul → sin`. **Question**: Does composite block expansion exist yet, or is this blocked on infrastructure?

---

### Q13: Easing functions — `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInElastic`, `easeOutElastic`, `easeOutBounce`

**Context**: Nine named easing curves. Take t ∈ [0, 1], produce shaped t ∈ [0, 1]. Used for animation timing.

- **Pro keep**: Easing is fundamental to animation. Users expect a library of curves.
- **Pro remove**: Every polynomial easing is trivially composable (`easeInQuad(t)` = `mul(t, t)`). Elastic and bounce are more complex but still composable from sin/pow/conditionals.
- **Con keep**: Nine separate kernels for what is a parameterizable concept. This violates "one type per behavior" — they're all instances of `ease(t, curve)`.
- **Con remove**: Without composite block infrastructure, removing these means users wire 3-5 nodes for every easing curve.

**Recommendation**: Remove from kernel layer. Same reasoning as Q12 — these are composite blocks or a parameterized `Ease` block, not kernel primitives. **Question**: Should there be a single `Ease` block with a curve selector, or individual blocks that expand to primitives?

---

### Q14: Shaping — `smoothstep`, `step`

**Context**: `step(edge, x)` = `x < edge ? 0 : 1`. `smoothstep(edge0, edge1, x)` = hermite interpolation between edges.

- **Pro keep**: `step` is just `gt` with different argument order — arguably not a separate kernel. `smoothstep` is a 5-op composition (clamp + mul chain) that's extremely common in shader-style programming.
- **Pro remove**: `step(e, x)` = `gt(x, e)`. Trivial. `smoothstep` = `clamp → t*t*(3-2t)` — composable.
- **Con remove**: `smoothstep` is a 5-node chain for a single concept. Same UX argument as oscillators.

**Recommendation**: Remove both. `step` is a renamed comparison. `smoothstep` becomes a composite block. **Question**: Agree?

---

### Q15: Noise — `noise(phase, seed)`

**Context**: `fract(sin(seed * K) * L)` — a deterministic hash-based noise function at signal level. Distinct from the `hash` opcode (Q8) which operates at scalar level.

- **Pro remove**: This is literally `hash(phase, seed)` renamed. The opcode `hash` already exists and does the same thing.
- **Con**: The signal-level `noise` kernel handles the phase-to-hash mapping with specific constants. Removing it means the user wires `hash` directly.

**Recommendation**: Remove. Use the `hash` opcode directly. **Question**: Is there any semantic difference between `noise` and `hash` that I'm missing?

---

### Q16: Combine kernels — `combine_sum`, `combine_average`, `combine_max`, `combine_min`, `combine_last`

**Context**: Variadic signal combinators. Used when multiple signals feed into one input (fan-in / merge). These determine how overlapping connections resolve.

- **Pro keep**: Fan-in is a graph-level concept that needs a resolution strategy. These define *how* multiple signals merge at a port.
- **Pro remove**: `combine_sum` = `reduce(sum)`. `combine_max` = `reduce(max)`. These duplicate the reduce operators.
- **Con remove**: Combine operates at signal level (scalar merge), while reduce operates at field level (lane aggregation). They're the same math but different cardinality contexts. Collapsing them may conflate two distinct concerns.
- **Con keep**: `combine_last` is not a mathematical operation — it's "ignore all but the last connection", which is a graph-wiring policy, not a kernel.

**Recommendation**: Remove as separate kernels. Fan-in resolution should be a port-level policy that emits the appropriate scalar opcode (add, max, etc.) during compilation. `combine_last` becomes the default policy (single-writer wins). **Question**: Is fan-in resolution currently baked into the kernel dispatch, or could it be moved to a compilation pass?

---

## Field Kernels (buffer operations via FieldKernels.ts)

### Q17: Field arithmetic — `fieldAdd`, `fieldMultiply`

**Context**: Element-wise addition and multiplication of field buffers. These are the field-level equivalents of the `add`/`mul` opcodes.

- **Pro keep**: Needed for any field-level computation. Without these, you can't add two position fields together.
- **Pro remove**: These duplicate the `add`/`mul` opcodes. If `map`/`zip` can dispatch scalar opcodes over field buffers (strided iteration), then `fieldAdd(a, b)` = `zip(add, a, b)` at field level.
- **Con remove**: This requires the field evaluator to support dispatching arbitrary opcodes over buffers. Does it today?

**Recommendation**: Remove IF the zip kernel dispatch can apply scalar opcodes element-wise over field buffers. Otherwise, keep until that infrastructure exists. **Question**: Can `zip` at field level dispatch to arbitrary opcodes today, or is the field kernel a separate dispatch path?

---

### Q18: Polar-to-Cartesian — `fieldPolarToCartesian`

**Context**: `(cx + r*cos(a), cy + r*sin(a))` — converts polar coordinates to Cartesian. Takes center, radius, and angle fields.

- **Pro keep**: Extremely common in the oscillator/animation domain. Circular motion is the #1 use case.
- **Pro remove**: Composed from `cos`, `sin`, `mul`, `add`. Five ops for what the user thinks of as one transform.
- **Con keep**: Multi-input (cx, cy, r, angle) means the composed version is a tangle of wires. A single block is much cleaner.
- **Con remove**: If kept as a kernel, it's a special-case that hardcodes one coordinate transform. What about spherical-to-Cartesian? Cylindrical? Each would need its own kernel.

**Recommendation**: Remove from kernel layer. Express as a composite block. The user sees "Polar to Cartesian"; the compiler sees cos/sin/mul/add. **Question**: Is there a performance concern with decomposing this? (It runs per-element per-frame.)

---

### Q19: HSV-to-RGB — `hsvToRgb`

**Context**: Color space conversion. Both a pure field kernel (3 float inputs) and a zipSig variant (per-element hue, uniform sat/val). The conversion formula is ~20 lines of conditional math.

- **Pro keep**: Color space conversion is a domain fundamental. HSV is the natural color model for animation (vary hue with phase, keep saturation/value fixed).
- **Pro remove**: It's a pure function — composable from comparisons, clamp, abs, mul. Just complex.
- **Con keep**: Decomposing a 20-line function into individual nodes would create an incomprehensible subgraph. This is the strongest UX argument for any kernel on this list.
- **Con remove**: If we keep this, we'd also want RGB-to-HSL, LCH, OKLCH, etc. Each is a separate kernel. Slippery slope.

**Recommendation**: **Keep for now**. This is complex enough that decomposition is impractical, and color is core to the domain. Revisit when composite blocks with internal evaluation exist. **Question**: Agree? Or should we remove and accept that color conversion is a "big composite block"?

---

### Q20: Per-element opacity — `perElementOpacity`, `applyOpacity`

**Context**: `perElementOpacity` multiplies alpha channel per-element. `applyOpacity` applies a uniform signal opacity to a color field (zipSig).

- **Pro remove**: `perElementOpacity(color, opacity)` = extract alpha, multiply, reconstruct color. `applyOpacity` is the same with a broadcast step.
- **Con**: These are convenience wrappers around 4-5 ops. Removing them means the user wires extract→mul→construct for every opacity adjustment.

**Recommendation**: Remove. Opacity is mul on the alpha channel — not a distinct operation.

---

### Q21: Geometric helpers — `fieldAngularOffset`, `fieldRadiusSqrt`

**Context**: `fieldAngularOffset` = `2π * phase * spin`. `fieldRadiusSqrt` = `radius * sqrt(id01)`. Both are single-expression compositions used in specific layout patterns.

- **Pro remove**: Both are trivial compositions. `fieldAngularOffset` = `mul(mul(TAU, phase), spin)`. `fieldRadiusSqrt` = `mul(radius, sqrt(id01))`.
- **Con**: None. These are clearly graph-level patterns, not primitives.

**Recommendation**: Remove both.

---

### Q22: Animation effects — `jitter2d`, `fieldJitterVec`, `attract2d`, `fieldPulse`, `fieldHueFromPhase`, `fieldGoldenAngle`

**Context**: Six specialized animation kernels:
- `jitter2d` / `fieldJitterVec`: Add hash-based random offset to positions
- `attract2d`: Lerp positions toward a target over time
- `fieldPulse`: `base + amplitude * sin(2π * (phase + id01 * spread))`
- `fieldHueFromPhase`: `fract(id01 + phase)`
- `fieldGoldenAngle`: Golden angle spiral layout

- **Pro remove**: Every one of these is a short composition of primitives (hash, lerp, sin, mul, fract). None introduces a new mathematical concept.
- **Con remove**: These encode useful animation recipes. Once removed, users need to rebuild them from scratch.
- **Counterpoint**: That's exactly what composite blocks / presets are for. The recipes should live in the block library, not the kernel layer.

**Recommendation**: Remove all six. These are block-level presets, not computational primitives.

---

### Q23: Layout kernels — `circleLayout`, `lineLayout`, `gridLayout` (and UV variants), `circleAngle`

**Context**: Seven layout kernels (plus 3D variants in the projection layer). These arrange N instances in geometric patterns. All are zipSig (field + signal inputs like phase, radius, count).

- `circleLayout`: `(cx + r*cos(2πi/n + phase), cy + r*sin(2πi/n + phase))`
- `lineLayout`: `lerp(start, end, i/n)`
- `gridLayout`: row/column from `i % cols`, `floor(i / cols)`

- **Pro remove**: All are compositions of basic math (sin, cos, mul, div, mod, floor). Circle layout = polar-to-cartesian with evenly-spaced angles. Line layout = lerp with normalized index.
- **Con remove**: Layout is the most common first thing a user does. "Place 100 dots in a circle" should be one block, not 8 wired-together nodes.
- **Con keep**: These are the most complex compositions on this list. A circle layout expressed as primitives requires: `div(index, count) → mul(TAU) → add(phase) → cos/sin → mul(radius) → add(center)`. That's 7-8 nodes with careful wiring.

**Recommendation**: Remove from kernel layer. These are the strongest candidates for composite blocks. **Question**: What's the path to composite block support? If it's far out, we may want to keep layouts temporarily as the only exception.

---

### Q24: Shape vertex generators — `polygonVertex`, `starVertex`

**Context**: Generate vertices for regular polygons and star shapes. These compute local-space control points for path rendering.

- **Pro remove**: `polygonVertex` = circle layout with `sides` instead of `count`. `starVertex` = two interleaved radii.
- **Con**: Star vertex has the inner/outer radius alternation logic which, while composable, is fiddly.

**Recommendation**: Remove. Same as layout kernels — composite block territory.

---

### Q25: Color broadcast — `broadcastColor`

**Context**: Fill all elements of a field with a single color composed from 4 signal inputs (r, g, b, a). ZipSig kernel.

- **Pro remove**: This is literally `broadcast(makeColor(r, g, b, a))`. It exists because broadcast + color construction wasn't wired up as a single path.
- **Con**: None.

**Recommendation**: Remove. This is broadcast + construct.

---

## Projection & 3D Layout Kernels

### Q26: 3D layout kernels — `gridLayout3D`, `lineLayout3D`, `circleLayout3D`, `applyZModulation`

**Context**: World-space layout in 3D. Located in `src/projection/layout-kernels.ts`. These are the 3D equivalents of the 2D layout kernels (Q23).

- **Pro keep**: If we're 3D-native, we need 3D layout. These are the same compositions as Q23 but with Z.
- **Pro remove**: Same reasoning as Q23 — compositions of primitives.
- **Con**: `applyZModulation` is literally `fieldSetZ(positions, mul(signal, id01))`.

**Recommendation**: Remove. Same as Q23. **Question**: Are these used in the current rendering pipeline? If so, removal needs to be coordinated with providing equivalent composite blocks.

---

## Reduce Operations

### Q27: Reduce operators — `min`, `max`, `sum`, `avg`

**Context**: Four reduce operators that collapse a field (many) to a signal (one). Part of the user's fundamental set.

- **Pro keep**: These are the only way to go from field→signal. Irreducible cardinality transformation.
- **Con**: `avg` = `sum / count` — technically composable. But count needs to be known.

**Recommendation**: Keep all four. `avg` is common enough to warrant inclusion even if technically derivable. **Question**: Are there other reduce operations we'll need? (e.g., `product`, `any`, `all`, `count`)?

---

## Event Operations

### Q28: Event kinds — `pulse`, `wrap`, `combine`, `never`, `const`

**Context**: Events are discrete occurrences (fire/don't-fire). `pulse` fires from time root. `wrap` converts signal threshold crossing to event. `combine` merges events (any/all). `never` and `const` are identity/zero elements.

- **Pro keep**: Events are a distinct domain (discrete vs continuous). These operations define how events are created and combined. Without them, no event-driven animation.
- **Con**: `combine(any)` is OR, `combine(all)` is AND — these are the boolean operators for events. `never` and `const` are identity elements. Minimal and clean.

**Recommendation**: Keep all. These form a complete, minimal algebra for events. **Question**: Is the event system in scope for the current phase, or should it be deferred entirely?

---

## Cross-Cutting Questions

### Q29: Generic extract/construct vs named-per-type

**Context**: Currently there are 7 extraction kernels (`vec3ExtractX/Y/Z`, `colorExtractR/G/B/A`) and ~5 construction kernels (`makeVec2`, `makeVec3`, `makeColorSig`, etc.), each named per type and component. Both at signal and field level.

- **Option A**: Keep named-per-type. Simple dispatch, explicit, no indirection.
- **Option B**: Generic `extract(value, componentIndex)` and `construct(type, ...components)`. One kernel each, parameterized. Prevents enum growth when new payload types are added.

**Question**: Which approach? Option B is cleaner architecturally but requires the dispatch to handle a parameter rather than a name.

---

### Q30: Field-level dispatch — separate kernel table vs opcode reuse

**Context**: Field kernels (`fieldAdd`, `fieldMultiply`, `fieldExtractX`, etc.) duplicate scalar opcodes at field granularity. Two possible architectures:

- **Option A (current)**: Separate field kernel dispatch table in `FieldKernels.ts`. Each field operation is a named function.
- **Option B**: Field evaluation reuses scalar opcodes by iterating over buffer lanes. `zip(add, fieldA, fieldB)` dispatches `add` per-lane. No separate field kernel registry needed.

**Question**: Option B would eliminate ~15 field kernels that duplicate scalar ops. Is the current field dispatch infrastructure close enough to support this, or is it a significant refactor?

---

### Q31: Composite block infrastructure

**Context**: Many removal recommendations depend on expressing operations as composite blocks that expand during compilation. This infrastructure does not fully exist yet.

**Question**: What is the priority of composite block expansion? Many kernels (oscillators, easing, layouts) can't be removed until composite blocks can replace them. Should we:

- **(A)** Remove kernels now, accept that those features are temporarily unavailable
- **(B)** Build composite block expansion first, then remove kernels
- **(C)** Keep a minimal set of "important" kernels (oscillators + one layout) as temporary exceptions, remove everything else now

---

## Summary Table

| # | Kernel(s) | Verdict | Depends On |
|---|-----------|---------|------------|
| Q1 | Core arithmetic | **Keep** | — |
| Q2 | sin, cos, tan | **Keep sin/cos, question tan** | — |
| Q3 | min, max, clamp, lerp | **Keep** | — |
| Q4 | eq, lt, gt | **Keep** | — |
| Q5 | floor, ceil, round, fract | **Keep floor, question rest** | — |
| Q6 | sqrt, exp, log, sign | **Keep sqrt, question rest** | — |
| Q7 | wrap01 | **Keep** | — |
| Q8 | hash | **Keep** | — |
| Q9 | vec3ExtractX/Y/Z, colorExtract* | **Keep capability, question naming** | Q29 |
| Q10 | makeVec2/3, makeColorSig | **Keep capability, fix signal-level** | Q29 |
| Q11 | vec2ToVec3, fieldSetZ, swizzles | **Keep lift/setZ, remove swizzles** | Q10 |
| Q12 | Oscillators (6) | **Remove → composite blocks** | Q31 |
| Q13 | Easing (9) | **Remove → composite blocks** | Q31 |
| Q14 | smoothstep, step | **Remove** | — |
| Q15 | noise | **Remove → use hash opcode** | — |
| Q16 | combine_* (5) | **Remove → port-level policy** | Fan-in redesign |
| Q17 | fieldAdd, fieldMultiply | **Remove IF zip dispatches opcodes** | Q30 |
| Q18 | fieldPolarToCartesian | **Remove → composite block** | Q31 |
| Q19 | hsvToRgb | **Keep for now** | Q31 |
| Q20 | perElementOpacity, applyOpacity | **Remove** | Q10 |
| Q21 | fieldAngularOffset, fieldRadiusSqrt | **Remove** | — |
| Q22 | Animation effects (6) | **Remove** | — |
| Q23 | Layout kernels (7) | **Remove → composite blocks** | Q31 |
| Q24 | polygonVertex, starVertex | **Remove** | Q31 |
| Q25 | broadcastColor | **Remove** | Q10 |
| Q26 | 3D layout kernels (4) | **Remove** | Q31 |
| Q27 | Reduce ops (4) | **Keep** | — |
| Q28 | Event ops (5) | **Keep (if events in scope)** | Scope decision |
| Q29 | Generic extract/construct | **Design question** | — |
| Q30 | Field dispatch architecture | **Design question** | — |
| Q31 | Composite block infrastructure | **Sequencing question** | — |
