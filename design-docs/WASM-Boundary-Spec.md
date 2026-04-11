# WASM Boundary Spec: The Oscilla JS ↔ WASM Contract

**Status:** Draft (from Gemini design session)
**Prerequisite:** `B0-4-Pillar-Arch-UBER.md`

---

## Type Aliases

```typescript
type SymbolId = string;      // e.g., "sys:time", "ui:boid_speed"
type DomainId = string;      // e.g., "pool_boids", "pool_spray"
type TextureId = string;     // e.g., "tex_fluid_vel", "tex_msdf_font"
type ShapeId = string;       // e.g., "proxy_quad_2d", "spline_64_seg"
type SamplerId = string;     // e.g., "samp_linear_clamp", "samp_nearest_repeat"
type StreamId = string;      // e.g., "audio:fft_01", "kinect:point_cloud"
type WebGpuTopology = 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';

// Fully qualified WGSL types — no ambiguous bare 'vec2', Rust never infers
type WgslType =
    | 'f32' | 'i32' | 'u32' | 'bool'
    | 'vec2<f32>' | 'vec2<i32>' | 'vec2<u32>'
    | 'vec3<f32>' | 'vec3<i32>' | 'vec3<u32>'
    | 'vec4<f32>' | 'vec4<i32>' | 'vec4<u32>'
    | 'mat3x3<f32>' | 'mat4x4<f32>';
```

---

# Phase 1: Pipeline Install (The Blueprint)

**Direction:** JS → WASM | **Frequency:** On graph topology change | **Payload:** JSON

JS traverses the user's graph, resolves all semantic links, and emits this declarative payload. Rust halts the render loop, allocates the `GpuMemoryArena`, translates the ASTs to WGSL via Naga, and compiles the WebGPU pipelines.

```typescript
interface PipelineInstallPayload {
    manifest: MemoryManifest;
    roster: ExecutionRoster;
}
```

## MemoryManifest

The JS compiler groups memory requests into **Domains** rather than a flat list. This is forced by three constraints:

- **Performance:** Rust needs to know exactly how many instances exist in a pool to calculate SoA padding and strides for 256-bit SIMD coalescing.
- **Debuggability:** Errors map to symbolic names (`"pool_boids:velocity_x"`) not byte offsets (`0x4FA2`), tracing directly back to the user's node graph.
- **Modulatability:** Globals (Uniforms — identical for every thread) must be explicitly separated from Fields (Varyings — per-instance).

```typescript
interface MemoryManifest {
    // true = Rust blits matching SymbolIds from old arena to new (live editing)
    // false = Rust drops old arena, fills new with clearValues (restart)
    preserveStateOnRecompile: boolean;

    // CPU-written, GPU-read-only (Uniform Buffer)
    // e.g., sys:time, ui:slider_1
    globals: Record<SymbolId, GlobalSpec>;

    // GPU-written, GPU-read (Storage Buffer scalars)
    // For values evaluated on-GPU: LFOs, accumulated energy, intermediate results.
    // Globals (Uniforms) are read-only in WGSL — if a parameter is computed
    // on the GPU, JS promotes it from globals to arenaScalars during lowering.
    arenaScalars: Record<SymbolId, ArenaScalarSpec>;

    domains: Record<DomainId, InstanceDomainSpec>;
    textures: Record<TextureId, TextureSpec>;

    // Static base geometries (proxy quads, spline skeletons, etc.)
    // Rust allocates as static wgpu::Buffer (VERTEX | INDEX) exactly once.
    shapeBank: Record<ShapeId, StaticGeometrySpec>;

    // Data streams that JS pushes every frame (audio FFT, sensor arrays, point clouds).
    // Allocated as Storage Buffers (STORAGE | COPY_DST).
    dataStreams: Record<StreamId, DataStreamSpec>;

    // Explicit sampler configurations — WebGPU decouples textures from filtering.
    // A fluid velocity texture needs linear; an SDF collision grid needs nearest.
    samplers: Record<SamplerId, SamplerSpec>;
}

interface ArenaScalarSpec {
    type: 'f32' | 'u32' | 'i32' | 'atomic<u32>' | 'atomic<i32>';
    clearValue: number;
}

interface DataStreamSpec {
    type: 'f32' | 'u32';
    length: number;  // e.g., 1024 for FFT bins
}

interface GlobalSpec {
    // Rust calculates correct WebGPU std140 padding/alignment for compound types
    type: 'f32' | 'u32' | 'i32' | 'vec2' | 'vec3' | 'vec4' | 'mat4x4';
    isDynamic: boolean;  // true = JS streams every frame; false = static constant
    defaultValue: number | number[];  // mat4x4 = 16-element array
}

interface InstanceDomainSpec {
    capacity: number;  // Absolute max instances to allocate

    // JS explicitly declares the symbol that holds the evaluated active count.
    // The compute pass writes to this; System_DrawPrep reads from it.
    // This is NOT a CPU-driven Uniform — it lives in GPU-writable storage
    // because the count may be evaluated on-GPU (e.g., LFO → particle count).
    activeLanesSymbol: SymbolId;

    fields: Record<SymbolId, FieldSpec>;
}

interface FieldSpec {
    type: 'f32' | 'u32' | 'i32' | 'atomic<u32>' | 'atomic<i32>';
    clearValue: number;  // Initial buffer fill (e.g., age = -1.0 for "dead")
}

interface TextureSpec {
    dimension: '1d' | '2d' | '3d' | 'cube';
    width: number | { relativeTo: 'canvas', scale: number };
    height?: number | { relativeTo: 'canvas', scale: number };  // Optional for 1D
    depthOrArrayLayers?: number;  // Z-axis for 3D volumes, 6 for cubemaps. Default 1.
    format: WebGpuTextureFormat;
    usage: ('storage' | 'sampled' | 'render_attachment')[];

    // If present, texture is driven by an external DOM source (video, canvas).
    // Rust expects JS to push frames via update_external_texture().
    // Uses queue.copyExternalImageToTexture() — zero CPU pixel-copying.
    externalSource?: 'video' | 'canvas' | 'image_bitmap';
}

type WebGpuTextureFormat =
    // 8-bit standard
    | 'r8unorm' | 'rgba8unorm'
    // 16-bit float (fluid/SDF data)
    | 'rgba16float'
    // 32-bit float (high precision)
    | 'r32float'
    | 'rg32float'     // 2D velocity fields / UV maps
    | 'rgba32float'   // HDR accumulation / heavy compute
    // Depth / Stencil
    | 'depth32float'
    | 'depth24plus-stencil8';

// Static base geometry — the vertex/index data for a single instance's shape.
// For SDF rendering: a 4-vertex proxy quad.
// For parametric splines: a 64-vertex line strip of t-values.
// Rust binds this buffer + the SoA arena, then fires draw_indirect.
interface StaticGeometrySpec {
    topology: WebGpuTopology;
    vertexLayout: {
        stride: number;  // bytes per vertex
        attributes: Record<string, {
            format: 'float32x2' | 'float32x3' | 'float32x4';
            shaderLocation: number;
        }>;
    };
    vertexData: number[];   // Flat array of floats
    indexData?: number[];   // Optional index buffer (u16/u32)
}

interface SamplerSpec {
    magFilter: 'nearest' | 'linear';
    minFilter: 'nearest' | 'linear';
    addressModeU: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
    addressModeV: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
}
```

**Manifest generation is trivial from a node graph:**
- EulerianFluid block → add `{ format: "rgba16float", usage: ["storage"] }` to `textures`.
- BoidFlock block with capacity 10,000 → add `"pool_boids"` to `domains` with `pos_x`, `pos_y`, `vel_x`, `vel_y`.
- UI Slider wired to Boid Cohesion → add `"ui:boid_cohesion"` to `globals` with `isDynamic: true`.
- Spatial hashing for collisions → add `"spatial_grid": { capacity: 65536, fields: { "cell_head": { type: "u32", clearValue: 0 } } }`.
- WebXR → send VR headset matrices as 16 `f32` globals every frame.

Rust packs all globals into a single `UniformBuffer`. Every frame, JS blasts a tiny typed array of floats over the WASM boundary — instant 120fps manual control.

## ExecutionRoster

Flat array, executed sequentially every frame. JS produces the topological sort; Rust executes blindly.

```typescript
type ExecutionRoster = Array<ComputePassSpec | RenderPassSpec | SystemPassSpec>;
```

### ComputePassSpec

Modifies data in the `GpuMemoryArena` or transient textures. The `dependencies` block is critical — JS explicitly declares which symbolic memory domains this pass touches so Rust can generate `BindGroupLayout`s without parsing the AST.

```typescript
interface ComputePassSpec {
    type: 'Compute';
    passId: string;
    // UUIDs of graph nodes whose logic compiled into this pass.
    // An array because multiple blocks may collapse into one pass (e.g., compute_main).
    sourceBlockIds: string[];
    workgroupSize: [number, number, number];
    dispatch:
        | { mode: 'Domain', domainId: DomainId }
        | { mode: 'Texture', textureId: TextureId }
        | { mode: 'Exact', x: number, y: number, z: number };
    dependencies: {
        requiresGlobals: boolean;
        domains: Record<DomainId, 'read' | 'read_write'>;
        textures: Record<TextureId, 'read' | 'write' | 'read_write'>;
    };
    ast: StatementIR[];
}
```

### RenderPassSpec

Encapsulates the transition from abstract data to pixels. A single Render Pass can have multiple render targets and execute multiple draw commands.

A single data source (e.g., an `InstanceDomain` of circles) can fan out to multiple `DrawCallSpec`s — one for filled shapes, a second for thin outlines — without duplicating any source data or transform math.

```typescript
interface RenderPassSpec {
    type: 'Render';
    passId: string;
    sourceBlockIds: string[];
    targets: {
        colors: Array<{
            textureId: TextureId | 'canvas';
            loadOp: 'load' | 'clear';
            clearColor?: [number, number, number, number];
        }>;
        depthStencil?: {
            textureId: TextureId;
            depthLoadOp?: 'load' | 'clear';
            depthClearValue?: number;
            stencilLoadOp?: 'load' | 'clear';
            stencilClearValue?: number;
        };
    };
    drawCalls: DrawCallSpec[];
}

interface DrawCallSpec {
    intentId: string;
    source:
        | {
            type: 'Domain',
            domainId: DomainId,
            sourceKind: 'Topology' | 'Parametric' | 'Field' | 'SolverResource',
            // Rust binds this specific vertex/index buffer before draw_indirect.
            shapeId: ShapeId,
          }
        | { type: 'FullScreenQuad' };
    pipelineState: PipelineStateSpec;
    dependencies: {
        requiresGlobals: boolean;
        // If this draw call uses a camera, JS specifies the global symbol
        // holding the ViewProjection matrix (e.g., "sys:main_cam_vp").
        cameraRef?: SymbolId;
        domains: Record<DomainId, 'read'>;
        textures: Record<TextureId, 'sampled'>;
    };
    // JS explicitly defines vertex and fragment logic.
    // No "auto-generated" vertex fetch — JS controls exactly what is
    // fetched from SoA and how it maps to clip-space position + varyings.
    // This allows the same InstanceDomain to be drawn multiple ways
    // (e.g., fill pass reads position normally, outline pass applies displacement).
    vertexAst: StatementIR[];    // Must terminate with ReturnVertex
    fragmentAst: StatementIR[];  // Must terminate with ReturnFragment
}

interface PipelineStateSpec {
    blendMode: 'opaque' | 'alpha' | 'additive' | 'multiply';
    cullMode: 'none' | 'front' | 'back';

    // Depth
    depthWrite: boolean;
    depthCompare: 'less' | 'always' | 'equal' | 'greater';

    // Stencil (for 3D portals, masking, outline effects)
    stencilReadMask?: number;   // e.g., 0xFF
    stencilWriteMask?: number;
    stencilFront?: StencilFaceState;
    stencilBack?: StencilFaceState;
}

interface StencilFaceState {
    compare: 'always' | 'never' | 'equal' | 'not-equal' | 'less' | 'less-equal' | 'greater' | 'greater-equal';
    failOp: StencilOp;
    depthFailOp: StencilOp;
    passOp: StencilOp;
}

type StencilOp = 'keep' | 'zero' | 'replace' | 'invert'
    | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap';
```

### SystemPassSpec

Compiler-injected passes not directly authored by the user. Maintains `[LAW:single-enforcer]`.

The **Draw Prep Pass** copies the evaluated `active_lanes` value into a WebGPU `DrawIndirect` buffer before the Render Pass begins.

JS owns the `vertexCount` because Rust cannot derive it — a `triangle-list` could be a 4-vertex SDF proxy quad or a 64-segment parametric spline. `[LAW:one-source-of-truth]`

Rust writes exactly four `u32` to the `IndirectBuffer`:
1. `vertexCount` — hardcoded from JS payload
2. `instanceCount` — read dynamically from `active_lanes` in VRAM
3. `firstVertex` — always `0`
4. `firstInstance` — always `0`

```typescript
interface SystemPassSpec {
    type: 'System_DrawPrep';
    passId: string;
    sourceBlockIds: string[];
    activeLanesSymbol: SymbolId;  // Explicit routing — reads active count from this storage slot
    vertexCount: number;
}
```

### Example Roster: Animated Particle System

1. **`ComputePass ("eval_math")`** — Reads globals, writes per-particle math to `domains["pool_particles"]`.
2. **`System_DrawPrep ("prep_particles")`** — Reads `active_lanes`, formats indirect buffer.
3. **`RenderPass ("draw_to_screen")`**:
   - Targets: `[{ textureId: 'canvas', loadOp: 'clear', clearColor: [0,0,0,1] }]`
   - DrawCalls: Source `pool_particles`, Material `glow_sprite`.

Because JS explicitly lists `dependencies` for every pass, Rust blindly iterates the array during Install, generates `BindGroupDescriptor`s, and wires WebGPU pipelines with zero heuristic guesswork.

---

# Phase 1.2: Environment Resize

**Direction:** JS → WASM | **Frequency:** On canvas resize (debounced via `ResizeObserver`) | **Payload:** JSON

A full Phase 1 on window resize would stutter violently — Naga AST construction and pipeline compilation take milliseconds to seconds, but the WGSL logic and SoA arena haven't changed. Only the 2D grid dimensions changed.

This lightweight signal triggers a **Targeted Reallocation** that touches only textures, leaving pipelines and arenas untouched.

```typescript
interface EnvironmentResizePayload {
    newCanvasWidth: number;
    newCanvasHeight: number;
    resizeMode: 'clear' | 'stretch_blit';  // stretch existing data or reset
}
```

**Rust's reaction (microseconds, not milliseconds):**
1. **Filter** — Identify only `TextureId`s where dimensions use `{ relativeTo: 'canvas' }`.
2. **Drop & Reallocate** — Destroy those specific `wgpu::Texture` objects, create new ones at the calculated dimensions.
3. **Data Policy** — `'clear'`: leave new textures at default values. `'stretch_blit'`: run a built-in compute shader to sample old texture into new before dropping old.
4. **Bind Group Patch** — Recreate only the `wgpu::BindGroup` objects that referenced the resized textures. Pipelines are NOT recompiled (WGSL reads dimensions dynamically via `textureDimensions()`).
5. **Resume** — Phase 2 continues uninterrupted.

---

# Phase 1.5: Install Receipt (The Memory Map)

**Direction:** WASM → JS | **Frequency:** After Phase 1 | **Payload:** JSON

JS does not calculate byte offsets — Rust returns a receipt telling JS how to format the Phase 2 hot-loop payload.

```typescript
interface InstallReceipt {
    status: 'success' | 'error';
    compilationTimeMs: number;
    globalOffsetMap: Record<SymbolId, number>;  // "put 'ui:viscosity' at array index 4"
    framePayloadLength: number;
    diagnostics: CompilationDiagnostic[];
}

interface CompilationDiagnostic {
    severity: 'fatal' | 'error' | 'warning';
    phase: 'manifest_allocation' | 'ast_lowering' | 'wgsl_validation' | 'pipeline_creation';
    blockId?: string;     // UUID of originating graph node (UI draws red halo)
    symbolId?: SymbolId;  // e.g., "pool_01:vel_x"
    message: string;
}
```

---

# Phase 2: Frame Pulse (The Hot Loop)

**Direction:** JS → WASM | **Frequency:** Every frame (120Hz) | **Payload:** TypedArrays + DOM refs

Zero JSON serialization, zero object allocation, zero graph traversal. The boundary is a pure hardware bus. Three avenues, split by bandwidth:

**See `WASM-Boundary-Phase2-Streams.md` for full contract.**

| Avenue | Payload | Use Cases | WASM Export |
|--------|---------|-----------|-------------|
| **Float Bus** | `Float32Array` → uniform buffer | Time, mouse, MIDI CC, OSC, sliders, camera matrices | `update_globals(ptr)` |
| **Data Stream** | TypedArray → storage buffer | Audio FFT, waveforms, point clouds, sensor arrays | `update_data_stream(id, ptr)` |
| **Pixel Stream** | DOM object ref → GPU texture | Webcam, video, Spout/Syphon canvas | `update_external_texture(id, dom)` |

After all updates, JS calls `render_frame()` to execute the full roster.

```typescript
function onFrame(time: number, dt: number) {
    // Avenue 1: Scalar globals
    frameData[receipt.globalOffsetMap["sys:time"]] = time;
    frameData[receipt.globalOffsetMap["midi:cc_74"]] = midi.getFilterCutoff();
    wasm.Module.update_globals(frameData.buffer);

    // Avenue 2: Array streams
    audioContext.analyser.getFloatFrequencyData(fftArray);
    wasm.Module.update_data_stream("audio:fft_01", fftArray.buffer);

    // Avenue 3: Video textures
    if (videoElement.readyState >= 2) {
        wasm.Module.update_external_texture("tex_webcam", videoElement);
    }

    // Execute roster
    wasm.Module.render_frame();
}
```

---

# Phase 3: Engine Telemetry (The Echo)

**Direction:** WASM → JS | **Frequency:** Every frame (or throttled) | **Payload:** JSON or `ArrayBuffer`

Drives the timeline, debuggers, and visualizers in the UI.

```typescript
interface EngineTelemetry {
    totalGpuFrameTimeMs: number;
    activeLanes: Record<DomainId, number>;

    // Per-pass micro-profiling (WebGPU timestamp queries).
    // JS maps passId → sourceBlockIds to color-code slow nodes in the graph.
    passTimingsMs: Record<string, number>;

    // VRAM budget monitoring
    memoryFootprint: {
        arenaStorageBytes: number;
        transientTextureBytes: number;
        staticGeometryBytes: number;
    };

    // Compiler health — newlyCompiledThisFrame should be 0 during Phase 2 hot loop
    pipelineStats: {
        totalPipelines: number;
        newlyCompiledThisFrame: number;
    };
}
```

---

# Math IR

Platform-agnostic, symbolic representation of WGSL. Rust's MMU replaces all symbolic loads with physical memory strides.

## ExprIR

```typescript
type ExprIR =
    // 1. Primitive Literals
    | { type: 'LiteralF32', value: number }
    | { type: 'LiteralU32', value: number }    // Maps to `123u` in WGSL
    | { type: 'LiteralI32', value: number }    // Maps to `123i` in WGSL
    | { type: 'LiteralBool', value: boolean }

    // 2. Composite Type Constructors & Casts
    | { type: 'Construct', dataType: WgslType, args: ExprIR[] }  // e.g., 'vec2<i32>' not bare 'vec2'
    | { type: 'Cast', targetType: WgslType, expr: ExprIR }       // e.g., i32(float_val)
    | { type: 'Swizzle', source: ExprIR, mask: string }          // e.g., "xy", "rgb", "xxxx"
    | { type: 'IndexAccess', target: ExprIR, index: ExprIR }

    // 3. Hardware Intrinsics
    | { type: 'Intrinsic', name: 'global_invocation_id.x' | 'global_invocation_id.y' | 'global_invocation_id.z' }

    // 4. Symbolic Memory Reads
    // LoadGlobal → Rust maps to: uniforms.data[offset] (CPU-written, read-only)
    | { type: 'LoadGlobal', symbolId: SymbolId }
    // LoadScalar → Rust maps to: arena_scalars[offset] (GPU-written, read-write)
    | { type: 'LoadScalar', symbolId: SymbolId }
    // LoadField → Rust maps to: arena_buffer[base_offset + (stride * index)]
    | { type: 'LoadField', symbolId: SymbolId, index: ExprIR }

    // 5. Texture Reads
    | { type: 'TextureSample', textureId: TextureId, samplerId: SamplerId, uv: ExprIR }
    | { type: 'TextureLoad', textureId: TextureId, coords: ExprIR } // exact texel fetch

    // 6. Atomic Reads (returns current value from atomic memory)
    | { type: 'AtomicLoadField', symbolId: SymbolId, index: ExprIR }
    | { type: 'AtomicLoadScalar', symbolId: SymbolId }

    // 7. Operators
    | {
        type: 'BinaryOp',
        op:
          // Arithmetic
          | '+' | '-' | '*' | '/' | '%'
          // Relational
          | '==' | '!=' | '<' | '>' | '<=' | '>='
          // Logical
          | '&&' | '||'
          // Bitwise (PRNGs, hash seeds, spatial hashing)
          | '&' | '|' | '^' | '<<' | '>>',
        left: ExprIR,
        right: ExprIR
      }
    | { type: 'UnaryOp', op: '!' | '-' | '~', expr: ExprIR }

    // 8. Built-in Math Functions
    | { type: 'CallBuiltin', func: BuiltinMathFunc, args: ExprIR[] }

    // 9. Variable Reference (locals + varyings)
    | { type: 'VarRef', name: string };

type BuiltinMathFunc =
    // Trigonometry & Exponentials
    | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'atan2' | 'exp' | 'log' | 'pow'
    // Common Math
    | 'abs' | 'min' | 'max' | 'clamp' | 'mix' | 'step' | 'smoothstep'
    | 'sign' | 'fract' | 'ceil' | 'floor' | 'round'
    // Vector Math
    | 'length' | 'distance' | 'dot' | 'cross' | 'normalize' | 'reflect' | 'refract'
    // Fragment Derivatives (fragment shaders only)
    | 'fwidth' | 'dpdx' | 'dpdy'
    // Engine Intrinsics (Rust translates to engine-provided WGSL functions)
    | 'hash_u32' | 'noise_simplex_2d' | 'noise_simplex_3d';
```

**Key design choice:** `LoadField` requires an explicit `index: ExprIR`. For standard modifiers (twisting a mesh), JS passes `global_invocation_id.x` — each thread reads its own lane. For Eulerian-to-Lagrangian spray, JS passes a hashed random value to read from a completely different part of the `InstanceDomain`. No special cases needed for cross-domain reads.

## StatementIR

```typescript
type StatementIR =
    // Immutable declaration (wgsl: let name = value;)
    | { type: 'Let', name: string, value: ExprIR }

    // Mutable declaration (wgsl: var name: type = value;)
    | { type: 'Var', name: string, dataType?: WgslType, value?: ExprIR }

    // Mutable assignment (wgsl: target = value;)
    // Target is ExprIR to support l-values like Swizzle (e.g., pos.xy = vec2(...))
    | { type: 'Assign', target: ExprIR, value: ExprIR }

    // Symbolic memory writes
    | { type: 'StoreScalar', symbolId: SymbolId, value: ExprIR }  // Write to arena scalar (GPU storage)
    | { type: 'StoreField', symbolId: SymbolId, index: ExprIR, value: ExprIR }
    | { type: 'TextureStore', textureId: TextureId, coords: ExprIR, value: ExprIR }

    // Control flow
    | { type: 'If', condition: ExprIR, accept: StatementIR[], reject: StatementIR[] }
    | { type: 'For', init: StatementIR, condition: ExprIR, update: StatementIR, body: StatementIR[] }
    | { type: 'Break' }
    | { type: 'Continue' }

    // Atomic mutations (WGSL: atomicAdd, atomicMax, etc.)
    // assignResultTo captures the pre-operation value into a local variable
    | {
        type: 'AtomicOpField',
        op: 'Add' | 'Sub' | 'Max' | 'Min' | 'And' | 'Or' | 'Xor' | 'Exchange',
        symbolId: SymbolId,
        index: ExprIR,
        value: ExprIR,
        assignResultTo?: string
      }
    | {
        type: 'AtomicOpScalar',
        op: 'Add' | 'Sub' | 'Max' | 'Min',
        symbolId: SymbolId,
        value: ExprIR,
        assignResultTo?: string
      }

    // Vertex shader terminal (mandatory end of vertexAst)
    // 'position' becomes @builtin(position) (vec4 clip-space)
    // 'varyings' are interpolated and passed to the fragment shader
    | { type: 'ReturnVertex', position: ExprIR, varyings: Record<string, ExprIR> }

    // Fragment shader terminal (mandatory end of fragmentAst)
    // 'outputs' maps to render target color attachments
    | { type: 'ReturnFragment', outputs: Record<string, ExprIR> };
```

---

# Design Decisions

## Ping-Pong / Double Buffering

JS unrolls iterations into explicit roster entries with alternating `textureId`s. Rust stays stateless — `[LAW:one-source-of-truth]`.

If Rust handled ping-ponging internally with a virtual `Swap()` command, it would dynamically track and swap `BindGroup`s behind the scenes, inventing and managing state. WebGPU cannot swap textures mid-compute-pass anyway — you must record a new pass with a new bind group.

JS requests two independent textures (`tex_pressure_A`, `tex_pressure_B`) in the manifest, then the lowering compiler emits 50 `ComputePassSpec`s with alternating read/write targets. Rust iterates the flat array blindly, creating a `BindGroup` for exactly what each pass requests.

## Hot-Swap: The Blit Protocol

On recompile with `preserveStateOnRecompile: true`:
1. **Lock** — Rust halts Phase 2 loop, drains in-flight GPU commands.
2. **Diff** — Compare new manifest to existing arena.
   - *No memory changes* (user changed math only): swap pipelines, zero data loss.
   - *Memory expanded* (user added a field): allocate new arena.
3. **Blit** — For every `SymbolId` in both old and new manifest, `copyBufferToBuffer` on GPU. Simulation state maps seamlessly into the new memory layout.
4. **Swap** — Drop old arena, resume Phase 2.

## Loops vs. Unrolled Passes

Cross-workgroup iterations (Jacobi pressure solver) **must** be unrolled into separate roster passes. WebGPU cannot synchronize execution barriers across different workgroups within a single dispatch — threads in workgroup A might be on iteration 2 while workgroup B is still on iteration 1, producing race conditions that explode the simulation into NaN.

`For` loops in the AST are for **thread-local operations only**: raymarching (stepping along a ray until SDF hit), kernel sampling (looping over a 3x3 blur grid), or any operation where each thread's loop is independent.

## Vertex Mapping

JS explicitly provides `vertexAst` rather than having Rust auto-generate vertex fetch logic from naming conventions. If Rust assumed `pos_x` was always the position, it would create hidden coupling — preventing a user from wiring `boid_velocity` to control geometry scale, or drawing the same `InstanceDomain` twice with different spatial interpretations (filled shapes vs. displaced outlines).
