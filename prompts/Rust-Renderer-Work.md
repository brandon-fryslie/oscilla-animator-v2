# Rust/WASM WebGPU Renderer Reference

## Architecture

The renderer is a GPU-only compute engine running in a `DedicatedWorker`. It receives a declarative `PipelineInstallPayload` from TypeScript, allocates GPU memory, translates symbolic IR → Naga → WGSL, and executes a roster of compute + render passes every frame.

```
PipelineInstallPayload (JSON)
        ↓
   contract.rs (serde deserialize)
        ↓
   mmu.rs (allocate GpuMemoryArena from manifest)
        ↓
   translator.rs (ExprIR/StatementIR → naga::Module via dsl.rs)
        ↓
   engine.rs (create pipelines + bind groups → CompiledRoster)
        ↓
   tick() loop: execute roster → queue.submit → present
```

**Key invariant:** Zero-allocation hot path. `StrictAllocator` poisons the global allocator during `tick()` — any heap allocation panics.

## File Manifest

### Rust (`src/render/wasm/rust/oscilla-rust-renderer/src/`)

| File | Lines | Role |
|------|-------|------|
| `engine.rs` | ~1600 | Core orchestration: init, install_pipeline, tick loop, roster execution |
| `translator.rs` | ~2400 | AST → Naga IR translation (compute + render passes) |
| `dsl.rs` | ~1600 | Naga builder DSL (ModuleBuilder / FnBuilder / FnBodyBuilder) |
| `contract.rs` | ~600 | Serde mirrors of boundary-contract.ts types |
| `wgsl_functions.rs` | ~800 | Parse WGSL sources + Naga arena transplant |
| `mmu.rs` | ~560 | Memory Management Unit — manifest → GPU buffers + symbol map |
| `telemetry.rs` | ~270 | Frame timing aggregation (60-sample rolling window) |
| `scheduler.rs` | ~200 | Worker state machine (Booting → Running → Paused → Lost) |
| `error_boundary.rs` | ~100 | GPU error capture, panic hook |
| `allocator.rs` | ~60 | StrictAllocator (zero-alloc hot path enforcement) |
| `lib.rs` | ~210 | WASM FFI exports, thread-local ENGINE |
| `dsl_tests.rs` | ~560 | DSL builder unit tests |

### TypeScript (`src/render/rust/`)

| File | Role |
|------|------|
| `boundary-contract.ts` | Zod schemas — **single source of truth** for all boundary types |
| `engine.worker.ts` | Worker harness, routes messages to WASM engine |
| `worker-protocol.ts` | Inbound/outbound message type definitions |
| `runtime-input-layout.ts` | SharedArrayBuffer heartbeat layout (zero-copy telemetry) |
| `engine-telemetry.ts` | Parse scheduler packets into JS observability |

### Dependencies (Cargo.toml)

```
wgpu = "29.0.1"      naga = "29.0.1"      wasm-bindgen = "0.2"
web-sys = "0.3"       js-sys = "0.3"       serde = "1.0"
bytemuck = "1.21"
```

## Engine Lifecycle

### WASM FFI Boundary (`lib.rs`)

Thread-local ENGINE ownership — one instance per worker, no shared state:

```rust
thread_local! {
    static ENGINE: RefCell<Option<Engine>> = RefCell::new(None);
}
```

WASM exports:
- `init_engine(canvas, width, height)` — create WebGPU device + surface
- `install_pipeline(payload_json)` → `InstallReceipt` (status, diagnostics, timing)
- `update_globals(data: &[u8])` — write CPU-side uniforms
- `render_frame()` — execute one tick
- `pause_engine()` / `resume_engine()`
- `take_frame_pacing_packet()` → heartbeat telemetry
- `inject_poison_alloc()` — test hook for hot-path guard

### Engine Init

- Create WebGPU instance → adapter → device (negotiate limits: 256 workgroup invocations, 128MB storage)
- Configure surface (color format, present mode, alpha)
- Resolve MSAA sample count (prefer 4x, fallback 1x)
- Install async GPU error handler (validation/OOM/internal → fatal flag)

### Pipeline Install

1. Parse JSON → `PipelineInstallPayload`
2. Parse registered WGSL functions (`wgsl_functions.rs`)
3. Allocate GPU memory arena (MMU)
4. For each `RosterEntry`: translate AST → Naga → create shader module → create pipeline → auto-construct bind groups
5. Store `CompiledRoster`
6. Return `InstallReceipt`

### Frame Tick

```
tick(timestamp)
├─ Check fatal GPU error (atomic flag)
├─ Check paused state
├─ execute_roster()
│  ├─ Write engine globals (sys:time, sys:resolution)
│  ├─ Create command encoder
│  ├─ Acquire surface texture ONCE (pre-resolved needs_surface flag)
│  ├─ For each CompiledPass:
│  │  ├─ Compute: begin pass → set pipeline + bind groups → dispatch → end
│  │  ├─ Render: begin pass (color/depth) → pipeline + vertex/index → draw_indexed_indirect → end
│  │  └─ DrawPrep: populate indirect draw args
│  ├─ queue.submit()
│  └─ surface.present()
├─ Increment frame_count
└─ Record telemetry
```

## Memory Management Unit (`mmu.rs`)

**Input:** `MemoryManifest` (semantic requests from JS)
**Output:** `GpuMemoryArena` (physical WebGPU buffers + symbol map)

```rust
pub struct GpuMemoryArena {
    globals_buffer: wgpu::Buffer,        // Uniform, CPU-written, GPU read-only
    scalars_buffer: wgpu::Buffer,        // Storage, GPU-writable
    domain_buffers: HashMap<String, wgpu::Buffer>,         // array<u32> with bitcast
    domain_atomic_buffers: HashMap<String, wgpu::Buffer>,  // array<atomic<u32>>
    shape_bank: HashMap<String, AllocatedShape>,           // Static vertex+index
    textures: HashMap<String, AllocatedTexture>,
    samplers: HashMap<String, wgpu::Sampler>,
    symbol_map: HashMap<String, PhysicalSymbol>,           // THE Rosetta Stone
    indirect_buffer: wgpu::Buffer,
}

pub struct PhysicalSymbol {
    buffer_kind: BufferKind,     // GlobalUniform | ArenaScalar | DomainStandard | DomainAtomic
    domain_id: Option<String>,
    word_offset: u32,            // 4-byte units (not bytes)
    wgsl_type: String,           // "f32", "vec3<f32>", "atomic<u32>"
}
```

**Memory layout:**
- All buffers are flat `array<u32>` with bitcast — no WGSL structs (avoids std430 padding)
- Domains use SoA layout with 256-byte alignment
- **Bifurcation rule:** If a domain has `atomic<u32>` fields, those go in a separate buffer (WGSL forbids `bitcast` on atomics)
- Bind groups use deterministic alphabetical slotting (Group 0 = globals, Group 1 = sorted deps)

**Symbol resolution:** The `symbol_map` is the **only source of truth** for where a symbol lives in GPU memory. The translator resolves `"pool_boids:velocity_x"` → physical buffer + word offset + type.

## AST Translation (`translator.rs`)

Takes `ExprIR`/`StatementIR` from the boundary contract and builds `naga::Module` via the DSL builder.

```rust
pub fn translate_compute_pass(
    spec: &ComputePassSpec,
    arena: &GpuMemoryArena,
    stdlib: Option<&HashMap<String, ParsedFunction>>,
) -> Result<ComputeTranslationResult, String>
```

**PassContext** holds resolved state for one pass:
- Buffer expressions for globals, scalars, domains, atomics, textures, samplers
- `symbol_map` for address resolution
- `type_handles` for Naga type reuse
- `stdlib_handles` for transplanted WGSL functions

**Translation pipeline:**
1. Build module skeleton (types, globals, bind groups)
2. Build PassContext (resolve all symbols from arena)
3. Walk AST statements recursively, emit Naga IR via FnBodyBuilder
4. Emit entry point
5. Validate module via `naga::valid::Validator`

## Naga DSL (`dsl.rs`)

Wraps raw Naga AST construction in semantic helpers. The translator reads like pseudocode, not plumbing.

```rust
// ModuleBuilder — owns naga::Module
mb.f32_type()                          // Handle<Type>
mb.vector_type(Vec3, F32)
mb.add_global_uniform(name, ty, group, binding)
mb.add_global_storage(name, ty, group, binding, access)
mb.add_compute_entry(name, workgroup_size, function)

// FnBodyBuilder — builds function body
fb.lit_f32(1.0)                        // Handle<Expression>
fb.binary_op(left, Multiply, right)
fb.load_buffer(buffer_expr, index_expr)
fb.store_buffer(buffer_expr, index_expr, value_expr)
fb.atomic_load(buffer_expr, index_expr)
fb.atomic_op(buffer_expr, index_expr, AtomicAdd, value_expr)
fb.call_function(func_handle, args)    // For transplanted WGSL functions
fb.if_block(cond, |fb| { ... })
fb.for_loop(init, cond, update, |fb| { ... })
```

## Telemetry & Scheduling

**Scheduler states:** `Booting` → `Running` ↔ `Paused` → `Lost` (fatal GPU error)

**Heartbeat packet** (returned via `take_frame_pacing_packet()`):
- Sequence number, scheduler state, frame count
- Mean tick ms, std dev tick ms, sample count (60-sample rolling window)
- Pending runtime events (errors, state changes)

**SharedArrayBuffer plane:** Zero-copy heartbeat monitoring between main thread and worker via `Atomics`.

## Error Handling

- **GPU errors:** Async handler installed at device creation. Validation/OOM/Internal → sets `pending_fatal_gpu_error` atomic flag → scheduler enters `Lost` state → posts `ENGINE_ERROR` to worker
- **Strict allocator:** Global allocator hook panics on any heap allocation while hot-path is locked
- **Install errors:** Returned in `InstallReceipt.diagnostics[]` with severity, phase, and source context

## MSAA

4x preferred, 1x fallback. Three-point wiring:
1. Pipeline `MultisampleState` with `sample_count`
2. MSAA texture created at init → `msaa_view`
3. Render pass: MSAA view as attachment, surface as `resolve_target`

## Testing

| Test Type | Location | What It Checks |
|-----------|----------|----------------|
| **Gate 1:** Native headless | `native-tests/webgpu-headless/` | Compute math correctness (Vulkan backend) |
| **Gate 2:** Hot-path poison | Playwright E2E | 100-frame run + poison alloc injection |
| **Gate 3:** Render snapshot | Native headless | PNG pixel diff against golden masters |
| **Gate 4:** Frame pacing | Playwright E2E | stdDev ≤ 1.0ms over 60 samples |
| **DSL unit tests** | `dsl_tests.rs` | Naga module construction + validation |
| **Visual validation** | `get-screenshot-of-payload-tester.sh` | Manual fixture screenshot (WebGPU needs real GPU) |

Build: `npm run build:rust-renderer`
Run native tests: `npm run test:native-webgpu-gates`
Run E2E tests: `npm run test:rust-worker-gates`

## Design Principles

- **Renderer as dumb executor**: Zero conditional logic in the frame loop. All decisions (load ops, dispatch sizes, buffer layout) resolved into the compiled roster at install time. If the renderer checks a value to decide what to do, that decision belongs in the IR compiler.
- **[LAW:one-source-of-truth]**: TS Zod schemas are authority → Rust derives via serde. MMU symbol_map is canonical address mapping. WGSL function implementations defined in TS, parsed + transplanted in Rust.
- **[LAW:dataflow-not-control-flow]**: Surface texture acquired unconditionally once per frame (pre-resolved `needs_surface` flag). Roster entries execute in flat sequence — no runtime branching on pass types.
- **[LAW:single-enforcer]**: One ENGINE instance (thread-local), one frame loop (tick), one heartbeat cadence (scheduler), one memory allocator guard (StrictAllocator).

## Spec & Design Docs

| Document | Location |
|----------|----------|
| WASM Boundary Spec | `design-docs/WASM-Boundary-Spec.md` |
| MMU Spec | `design-docs/WASM-MMU-Spec.md` |
| AST-to-Naga Spec | `design-docs/WASM-AST-to-Naga-Spec.md` |
| 4-Pillar Architecture | `design-docs/B0-4-Pillar-Arch-UBER.md` |
| Renderer Verification Matrix | `docs/current/renderer/rust-renderer-verification-matrix.md` |
| Debug ABI | `docs/current/renderer/RUST-WASM-DEBUG-ABI.md` |
| GPU Architecture (P0-P6) | `docs/current/webgpu-specs/` |
| Shape Taxonomy (5 types) | `docs/current/webgpu-specs/shapes-*.md` |
| Naga DSL reference skill | `/oscilla-naga-dsl-reference` |
