# GPU-IR Node Reference

Canonical reference for all `ExprIR` and `StatementIR` variants, their fields, WGSL equivalents, and how the DSL maps to them.

Type definitions are owned by `src/render/rust/boundary-contract.ts`. Builders are in `ir-builders.ts`.

## ExprIR Variants

### Literals

| Variant | Builder | DSL Source | WGSL Output |
|---------|---------|------------|-------------|
| `LiteralF32 { value }` | `B.litF32(3.14)` | `3.14` | `3.14` |
| `LiteralU32 { value }` | `B.litU32(5)` | `u32(5)` or `arr[5]` | `5u` |
| `LiteralI32 { value }` | `B.litI32(-1)` | `i32(-1)` | `-1i` |
| `LiteralBool { value }` | `B.litBool(true)` | `true` | `true` |

**Optimization:** `u32(5)` with a literal argument compiles to `LiteralU32(5)`, not `Cast('u32', LiteralF32(5))`. Similarly, bare numeric literals in index positions (`arr[0]`) become `LiteralU32`.

### Variable References

| Variant | Builder | DSL Source | WGSL Output |
|---------|---------|------------|-------------|
| `VarRef { name }` | `B.ref('x')` | `x` (local binding) | `x` |
| `Intrinsic { name }` | `B.intrinsic(...)` | `$thread.x`, `$instance.index`, `$vertex.index` | `global_invocation_id.x`, etc. |

**Intrinsic names** (closed enum): `global_invocation_id.x`, `global_invocation_id.y`, `global_invocation_id.z`, `vertex_index`, `instance_index`.

### Memory Access

| Variant | Builder | DSL Source | WGSL Concept |
|---------|---------|------------|--------------|
| `LoadGlobal { symbolId }` | `B.loadGlobal('sys:time')` | `$global.time` | Uniform buffer read |
| `LoadScalar { symbolId }` | `B.loadScalar('sys:active')` | `$scalar.active` | Arena scalar read |
| `LoadField { symbolId, index }` | `B.loadField('tri:x', idx)` | `$domains.tri.x[i]` | Storage buffer indexed read |
| `AtomicLoadField { symbolId, index }` | `B.atomicLoadField(...)` | (programmatic only) | `atomicLoad(&field[i])` |
| `AtomicLoadScalar { symbolId }` | `B.atomicLoadScalar(...)` | (programmatic only) | `atomicLoad(&scalar)` |

**Symbol ID conventions:**
- Globals and scalars: `sys:name`
- Domain fields: `domainId:fieldName`

### Texture Operations

| Variant | Builder | DSL Source | WGSL Concept |
|---------|---------|------------|--------------|
| `TextureSample { textureId, samplerId, uv }` | `B.textureSample(...)` | (programmatic) | `textureSample(tex, samp, uv)` |
| `TextureLoad { textureId, coords }` | `B.textureLoad(...)` | (programmatic) | `textureLoad(tex, coords, 0)` |

### Arithmetic and Logic

| Variant | Builder | Fields | WGSL |
|---------|---------|--------|------|
| `BinaryOp` | `B.binop(op, left, right)` | `op`: one of 17 ops | `left op right` |
| `UnaryOp` | `B.unaryOp(op, expr)` | `op`: `-`, `!`, `~` | `op expr` |
| `CallBuiltin` | `B.callBuiltin(func, args)` | `func`: one of 36 builtins | `func(args...)` |

**Binary operators (17):** `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `&`, `|`, `^`, `<<`, `>>`

### Type Operations

| Variant | Builder | DSL Source | WGSL Output |
|---------|---------|------------|-------------|
| `Cast { targetType, expr }` | `B.cast('u32', expr)` | `u32(x)` (non-literal) | `u32(expr)` |
| `Construct { dataType, args }` | `B.construct('vec4<f32>', args)` | `vec4(a, b, c, d)` | `vec4<f32>(a, b, c, d)` |
| `Swizzle { source, mask }` | `B.swizzle(expr, 'xy')` | `pos.xy` | `pos.xy` |
| `IndexAccess { target, index }` | `B.indexAccess(expr, idx)` | `arr[i]` | `arr[i]` |

**Supported WGSL types:** `f32`, `i32`, `u32`, `bool`, `vec2<f32>`, `vec2<i32>`, `vec2<u32>`, `vec3<f32>`, `vec3<i32>`, `vec3<u32>`, `vec4<f32>`, `vec4<i32>`, `vec4<u32>`, `mat3x3<f32>`, `mat4x4<f32>`

---

## StatementIR Variants

### Declarations

| Variant | Builder | DSL Source | WGSL Output |
|---------|---------|------------|-------------|
| `Let { name, value }` | `B.let_('x', expr)` | `const x = expr` | `let x = expr;` |
| `Var { name, dataType?, value? }` | `B.var_('x', type?, expr?)` | `let x = expr` | `var x: type = expr;` |

**Note:** `const` in JS maps to `let` in WGSL (immutable binding). `let` in JS maps to `var` in WGSL (mutable binding).

### Assignments and Stores

| Variant | Builder | DSL Source | WGSL Concept |
|---------|---------|------------|--------------|
| `Assign { target, value }` | `B.assign(ref, expr)` | `x = expr` | `x = expr;` |
| `StoreScalar { symbolId, value }` | `B.storeScalar(id, expr)` | `$scalar.X = expr` | Arena scalar write |
| `StoreField { symbolId, index, value }` | `B.storeField(id, idx, expr)` | `$domains.D.F[i] = expr` | Storage buffer indexed write |
| `TextureStore { textureId, coords, value }` | `B.textureStore_(id, coords, expr)` | (programmatic) | `textureStore(tex, coords, val)` |

### Atomic Operations

| Variant | Builder | Fields | WGSL Concept |
|---------|---------|--------|--------------|
| `AtomicOpField` | `B.atomicOpField(op, id, idx, val)` | `op`: Add, Sub, Max, Min, And, Or, Xor, Exchange | `atomicOp(&field[i], val)` |
| `AtomicOpScalar` | `B.atomicOpScalar(op, id, val)` | same ops | `atomicOp(&scalar, val)` |

Both accept an optional `assignResultTo` field to capture the previous value.

### Control Flow

| Variant | Builder | DSL Source | WGSL Output |
|---------|---------|------------|-------------|
| `If { condition, accept, reject }` | `B.if_(cond, then, else)` | `if (...) { } else { }` | `if (cond) { ... } else { ... }` |
| `For { init, condition, update, body }` | `B.for_(init, cond, upd, body)` | `for (let i = 0; i < N; i++)` | `for (var i = 0; i < N; i = i + 1)` |
| `Break` | `B.break_()` | `break` | `break;` |
| `Continue` | `B.continue_()` | `continue` | `continue;` |

**For loop update:** `i++` in the DSL compiles to `Assign(ref('i'), BinaryOp('+', ref('i'), LiteralU32(1)))`.

### Shader Returns

| Variant | Builder | DSL Source | Purpose |
|---------|---------|------------|---------|
| `ReturnVertex { position, varyings }` | `B.returnVertex(pos, {...})` | `return vertex(pos, { uv })` | Vertex shader output: clip-space position + interpolated varyings |
| `ReturnFragment { outputs }` | `B.returnFragment({...})` | `return fragment({ color: ... })` | Fragment shader output: named color attachments |

**Varyings** support both explicit and shorthand syntax:
```typescript
// Explicit
return vertex(pos, { uv: vec2(0, 0) });

// Shorthand (value is the identifier itself)
const uv = vec2(0, 0);
return vertex(pos, { uv });
```

---

## IR Node Rule Tables

Every variant has an entry in `EXPR_RULES` or `STMT_RULES` (in `ir-node-rules.ts`). These tables define:

- **Which fields are manifest references** (and what kind: global, scalar, field, texture, sampler)
- **Which fields are child expressions** (single or array)
- **Which fields are child statements** (single or array)
- **Which fields are expression records** (e.g., `varyings`, `outputs`)

This is the data that drives `walkIR` traversal and `boundary-contract.ts` validation. The tables are exhaustive — a missing entry is a TypeScript compile error.
