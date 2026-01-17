# What Is A Domain?

## Part 1: The Concept of Domain (Abstract)

### Definition

A **domain** is a classification that defines a kind of element. It answers the question: "What *type of thing* are we talking about?"

A domain specifies:

1. **What kind of thing the elements are** — The ontological category
2. **What operations make sense for those elements** — The valid transformations
3. **What intrinsic properties elements have** — The inherent attributes

A domain is **not**:
- A count of elements
- A spatial arrangement or layout
- A specific instantiation or configuration

### The Key Distinction: Domain vs. Instantiation

This is the critical insight: **domain** and **instantiation** are orthogonal concerns.

- **Domain**: "These are *shapes*" (classification)
- **Instantiation**: "There are 100 of them arranged in a grid" (configuration)

You can have:
- 100 shapes in a grid
- 50 shapes along a spiral
- 1000 shapes scattered randomly

All three are the *same domain* (shape) with *different instantiations*.

The domain tells you what operations are valid. The instantiation tells you how many elements exist and where they are.

---

### Elaboration: What Kind of Thing Elements Are

The domain declares the ontological category of its elements. This is not about data types (float, vec2, color) — it's about *what the thing fundamentally is*.

**Examples:**

| Domain | Elements are... |
|--------|----------------|
| `shape` | 2D geometric primitives (circles, rectangles, polygons) |
| `path` | Points sampled along a parametric curve |
| `text` | Individual glyphs or characters |
| `mesh` | Vertices or faces of a 3D mesh |
| `audio` | Samples in a buffer, or polyphonic voices |
| `particle` | Point masses in a physics simulation |
| `pixel` | Individual pixels in an image buffer |

Knowing the domain immediately tells you *what you're working with* without needing to inspect any data.

---

### Elaboration: What Operations Make Sense

Each domain admits certain operations and excludes others. The domain acts as a filter on what transformations are meaningful.

**Examples:**

| Domain | Valid Operations | Invalid/Meaningless Operations |
|--------|-----------------|-------------------------------|
| `shape` | translate, rotate, scale, boolean union/difference, extrude | kern, conjugate, bandpass filter |
| `path` | sample at t, subdivide, offset, reverse | rotate individual points (breaks continuity), kern |
| `text` | kern, set font weight, align baseline, substitute ligatures | boolean union, extrude, bandpass filter |
| `audio` | filter, envelope, pitch shift, mix | rotate, kern, boolean union |
| `mesh` | subdivide, smooth, deform, compute normals | kern, set font weight |

An operation being "invalid" doesn't mean it would crash — it means it **doesn't make semantic sense**. You *could* apply a bandpass filter to text glyph positions, but the result is nonsense. The domain classification prevents this category error.

---

### Elaboration: What Intrinsic Properties Elements Have

Each domain grants its elements certain inherent attributes — properties that exist simply because of *what the element is*, not because someone assigned them.

**Examples:**

| Domain | Intrinsic Properties |
|--------|---------------------|
| `shape` | position, bounds, area, centroid, perimeter |
| `path` | parametric position t ∈ [0,1], tangent vector, curvature, arc length |
| `text` | character code, glyph index, baseline offset, advance width |
| `mesh` | vertex position, normal vector, UV coordinates, face adjacency |
| `audio` | amplitude, phase, frequency (if transformed), sample index |
| `particle` | position, velocity, mass, age |

These properties are **not stored data** in the traditional sense — they are *consequences of domain membership*. A point on a path *has* a tangent vector by virtue of being on a path. A glyph *has* an advance width by virtue of being text.

Some intrinsic properties are:
- **Derivable**: Computed from the element's state (e.g., area from vertices)
- **Inherent**: Present by definition (e.g., t ∈ [0,1] for path points)
- **Relational**: Defined by relationship to neighbors (e.g., face adjacency in mesh)

---

### Domain Reference Table

| Domain | Elements are... | Intrinsic Properties | Sensible Operations |
|--------|----------------|---------------------|-------------------|
| `shape` | 2D geometric primitives | position, bounds, area, centroid | translate, scale, rotate, boolean ops, extrude |
| `path` | Points along a curve | t (0→1), tangent, curvature, arc length | sample, subdivide, offset, reverse |
| `text` | Glyphs/characters | char code, baseline, advance width | kern, style, align, substitute |
| `mesh` | Vertices/faces | normal, UV, adjacency | deform, subdivide, smooth |
| `audio` | Samples or voices | amplitude, phase, sample index | filter, envelope, mix, pitch shift |
| `particle` | Point masses | position, velocity, mass, age | integrate, collide, emit, kill |
| `pixel` | Image buffer cells | x, y, color channels | convolve, blend, threshold |

---

### Domains Are Not Data Types

It's tempting to confuse domains with data types, but they are distinct:

- **Data type**: What the *value* is made of (float, vec2, color, bool)
- **Domain**: What the *element* fundamentally is (shape, path, text)

A shape's position is a `vec2`. Its area is a `float`. Its fill is a `color`. But the *shape itself* is not a vec2, float, or color — it is a **shape**, and that classification (the domain) determines what properties and operations apply.

---

### Domains Enable Type-Safe Composition

When you know the domain of a value, you can:

1. **Validate operations at compile time** — Reject meaningless transformations before runtime
2. **Provide contextual UI** — Show only relevant operations to the user
3. **Infer missing information** — If you're in the `path` domain, `t` is implicitly available
4. **Catch errors early** — Connecting a `text` output to a `mesh` input is a domain mismatch

---

### Summary: The Essence of Domain

A domain is an **answer to the question "what kind of thing is this?"** that:

- Classifies elements into an ontological category
- Determines which operations are semantically valid
- Grants intrinsic properties by virtue of membership
- Is orthogonal to count, layout, and instantiation details

The domain is the *kind*. Everything else is configuration.

---

## Part 2A: Domains in a Generative Animation System (Conceptual)

This section applies the abstract concept of domain to the specific context of a generative animation system — software that creates motion graphics, visualizations, and procedural animations through node-based or programmatic composition.

### Why Domains Matter for Animation

Animation is fundamentally about **things changing over time**. But before anything can change, we must answer: *what things?*

A generative animation system manipulates many different kinds of elements:
- Geometric shapes that move and transform
- Paths that particles follow
- Text that types on or morphs
- Audio that drives visuals
- Layers that composite together
- Timeline events that trigger behaviors

Without domains, these are all just "data" — arrays of numbers with no semantic meaning. With domains, the system *knows what it's working with* and can:
- Offer appropriate tools
- Validate connections
- Provide intrinsic properties automatically
- Catch errors before they become visual glitches

### Domains for Animation

Here is an expanded set of domains relevant to a generative animation system:

| Domain | Elements are... | Intrinsic Properties | Sensible Operations |
|--------|----------------|---------------------|-------------------|
| `shape` | 2D geometric primitives | position, bounds, area, centroid, vertices | translate, rotate, scale, boolean ops, morph |
| `path` | Points along a parametric curve | t ∈ [0,1], tangent, normal, curvature | sample, subdivide, offset, trim, reverse |
| `text` | Glyphs/characters | char, index, baseline, advance, line | kern, style, animate-in, split |
| `particle` | Point masses in simulation | position, velocity, age, mass, life | emit, integrate, collide, kill, attract |
| `mesh` | 3D vertices/faces | position, normal, UV, adjacency | deform, subdivide, smooth, extrude |
| `audio` | Samples or frequency bins | amplitude, phase, frequency, time | analyze, filter, beat-detect, spectrum |
| `pixel` | Image buffer cells | x, y, r, g, b, a | convolve, blend, threshold, distort |
| `layer` | Compositing layers | opacity, blend mode, mask, z-order | composite, mask, blend, nest |
| `sequence` | Timeline keyframes/events | time, value, easing, duration | interpolate, retarget, offset, loop |
| `control` | UI parameters/knobs | value, min, max, default, label | bind, animate, expose, link |
| `voice` | Polyphonic instances | note, velocity, age, voice-id | allocate, steal, release, modulate |
| `stroke` | Brush/pen strokes | pressure, tilt, position along stroke | taper, jitter, offset, stylize |
| `grid` | Regular 2D cell arrangement | row, col, cell-center, neighbors | subdivide, offset, select-region |
| `bone` | Skeletal rig joints | parent, rotation, length, weight | IK-solve, FK-pose, blend, constrain |
| `event` | Discrete occurrences | time, payload, source | trigger, delay, filter, merge |

### Domain Instantiation in Animation

Remember: domain is *what kind*, instantiation is *how many and where*.

In an animation system, instantiation typically involves:

**Count**: How many elements exist
- 100 particles
- 1 shape (yes, count of 1 is valid)
- 500 audio samples per frame

**Layout**: How elements are arranged in space or time
- Grid (rows × columns)
- Along a path (parameterized by t)
- Random scatter
- Timeline (ordered by time)
- Hierarchical (tree structure)

**Lifecycle**: When elements exist
- Static (always present)
- Dynamic (created/destroyed during animation)
- Pooled (fixed max, recycled)

A user might say "give me 100 particles in a circle." The system interprets this as:
- Domain: `particle`
- Count: 100
- Layout: circular arrangement
- Lifecycle: static (or dynamic if emitter-based)

The domain `particle` grants each element intrinsic properties (position, velocity, age) and valid operations (emit, integrate, collide). The instantiation determines there are 100 of them arranged in a circle.

### Intrinsic Properties as Automatic Sources

One of the most powerful consequences of domains in animation: **intrinsic properties are automatically available**.

When you're working with elements in the `path` domain, you don't need to manually compute or wire up:
- `t` — the parametric position (0 at start, 1 at end)
- `tangent` — the direction of travel
- `normal` — perpendicular to tangent
- `curvature` — how sharply the path bends
- `arcLength` — distance traveled from start

These are *given* by the domain. They exist because the element is a path point. The system provides them as built-in sources that any operation can reference.

This is enormously valuable for animation because so many effects depend on these intrinsic values:
- Particles following a path need `tangent` to orient correctly
- Text animation often staggers by `index`
- Grid effects ripple from `distance-to-center`
- Audio visualization maps `frequency` to `color`

Without domains, users must manually wire these relationships. With domains, they're simply *there*.

### Operations as Domain-Scoped Capabilities

The domain determines which operations appear in the UI and which connections are valid.

**Example: Shape domain**
- User creates a shape element
- Transform panel shows: translate, rotate, scale, skew
- Effect menu shows: boolean union/difference, round corners, offset path
- Invalid operations (filter, pitch-shift, kern) are not shown

**Example: Audio domain**
- User connects audio input
- Analysis panel shows: FFT, beat detection, envelope follower
- Effect menu shows: low-pass, high-pass, compress, gate
- Invalid operations (translate, boolean union) are not shown

This is not just UI filtering — it's **semantic correctness**. The system genuinely knows that "translate" doesn't apply to audio, not because someone manually hid the button, but because the domain declaration excludes it.

### Domain Relationships

Domains don't exist in isolation. In animation, elements frequently **cross domain boundaries**:

**Conversion**: Transforming elements from one domain to another
- `text` → `path`: Convert text to outlines
- `path` → `shape`: Stroke a path to get filled shapes
- `shape` → `mesh`: Extrude 2D shape to 3D mesh
- `audio` → `control`: Extract envelope as animation control

**Derivation**: One domain's elements derived from another's
- `particle` emitted along a `path`
- `grid` cells positioned by a `shape`'s bounds
- `bone` joints driving `mesh` vertices

**Mapping**: Values from one domain driving another
- `audio` amplitude → `shape` scale
- `control` value → `particle` emission rate
- `sequence` keyframe → any animatable property

**Aggregation**: Many elements of one domain → single element of another
- Many `pixel` elements → one `layer`
- Many `shape` elements → one `group` (if group were a domain)
- Many `voice` elements → one `audio` output

These relationships are **typed by domain**. The system knows that `text → path` is a valid conversion but `audio → mesh` is not (at least not directly — you'd need intermediate steps).

### User Experience Implications

Domains profoundly affect how users interact with the system:

**1. Contextual Tools**
When a user selects elements, the available tools depend on the domain. No hunting through irrelevant options.

**2. Smart Connections**
When connecting nodes, the system can:
- Allow same-domain connections freely
- Offer conversion nodes for compatible cross-domain connections
- Reject incompatible connections with clear error messages

**3. Autocomplete & Suggestions**
When typing an expression or formula, the system knows which intrinsic properties are available based on context:
- In a particle context: `position`, `velocity`, `age` autocomplete
- In a path context: `t`, `tangent`, `curvature` autocomplete

**4. Error Messages That Make Sense**
Instead of "type mismatch: vec2 vs float", the system can say:
- "Cannot connect audio output to shape input — try adding an Audio Envelope node"
- "Path operations require path elements — this is a particle system"

**5. Templates & Presets**
Domain-aware templates: "Particle system along path" knows it needs a `path` domain source and creates `particle` domain elements that reference it.

### The Animation Loop and Domains

In each frame of animation, the system:

1. **Evaluates controls**: `control` domain elements update from UI or automation
2. **Processes events**: `event` and `sequence` domain elements trigger behaviors
3. **Updates simulations**: `particle`, `physics` domains integrate forward
4. **Computes derived values**: Intrinsic properties recalculated as needed
5. **Renders output**: `shape`, `mesh`, `layer` domains produce visual output; `audio` domain produces sound

Domains organize this flow. The system knows that `particle` simulation must happen before `particle` intrinsic properties (like position) are valid for downstream use.

### Summary: Domains as Semantic Foundation

In a generative animation system, domains provide:

- **Clarity**: Users always know what kind of thing they're manipulating
- **Safety**: Invalid operations are prevented, not just hidden
- **Power**: Intrinsic properties appear automatically
- **Composability**: Cross-domain relationships are explicit and typed
- **Discoverability**: UI adapts to show relevant options

Without domains, an animation system is just "boxes connected by wires carrying numbers." With domains, it's a structured environment where **meaning is preserved** through every transformation.

---

## Part 2B: Domains in a Generative Animation System (Deep Technical)

This section takes the mechanic's view — how domains would actually be implemented in a well-architected animation system. We'll go deep into data structures, type systems, compilation, and runtime considerations.

### Domain as a First-Class Type Construct

At the deepest level, a domain is a **compile-time type tag** that propagates through the system.

```
Domain := {
  id: Symbol,                           // Unique identifier
  intrinsics: Map<Name, PropertySpec>,  // What properties elements have
  operations: Set<OperationId>,         // What ops are valid
  conversions: Map<Domain, Converter>,  // How to convert to other domains
}
```

This is not a runtime data structure (mostly) — it's a **type-level declaration** that informs:
- Type checking during graph construction
- Code generation during compilation
- UI generation for tooling

### The Domain Registry

A well-architected system has a **domain registry** — a central catalog of all known domains.

```
DomainRegistry := {
  domains: Map<DomainId, DomainSpec>,

  // Query capabilities
  getIntrinsics(domain) → PropertySpec[],
  getOperations(domain) → OperationSpec[],
  canConvert(from, to) → bool,
  getConverter(from, to) → Converter | null,

  // Relationship queries
  commonAncestor(a, b) → Domain | null,
  isSubdomainOf(sub, super) → bool,
}
```

The registry is populated at system initialization — either statically compiled or loaded from declarations. User-defined domains (advanced feature) would register here.

### Intrinsic Property Specification

Each domain declares its intrinsic properties with full type information:

```
PropertySpec := {
  name: string,
  type: DataType,                    // float, vec2, color, etc.
  computation: 'inherent' | 'derived' | 'relational',
  derivation?: (element, context) → value,  // If derived
  cacheable: bool,                   // Can value be cached across frames?
  dependencies?: PropertyName[],     // What other properties this depends on
}
```

**Examples for `path` domain:**

```
path.intrinsics = {
  t:         { type: float, computation: 'inherent' },
  position:  { type: vec2,  computation: 'derived',
               derivation: (el, ctx) => ctx.curve.evaluate(el.t) },
  tangent:   { type: vec2,  computation: 'derived',
               derivation: (el, ctx) => ctx.curve.tangentAt(el.t) },
  curvature: { type: float, computation: 'derived',
               derivation: (el, ctx) => ctx.curve.curvatureAt(el.t),
               dependencies: ['tangent'] },
  arcLength: { type: float, computation: 'derived',
               derivation: (el, ctx) => ctx.curve.arcLengthTo(el.t),
               cacheable: true },
}
```

The distinction between `inherent`, `derived`, and `relational` matters for:
- **Inherent**: Stored directly, no computation needed (like `t` for path, `char` for text)
- **Derived**: Computed from element + context (like `position` from `t` + curve)
- **Relational**: Computed from neighbors (like `adjacency` in mesh)

### Operation Specification

Operations are declared with their domain constraints:

```
OperationSpec := {
  id: OperationId,
  name: string,
  domains: Set<DomainId>,           // Which domains this applies to
  signature: {
    inputs: PortSpec[],
    outputs: PortSpec[],
    params: ParamSpec[],
  },
  implementation: OperationImpl,
}
```

**Example: "Translate" operation**

```
translate := {
  id: 'translate',
  name: 'Translate',
  domains: { shape, mesh, particle, path },  // NOT audio, text, control
  signature: {
    inputs: [{ name: 'elements', type: 'field<vec2>', domain: SAME }],
    outputs: [{ name: 'elements', type: 'field<vec2>', domain: SAME }],
    params: [{ name: 'offset', type: 'signal<vec2>' }],
  },
  implementation: (elements, offset) => elements.map(p => p + offset),
}
```

Note `domain: SAME` — this means the output domain matches the input domain. Some operations preserve domain, others transform it.

### Domain Conversion

Cross-domain conversions are explicit transformations:

```
Converter := {
  from: DomainId,
  to: DomainId,
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many',
  convert: (elements: Field<from>) → Field<to>,
}
```

**Example: text → path conversion**

```
textToPath := {
  from: 'text',
  to: 'path',
  cardinality: 'one-to-many',  // One glyph → multiple path contours
  convert: (glyphs) => glyphs.flatMap(g => g.outlinePaths()),
}
```

Conversions have cardinality because element count often changes:
- `text` → `path`: One glyph might produce 2-3 path contours (holes, disconnected parts)
- `path` → `shape`: One path → one filled shape (one-to-one)
- `audio` → `control`: Many samples → one envelope value (many-to-one)

### Type System Integration

The domain becomes part of the **type signature** for every value in the system:

```
SignalType := {
  payload: DataType,      // float, vec2, color, etc.
  cardinality: zero | one | many(domain),
  temporality: continuous | discrete,
  // ... other axes
}
```

When cardinality is `many(domain)`, that domain reference is **load-bearing**:

```
// A field of positions over the 'particle' domain
particlePositions: SignalType = {
  payload: vec2,
  cardinality: many(particle),
  temporality: continuous,
}

// A field of positions over the 'path' domain
pathPositions: SignalType = {
  payload: vec2,
  cardinality: many(path),
  temporality: continuous,
}
```

These are **different types** even though both are `many<vec2>`. You cannot directly wire `particlePositions` to an input expecting `pathPositions` — the domains don't match.

### Instantiation as Separate Concern

Domain instantiation is tracked separately:

```
Instantiation := {
  domain: DomainId,
  count: number | 'dynamic',
  layout: LayoutSpec,
  lifecycle: 'static' | 'dynamic' | 'pooled',
  source: InstantiationSource,  // What created this instantiation
}

LayoutSpec :=
  | { kind: 'unordered' }
  | { kind: 'linear', spacing: float }
  | { kind: 'grid', rows: int, cols: int }
  | { kind: 'along-path', path: PathRef }
  | { kind: 'random', bounds: Rect, seed: int }
  | { kind: 'hierarchical', parent: InstantiationRef }
```

The instantiation is **orthogonal to the domain**. You can have:
- `particle` domain with grid layout
- `particle` domain with random layout
- `shape` domain with grid layout

Same domain, different instantiation.

### Compilation: Domain Resolution

During compilation (graph → executable), domains are resolved and validated:

**Phase: Domain Inference**
- Walk the graph
- Infer domain for each edge based on source node
- Propagate domain through domain-preserving operations
- Insert conversion nodes where domains change

**Phase: Domain Validation**
- Check all connections are domain-compatible
- Verify operations only apply to valid domains
- Ensure intrinsic property references are valid for their domain

**Phase: Domain Erasure**
- Domains are primarily compile-time constructs
- At runtime, we just have arrays and loop bounds
- But domain information may be preserved for debugging/visualization

### Runtime: What Remains of Domains

After compilation, domains are mostly erased. What remains:

**Loop Bounds**: The domain's instantiation becomes a loop count
```
for i in 0..particleCount:
  positions[i] = positions[i] + velocities[i] * dt
```

**Intrinsic Computations**: Derived properties become computed values
```
// Path domain intrinsic 't' maps to array index
t[i] = i / (pathPointCount - 1)
```

**Dispatch Tables**: Operations may dispatch based on domain for optimized implementations
```
// Particle domain has SIMD-optimized integration
particleDomain.integrate = simdParticleIntegrate
// Path domain has curve-aware integration
pathDomain.integrate = curveConstrainedIntegrate
```

### Memory Layout and Domain

Domains can inform memory layout for cache efficiency:

**Structure of Arrays (SoA) by Domain**:
```
ParticleDomain := {
  positions: Float32Array[N * 2],  // vec2 × N
  velocities: Float32Array[N * 2],
  ages: Float32Array[N],
  masses: Float32Array[N],
}
```

All particles are stored together, all properties for a domain are contiguous. This is vastly more cache-friendly than storing heterogeneous elements together.

**Cross-Domain References**:
When one domain references another (particles along a path), indices are used:
```
PathFollowingParticle := {
  particleIndex: int,  // Index in particle domain
  pathIndex: int,      // Index in path domain
  t: float,            // Position along that path element
}
```

### Hot Path Optimization

The domain system enables targeted optimization:

**Domain-Specific SIMD**: Particle physics can use SIMD for position/velocity updates because the domain guarantees all elements have the same structure.

**Batched Rendering**: All elements of `shape` domain can be batched into a single draw call if they share material properties.

**Incremental Update**: If only `control` domain changed this frame, `particle` simulation can be skipped (dependency tracking by domain).

**Culling by Domain**: Visibility culling can operate at domain level — if no `mesh` elements are visible, skip entire mesh rendering pipeline.

### Domain Subtyping (Advanced)

Some systems support domain subtyping:

```
// 'circle' is a subdomain of 'shape'
circle <: shape

// Operations valid for 'shape' are automatically valid for 'circle'
// 'circle' may have additional intrinsics (radius, center)
// 'circle' may have additional operations (set-radius)
```

This enables:
- Generic operations that work on any shape
- Specialized operations that only work on circles
- Gradual refinement of domain specificity

### Error Handling by Domain

Domains enable domain-specific error handling:

```
DomainError := {
  domain: DomainId,
  element: ElementIndex,
  error: ErrorSpec,
  recovery: RecoveryStrategy,
}

// Particle domain: death is a valid outcome, not an error
particle.onOutOfBounds = 'kill'

// Shape domain: out of bounds is an error
shape.onOutOfBounds = 'clamp-and-warn'

// Audio domain: clipping is handled differently
audio.onOverflow = 'soft-clip'
```

### Summary: The Mechanical Reality

Under the hood, domains are:

1. **Type tags** that propagate through the system at compile time
2. **Registry entries** that declare intrinsics and valid operations
3. **Validation constraints** that catch errors before runtime
4. **Memory layout hints** that enable cache-friendly data structures
5. **Optimization boundaries** that enable domain-specific fast paths
6. **Erasable** — mostly gone at runtime, replaced by concrete loops and arrays

The domain system is the **spine** of the architecture. It's not just metadata — it determines what connections are valid, what operations exist, how memory is laid out, and how errors are handled.

A well-implemented domain system makes the impossible states unrepresentable and the common patterns effortless.

---

## Part 3: Domains Applied to This Codebase

This section describes what a correct implementation of domains would look like in Oscilla, independent of what currently exists. We'll cover the type system, IR representation, block library patterns, and most importantly, how to make this intuitive for users who will never know the word "domain."

### 3.1 Domain Catalog for Oscilla

**Immediate (Full attention, beginning to end):**

| Domain | Elements are... | Intrinsic Properties | Core Operations |
|--------|----------------|---------------------|-----------------|
| `shape` | 2D geometric primitives | position, bounds, area, centroid, rotation | translate, rotate, scale, boolean ops |
| `control` | Animatable parameters | value, min, max, default, velocity | lerp, spring, ease, clamp |
| `event` | Discrete occurrences | time, payload, fired | trigger, delay, filter, gate |

**Roadmap (Planned, lower priority):**

| Domain | Elements are... | Intrinsic Properties | Core Operations |
|--------|----------------|---------------------|-----------------|
| `mesh` | 3D vertices/faces | position, normal, UV | deform, subdivide (MVP/POC only) |
| `path` | Curve sample points | t, tangent, normal, curvature | sample, trim, offset |
| `text` | Glyphs/characters | char, index, baseline, advance | kern, style, split |
| `particle` | Simulated point masses | position, velocity, age, life | emit, integrate, collide |
| `audio` | Samples/frequency bins | amplitude, phase, frequency | analyze, filter, envelope |

**Stretch Goal (Far future):**

| Domain | Notes |
|--------|-------|
| `layer` | Compositing layers — may emerge naturally from shape grouping |
| `sequence` | Timeline keyframes — on the fence; may not be needed if events are expressive enough |
| `stroke` | See discussion below |

**Clarification: Why `grid` is NOT a domain**

You're right to question this. `grid` is **not a domain** — it's a **layout**. A grid of shapes and a grid of glyphs are both grids, but they're different domains (shape vs text) with the same layout.

The confusion in the current code comes from conflating:
- Domain: what kind of thing (`shape`)
- Layout: spatial arrangement (`grid`, `circular`, `random`, `along-path`)
- Count: how many (100)

These are three independent axes. You can have:
- 100 shapes in a grid
- 100 shapes in a circle
- 50 shapes scattered randomly
- 100 particles in a grid
- 100 particles along a path

Same domain, different layout. Same layout, different domain. The combinatorics are orthogonal.

**Clarification: `stroke` vs `path`**

These are genuinely different domains:

| Aspect | `path` | `stroke` |
|--------|--------|----------|
| Elements are | Points sampled along a curve | Drawn marks with brush characteristics |
| Intrinsic props | t, tangent, curvature | pressure, tilt, velocity, width |
| Typical source | Mathematical curve, SVG path | Stylus input, brush simulation |
| Typical use | Motion path, shape outline | Artistic marks, calligraphy |

A `stroke` often *follows* a `path`, but carries additional brush/pen metadata. You could convert `path` → `stroke` by adding constant pressure/tilt, or derive a `path` from `stroke` by extracting the centerline.

For MVP, `stroke` is not needed. It becomes relevant when supporting drawing input or brush-based effects.

---

### 3.2 Domain Subtyping: Shape Hierarchy

The `shape` domain benefits from subtyping:

```
shape (base domain)
├── circle
│   └── intrinsics: radius, center (derived: position = center)
├── rectangle
│   └── intrinsics: width, height, corner-radius
├── polygon
│   └── intrinsics: vertices[], vertex-count
├── ellipse
│   └── intrinsics: rx, ry, center
└── line
    └── intrinsics: start, end, length
```

**Subtyping rules:**
- Any operation valid for `shape` is valid for subtypes
- Subtypes may have additional intrinsics (e.g., `circle.radius`)
- Subtypes may have specialized operations (e.g., `circle.set-radius`)
- A `Field<circle>` can be passed where `Field<shape>` is expected (covariance)

**Implementation approach:**
```typescript
type ShapeDomain = 'shape' | 'circle' | 'rectangle' | 'polygon' | 'ellipse' | 'line';

const shapeHierarchy: DomainHierarchy = {
  'shape': { parent: null, intrinsics: ['position', 'bounds', 'area', 'rotation'] },
  'circle': { parent: 'shape', intrinsics: ['radius', 'center'] },
  'rectangle': { parent: 'shape', intrinsics: ['width', 'height', 'cornerRadius'] },
  // ...
};

function isSubdomainOf(sub: DomainId, parent: DomainId): boolean {
  let current = sub;
  while (current) {
    if (current === parent) return true;
    current = shapeHierarchy[current]?.parent;
  }
  return false;
}
```

---

### 3.3 Type System Integration

The domain must be part of the type signature. Here's how it integrates with the existing 5-axis type system:

```typescript
// Current: Cardinality references a DomainId for 'many'
type Cardinality =
  | { kind: 'zero' }                              // Compile-time constant
  | { kind: 'one' }                               // Single value
  | { kind: 'many'; domain: DomainRef };          // N values over a domain

// The DomainRef currently just holds an ID. It should hold the DOMAIN TYPE:
interface DomainRef {
  readonly kind: 'domain';
  readonly domainType: DomainId;        // 'shape', 'circle', 'particle', etc.
  readonly instanceId: InstanceId;       // Which instantiation (see 3.5)
}
```

**Key insight**: The `DomainRef` has TWO parts:
1. `domainType`: What KIND of thing (the domain proper)
2. `instanceId`: WHICH collection of those things (the instantiation)

This separation is crucial. You might have multiple instantiations of the same domain type:
- "foreground shapes" (50 circles)
- "background shapes" (200 rectangles)

Both are `shape` domain, but different instances. Operations must track which instance they're working with.

---

### 3.4 IR Representation

The IR needs to represent domains and instances cleanly:

```typescript
// Domain declaration (compile-time, from registry)
interface DomainSpec {
  readonly id: DomainId;
  readonly parent: DomainId | null;           // For subtyping
  readonly intrinsics: readonly IntrinsicSpec[];
  readonly operations: readonly OperationId[];
}

// Intrinsic property specification
interface IntrinsicSpec {
  readonly name: string;
  readonly type: PayloadType;
  readonly computation: 'inherent' | 'derived' | 'relational';
  readonly derivation?: DerivationFn;         // For derived intrinsics
}

// Instance declaration (per-patch, in the graph)
interface InstanceDecl {
  readonly id: InstanceId;
  readonly domainType: DomainId;
  readonly count: number | 'dynamic';
  readonly layout: LayoutSpec;
  readonly lifecycle: 'static' | 'dynamic' | 'pooled';
}

// Layout specification (orthogonal to domain)
type LayoutSpec =
  | { kind: 'unordered' }
  | { kind: 'linear'; spacing: number }
  | { kind: 'grid'; rows: number; cols: number }
  | { kind: 'circular'; radius: number }
  | { kind: 'along-path'; pathRef: FieldExprId }
  | { kind: 'random'; bounds: Rect; seed: number }
  | { kind: 'custom'; positionField: FieldExprId };

// The compiled program includes both
interface CompiledProgram {
  readonly domainSpecs: ReadonlyMap<DomainId, DomainSpec>;    // From registry
  readonly instances: ReadonlyMap<InstanceId, InstanceDecl>;  // From graph
  readonly fields: ReadonlyMap<FieldExprId, FieldExpr>;
  readonly steps: readonly Step[];
  // ...
}
```

**Field expressions now carry full domain info:**

```typescript
interface FieldExprSource {
  readonly kind: 'source';
  readonly domainType: DomainId;      // 'shape', 'circle', etc.
  readonly instanceId: InstanceId;     // Which instantiation
  readonly intrinsic: string;          // 'position', 'radius', etc.
  readonly type: SignalType;
}
```

---

### 3.5 The Three-Stage Architecture: Primitive → Array → Layout

The correct architecture separates three orthogonal concerns:

1. **Primitive** — What kind of thing (domain classification)
2. **Array** — How many instances (cardinality transform: one → many)
3. **Layout** — Where they are (spatial arrangement)

Each is a separate block, composable and independent.

---

### 3.6 Primitive Blocks

Primitive blocks create **a single element** of a specific domain type.

```
┌─────────────────────────────┐
│          Circle             │
├─────────────────────────────┤
│ radius: ───────────○        │  ← Input: float (optional)
├─────────────────────────────┤
│               circle ○──────│  ← Output: Signal<circle> (ONE circle)
└─────────────────────────────┘
```

**Key properties:**
- Output type: `signalType('circle')` — cardinality: **one**
- No count, no layout — just defines a single circle
- Domain-specific parameters (e.g., radius for circle)

**Other primitive blocks:**

```
┌─────────────────────────────┐
│        Rectangle            │
├─────────────────────────────┤
│ width: ────────────○        │
│ height: ───────────○        │
├─────────────────────────────┤
│          rectangle ○────────│  ← Signal<rectangle>
└─────────────────────────────┘
```

```
┌─────────────────────────────┐
│         Polygon             │
├─────────────────────────────┤
│ sides: ────────────○        │
├─────────────────────────────┤
│            polygon ○────────│  ← Signal<polygon>
└─────────────────────────────┘
```

All output `Signal<T>` where T is a domain type. One element.

---

### 3.7 Array Block (Cardinality Transform)

The Array block transforms **one element** into **many elements**.

```
┌─────────────────────────────┐
│           Array             │
├─────────────────────────────┤
│ element: ──────────○        │  ← Input: Signal<any-domain> (ONE)
│ count: ────────────○        │  ← Input: Signal<int>
├─────────────────────────────┤
│           elements ○────────│  ← Output: Field<same-domain> (MANY)
│            index ○──────────│  ← Output: Field<int>
│                t ○──────────│  ← Output: Field<float> [0,1]
│           active ○──────────│  ← Output: Field<bool> (for pooling)
└─────────────────────────────┘
```

**Type transform:**
- Input: `Signal<T>` (one element of domain T)
- Output: `Field<T, inst>` (many elements of domain T)

**Pool-based implementation:**
- `maxCount` parameter defines pool size (allocated once)
- `count` input determines how many are active each frame
- `active` output is a boolean mask: `active[i] = (i < count)`

**Example usage:**

```
[Circle] ──element──▶ [Array] ──elements──▶ ...
                        ↑
                    count: 100
                  maxCount: 200
```

This creates 100 circles (from a pool of 200).

**Dynamic count:**

```
[Circle] ──▶ [Array] ──elements──▶ ...
              ↑
    [Audio] ──▶ [Envelope] ──▶ [Remap: 50-150]
```

Count varies 50-150 based on audio. Pool size is 200 (static).

---

### 3.8 Layout Blocks (Spatial Arrangement)

Layout blocks operate on **field** inputs (many elements) and output **position** fields.

```
┌─────────────────────────────┐
│        Grid Layout          │
├─────────────────────────────┤
│ elements: ─────────○        │  ← Input: Field<any>
│ rows: ─────────────○        │  ← Input: Signal<int>
│ cols: ─────────────○        │  ← Input: Signal<int>
├─────────────────────────────┤
│          position ○─────────│  ← Output: Field<vec2, same-instance>
└─────────────────────────────┘
```

**Key properties:**
- Operates on existing elements (field input)
- Outputs position field over the same instance
- Layout parameters can be signals (animated grids!)

**Other layout blocks:**

```
┌─────────────────────────────┐
│      Spiral Layout          │
├─────────────────────────────┤
│ elements: ─────────○        │
│ radius: ───────────○        │
│ turns: ────────────○        │
├─────────────────────────────┤
│          position ○─────────│
│           tangent ○─────────│
└─────────────────────────────┘
```

```
┌─────────────────────────────┐
│    Along Path Layout        │
├─────────────────────────────┤
│ elements: ─────────○        │
│ path: ─────────────○        │  ← Input: Field<path>
├─────────────────────────────┤
│          position ○─────────│
│           tangent ○─────────│
│                 t ○─────────│
└─────────────────────────────┘
```

```
┌─────────────────────────────┐
│     Random Scatter          │
├─────────────────────────────┤
│ elements: ─────────○        │
│ bounds: ───────────○        │
│ seed: ─────────────○        │
├─────────────────────────────┤
│          position ○─────────│
└─────────────────────────────┘
```

**Layout as an operation:**
- Layout is not "configuration" — it's a transformation
- Position is just another field that can be replaced/modified
- Layouts can be chained, blended, or swapped

---

---

### 3.9 Complete Flow Example

Here's a complete graph showing all three stages:

```
[Circle] ──element──▶ [Array] ──elements──▶ [Grid Layout] ──position──▶ [Noise] ──▶ [Render]
 radius: 0.02          ↑  ↑                   ↑  ↑                         ↑
                     count maxCount         rows cols                amplitude
                      100   200               10   10                    0.1
```

**Data flow:**

1. `[Circle]` outputs `Signal<circle>` — ONE circle with radius 0.02
2. `[Array]` transforms to `Field<circle, inst_1>` — 100 circles (from pool of 200)
3. `[Grid Layout]` assigns positions in 10×10 grid → `Field<vec2, inst_1>`
4. `[Noise]` adds random displacement to positions → `Field<vec2, inst_1>`
5. `[Render]` draws all 100 circles at their final positions

**Composability benefits:**

Same circles, different layouts:
```
                    ┌──▶ [Grid Layout] ──▶ [Render: View A]
[Circle] ──▶ [Array]─┼──▶ [Spiral Layout] ──▶ [Render: View B]
                    └──▶ [Along Path] ──▶ [Render: View C]
```

Different primitives, same layout:
```
[Circle] ──▶ [Array × 100] ──▶ [Grid] ──▶ [Render]
[Rectangle] ──▶ [Array × 50] ──▶ [Grid] ──▶ [Render]
```

---

### 3.10 Domain Propagation: How Connected Blocks Know Their Domain

When blocks are connected, domain information flows through the graph:

```
[Circle] ──▶ [Array] ──▶ [Grid Layout] ──▶ [Translate] ──▶ [Render]
    │          │              │                │              │
domain:    domain:        domain:         domain:        domain:
circle     circle        circle          circle         circle
card: one  card: many    card: many      card: many     card: many
           inst: 1       inst: 1         inst: 1        inst: 1
```

**Propagation rules:**

1. **Source blocks** (instance blocks, constants) establish the domain
2. **Transform blocks** inherit domain from their primary input
3. **Combining blocks** (zip, merge) require domain compatibility
4. **Conversion blocks** explicitly change domain

**Example: Domain-preserving operation**

```typescript
// Translate block definition
registerBlock({
  type: 'Translate',
  inputs: [
    { id: 'positions', type: 'field<vec2>', domainConstraint: 'inherit' },
    { id: 'offset', type: 'signal<vec2>' },  // Signal, not field — no domain
  ],
  outputs: [
    { id: 'result', type: 'field<vec2>', domainConstraint: 'same-as:positions' },
  ],
  // ...
});
```

The `domainConstraint: 'inherit'` means "accept any domain from upstream."
The `domainConstraint: 'same-as:positions'` means "output has same domain as positions input."

**Example: Domain-converting operation**

```typescript
// Text to Path conversion
registerBlock({
  type: 'TextToPath',
  inputs: [
    { id: 'glyphs', type: 'field<glyph>', domainConstraint: { type: 'text' } },
  ],
  outputs: [
    { id: 'paths', type: 'field<path>', domainConstraint: { type: 'path', newInstance: true } },
  ],
  // ...
});
```

The output creates a NEW instance of a different domain type.

**Example: Domain-requiring operation**

```typescript
// Circle-specific operation
registerBlock({
  type: 'SetRadius',
  inputs: [
    { id: 'circles', type: 'field<circle>', domainConstraint: { type: 'circle' } },
    { id: 'radius', type: 'field<float>', domainConstraint: 'same-as:circles' },
  ],
  outputs: [
    { id: 'result', type: 'field<circle>', domainConstraint: 'same-as:circles' },
  ],
  // ...
});
```

This block ONLY accepts `circle` domain (or subtypes). Connecting a `rectangle` field would be a compile error.

---

### 3.11 Intrinsic Sources: Design Options

How do users access intrinsic properties (position, radius, index, etc.)?

#### Option I1: Outputs on Array Block

Intrinsics are output ports on the Array block (which creates the instance):

```
┌─────────────────────────────┐
│           Array             │
├─────────────────────────────┤
│ element: ──────────○        │
│ count: ────────────○        │
├─────────────────────────────┤
│           elements ○────────│
│              index ○────────│
│                  t ○────────│
│             active ○────────│
└─────────────────────────────┘
```

**Pros:**
- Discoverable: user sees all available intrinsics
- Explicit: clear where values come from
- Type-safe: outputs have correct domain type

**Cons:**
- Block gets large for domains with many intrinsics
- Every intrinsic needs a wire, even if used far downstream
- Wiring spaghetti if intrinsics used in many places

**Conceptual purity:** High. Intrinsics are explicit outputs.

**Ergonomics:** Medium. Works well for simple graphs, gets unwieldy for complex ones.

#### Option I2: Dedicated "Domain Properties" Block

A separate block that taps into the current domain context:

```
[Circle Instance] ──▶ [Translate] ──▶ [Scale] ──▶ [Render]
                           ▲
                           │
                    [Get: position]
                    [Get: index]
```

The "Get" block reads from whatever domain is flowing through that part of the graph.

**Pros:**
- Intrinsics accessed where needed, not at source
- Reduces wiring
- Block stays small

**Cons:**
- "Which instance?" is implicit — could be confusing
- Needs some way to specify which intrinsic
- Less discoverable (user must know intrinsics exist)

**Conceptual purity:** Medium. The "current domain context" is implicit.

**Ergonomics:** Good for complex graphs, but discoverability suffers.

#### Option I3: Inline Expression Access

Intrinsics accessed via expression syntax in parameter fields:

```
┌─────────────────────────────┐
│          Translate          │
├─────────────────────────────┤
│ offset: [=position * 0.1]   │  ← Expression referencing intrinsic
└─────────────────────────────┘
```

**Pros:**
- Very compact
- No extra blocks or wires
- Powerful (can combine intrinsics in expressions)

**Cons:**
- Requires expression language
- Less visual (text instead of wires)
- Harder to see data flow at a glance

**Conceptual purity:** Medium. Expressions are a different paradigm than node graphs.

**Ergonomics:** Excellent for power users, learning curve for beginners.

#### Option I4: Hybrid — Array Outputs + Context Blocks

Array block has primary intrinsics as outputs (index, t, active). Domain-specific intrinsics accessed via "Get Property" blocks:

```
                      ┌──────────────────┐
[Circle] ──▶ [Array]──│ elements ○───────│──▶ [Translate] ──▶ ...
                      │ index ○──────────│
                      │ t ○──────────────│
                      └──────────────────┘
                           │
                           │   (later in the graph)
                           │
                           └──▶ [Get: radius] ──▶ [Color Map] ──▶ ...
```

Universal intrinsics (index, t) are Array outputs.
Domain-specific intrinsics (radius for circles) accessed via "Get" blocks.

**Pros:**
- Common intrinsics are discoverable and convenient
- Rare intrinsics don't clutter the instance block
- Best of both worlds

**Cons:**
- Two mechanisms to learn
- "Primary" vs "secondary" is arbitrary

**Conceptual purity:** Medium-high.

**Ergonomics:** Good balance.

#### Recommendation: Option I1

Array block shows universal intrinsics as outputs:

```
┌─────────────────────────────┐
│           Array             │
├─────────────────────────────┤
│ element: ──────────○        │
│ count: ────────────○        │
├─────────────────────────────┤
│           elements ○────────│  ← The field itself
│              index ○────────│  ← Universal intrinsic
│                  t ○────────│  ← Universal intrinsic
│             active ○────────│  ← Pool mask
└─────────────────────────────┘
```

Domain-specific intrinsics (like `radius` for circles, `width` for rectangles) are accessed via:
- **Primitive block outputs** if they're parameters (e.g., `Circle.radius` input becomes intrinsic)
- **Get Property blocks** for derived intrinsics (e.g., area, bounds)

This keeps the Array block domain-agnostic and maximally composable.

---

### 3.12 User Experience: Making Domains Invisible

The goal: users work naturally with shapes, particles, controls — never thinking about "domains."

#### Principle 1: Domain Follows Intent

When a user creates circles:
```
[Circle] ──▶ [Array] ──▶ [Grid Layout] ──▶ ...
```

They think: "I want circles in a grid." The system provides:
- Circle primitive (domain: circle)
- Array (creates 100 instances)
- Grid layout (positions them)

The user didn't configure a "domain type" — they chose "Circle" from the palette and the domain follows naturally.

#### Principle 2: Errors Are Actionable

When domains mismatch:

**Bad error:** "Type error: Field<vec2, shape> incompatible with Field<vec2, audio>"

**Good error:** "Can't connect shape position to audio filter. Try adding a 'Shape to Control' converter."

The error names the domains in user terms and suggests a fix.

#### Principle 3: Conversions Are Suggested

When the user tries to connect incompatible domains, the UI offers:

```
┌────────────────────────────────────┐
│ These can't connect directly.      │
│                                    │
│ Would you like to:                 │
│  ○ Add "Audio → Control" node      │
│  ○ Cancel connection               │
└────────────────────────────────────┘
```

The system knows which conversions are valid and offers them.

#### Principle 4: Block Palette Is Context-Aware

When the user is working with shapes (has shape wires selected), the block palette highlights:
- Shape-compatible operations (translate, rotate, scale)
- Valid conversions (shape → control)

Audio-specific blocks are grayed or hidden.

#### Principle 5: Visual Domain Indicators

Each domain has a subtle visual signature:
- Wire color (shape = blue, control = green, audio = orange)
- Block header tint
- Small icon badge

Users learn to "read" the graph by color without understanding the underlying type system.

---

### 3.13 Steel Thread: End-to-End Example

Let's trace a complete example from user action to rendered frame.

**User Goal:** "100 circles in a grid, pulsing in size based on their distance from center"

#### Step 1: User Creates Circle Primitive

User drags "Circle" block onto canvas.

```
┌─────────────────────────────┐
│          Circle             │
├─────────────────────────────┤
│ radius: [0.02]              │
├─────────────────────────────┤
│               circle ○──────│
└─────────────────────────────┘
```

**What happens internally:**
- Output typed as `Signal<circle>` (cardinality: one)
- Domain: circle, count: 1

#### Step 2: User Creates Array

User drags "Array" block and connects circle to it.

```
[Circle] ──▶ [Array]
              ↑
         count: [100]
       maxCount: 200
```

**What happens internally:**
- Input: `Signal<circle>`
- Output: `Field<circle, inst_1>` where inst_1 is a new instance
- Instance registered: `{ id: 'inst_1', domainType: 'circle', maxCount: 200, lifecycle: 'pooled' }`
- Pool allocated: 200-element buffers (positions, radii, active flags)
- Active count: 100 (indices 0-99 active, 100-199 inactive)

#### Step 3: User Applies Grid Layout

User drags "Grid Layout" and connects array output.

```
[Circle] ──▶ [Array] ──elements──▶ [Grid Layout] ──position──▶ ...
                                        ↑
                                    rows: 10
                                    cols: 10
```

**What happens internally:**
- Grid layout reads instance from `elements` field: inst_1
- Computes grid positions for active elements (0-99)
- Output: `Field<vec2, inst_1>` — position per circle

#### Step 4: User Computes Distance from Center

User adds "Distance" block.

```
[Grid Layout] ──position──▶ [Distance] ──▶ ...
                                 │
                        center: [0.5, 0.5]
```

**What happens internally:**
- Distance inherits instance from position field: inst_1
- Output: `Field<float, inst_1>` — distance per circle

#### Step 5: User Maps Distance to Size

User adds Remap to scale distance to size range.

```
[Distance] ──▶ [Remap] ──▶ ...
                 │
           in: [0, 0.7]
          out: [0.01, 0.05]
```

**What happens internally:**
- Remap operates per-element
- Output: `Field<float, inst_1>` — size per circle

#### Step 6: User Adds Time-Based Pulsing

User wants pulsing animation.

```
[Time] ──▶ [LFO] ──▶ [Multiply] ──▶ ...
                        ↑
                  (size field)
```

**Type consideration:**
- LFO outputs `Signal<float>` (cardinality: one)
- Size is `Field<float, inst_1>` (cardinality: many)
- Multiply broadcasts signal across field
- Result: `Field<float, inst_1>` — pulsing size per circle

#### Step 7: User Renders

```
[Grid Layout] ──position──┐
                          ├──▶ [Render]
[Multiply] ──size─────────┘
```

**What happens internally:**
- Render accepts position and size fields
- Both must be over same instance → inst_1 ✓
- Render iterates only over active elements (0-99)

#### Compilation Result

```typescript
// Instance declaration
instances: {
  'inst_1': {
    domainType: 'circle',
    maxCount: 200,
    count: 100,  // Active count
    lifecycle: 'pooled'
  }
}

// Field expressions
fields: {
  'f_elements': { kind: 'array', primitiveId: 'prim_circle', instanceId: 'inst_1' },
  'f_position': { kind: 'layout', layout: 'grid', instanceId: 'inst_1', params: { rows: 10, cols: 10 } },
  'f_distance': { kind: 'map', input: 'f_position', fn: 'distance_from_center' },
  'f_size': { kind: 'map', input: 'f_distance', fn: 'remap_0_0.7_to_0.01_0.05' },
  'f_pulsing': { kind: 'zipSig', field: 'f_size', signals: ['s_lfo'], fn: 'multiply' },
}

// Signals
signals: {
  's_time': { kind: 'time', which: 'tMs' },
  's_lfo': { kind: 'map', input: 's_time', fn: 'lfo_sine' },
}

// Steps
steps: [
  { kind: 'materialize', field: 'f_position', instanceId: 'inst_1', target: slot_0 },
  { kind: 'materialize', field: 'f_pulsing', instanceId: 'inst_1', target: slot_1 },
  { kind: 'render', instanceId: 'inst_1', position: slot_0, size: slot_1 },
]
```

#### Runtime Execution

Each frame:

1. Evaluate `s_time` → current milliseconds
2. Evaluate `s_lfo` → sin(time) mapped to 0..1
3. For each active element (i = 0..99):
   - Read position from slot_0[i] (grid layout computed)
   - Compute distance from position to center
   - Remap distance → base size
   - Multiply by LFO → pulsing size
   - Store in slot_1[i]
4. Render all 100 circles using position and size arrays
5. Inactive elements (i = 100..199) are skipped

The domain information is mostly erased at runtime — just arrays, loops, and an active mask. But the domain system ensured at compile time that all operations are valid and all arrays are the right size.

---

### 3.14 What Doesn't Exist Yet: Gap Analysis

Before Part 4 (touch points), let's identify what the correct architecture requires that may not exist:

**Type System:**
- Domain type as part of SignalType (not just DomainId, but domain classification)
- Instance ID separate from domain type
- Primitive concept (Signal<T> for single elements)
- Domain hierarchy for subtyping
- Domain constraint specifications for block ports

**IR:**
- Primitive declarations (what defines a single element)
- Instance declarations (pool-based, separate from domain specs)
- Layout as field operations (not instance configuration)
- FieldExprArray (created by Array block)
- FieldExprLayout (created by layout blocks)
- Intrinsic derivation functions

**Block Library:**
- Primitive blocks per domain type (Circle, Rectangle, etc.)
- Array block (cardinality transform: one → many)
- Layout blocks as operations (Grid, Spiral, Random, AlongPath)
- Intrinsic access patterns (universal: index/t/active, domain-specific via Get blocks)
- Domain conversion blocks

**Compiler:**
- Domain inference pass
- Domain validation pass
- Primitive resolution
- Instance resolution (pool allocation)
- Layout evaluation (as field operations)

**UI:**
- Domain-colored wires
- Context-aware block palette
- Conversion suggestions on mismatch
- Visual distinction between Signal<T> (one) and Field<T> (many)

**Runtime:**
- Pool-based instance buffers (allocated once)
- Active mask evaluation (toggles visibility)
- Layout evaluation as field computation (per-frame for dynamic layouts)

---

## Conclusion

This document establishes the correct understanding of **domain** as a fundamental concept in Oscilla:

1. **Domain is classification, not instantiation.** A domain answers "what kind of thing?" — shape, control, event — not "how many?" or "where?"

2. **Three orthogonal stages:** The architecture separates:
   - **Primitive** (domain classification: what kind)
   - **Array** (cardinality: how many)
   - **Layout** (spatial arrangement: where)

3. **Cardinality is explicit in the type system:**
   - `Signal<T>` — one element of domain T
   - `Field<T, instance>` — many elements of domain T
   - Array block is the transform: one → many

4. **Pool-based performance:** Instances allocate once (maxCount), use active mask to toggle visibility. No reallocation when count changes dynamically.

5. **Layout is an operation, not configuration.** Layout blocks operate on existing fields, outputting position fields. Position is not special — it's just another field that can be replaced or transformed.

6. **Domain enables semantic correctness.** Operations are valid for specific domains. Connections are checked for domain compatibility. Intrinsic properties are granted by domain membership.

7. **Users never see "domain."** They see circles, particles, controls. The domain system operates beneath the surface, providing type safety and intelligent tooling without exposing abstract concepts.

8. **Implementation requires a clean break.** The current `DomainDef`, `DomainId`, and related code embody multiple incorrect conflations. A scorched-earth migration is necessary — no bridging, no dual code paths.

The detailed refactoring plan is in `WHAT-IS-A-DOMAIN-PART-4-REFACTOR.md`.
