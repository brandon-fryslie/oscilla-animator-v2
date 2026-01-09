# Primitives and Composites (Unified Spec)

This document captures early architecture ideas focused on domain identity, field mappers, renderer sinks, and a starter composite library. It is aligned with the unified spec and avoids temporal semantics.

## Core Model

**Domain -> Field Mappers -> Renderers** is the fundamental architecture.

- **Domain** defines stable element identity and count.
- **Field mappers** compute per-element attributes (positions, sizes, colors).
- **Renderers** materialize fields and emit render output.

Domain is a first-class value (`special:domain`), not a count or a field of positions.

"Points" are not a primitive. A "points" block is a composite of domain + position mapping + renderer.

## Definitions

**Primitive block**: an atomic block with a dedicated compiler/runtime implementation. It is not expanded into other blocks. Primitives are the building blocks for composites.

**Composite block**: a block whose implementation is another graph. GraphNormalization expands composites into primitives and derived blocks with stable IDs. Composites exist for UX and library ergonomics, not for new semantics.

## Primitive Blocks (Non-Time)

These are recommended primitives that keep the system orthogonal and avoid "mystery blocks." They are not mandatory, but they represent a clean minimal set.

### Domain Primitives

- **DomainN**
  - Inputs: `n` (scalar:number), `seed` (scalar:number, optional)
  - Output: `domain` (special:domain)
  - Policy: stable IDs for unchanged (n, seed); deterministic append on growth; stable prefix on shrink.

- **DomainFromSVGSample**
  - Inputs: `asset` (special:path), `sampleCount` (scalar:number), `seed` (scalar:number, optional)
  - Outputs: `domain` (special:domain), `pos` (field:vec2), optional `bounds` (special:bounds)
  - Policy: stable IDs for unchanged (asset, sampleCount, seed); deterministic sampling.

### Position Mappers (Domain -> Field<vec2>)

- **PositionMapGrid**
  - Inputs: `domain`, `rows`, `cols`, `spacing`, `origin`, `order`
  - Output: `pos` (field:vec2)
  - Supports `fit` policy for count mismatch (wrap/crop/pad).

- **PositionMapCircle**
  - Inputs: `domain`, `center`, `radius`, `startAngle`, `winding`, `distribution`
  - Output: `pos` (field:vec2)

- **PositionMapLine**
  - Inputs: `domain`, `a`, `b`, `distribution`
  - Output: `pos` (field:vec2)

### Field Generators

- **FieldConstNumber / FieldConstColor / FieldConstVec2**
  - Inputs: `domain`, `value`
  - Output: `out` (field)

- **FieldHash01ById**
  - Inputs: `domain`, `seed`
  - Output: `u` (field:number in [0,1))
  - Must be stable per element ID + seed.

- **FieldHashVec2ById** (optional)
  - Inputs: `domain`, `seed`
  - Output: `v` (field:vec2)

- **FieldColorize**
  - Inputs: `values` (field:number)
  - Params: `hueStart`, `hueEnd`, `saturation`, `lightness`
  - Output: `color` (field:color)

### Field Combinators

- **FieldMapNumber / FieldMapVec2**
  - Unary mapping using a function id; compiles to FieldExpr.

- **FieldZipNumber / FieldZipVec2**
  - Binary combine with operation id (add/sub/mul/min/max, etc.).

### World-Lift / Reduction (Explicit Blocks)

- **FieldFromSignal** (broadcast)
  - Inputs: `domain`, `x: signal<T>`
  - Output: `out: field<T>`
  - Heavy; explicit block required.

- **FieldReduceSum / Mean / Min / Max**
  - Inputs: `x: field<T>`
  - Output: `out: signal<T>`
  - Heavy; explicit block required.

### Renderer Primitives

- **RenderInstances2D**
  - Inputs: `domain`, `pos`, `size`, `rot`, `fill`, `opacity`, `shape` or `pathAsset`
  - Output: `renderTree`
  - Primary sink for field materialization.
  - Prefer emitting a single instanced layer node instead of N independent nodes.

- **LayerCombine**
  - Inputs: `a: renderTree`, `b: renderTree`, `mode`
  - Output: `renderTree`

## Domain Identity and Count Mismatch Rules

- **Domain is authoritative** for identity and count.
- Mappers must produce outputs for every element ID.
- When mapper grid parameters imply a different count than `domain.count`, use an explicit `fit` policy:
  - `wrap`: repeat traversal
  - `crop`: ignore excess rows/cols while still producing outputs for all IDs
  - `pad`: introduce empty slots but still emit outputs (policy-defined)

Count changes are inherently disruptive. They must be deliberate and stable under deterministic ID policies.

## Axes of Variation (Useful for Library Design)

Treat these as independent axes you can mix without new primitives:

- **Arrangement**: Grid/Circle/Line/Path mapping
- **Instance shape**: Circle/Square/Path/Glyph
- **Styling fields**: size, rotation, color, opacity
- **Per-element variation**: hash-based offsets, scatter, noise-free jitter

## Composites: Friendly Building Blocks

Composites are prebuilt graphs expanded during GraphNormalization. They exist for UX, not as primitives.

### Design Rules

- **Composites are decomposable** into primitives without loss of meaning.
- **Composites do not hide identity changes.** They should not change Domain identity unless explicitly configured.
- **Prefer Model B internally** (Domain + Mapper), and expose Model A as composites for ease of use.

### Starter Composite Library (No Time/Phase)

#### Arrangement Composites

- **Grid Points**
  - Inputs: `count`, `seed`, `rows`, `cols`, `spacing`, `origin`, `order`, `fit`
  - Outputs: `domain`, `pos`
  - Nodes:
    - `domain`: DomainN
    - `grid`: PositionMapGrid
  - Edges:
    - `domain.domain` -> `grid.domain`

- **Circle Points**
  - Inputs: `count`, `seed`, `center`, `radius`, `startAngle`, `winding`, `distribution`
  - Outputs: `domain`, `pos`
  - Nodes:
    - `domain`: DomainN
    - `circle`: PositionMapCircle
  - Edges:
    - `domain.domain` -> `circle.domain`

- **Line Points**
  - Inputs: `count`, `seed`, `a`, `b`, `distribution`
  - Outputs: `domain`, `pos`
  - Nodes:
    - `domain`: DomainN
    - `line`: PositionMapLine
  - Edges:
    - `domain.domain` -> `line.domain`

- **SVG Sample Points**
  - Inputs: `asset`, `sampleCount`, `seed`
  - Outputs: `domain`, `pos`, `bounds`
  - Nodes:
    - `sample`: DomainFromSVGSample
  - Edges: (none)

#### Per-Element Variation Composites

- **Per-Element Random (Stable)**
  - Inputs: `domain`, `seed`
  - Outputs: `u` (field:number)
  - Nodes:
    - `hash`: FieldHash01ById
  - Edges: (none)

- **Per-Element Size Scatter**
  - Inputs: `domain`, `seed`, `min`, `max`
  - Outputs: `size` (field:number)
  - Nodes:
    - `hash`: FieldHash01ById
    - `map`: FieldMapNumber (mapRange)
  - Edges:
    - `hash.u` -> `map.x`

- **Per-Element Rotation Scatter**
  - Inputs: `domain`, `seed`, `min`, `max`
  - Outputs: `rot` (field:number)
  - Nodes:
    - `hash`: FieldHash01ById
    - `map`: FieldMapNumber (mapRange)
  - Edges:
    - `hash.u` -> `map.x`

- **Per-Element Color Scatter**
  - Inputs: `domain`, `seed`, `hueStart`, `hueEnd`, `saturation`, `lightness`
  - Outputs: `fill` (field:color)
  - Nodes:
    - `hash`: FieldHash01ById
    - `colorize`: FieldColorize
  - Edges:
    - `hash.u` -> `colorize.values`

#### Render Composites

- **Dots Renderer (Ambient)**
  - Inputs: `domain`, `pos`, `size`, `fill`, `opacity`
  - Outputs: `renderTree`
  - Nodes:
    - `render`: RenderInstances2D (shape=circle)
  - Edges: (none; inputs map directly)

- **Path Instances Renderer**
  - Inputs: `domain`, `pos`, `size`, `rot`, `fill`, `opacity`, `pathAsset`
  - Outputs: `renderTree`
  - Nodes:
    - `render`: RenderInstances2D (shape=path)
  - Edges: (none; inputs map directly)

Composites that require dynamic inputs must accept explicit signal inputs and remain agnostic about their source (no built-in source assumptions).

## Composite Graph Format (Concrete)

Composite definitions are structured data with explicit nodes, edges, and input/output mappings.

Conventions:
- `nodeId.portId` is the canonical port reference format.
- `inputMap` wires composite inputs to internal node ports.
- `outputMap` exposes internal node ports as composite outputs.
- `params` are constants unless they explicitly reference a composite input using `{ "__fromInput": "<inputId>" }`.

## Renderer Materialization Guidance

Renderers are the canonical materialization sink. A renderer should:

- Evaluate only the fields it actually uses.
- Batch-evaluate fields into typed buffers once per frame per domain.
- Reuse buffers to avoid per-frame allocations.
- Cache field evaluations when inputs are frame-invariant.
- Prefer compact buffer layouts (interleaved or parallel arrays) for vec2 and color fields.

This keeps field evaluation lazy, predictable, and performant.
