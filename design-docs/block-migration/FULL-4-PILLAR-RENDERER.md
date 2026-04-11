# Plan: Expand WASM Boundary Contract — Serial Gate Sequence

## Context

The single-triangle vertical slice is complete and passing (`check-payload-tester-visible.mjs`). Every layer works end-to-end for a narrow case. Now we widen the slice through a linear series of gates, each adding a concrete testable capability with a fixture that exercises it. After every gate, the system is in a valid state with more features than before.

All gates execute serially. They are ordered to maximize leverage — each gate unblocks the most subsequent capabilities.

### What Already Works (Vertical Slice)
- Full pipeline: TS types → JSON → Rust deserialize → MMU → AST translate → Naga → WebGPU → pixels
- DSL: ~60 methods (literals, arithmetic, comparison, trig, buffer ops, control flow, barriers, atomics, bitcast)
- MMU: Phases A (globals/storage), A.5 (scalars), B (domains/aligned), D (shapes), G (clear)
- Translator: Literals, LoadGlobal/Scalar/Field, BinaryOp (arithmetic+comparison), 17 CallBuiltin math funcs, Construct, VarRef, single-component Swizzle, Let, StoreScalar/Field, ReturnVertex (no varyings), ReturnFragment (single output)
- Engine: install_pipeline, tick with execute_roster (compute/draw_prep/render via draw_indirect)
- Fixture: "Visible Triangle" — compute color + draw_prep + render

---

## Gate Sequence

### Gate 1: global_invocation_id + Domain Dispatch
**Unlocks:** Every compute pass that processes N instances in parallel.

**What:** Translator handles `Intrinsic("global_invocation_id.x/y/z")`. Engine resolves `dispatch.mode: 'Domain'` to `ceil(capacity / workgroupSize[0])`.

**Files:**
- `translator.rs` — Handle `Intrinsic` variant: add `@builtin(global_invocation_id) gid: vec3<u32>` as compute entry point argument, then `access_index(gid, 0/1/2)` for .x/.y/.z components
- `engine.rs` — In `install_pipeline`, resolve `DispatchMode::Domain { domain_id }` → look up capacity from manifest, compute `ceil(capacity / workgroup_size[0])`

**Fixture:** `instanced-write` — 64-instance domain, compute writes `sin(time + f32(gid.x))` to each instance's color field. Uses `Cast` (u32→f32 for gid) — also implement `Cast` in translator.

**Gate test:** Fixture installs successfully; 64 instances visible (ring of colored dots via draw_indirect).

---

### Gate 2: Control Flow (If / For / Var / Assign)
**Unlocks:** Loops, conditionals, mutable variables — required for any non-trivial shader logic.

**What:** Translator handles `If`, `For`, `Var`, `Assign`, `Break`, `Continue`.

**Files:**
- `dsl.rs` — Add `declare_var(name, ty, init)` → `Statement::LocalVariable` + returns pointer handle; add `store_local(ptr, val)` → `Statement::Store` on local
- `translator.rs` — `If` → `fb.if_then`/`fb.if_then_else`; `For` → `fb.loop_body` with break_if; `Var` → `fb.declare_var`; `Assign` → resolve target to pointer + `Statement::Store`; `Break`/`Continue` → `fb.emit_break`/`fb.emit_continue`

**Fixture:** `for-loop-gradient` — compute pass with `For` loop that accumulates values into a mutable `Var`, stores result to domain field

**Gate test:** Fixture compiles and renders gradient based on accumulated loop values.

---

### Gate 3: Logical + Bitwise Operators
**Unlocks:** Hash functions, spatial indexing, boolean logic in shaders.

**What:** All remaining BinaryOp and UnaryOp variants.

**Files:**
- `dsl.rs` — Add 9 methods: `and`(LogicalAnd), `or`(LogicalOr), `bit_and`(And), `bit_or`(InclusiveOr), `bit_xor`(ExclusiveOr), `shl`(ShiftLeft), `shr`(ShiftRight), `not`(LogicalNot), `bit_not`(BitwiseNot)
- `translator.rs` — Map operator strings to DSL calls in BinaryOp/UnaryOp match arms

**Fixture:** `hash-color` — compute pass uses bitwise ops (XOR, shift, multiply) for a PCG-style hash → deterministic per-instance colors

**Gate test:** Fixture compiles; all 9 operators produce valid naga IR; instances show deterministic pseudo-random colors.

---

### Gate 4: Extended Math + IndexAccess + Multi-Component Swizzle
**Unlocks:** Vector math (dot, normalize, reflect), SDF operations, rich shader expressions.

**What:** All remaining CallBuiltin functions, IndexAccess, multi-component swizzle.

**Files:**
- `dsl.rs` — Add 12 math methods: `asin`, `acos`, `atan`, `step`, `smoothstep`, `length`, `distance`, `dot`, `cross`, `normalize`, `reflect`, `refract`. Add `swizzle(src, [components])` → `Expression::Swizzle { size, pattern }`.
- `translator.rs` — Handle all new CallBuiltin funcs; `IndexAccess` → `fb.access(target, index)`; multi-component `Swizzle` → parse mask string ("xy", "rgb", etc.) into `SwizzleComponent` array → `fb.swizzle`

**Fixture:** `vector-math` — compute pass using dot, normalize, reflect, length on vec3 data for lighting calculation

**Gate test:** Fixture compiles; all 12 math functions + IndexAccess + multi-swizzle produce valid naga IR.

---

### Gate 5: Varyings (Vertex → Fragment Data Passing)
**Unlocks:** Per-vertex colors, UVs, normals — required for any render pass richer than flat color.

**What:** `ReturnVertex.varyings` compiles into an inter-stage struct. Fragment shader receives varyings as inputs.

**Files:**
- `dsl.rs` — Add `struct_type(name, members)` to `ModuleBuilder` → creates `naga::TypeInner::Struct` with named members and `@location(N)` bindings
- `translator.rs` — In `translate_render_pass`: (1) scan vertexAst for ReturnVertex, extract varying keys; (2) build inter-stage struct type (position + varyings sorted alphabetically → `@location(0)`, `@location(1)`, ...); (3) vertex function returns composed struct; (4) fragment function receives struct as argument, varyings registered in scope

**Fixture:** `varying-gradient` — vertex shader passes per-vertex RGB as varyings, fragment shader interpolates → smooth gradient triangle

**Gate test:** Triangle renders with smooth color gradient (not flat color). Visual difference from hello-triangle is clear.

---

### Gate 6: Texture Allocation + Sampler Creation (MMU Phases C + E)
**Unlocks:** Any texture-based rendering or compute.

**What:** MMU allocates textures and samplers from manifest entries.

**Files:**
- `mmu.rs` — Add `allocate_textures()`: iterate `manifest.textures`, resolve dimensions (handle `relativeTo: 'canvas'`), create `wgpu::Texture` + `TextureView`, store in arena. Add `allocate_samplers()`: iterate `manifest.samplers`, create `wgpu::Sampler`. Extend `GpuMemoryArena` with `textures`, `texture_views`, `samplers` fields.

**Gate test:** Unit test (if possible natively) or fixture that declares textures/samplers in manifest → install succeeds without crash, receipt shows no diagnostics.

---

### Gate 7: Texture Ops in Translator + Bind Group Wiring
**Unlocks:** Texture sampling in fragment shaders, texture read/write in compute, ping-pong patterns.

**What:** Translator handles `TextureSample`, `TextureLoad`, `TextureStore`. Engine wires texture/sampler handles into pass bind groups.

**Files:**
- `translator.rs` — Handle `TextureSample` → `fb.texture_sample_level(tex_expr, samp_expr, uv, level)`; `TextureLoad` → `fb.texture_load`; (stmt) `TextureStore` → `fb.texture_store`. Thread texture/sampler global variable handles through `PassContext`.
- `engine.rs` — In bind group construction for compute/render passes: after domain bindings, add texture view bindings (sorted alpha by textureId) and sampler bindings (sorted alpha by samplerId). Module scaffold in translator must declare texture/sampler globals at matching group/binding slots.
- `translator.rs` — In scaffold: add texture global handles (`add_global_handle` with image type) and sampler handles for each dependency

**Fixture:** `texture-readwrite` — compute writes to storage texture, render pass samples it via sampler

**Gate test:** Fixture renders non-uniform colors sourced from texture data.

---

### Gate 8: Fragment Derivatives
**Unlocks:** SDF rendering, anti-aliasing, procedural texturing.

**What:** `dpdx`, `dpdy`, `fwidth` in fragment shaders.

**Files:**
- `dsl.rs` — Add 3 derivative methods: `dpdx(x)`, `dpdy(x)`, `fwidth(x)` → `Expression::Derivative { expr, axis, ctrl }`
- `translator.rs` — Handle CallBuiltin `dpdx`/`dpdy`/`fwidth` (fragment context only)

**Fixture:** `sdf-circle` — fragment shader renders anti-aliased SDF circle using `fwidth`

**Gate test:** Smooth-edged circle visible (not aliased staircase edges).

---

### Gate 9: Domain Buffer Bifurcation + Atomic Operations
**Unlocks:** Spatial hashing, collision detection, GPU-driven counting.

**What:** MMU splits domain fields into standard + atomic buffers. Translator handles all atomic ExprIR/StatementIR.

**Files:**
- `mmu.rs` — Route `atomic<u32>`/`atomic<i32>` fields to separate atomic buffer. `DomainBuffers { standard, atomic: Option<Buffer> }`. Bind both in separate slots.
- `dsl.rs` — Add 6 atomic methods: `atomic_sub`, `atomic_max`, `atomic_min`, `atomic_and`, `atomic_or`, `atomic_xor`
- `translator.rs` — Handle `AtomicOpField`, `AtomicOpScalar` (build pointer to atomic buffer, map op → `AtomicFunction`, emit `Statement::Atomic`). Handle `AtomicLoadField`, `AtomicLoadScalar` (emit `Expression::Load` on atomic pointer).

**Fixture:** `atomic-counter` — compute atomically counts alive instances; fragment reads the count for a HUD display

**Gate test:** Fixture compiles; counter shows correct instance count.

---

### Gate 10: Data Streams (MMU Phase B.5)
**Unlocks:** Audio FFT, sensor arrays, point clouds pushed from JS every frame.

**What:** MMU allocates per-stream storage buffers. Engine exposes `update_data_stream` WASM export.

**Files:**
- `mmu.rs` — `allocate_data_streams()`: one STORAGE | COPY_DST buffer per stream. Add to GpuMemoryArena + symbol_map.
- `lib.rs` — Add `update_data_stream(stream_id: &str, data: &[u8])` WASM export
- `engine.rs` — `update_data_stream()` method → find buffer in arena, `queue.write_buffer`
- `worker-protocol.ts` — Add `UPDATE_DATA_STREAM` message type (if not already present)
- `engine.worker.ts` — Handle `UPDATE_DATA_STREAM` → call WASM export

**Fixture:** `audio-reactive` — JS pushes mock 128-bin FFT array, compute maps bins to instance heights

**Gate test:** Fixture renders bars at heights determined by stream data.

---

### Gate 11: Environment Resize
**Unlocks:** Canvas resize without full pipeline recompile.

**What:** Lightweight resize signal reallocates only `relativeTo: 'canvas'` textures.

**Files:**
- `contract.rs` — Add `EnvironmentResizePayload` serde type
- `lib.rs` — Add `resize_environment(payload_json: &str)` WASM export
- `engine.rs` — Filter canvas-relative textures, drop + reallocate, recreate affected bind groups, resume
- `worker-protocol.ts` — Add `ENVIRONMENT_RESIZE` message

**Gate test:** Resize browser window → rendering continues without stutter or recompile.

---

### Gate 12: Hot-Swap Blit
**Unlocks:** Live editing — change shader math without losing simulation state.

**What:** When `preserveStateOnRecompile: true`, MMU diffs old/new symbol maps and copies matching data via `copy_buffer_to_buffer`.

**Files:**
- `mmu.rs` — Add `blit_state(device, queue, old_arena, new_arena)`: for each SymbolId in both maps with same buffer kind, emit `copy_buffer_to_buffer` with physical offsets
- `engine.rs` — In `install_pipeline`, if old compiled_roster exists and `preserveStateOnRecompile: true`, run blit before dropping old arena

**Gate test:** Modify compute math in fixture → re-install → particles don't reset positions.

---

### Gate 13: Engine Intrinsics (hash_u32, noise)
**Unlocks:** Procedural generation, deterministic randomness.

**What:** Translator injects helper function bodies into naga modules when referenced by `CallBuiltin`.

**Files:**
- `translator.rs` — When `CallBuiltin("hash_u32")` encountered: build PCG hash as `naga::Function` (bit ops + multiply), add to module, emit `Call` expression. Same pattern for `noise_simplex_2d`/`noise_simplex_3d` (port Ashima/webgl-noise).

**Fixture:** `hash-positions` — compute distributes instances using `hash_u32(instance_index)` for deterministic layout; `noise-terrain` — fragment uses simplex noise for procedural color

**Gate test:** Fixtures render deterministic pseudo-random patterns and organic noise respectively.

---

## Summary: Linear Gate Sequence

| # | Gate | Key Capability Added | Fixture |
|---|------|---------------------|---------|
| 1 | global_invocation_id + Domain Dispatch | Parallel compute over N instances | `instanced-write` |
| 2 | Control Flow | If/For/Var/Assign | `for-loop-gradient` |
| 3 | Logical + Bitwise Ops | Hash functions, boolean logic | `hash-color` |
| 4 | Extended Math + Swizzle | Vector math, SDF building blocks | `vector-math` |
| 5 | Varyings | Vertex→fragment data passing | `varying-gradient` |
| 6 | Texture + Sampler Allocation | MMU texture/sampler support | (unit test) |
| 7 | Texture Ops + Bind Groups | Texture sample/load/store in shaders | `texture-readwrite` |
| 8 | Fragment Derivatives | SDF anti-aliasing | `sdf-circle` |
| 9 | Atomics + Domain Bifurcation | GPU counting, collision | `atomic-counter` |
| 10 | Data Streams | JS-pushed per-frame arrays | `audio-reactive` |
| 11 | Environment Resize | Canvas resize without recompile | (manual) |
| 12 | Hot-Swap Blit | Live edit state preservation | (manual) |
| 13 | Engine Intrinsics | hash_u32, simplex noise | `hash-positions` / `noise-terrain` |

**After Gate 5**, the system can render any non-texture, non-atomic shader with full math coverage and vertex→fragment data passing. This is the "useful for real patches" threshold.

**After Gate 9**, the system has full compute + render capabilities including atomics. This is the "feature complete for 2D" threshold.

**After Gate 12**, the system supports live editing. This is the "production workflow" threshold.
