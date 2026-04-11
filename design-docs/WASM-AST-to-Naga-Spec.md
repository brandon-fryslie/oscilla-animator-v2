# AST → Naga IR Translation Spec

**Status:** Draft (for Gemini session)
**Prerequisite:** `WASM-Boundary-Spec.md` (Math IR definitions), `WASM-MMU-Spec.md` (symbol map + allocation)
**Implementation Tool:** `oscilla-naga-shim` DSL (`ModuleBuilder`, `FnBuilder`, `FnBodyBuilder`) — see `DSL-REFERENCE.md`

This module takes the symbolic `ExprIR`/`StatementIR` JSON from the JS compiler and produces `naga::Module` objects. The MMU's `symbol_map` provides the physical translation for every symbolic reference.

---

## 1. Overview: What Gets Translated

Each roster entry produces one `naga::Module`:

| Roster Entry | Entry Point(s) | Module Contains |
|-------------|----------------|-----------------|
| `ComputePassSpec` | `@compute fn main()` | Bind group declarations, compute body from `ast` |
| `DrawCallSpec` | `@vertex fn vs_main()` + `@fragment fn fs_main()` | Bind group declarations, inter-stage struct, vertex body from `vertexAst`, fragment body from `fragmentAst` |
| `SystemPassSpec` (DrawPrep) | `@compute fn draw_prep()` | Hardcoded: read `activeLanesSymbol`, write `DrawIndirectArgs` |

---

## 2. Module Scaffolding

For every pass, the translator builds the module skeleton before walking the AST.

### 2.1 Compute Pass Scaffold

```rust
let mut m = ModuleBuilder::new();

// Types
let f32_ty = m.f32_type();
let u32_ty = m.u32_type();
let i32_ty = m.i32_type();
// ... vec types, array types as needed by the pass

// Group 0: Global Context (always present)
let globals_arr = m.array_type(f32_ty, None, 4); // runtime-sized array<f32>
let globals_gv = m.add_global_uniform("globals", globals_arr, 0, 0);

let scalars_arr = m.array_type(u32_ty, None, 4); // runtime-sized array<u32>
let scalars_gv = m.add_global_storage("scalars", scalars_arr, 0, 1,
    StorageAccess::LOAD | StorageAccess::STORE);

// Group 1: Pass-specific (from sorted dependencies)
// For each domain in sorted order:
let domain_arr = m.array_type(u32_ty, None, 4);
let domain_gv = m.add_global_storage("pool_boids", domain_arr, 1, 0,
    access_from_dependency); // LOAD or LOAD|STORE

// For each texture in sorted order:
let tex_ty = m.image_type(dim, arrayed, class);
let tex_gv = m.add_global_handle("tex_fluid_vel", tex_ty, 1, binding_index);

// For each sampler in sorted order:
let samp_ty = m.sampler_type(false);
let samp_gv = m.add_global_handle("samp_linear", samp_ty, 1, binding_index);

// Build the function
let mut fb = FnBuilder::new("main");
// ... translate ast statements ...
let func = fb.finish();

m.add_compute_entry("main", spec.workgroup_size, func);
let module = m.finish();
```

### 2.2 Render Pass Scaffold (Vertex + Fragment)

The translator must auto-generate an inter-stage struct from the `varyings` keys in `ReturnVertex`.

```rust
// 1. Scan the vertexAst for the ReturnVertex statement
//    Extract varyings: Record<string, ExprIR>
//    e.g., { "uv": ..., "color": ..., "normal": ... }

// 2. Build the inter-stage struct type
//    struct Varyings {
//        @builtin(position) position: vec4<f32>,
//        @location(0) uv: vec2<f32>,
//        @location(1) color: vec4<f32>,
//        @location(2) normal: vec3<f32>,
//    }
// Location indices assigned in alphabetical order of varying keys

// 3. Vertex function: returns Varyings struct
let mut vs = FnBuilder::new("vs_main");
// ... translate vertexAst ...
// ReturnVertex → compose the Varyings struct, emit return
let vs_func = vs.finish();
m.add_vertex_entry("vs_main", vs_func);

// 4. Fragment function: receives Varyings struct as input
let mut fs = FnBuilder::new("fs_main");
// Varyings fields become available as VarRef names in the fragment scope
// ... translate fragmentAst ...
// ReturnFragment → write to @location(0), etc.
let fs_func = fs.finish();
m.add_fragment_entry("fs_main", fs_func);
```

---

## 3. ExprIR Translation Map

Each `ExprIR` variant maps to specific DSL calls. The translator walks the tree recursively, returning a `Handle<Expression>` for each node.

| ExprIR Variant | DSL Call(s) | Notes |
|---------------|-------------|-------|
| `LiteralF32 { value }` | `fb.lit_f32(value)` | |
| `LiteralU32 { value }` | `fb.lit_u32(value)` | |
| `LiteralI32 { value }` | `fb.lit_i32(value)` | |
| `LiteralBool { value }` | `fb.lit_bool(value)` | |
| `Intrinsic { name: "global_invocation_id.x" }` | `fb.access_index(global_id, 0)` | `global_id` is a built-in input to compute entry points |
| `Intrinsic { name: "global_invocation_id.y" }` | `fb.access_index(global_id, 1)` | |
| `Intrinsic { name: "global_invocation_id.z" }` | `fb.access_index(global_id, 2)` | |
| `LoadGlobal { symbolId }` | Look up `symbol_map[symbolId]` → `word_offset`. Then `fb.load_buffer(globals, fb.lit_u32(word_offset))`. For `mat4x4`: load 16 consecutive floats and `fb.compose(mat4_ty, ...)`. | Globals buffer is `array<f32>` |
| `LoadScalar { symbolId }` | Look up `symbol_map[symbolId]` → `word_offset`. Then `fb.load_buffer(scalars, fb.lit_u32(word_offset))`. Bitcast if f32: `fb.f32(raw_u32)` or use `bitcast`. | Scalars buffer is `array<u32>` |
| `LoadField { symbolId, index }` | Look up `symbol_map[symbolId]` → `word_offset`, `domain_id`. Translate `index` recursively → `idx_expr`. Then `fb.load_buffer(domain_buf, fb.add(fb.lit_u32(word_offset), idx_expr))`. Bitcast to target type. | SoA: `buffer[offset + instance_id]` |
| `TextureSample { textureId, samplerId, uv }` | Translate `uv` → `uv_expr`. Then `fb.texture_sample_level(tex_handle, samp_handle, uv_expr, fb.lit_f32(0.0))`. | Use `sample_level` (not `sample`) in compute shaders — `sample` is fragment-only |
| `TextureLoad { textureId, coords }` | Translate `coords` → `coords_expr`. Then `fb.texture_load(tex_handle, coords_expr, None)`. | |
| `BinaryOp { op, left, right }` | Translate both sides. Map `op` to DSL: | |
| | `+` → `fb.add(l, r)` | |
| | `-` → `fb.sub(l, r)` | |
| | `*` → `fb.mul(l, r)` | |
| | `/` → `fb.div(l, r)` | |
| | `%` → `fb.modulo(l, r)` | |
| | `==` → `fb.eq(l, r)` | |
| | `!=` → `fb.ne(l, r)` | |
| | `<` → `fb.lt(l, r)` | |
| | `>` → `fb.gt(l, r)` | |
| | `<=` → `fb.le(l, r)` | |
| | `>=` → `fb.ge(l, r)` | |
| | `&&`, `\|\|`, `&`, `\|`, `^`, `<<`, `>>` → **DSL gap** (see §6) | |
| `UnaryOp { op: '-', expr }` | `fb.neg(translate(expr))` | |
| `UnaryOp { op: '!', expr }` | **DSL gap** — need `fb.not(expr)` → `Unary(LogicalNot)` | |
| `UnaryOp { op: '~', expr }` | **DSL gap** — need `fb.bitwise_not(expr)` → `Unary(BitwiseNot)` | |
| `Construct { dataType, args }` | Resolve `dataType` to a Naga type handle. Translate each arg. `fb.compose(ty, translated_args)`. | |
| `Cast { targetType, expr }` | Map `targetType` to cast: `f32` → `fb.f32(e)`, `u32` → `fb.u32(e)`, `i32` → `fb.i32(e)`. For vector casts, need component-wise cast or `As` expression. | |
| `Swizzle { source, mask }` | Translate `source`. Map mask characters to `AccessIndex` calls or Naga `Swizzle` expression. Single component (`"x"`) → `fb.access_index(src, 0)`. Multi-component (`"xy"`) → Naga `Expression::Swizzle`. | **DSL gap** — need `fb.swizzle(src, pattern)` |
| `IndexAccess { target, index }` | `fb.access(translate(target), translate(index))` | |
| `CallBuiltin { func, args }` | Map `func` to DSL (see §4) | |
| `VarRef { name }` | Look up the local variable handle by `name` from the translator's scope map. | Translator maintains `HashMap<String, Handle<Expression>>` for locals |
| `AtomicLoadField { symbolId, index }` | Look up symbol → atomic domain buffer. Build pointer via `fb.access(atomic_buf, fb.add(fb.lit_u32(offset), idx))`. Then Naga `Expression::Load` on the atomic pointer. | Atomic buffer is `array<atomic<u32>>` |
| `AtomicLoadScalar { symbolId }` | Similar, from scalars buffer at `word_offset`. | |

---

## 4. BuiltinMathFunc Translation Map

| `BuiltinMathFunc` | DSL Call | Notes |
|-------------------|----------|-------|
| `sin` | `fb.sin(a)` | |
| `cos` | `fb.cos(a)` | |
| `tan` | `fb.tan(a)` | |
| `asin` | **DSL gap** — `Math(Asin)` | |
| `acos` | **DSL gap** — `Math(Acos)` | |
| `atan` | **DSL gap** — `Math(Atan)` | |
| `atan2` | `fb.atan2(y, x)` | |
| `exp` | `fb.exp(a)` | |
| `log` | `fb.log(a)` | |
| `pow` | `fb.pow(a, b)` | |
| `abs` | `fb.abs(a)` | |
| `min` | `fb.min(a, b)` | |
| `max` | `fb.max(a, b)` | |
| `clamp` | `fb.clamp(v, lo, hi)` | |
| `mix` | `fb.mix(a, b, t)` | Currently lowered as `a + (b-a)*t`, could use native `Math(Mix)` |
| `step` | **DSL gap** — `Math(Step)` | |
| `smoothstep` | **DSL gap** — `Math(SmoothStep)` | |
| `sign` | `fb.sign(a)` | |
| `fract` | `fb.fract(a)` | |
| `ceil` | `fb.ceil(a)` | |
| `floor` | `fb.floor(a)` | |
| `round` | `fb.round(a)` | |
| `length` | **DSL gap** — `Math(Length)` | |
| `distance` | **DSL gap** — `Math(Distance)` | |
| `dot` | **DSL gap** — `Math(Dot)` | |
| `cross` | **DSL gap** — `Math(Cross)` | |
| `normalize` | **DSL gap** — `Math(Normalize)` | |
| `reflect` | **DSL gap** — `Math(Reflect)` | |
| `refract` | **DSL gap** — `Math(Refract)` | |
| `fwidth` | **DSL gap** — `Math(Fwidth)` (fragment only) | |
| `dpdx` | **DSL gap** — derivative expression (fragment only) | |
| `dpdy` | **DSL gap** — derivative expression (fragment only) | |
| `hash_u32` | Engine intrinsic — inject a WGSL helper function into the module | |
| `noise_simplex_2d` | Engine intrinsic — inject WGSL helper | |
| `noise_simplex_3d` | Engine intrinsic — inject WGSL helper | |

---

## 5. StatementIR Translation Map

| StatementIR Variant | DSL Call(s) | Notes |
|--------------------|-------------|-------|
| `Let { name, value }` | Translate `value` → `expr`. Register `(name, expr)` in scope map. No Naga statement needed — `let` in WGSL is just an alias. | The `expr` handle IS the variable |
| `Var { name, dataType, value }` | Emit `Statement::LocalVariable` with optional initializer. Register mutable pointer in scope map. | **DSL gap** — need `fb.declare_var(name, ty, init)` |
| `Assign { target, value }` | Translate `target` → pointer expr, `value` → value expr. `Statement::Store { pointer, value }`. | For `VarRef` targets: store to the local var pointer. For `Swizzle` targets: need to build the pointer path. |
| `StoreScalar { symbolId, value }` | Look up `symbol_map[symbolId]` → `word_offset`. `fb.store_buffer(scalars, fb.lit_u32(word_offset), translated_value)`. Bitcast if needed. | |
| `StoreField { symbolId, index, value }` | Look up symbol → `word_offset`, `domain_id`. `fb.store_buffer(domain_buf, fb.add(fb.lit_u32(word_offset), idx), val)`. Bitcast if needed. | |
| `TextureStore { textureId, coords, value }` | `fb.texture_store(tex_handle, translated_coords, translated_value)` | |
| `If { condition, accept, reject }` | If `reject` is empty: `fb.if_then(cond, \|b\| { translate_block(b, accept) })`. If both: `fb.if_then_else(cond, \|a\| { ... }, \|r\| { ... })`. | |
| `For { init, condition, update, body }` | Translate to `fb.loop_body(\|b\| { translate(init); b.break_if(not(cond)); translate_block(b, body); translate(update); })`. | WGSL `for` is syntactic sugar — Naga represents it as `loop` with `break if` |
| `Break` | `fb.emit_break()` | |
| `Continue` | `fb.emit_continue()` | |
| `AtomicOpField { op, symbolId, index, value, assignResultTo }` | Look up symbol → atomic buffer, `word_offset`. Build pointer. Map `op`: `Add` → `fb.atomic_add(ptr, val, u32_ty)`. If `assignResultTo` is set, register the result handle in scope map. | |
| `AtomicOpScalar { op, symbolId, value, assignResultTo }` | Same but on scalars buffer. | |
| `ReturnVertex { position, varyings }` | Translate `position` and each varying value. Compose the inter-stage struct. Emit `Statement::Return { value: composed_struct }`. | |
| `ReturnFragment { outputs }` | Translate each output value. Compose the output struct (`@location(0)`, etc.). Emit `Statement::Return { value: composed_struct }`. | |

---

## 6. DSL Gaps (Extensions Needed)

The existing `oscilla-naga-shim` DSL covers ~70% of what the translator needs. These additions are required:

### Operators
| Need | WGSL | Naga AST | Proposed DSL |
|------|------|----------|-------------|
| Logical AND | `a && b` | `Binary(LogicalAnd)` | `fb.and(a, b)` |
| Logical OR | `a \|\| b` | `Binary(LogicalOr)` | `fb.or(a, b)` |
| Bitwise AND | `a & b` | `Binary(And)` | `fb.bit_and(a, b)` |
| Bitwise OR | `a \| b` | `Binary(InclusiveOr)` | `fb.bit_or(a, b)` |
| Bitwise XOR | `a ^ b` | `Binary(ExclusiveOr)` | `fb.bit_xor(a, b)` |
| Shift Left | `a << b` | `Binary(ShiftLeft)` | `fb.shl(a, b)` |
| Shift Right | `a >> b` | `Binary(ShiftRight)` | `fb.shr(a, b)` |
| Logical NOT | `!a` | `Unary(LogicalNot)` | `fb.not(a)` |
| Bitwise NOT | `~a` | `Unary(BitwiseNot)` | `fb.bit_not(a)` |

### Math Functions
| Need | WGSL | Naga | Proposed DSL |
|------|------|------|-------------|
| `asin` | `asin(x)` | `Math(Asin)` | `fb.asin(a)` |
| `acos` | `acos(x)` | `Math(Acos)` | `fb.acos(a)` |
| `atan` | `atan(x)` | `Math(Atan)` | `fb.atan(a)` |
| `step` | `step(edge, x)` | `Math(Step)` | `fb.step(edge, x)` |
| `smoothstep` | `smoothstep(lo, hi, x)` | `Math(SmoothStep)` | `fb.smoothstep(lo, hi, x)` |
| `length` | `length(v)` | `Math(Length)` | `fb.length(v)` |
| `distance` | `distance(a, b)` | `Math(Distance)` | `fb.distance(a, b)` |
| `dot` | `dot(a, b)` | `Math(Dot)` | `fb.dot(a, b)` |
| `cross` | `cross(a, b)` | `Math(Cross)` | `fb.cross(a, b)` |
| `normalize` | `normalize(v)` | `Math(Normalize)` | `fb.normalize(v)` |
| `reflect` | `reflect(i, n)` | `Math(Reflect)` | `fb.reflect(i, n)` |
| `refract` | `refract(i, n, eta)` | `Math(Refract)` | `fb.refract(i, n, eta)` |

### Fragment Derivatives
| Need | WGSL | Naga | Proposed DSL |
|------|------|------|-------------|
| `fwidth` | `fwidth(x)` | `DerivativeControl(Fwidth)` or `Math(Fwidth)` | `fb.fwidth(x)` |
| `dpdx` | `dpdx(x)` | `Derivative { axis: X }` | `fb.dpdx(x)` |
| `dpdy` | `dpdy(x)` | `Derivative { axis: Y }` | `fb.dpdy(x)` |

### Swizzle
| Need | WGSL | Naga | Proposed DSL |
|------|------|------|-------------|
| Multi-component swizzle | `v.xy`, `v.rgb` | `Expression::Swizzle { size, pattern }` | `fb.swizzle(v, "xy")` |

### Mutable Variables
| Need | WGSL | Naga | Proposed DSL |
|------|------|------|-------------|
| Declare mutable var | `var x: f32 = 0.0;` | `Statement::LocalVariable` + `Statement::Store` | `fb.declare_var(name, ty, init)` → returns pointer handle |

### Additional Atomics
| Need | WGSL | Naga | Proposed DSL |
|------|------|------|-------------|
| `atomicSub` | `atomicSub(ptr, v)` | `Atomic(Sub)` | `fb.atomic_sub(ptr, v, ty)` |
| `atomicMax` | `atomicMax(ptr, v)` | `Atomic(Max)` | `fb.atomic_max(ptr, v, ty)` |
| `atomicMin` | `atomicMin(ptr, v)` | `Atomic(Min)` | `fb.atomic_min(ptr, v, ty)` |
| `atomicAnd` | `atomicAnd(ptr, v)` | `Atomic(And)` | `fb.atomic_and(ptr, v, ty)` |
| `atomicOr` | `atomicOr(ptr, v)` | `Atomic(Or)` | `fb.atomic_or(ptr, v, ty)` |
| `atomicXor` | `atomicXor(ptr, v)` | `Atomic(Xor)` | `fb.atomic_xor(ptr, v, ty)` |

---

## 7. Engine Intrinsics (Injected WGSL Functions)

These are not Naga built-ins. The translator injects helper function bodies into the `naga::Module` when the AST references them.

| Intrinsic | Signature | Implementation |
|-----------|-----------|----------------|
| `hash_u32` | `fn hash_u32(seed: u32) -> u32` | PCG or xxHash-style bit manipulation |
| `noise_simplex_2d` | `fn noise_simplex_2d(p: vec2<f32>) -> f32` | Simplex noise (Ashima/webgl-noise port) |
| `noise_simplex_3d` | `fn noise_simplex_3d(p: vec3<f32>) -> f32` | 3D simplex noise |

These are added to the module as regular `naga::Function` entries (not entry points). The translator emits `Expression::CallResult` + `Statement::Call` when encountering `CallBuiltin { func: "hash_u32", ... }`.

---

## 8. System_DrawPrep Shader (Hardcoded)

This is a fixed-function shader — no AST translation needed. The translator generates it directly from the `SystemPassSpec` fields.

```wgsl
@group(0) @binding(1) var<storage, read> scalars: array<u32>;
@group(1) @binding(0) var<storage, read_write> indirect: array<u32>;

@compute @workgroup_size(1, 1, 1)
fn draw_prep() {
    // vertexCount: hardcoded from JS payload
    indirect[0u] = ${spec.vertexCount}u;
    // instanceCount: read from activeLanesSymbol
    indirect[1u] = scalars[${symbol_map[spec.activeLanesSymbol].word_offset}u];
    // firstVertex, firstInstance: always 0
    indirect[2u] = 0u;
    indirect[3u] = 0u;
}
```

---

## 9. Translation Architecture

```
PipelineInstallPayload
        │
        ├── manifest ──→ MMU (Phase A–G) ──→ GpuMemoryArena + symbol_map
        │
        └── roster[] ──→ For each pass:
                            │
                            ├── 1. Build ModuleBuilder scaffold
                            │      (bind group declarations from dependencies + sorted slotting)
                            │
                            ├── 2. Walk ast/vertexAst/fragmentAst recursively
                            │      (ExprIR → DSL calls, using symbol_map for patching)
                            │
                            ├── 3. Finish module → naga::Module
                            │
                            ├── 4. naga::back::wgsl::write_string() (for debugging)
                            │      — or —
                            │      device.create_shader_module(ShaderSource::Naga(module))
                            │
                            └── 5. Create GPUComputePipeline / GPURenderPipeline
                                   with the BindGroupLayout from Phase F
```

The translator is a pure function: `(PassSpec, GpuMemoryArena) → naga::Module`. No side effects, no state between passes. Each pass is independently compilable.
