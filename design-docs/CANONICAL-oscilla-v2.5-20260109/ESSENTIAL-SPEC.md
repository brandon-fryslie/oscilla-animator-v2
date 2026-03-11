# Oscilla v2.5: Essential Specification

> **Purpose:** Condensed spec for agent consumption during implementation.
> For full detail, rationale, and examples, see individual topic files.
> Token target: <30k (vs ~124k for full spec)

---

## System Invariants

> **These rules are non-negotiable. Violations indicate bugs.**

### A. Time, Continuity, and Edit-Safety

| ID | Rule | Enforcement |
|----|------|-------------|
| I1 | Time is monotonic, never wraps/resets/clamps | Wall-clock conversion to f32 |
| I2 | Gauge invariance: effective values continuous across discontinuities | Continuity System |
| I3 | State migration with stable StateIds | Migration Compute Pass |
| I4 | Deterministic event ordering | Explicit ordering in scheduler |
| I5 | Single time authority per patch | Single TimeRoot |

### B. Graph Semantics

| ID | Rule | Enforcement |
|----|------|-------------|
| I6 | Compiler never mutates the graph | NormalizedGraph is immutable input |
| I7 | Cycles must cross stateful boundary | Tarjan's SCC + validation |
| I8 | Arena-addressed execution (no string lookups) | Hardcoded byte offsets |
| I9 | Schedule is data | Naga module structure |
| I10 | Uniform transform semantics (table-driven) | Transform registry |

### C. Lanes, Identity, and Performance

| ID | Rule | Enforcement |
|----|------|-------------|
| I11 | Stable element identity | Pool-based allocation |
| I12 | SoA Layout | Channel-separated contiguous arrays |
| I13 | Structural sharing / hash-consing | ExprId canonicalization |
| I14 | Explicit cache keys | Cache key model |

### D. Rendering

| ID | Rule | Enforcement |
|----|------|-------------|
| I15 | Renderer is sink only (no creative logic) | GPU Draw Prep |
| I16 | Indirect Draw | Hardware-native command ABI |
| I17 | Planned batching | Sink metadata in draw prep |
| I18 | Temporal stability (no flicker on swap) | Atomic swap |

### E. Debuggability

| ID | Rule | Enforcement |
|----|------|-------------|
| I19 | First-class error taxonomy | Naga Validation Layer |
| I20 | Source Mapping | SourceMap registry |
| I21 | Deterministic replay | Seeded randomness only |
| I28 | Diagnostic attribution to targets | TargetRef required |
| I29 | Error taxonomy by domain/severity | DiagnosticCode enum |

### F. Live Performance

| ID | Rule | Enforcement |
|----|------|-------------|
| I22 | Safe modulation ranges (normalized domains) | Unit discipline |

### G. Scaling

| ID | Rule | Enforcement |
|----|------|-------------|
| I23 | Patch vs instance separation | Architecture |
| I24 | Snapshot/transaction model | Transaction-based edits |
| I25 | Asset system with stable IDs | ShapeBank registry |

### H. Architecture Laws

| ID | Rule | Enforcement |
|----|------|-------------|
| I26 | Every input has a source (DefaultSource) | GraphNormalization |
| I27 | Toy detector: explicit execution order, identity, state | Entire invariant set |
| I30 | Continuity is deterministic | Uses t_model_ms only |
| I31 | Export matches playback | Same schedule/continuity |

### I. Type System Soundness

| ID | Rule | Enforcement |
|----|------|-------------|
| I32 | Single type authority (CanonicalType only) | CI gate, code review |
| I33 | Only explicit ops change axes | Type-driven kernel contracts |
| I34 | Axis enforcement centralized (validateAxes) | Single gate, no bypass |
| I35 | State scoped by axes (branch + instance) | Runtime state keying |
| I36 | Const literal matches payload kind | constValueMatchesPayload() |

---

## Glossary (Core Terms)

### Type System

**PayloadType**: Discriminated union - `{ kind: 'float' } | { kind: 'int' } | { kind: 'bool' } | { kind: 'vec2' } | { kind: 'vec3' } | { kind: 'color' } | { kind: 'cameraProjection' } | { kind: 'shape2d' } | { kind: 'shape3d' }`

**payloadStride()**: Always derived from payload. `float/int/bool=1`, `vec2=2`, `vec3=3`, `color=4`, `cameraProjection=1`, `shape2d=1`, `shape3d=1`

**UnitType**: 6 structured kinds - `none | count | angle(radians|degrees|phase01) | time(ms|seconds) | space(ndc|world|view, dims:2|3) | color(oklch|rgba01)`.

**Handle**: A `u32` identity value for a persistent shape/topology record in the **ShapeBank**.

**Extent**: 5-axis coordinate (cardinality, temporality, binding, perspective, branch)

**CanonicalType**: Single type authority = `{ payload: PayloadType; unit: UnitType; extent: Extent }`.

**Axis\<T, V\>**: `{ kind: 'var'; var: V } | { kind: 'inst'; value: T }`. `var` MUST NOT escape frontend.

**Cardinality**: `zero` (constant) | `one` (scalar) | `many(instance)` (array)

**Temporality**: `continuous` (every frame) | `discrete` (events only)

**Domain**: Classification defining element kind (shape, circle, particle).

**DomainSpec**: Compile-time domain type spec with parent and intrinsics

**Instance**: Specific collection of domain elements with count and lifecycle

**InstanceDecl**: Per-patch instance declaration (id, domainType, maxCount, lifecycle)

**InstanceRef**: `{ kind: 'instance'; domainType: DomainTypeId; instanceId: InstanceId }`

### Block System

**Block**: Only compute unit. Has `id`, `kind` (NOT type), `role`, `inputs`, `outputs`

**BlockRole**: `{ kind: 'user' }` | `{ kind: 'derived'; meta: DerivedBlockMeta }`

**DerivedBlockMeta**: `defaultSource` | `wireState` | `lens`

**EdgeRole**: `user` | `default` | `auto`

**Stateful Primitives (4)**: UnitDelay, Lag, Phasor, SampleAndHold

**Lane-Local Block**: Per-lane semantics, works for both `one` and `many` cardinality. Lane-local, cardinality-preserving.

**Payload-Specialized Block**: Specialized at compile time into Naga IR.

**Lane**: Individual element within an Instance (GlobalInvocationID.x).

**StateId**: Stable identifier for a state array. Format: `blockId + primitive_kind`.

### Architecture

**Arena**: Monolithic GPU storage buffer containing all mutable state.

**ShapeBank**: Read-only GPU buffer containing `ShapeHeaderV1` records and topology payloads.

**Indirect Command Buffer**: Buffer populated by **Draw Prep** containing hardware-native draw records.

### Compilation

**NormalizedGraph**: Fully explicit graph the compiler consumes.

**Async Compiler Service**: asynchronous service that lowers the user's Graph into a validated Naga IR module.

**Naga Validation Layer**: WASM-based service that validates scoped IR against WebGPU rules.

**GpuLayout**: Metadata resolving abstract Slot IDs into concrete byte offsets in the Arena.

**SourceMap**: Registry linking generated IR instructions back to their originating UI Block IDs.

### Runtime

**Compute Dispatch**: CPU schedules the parallel simulation of logic across the GPU.

**Draw Prep Dispatch**: GPU compute pass that writes indirect command records based on active instance counts.

**Input Marshalling**: High-frequency sync of CPU user state (Mouse, dt) to the GPU Arena header.

**The Swap**: Ping-pong buffer role rotation between frames.

### Combine System

**CombineMode**: Strategy for multi-writer inputs (sum, avg, min, max, mul, last, first, layer, or, and).

### Rails (System Buses)

| Rail | Type | Description |
|------|------|-------------|
| `time` | `one + continuous + float` | tMs value |
| `dt` | `one + continuous + float` | Frame delta time |
| `phaseA` | `one + continuous + float(phase01)` | Primary phase |
| `phaseB` | `one + continuous + float(phase01)` | Secondary phase |
| `pulse` | `one + discrete + unit` | Frame tick |
| `palette` | `one + continuous + color` | Chromatic reference |

---

## Type System (Core)

### PayloadType Semantics

| Type | Stride | Range/Notes |
|------|--------|-------------|
| `float` | 1 | IEEE 754 |
| `int` | 1 | Signed 32-bit |
| `vec2` | 2 | Two floats |
| `vec3` | 3 | Three floats |
| `color` | 4 | RGBA, 0..1 each |
| `float(phase01)` | 1 | strictly `[0, 1)` with wrap semantics |
| `bool` | 1 | true/false |
| `cameraProjection` | 1 | Closed string enum (orthographic/perspective) |
| `shape2d` | 1 | u32 handle to ShapeBank |

### Extent (Five-Axis Coordinate)

```typescript
type Extent = {
  cardinality: AxisTag<Cardinality>;
  temporality: AxisTag<Temporality>;
  binding: AxisTag<Binding>;
  perspective: AxisTag<string>;
  branch: AxisTag<string>;
};
```

---

## Compilation (Core)

### Naga Lowering Pipeline

```
RawGraph → GraphNormalization → NormalizedGraph → Naga Lowering → Shader Artifacts
```

1. **Recursive Scoped Walk**:Traverses execution edges and emits nested block bodies.
2. **Address Resolution**: Queries `GpuLayout` to resolve byte offsets.
3. **Validation**: Naga checks IR for type-safety and memory invariants.

### GpuLayout Rules (SoA)

- **Scalar Zone**: Packed f32 values.
- **Lane Zone**: Channel-separated contiguous arrays.
- **Alignment**: Every channel block is padded to 256-byte alignment.

---

## Runtime (Core)

### Frame Sequence

Every tick:
1. **Input Marshalling**: Write User State to Arena Header.
2. **Compute Dispatch**: Run simulation kernels.
3. **Draw Prep**: GPU writes indirect commands.
4. **Render Pass**: Rasterize simulation state using vertex pulling.
5. **The Swap**: Rotate buffer roles.

### Storage Model (The Arena)

```typescript
interface ArenaLayout {
  header: 256;      // Uniforms (Time, Mouse)
  scalars: number;  // Global params
  channels: number; // SoA channel blocks
  state: number;    // Persistent cells
}
```

Strict Read-Modify-Write safety via `Arena_Read` and `Arena_Write`.

---

## Renderer (Core)

### Hardware Execution

Renderer executes two indirect command streams:
1. **Indexed Region**: 20-byte `DrawIndexedIndirectArgs` records.
2. **Non-Indexed Region**: 16-byte `DrawIndirectArgs` records.

### Vertex Pulling

Vertex shader fetches geometry from `ShapeBank` and attributes from `Arena` via storage bindings.

---

### Quick Reference

### Coordinate Spaces

- **Local (L)**: Geometry definition & SDF math.
- **World (W)**: Absolute instance placement (Unbounded $\mathbb{R}^3$).
- **View (V)**: Camera-relative world.
- **Clip (C)**: Hardware normalized box.
- **Viewport (P)**: Rasterized physical output.


### scale Semantics

Strictly **isotropic (uniform)** scale factor. Anisotropic scaling must be applied inside geometry generation (bounds).

---

## When to Read Full Topics

| Task | Read |
|------|------|
| Naga IR / Lowering | 04-compilation.md, 25-pure-lowering.md |
| Arena / Dispatch / Swap | 05-runtime.md |
| Indirect Rendering | 06-renderer.md |
| Coordinate Pipeline | 16-coordinate-spaces.md, 18-camera-projection.md |
| Implementing diagnostics | 07-diagnostics-system.md, 08-observation-system.md |
