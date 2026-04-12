# GPU-IR Gap Analysis: Current Contract vs. Full WebGPU API

**Date:** 2026-04-11
**Purpose:** Systematic inventory of what the boundary IR can/cannot express vs. the full WebGPU API surface. Used to scope the IR expansion epic.

---

## How to Read This Document

Each section maps to a WebGPU API area. For each:
- **IR Status**: What the contract currently expresses
- **Rust Status**: What the renderer actually implements (may be less than IR declares)
- **Gap**: What's missing from both IR and Rust
- **Priority**: `P0` = blocks real use cases now, `P1` = needed for generality, `P2` = niche/future

---

## 1. Render Pipeline State

### 1.1 Blend State

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Per-component blend factors (src, dst, op for color+alpha independently) | **NO** — 4 preset modes (opaque, alpha, additive, multiply) | 4 presets hardcoded to wgpu::BlendState | Full custom blend factors missing |
| Dual-source blending (`blend_src`) | NO | NO | Missing |
| Per-attachment blend enable/disable | NO — blend mode is per-draw-call, applied to all targets | Hardcoded ALL targets same | Missing |
| Per-attachment write mask | NO | Hardcoded `ALL` | Missing |

**Priority:** P0 — custom blend factors needed for standard VFX (screen, overlay, premultiplied alpha variants). Per-attachment write mask needed for MRT (e.g., write color to target 0 but not target 1).

### 1.2 Depth/Stencil State

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Depth compare function | 4 variants (less, always, equal, greater) | Implemented | Missing: `never`, `not-equal`, `less-equal`, `greater-equal` |
| Depth write enable | Boolean | Implemented | — |
| Depth bias (constant, slope, clamp) | NO | Hardcoded `default()` | Missing |
| Stencil compare + ops (front/back) | Full 8-variant compare + 8-variant ops | Implemented | — |
| Stencil read/write masks | Optional u32 | Implemented | — |
| Depth bounds testing | Not in WebGPU spec | N/A | N/A |

**Priority:** P1 — depth compare completeness is easy. Depth bias is P0 for shadow mapping and decals.

### 1.3 Primitive/Rasterization State

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Topology | 5 types via shape bank | Implemented | — |
| Front face winding | NO | Hardcoded `Ccw` | Missing |
| Cull mode | 3 variants (none, front, back) | Implemented | — |
| Polygon mode (fill/line/point) | NO | Hardcoded `Fill` | Missing (wireframe debug) |
| Unclipped depth | NO | Hardcoded `false` | Missing |
| Conservative rasterization | NO | Hardcoded `false` | Missing |
| Strip index format | NO | Hardcoded `None` | Missing (needed for strip topologies with index buffers) |

**Priority:** P1 — front face winding needed for 3D. Polygon mode useful for debug. Conservative rasterization is P2.

### 1.4 Multisample State

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Sample count | Declared per render pass (1, 4, 8) | Implemented with reconciliation | — |
| Alpha-to-coverage | NO | Hardcoded `false` | Missing |
| Sample mask | NO | Hardcoded `!0` | Missing |
| Per-sample shading | NO | NO | Missing |

**Priority:** P1 — alpha-to-coverage useful for vegetation/transparency. Per-sample shading is P2.

---

## 2. Vertex Input

### 2.1 Vertex Buffer Layout

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Multiple vertex buffers | NO — single buffer via shape bank | Single buffer | Missing |
| Multiple attributes per buffer | IR declares `vertexLayout.attributes` (multiple) | **Hardcoded single Float32x2 at location 0** | IR > Rust — IR declares it, Rust ignores it |
| Attribute formats (float16, float32x2/3/4, sint8/16/32, uint8/16/32, snorm/unorm variants) | IR: `float32x2`, `float32x3`, `float32x4` only | Only `Float32x2` | Missing most formats |
| Instance step mode | NO — uses domain fields + InstanceIndex | NO | By design — domain fields replace this |
| Vertex pulling (bindless) | NO | NO | Alternative to VBO attributes |

**Priority:** P0 — Float32x3 and Float32x4 needed for 3D vertex positions, normals, colors. The current approach of domain fields + InstanceIndex is correct for instanced data, but mesh vertex attributes need real vertex buffers.

### 2.2 Index Buffers

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| uint16 index format | NO — indexData is number[] | Uses u16 always (mmu.rs) | IR doesn't specify format |
| uint32 index format | NO | NO | Missing for >65k vertex meshes |
| Primitive restart | NO | NO | Missing |

**Priority:** P1 — uint32 indices needed for large meshes. Index format should be in IR.

---

## 3. Shader I/O

### 3.1 Vertex Outputs / Fragment Inputs (Varyings)

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Multiple varyings | Yes, via `ReturnVertex.varyings` record | Implemented | — |
| Varying types (f32, vec2, vec3, vec4, i32, u32, etc.) | NO — all coerced to vec4<f32> | Hardcoded vec4<f32> | Missing type variety |
| Interpolation mode (perspective, linear, flat) | NO | Hardcoded `Perspective` | Missing — flat needed for integer data |
| Interpolation sampling (center, centroid, sample) | NO | Hardcoded `Center` | Missing |

**Priority:** P0 — flat interpolation is required for passing integer IDs to fragment shader (common pattern). Varying types beyond vec4 needed for efficiency and correctness.

### 3.2 Fragment Outputs

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Multiple render targets (MRT) | IR: `ReturnFragment.outputs` is Record<string, ExprIR> | Implemented — multiple color attachments | — |
| Output types beyond vec4<f32> | NO — all outputs coerced to vec4 | Hardcoded vec4<f32> | Missing (e.g., r32float targets) |
| Depth output (`@builtin(frag_depth)`) | NO | NO | Missing — needed for custom depth writes |
| Sample mask output | NO | NO | P2 |
| Discard statement | NO | NO | Missing — needed for alpha testing/cutout |

**Priority:** P0 — discard is essential for alpha-test rendering. frag_depth needed for logarithmic depth, imposters, decals.

### 3.3 Shader Entry Points

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Custom entry point names | NO — implicit | Hardcoded: `main` (compute), `vs_main` (vertex), `fs_main` (fragment) | Not really a gap — translator generates names |
| Multiple entry points per module | NO | NO | Not needed — one module per pass |

**Priority:** None — current approach is correct.

---

## 4. Texture & Sampler

### 4.1 Texture Creation

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| 1D/2D/3D/Cube dimensions | All 4 | Implemented | — |
| Array textures (2D array, cube array) | NO explicit array dimension | Rust supports `depthOrArrayLayers` | IR partially declares it via depthOrArrayLayers |
| Mip levels | NO | Hardcoded `mip_level_count = 1` | Missing |
| Multisampled textures | NO (named textures always count=1) | Named textures = 1; canvas = negotiated | Missing for off-screen MSAA |
| Format specification | String format in IR | Passed to wgpu parser | — |
| Usage flags | `storage`, `sampled`, `render_attachment` | Implemented | — |
| External textures (video, canvas) | IR declares `externalSource` | NOT implemented | Stub |
| Texture views (subset of mips/layers) | NO | NO | Missing |
| Storage texture access modes | Inferred from compute dependencies | Implemented (LOAD, STORE, LOAD|STORE) | — |

**Priority:** P0 — mip levels needed for any texture filtering beyond nearest/bilinear. Texture views needed for rendering to specific mip/layer.

### 4.2 Sampler Configuration

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Mag/min filter | nearest, linear | Implemented | — |
| Mip filter | NO | NO | Missing (requires mipmapped textures) |
| Address modes U/V/W | U/V only (2 axes) | Implemented | Missing W (3D textures) |
| LOD clamp (min/max) | NO | NO | Missing |
| Max anisotropy | NO | NO | Missing |
| Comparison sampler | NO | All non-comparison | Missing — needed for shadow mapping |
| Border color | Not in WebGPU | N/A | N/A |

**Priority:** P0 — comparison samplers needed for shadow maps. Mip filter needed once mip levels exist. Anisotropy is P1.

### 4.3 Texture Operations (Shader-Side)

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| textureSample (2D) | Yes | Implemented | — |
| textureSampleLevel (explicit LOD) | NO | NO | Missing |
| textureSampleBias | NO | NO | Missing |
| textureSampleGrad | NO | NO | Missing |
| textureSampleCompare (shadow) | NO | NO | Missing — needed for shadow mapping |
| textureLoad (integer coords) | Yes | Implemented | — |
| textureStore (storage write) | Yes | Implemented | — |
| textureGather | NO | NO | Missing |
| textureDimensions | NO | NO | Missing |
| textureNumLayers | NO | NO | Missing |
| textureNumLevels | NO | NO | Missing |
| textureNumSamples | NO | NO | Missing |

**Priority:** P0 — `textureSampleCompare` for shadows, `textureSampleLevel` for custom LOD. Others P1-P2.

---

## 5. Compute

### 5.1 Dispatch

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Direct dispatch (x, y, z) | Yes — `Exact` mode | Implemented | — |
| Domain-based dispatch | Yes — `Domain` mode | Implemented | — |
| Texture-based dispatch | Yes — `Texture` mode | Implemented | — |
| Indirect dispatch (from GPU buffer) | NO | NO | Missing |

**Priority:** P1 — indirect dispatch needed for GPU-driven pipelines where work count is computed on GPU.

### 5.2 Workgroup Shared Memory

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| `var<workgroup>` declarations | NO | NO | Missing |
| workgroupBarrier() | NO | NO | Missing |
| storageBarrier() | NO | NO | Missing |
| workgroupUniformLoad() | NO | NO | Missing |

**Priority:** P1 — shared memory is essential for efficient compute (reductions, prefix sums, tiled algorithms). Currently all compute is embarrassingly parallel.

---

## 6. Buffer & Memory

### 6.1 Buffer Types

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Uniform buffers | NO — all storage | Globals are `STORAGE` not `UNIFORM` | Design choice, not gap |
| Storage buffers (read-only) | Yes | Implemented | — |
| Storage buffers (read-write) | Yes | Implemented | — |
| Dynamic uniform/storage offsets | NO | NO | Missing (all bound as entire) |
| Indirect buffers | Internal only (draw prep) | Implemented | Not in IR — internal |
| Data streams (read-only large) | IR declares DataStreamSpec | NOT implemented | Stub |

**Priority:** P1 — dynamic offsets useful for batching. Data streams declared but unused.

### 6.2 Bind Group Layout

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Multiple bind groups (0-3) | NO — inferred by translator | Compute: 2 groups, Render: 1 group | Not configurable from IR |
| Explicit layout specification | NO — auto-inferred | Auto layout | By design |
| Dynamic offsets | NO | NO | Missing |
| Binding visibility per-stage | NO — inferred | Inferred from AST usage | Correct |
| Sampled texture binding type | Inferred | Hardcoded to float, non-multisampled | Missing multisampled texture bindings |

**Priority:** P2 — current auto-layout is fine. Explicit control only needed for advanced sharing patterns.

---

## 7. Render Pass Configuration

### 7.1 Color Attachments

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Multiple color targets | Yes — `targets.colors[]` | Implemented | — |
| Load op (clear/load) | Yes | Implemented | — |
| Store op (store/discard) | NO — always store | Hardcoded `Store` | Missing — discard useful for transient attachments |
| Clear color | Yes (RGBA) | Implemented | — |
| Resolve target (MSAA) | NO — implicit for canvas | Canvas auto-resolve | Missing for off-screen MSAA resolve |
| Named texture targets | Yes — textureId string | Implemented | — |

**Priority:** P1 — store op discard is an optimization. MSAA resolve for off-screen targets is P0 for post-processing.

### 7.2 Depth/Stencil Attachment

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Depth load/clear | Yes | Implemented | — |
| Stencil load/clear | Yes | Implemented | — |
| Depth store op | NO — always store | Hardcoded | Missing |
| Stencil store op | NO — always store | Hardcoded | Missing |
| Read-only depth | NO | NO | Missing — needed for depth-tested transparent passes |
| Read-only stencil | NO | NO | Missing |

**Priority:** P1 — read-only depth is important for transparent geometry that tests against opaque depth but doesn't write.

### 7.3 Viewport & Scissor

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| Viewport (x, y, w, h, minDepth, maxDepth) | Yes | Implemented | — |
| Scissor rect | Yes | Implemented | — |
| Multiple viewports | Not in WebGPU | N/A | N/A |

**Priority:** None — complete.

---

## 8. Draw Commands

| WebGPU Capability | IR Status | Rust Status | Gap |
|---|---|---|---|
| draw(vertexCount, instanceCount, ...) | Indirect via domain | Implemented | — |
| drawIndexed(indexCount, instanceCount, ...) | Via shape bank indexData | Implemented | — |
| drawIndirect (from GPU buffer) | NO | NO | Missing |
| drawIndexedIndirect | NO | NO | Missing |
| Multi-draw (multiple draws, one call) | Not in WebGPU core | N/A | N/A |

**Priority:** P1 — GPU-driven indirect draw needed for culling/LOD computed on GPU.

---

## 9. WGSL Language Features

### 9.1 Types

| WGSL Type | IR Status | Gap |
|---|---|---|
| f32, i32, u32, bool | Yes | — |
| f16 | NO | Missing (requires shader-f16 feature) |
| vec2/3/4<f32/i32/u32> | Yes | — |
| vec2/3/4<f16> | NO | Missing |
| vec2/3/4<bool> | NO | Missing |
| mat2x2, mat2x3, mat2x4, mat3x2, mat3x4, mat4x2, mat4x3 | NO — only mat3x3, mat4x4 | Missing non-square matrices |
| array<T, N> (fixed-size) | NO | Missing |
| array<T> (runtime-sized) | Via domain fields (implicit) | Not general-purpose |
| struct | NO | Missing |
| ptr / ref | Not in WGSL user types | N/A |
| texture types | Via manifest references | — |
| sampler types | Via manifest references | — |
| atomic<u32/i32> | Yes | — |

**Priority:** P1 — fixed-size arrays needed for lookup tables in shaders. Structs needed for complex data. f16 is P2 (feature-gated).

### 9.2 Control Flow

| WGSL Feature | IR Status | Gap |
|---|---|---|
| if/else | Yes | — |
| for loop | Yes | — |
| while loop | NO | Missing |
| loop (infinite + break) | NO | Missing |
| switch | NO | Missing |
| break / continue | Yes | — |
| continuing block | NO | Missing |
| return (mid-function) | NO — only ReturnVertex/ReturnFragment as final stmt | Missing early return |
| discard (fragment) | NO | Missing — P0 |

**Priority:** P0 — `discard` needed for alpha test. `switch` useful for material dispatch. `while` is easy. Early return is P1.

### 9.3 Expressions

| WGSL Feature | IR Status | Gap |
|---|---|---|
| Binary ops (arith, compare, bitwise, logical) | Yes — 17 variants | — |
| Unary ops (!, -, ~) | Yes | — |
| Ternary / select() | NO — must use if/else statement | Missing (select builtin exists but no ternary expr) |
| Array constructors | NO | Missing |
| Struct constructors | NO | Missing (no structs) |
| Pointer dereference | NO | N/A for value semantics |
| Address-of (&) | NO | N/A |

**Priority:** P1 — select/ternary is a convenience but if/else works. Array/struct constructors follow from adding those types.

### 9.4 Built-in Functions (Beyond What's Declared)

| Category | In IR | Missing |
|---|---|---|
| Trig (sin, cos, tan, asin, acos, atan, atan2) | Yes | — |
| Exponential (exp, log, pow, sqrt) | Yes | exp2, log2, inverseSqrt |
| Comparison (min, max, clamp, saturate) | min/max/clamp | saturate |
| Interpolation (mix, step, smoothstep) | Yes | — |
| Vector (length, distance, dot, cross, normalize, reflect, refract) | Yes | faceForward, determinant, transpose, inverse (mat) |
| Component (abs, sign, floor, ceil, round, fract) | abs, sign, floor, ceil, round, fract | trunc, modf, frexp, ldexp |
| Derivative (dpdx, dpdy, fwidth) | Yes | dpdxCoarse, dpdxFine, dpdyCoarse, dpdyFine |
| Integer (countLeadingZeros, countOneBits, countTrailingZeros, ...) | NO | All integer bit functions |
| Pack/unpack (pack4x8snorm, unpack2x16float, ...) | NO | All packing functions |
| Workgroup (workgroupBarrier, storageBarrier) | NO | Missing |
| Texture (textureSample, textureLoad, textureStore) | Partial | See Section 4.3 |
| Atomic (atomicAdd, etc.) | Yes — 8 variants | atomicCompareExchangeWeak |

**Priority:** P1 — `exp2`/`log2`/`inverseSqrt` are common. Bit functions needed for bitfield tricks. Matrix inverse/transpose needed for 3D normals.

---

## 10. Features Not in WebGPU (Excluded from Gap)

These are GPU features that WebGPU intentionally does not expose:
- Tessellation shaders
- Geometry shaders
- Mesh shaders
- Ray tracing / ray queries (proposed extension)
- Variable-rate shading
- Subgroup operations (proposed extension)
- Bindless resources
- Sparse textures

---

## Summary: Priority Buckets

### P0 — Blocks Real Use Cases Now

| # | Gap | Why |
|---|---|---|
| 1 | **Custom blend factors** (per-component src/dst/op) | Standard VFX requires screen, overlay, premultiplied variants |
| 2 | **Per-attachment write mask** | MRT requires selective writes |
| 3 | **Discard statement** (fragment) | Alpha-test/cutout rendering |
| 4 | **Flat interpolation** for varyings | Integer ID passing to fragment |
| 5 | **Varying types beyond vec4<f32>** | Efficiency + correctness |
| 6 | **Mip levels** + mip filter on samplers | Any texture filtering beyond point/bilinear |
| 7 | **Comparison samplers** + `textureSampleCompare` | Shadow mapping |
| 8 | **Depth bias** (constant + slope) | Shadow mapping, decals |
| 9 | **Fragment depth output** (`frag_depth`) | Custom depth writes |
| 10 | **Vertex attribute formats** (Float32x3, Float32x4+) | 3D vertex positions, normals, colors |
| 11 | **`textureSampleLevel`** | Explicit LOD selection |
| 12 | **Missing depth compare functions** (never, not-equal, less-equal, greater-equal) | Complete depth testing |

### P1 — Needed for Generality

| # | Gap | Why |
|---|---|---|
| 13 | Front face winding (CW/CCW configurable) | 3D model compatibility |
| 14 | Polygon mode (wireframe) | Debug visualization |
| 15 | Alpha-to-coverage | Transparency without sorting |
| 16 | While loops, switch statements, early return | WGSL language completeness |
| 17 | Workgroup shared memory + barriers | Efficient compute (reductions, tiling) |
| 18 | Fixed-size arrays in shaders | Lookup tables, kernel weights |
| 19 | Struct types | Complex data organization |
| 20 | uint32 index format | Large meshes (>65k vertices) |
| 21 | Indirect draw/dispatch | GPU-driven rendering |
| 22 | Read-only depth/stencil | Transparent geometry rendering |
| 23 | Store op discard | Transient attachment optimization |
| 24 | Off-screen MSAA resolve | Post-processing with MSAA |
| 25 | Texture views (mip/layer subset) | Render-to-mip, cubemap faces |
| 26 | Address mode W (3D textures) | Volume textures |
| 27 | Max anisotropy | Texture quality at oblique angles |
| 28 | Matrix builtins (transpose, inverse, determinant) | 3D normal transforms |
| 29 | Missing math builtins (exp2, log2, inverseSqrt, saturate) | Common shader math |
| 30 | Data streams (declared but unimplemented) | Large read-only GPU buffers |
| 31 | select() / ternary expression | Branchless conditionals |
| 32 | Non-square matrices (mat2x3, mat3x4, etc.) | Compact transform storage |

### P2 — Niche / Future

| # | Gap | Why |
|---|---|---|
| 33 | f16 types | Performance (feature-gated) |
| 34 | Conservative rasterization | Voxelization, coverage estimation |
| 35 | Unclipped depth | Special projection effects |
| 36 | Per-sample shading | Anti-aliasing quality |
| 37 | Texture gather | Efficient multi-tap sampling |
| 38 | Integer bit functions | Bitfield packing tricks |
| 39 | Pack/unpack builtins | Format conversion in shaders |
| 40 | Explicit bind group layout | Advanced resource sharing |
| 41 | Dynamic buffer offsets | Batching optimization |
| 42 | External textures (video/canvas) | Media integration |
| 43 | atomicCompareExchangeWeak | Lock-free algorithms |
| 44 | Fine/coarse derivatives | Shader LOD control |
| 45 | Render bundles | Command recording optimization |
| 46 | Multisampled named textures | Off-screen MSAA without canvas |
| 47 | Occlusion queries | Visibility determination |
| 48 | Timestamp queries | GPU profiling |

---

## Appendix: IR → Rust Implementation Parity Issues

These are cases where the IR declares something the Rust translator does NOT implement:

| IR Declares | Rust Reality |
|---|---|
| `vertexLayout.attributes` (multiple attrs with format + location) | Hardcoded single Float32x2 at location 0 |
| `StaticGeometrySpec.vertexLayout.attributes[].format` includes float32x3, float32x4 | Only Float32x2 used |
| `depthCompare: 'equal' \| 'greater'` | Implemented, but missing 4 of 8 WebGPU compare functions |
| `DataStreamSpec` type | Completely unimplemented |
| `TextureSpec.externalSource` | Unimplemented stub |
| `sampleCount` per named texture | Always 1 for named textures |

These parity issues should be resolved as part of the expansion — either implement in Rust or remove from IR.
