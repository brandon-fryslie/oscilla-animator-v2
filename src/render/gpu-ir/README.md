# GPU-IR: TypeScript DSL for WebGPU Shader Pipelines

## Why GPU-IR Exists

Oscilla's WebGPU renderer runs in a dedicated `DedicatedWorker` backed by Rust/WASM. The JS main thread must send it a **`PipelineInstallPayload`** — a fully self-describing JSON object that declares memory layout, execution roster, and shader ASTs. The Rust engine compiles these ASTs into WGSL shaders and GPU pipelines.

Writing `PipelineInstallPayload` by hand is verbose and error-prone. GPU-IR is a TypeScript DSL that lets you write shader logic as plain arrow functions, then compiles them into the correct IR tree at call time. The result is validated against the Zod schema in `boundary-contract.ts` before crossing the JS→WASM boundary.

```
TypeScript arrow fns ──► acorn parse ──► ExprIR/StatementIR tree ──► PipelineInstallPayload
                          (walker.ts)     (ir-builders.ts)            (compile.ts + deps.ts)
                                                                            │
                                                                            ▼
                                                                     Zod validation
                                                                  (boundary-contract.ts)
                                                                            │
                                                                            ▼
                                                                   Rust WASM renderer
```

## Architecture

### File Map

| File | Role |
|------|------|
| `compile.ts` | **Orchestrator.** Public API: `gpu()`, `compute()`, `render()`, `draw()`, `drawPrep()`. Transforms compact DSL specs into `PipelineInstallPayload`. |
| `walker.ts` | **Parser.** Parses `fn.toString()` via acorn, walks ESTree AST, emits `ExprIR`/`StatementIR` arrays. |
| `ir-builders.ts` | **Constructors.** One builder function per IR variant. Single authority for node construction. |
| `ir-node-rules.ts` | **Tables.** Single source of truth for IR structure (recursion rules), DSL symbol mappings, operator tables, and the generic `walkIR` traversal. |
| `deps.ts` | **Dependency inference.** Walks IR to determine which globals, domains, and textures a shader reads/writes. |
| `manifest.ts` | **Manifest expansion.** Converts compact shorthand manifests into the full `MemoryManifest` shape. |
| `shapes.ts` | **Geometry helpers.** `quad()`, `fullscreenQuad()`, `tri()` produce `StaticGeometrySpec`. |
| `types.ts` | **Ambient type declarations.** Branded scalar/vector types and ambient `declare function` stubs for the DSL. |
| `index.ts` | **Public barrel.** Re-exports the user-facing API. |

### Dependency Graph

```
index.ts
  └── compile.ts
        ├── walker.ts ──────── ir-node-rules.ts
        │     └── ir-builders.ts
        ├── deps.ts ────────── ir-node-rules.ts
        ├── manifest.ts
        └── ir-builders.ts

boundary-contract.ts (../rust/)
  └── ir-node-rules.ts (imports types only)
```

All type definitions (`ExprIR`, `StatementIR`, `BinaryOp`, etc.) are owned by `boundary-contract.ts`. GPU-IR modules import types from there — never the reverse.

## The IR: ExprIR and StatementIR

The IR is a discriminated union of typed AST nodes. It maps closely to WGSL semantics but uses JavaScript-friendly names. The Rust renderer translates this IR into actual WGSL shader source.

### ExprIR (20 variants)

| Variant | Fields | Description |
|---------|--------|-------------|
| `LiteralF32` | `value: number` | 32-bit float constant |
| `LiteralU32` | `value: number` | 32-bit unsigned int constant |
| `LiteralI32` | `value: number` | 32-bit signed int constant |
| `LiteralBool` | `value: boolean` | Boolean constant |
| `VarRef` | `name: string` | Local variable reference |
| `Intrinsic` | `name: string` | GPU built-in (`global_invocation_id.x`, `vertex_index`, `instance_index`) |
| `LoadGlobal` | `symbolId` | Read a uniform global (`sys:time`) |
| `LoadScalar` | `symbolId` | Read an arena scalar (`sys:tri_active`) |
| `LoadField` | `symbolId`, `index: ExprIR` | Read a domain field at index (`tri:color_r[i]`) |
| `AtomicLoadField` | `symbolId`, `index: ExprIR` | Atomic read from a domain field |
| `AtomicLoadScalar` | `symbolId` | Atomic read from an arena scalar |
| `TextureLoad` | `textureId`, `coords: ExprIR` | Texel fetch by integer coords |
| `TextureSample` | `textureId`, `samplerId`, `uv: ExprIR` | Sample texture with sampler |
| `BinaryOp` | `op`, `left`, `right` | Binary operation (`+`, `-`, `*`, `/`, `%`, comparisons, logical, bitwise) |
| `UnaryOp` | `op`, `expr` | Unary prefix (`-`, `!`, `~`) |
| `CallBuiltin` | `func`, `args` | Call a WGSL builtin math function (36 supported) |
| `Cast` | `targetType`, `expr` | Type cast (`f32(x)`, `u32(x)`, `i32(x)`) |
| `Construct` | `dataType`, `args` | Vector/matrix constructor (`vec4(a,b,c,d)`) |
| `Swizzle` | `source`, `mask: string` | Component swizzle (`position.xy`) |
| `IndexAccess` | `target`, `index` | Array/vector index (`arr[i]`) |

### StatementIR (14 variants)

| Variant | Fields | Description |
|---------|--------|-------------|
| `Let` | `name`, `value` | Immutable binding (`const x = ...`) |
| `Var` | `name`, `dataType?`, `value?` | Mutable binding (`let x = ...`) |
| `Assign` | `target`, `value` | Assignment to mutable var (`x = ...`) |
| `StoreScalar` | `symbolId`, `value` | Write to arena scalar |
| `StoreField` | `symbolId`, `index`, `value` | Write to domain field at index |
| `TextureStore` | `textureId`, `coords`, `value` | Write to storage texture |
| `If` | `condition`, `accept`, `reject` | Conditional branch |
| `For` | `init`, `condition`, `update`, `body` | For loop |
| `Break` | — | Break out of loop |
| `Continue` | — | Continue to next iteration |
| `AtomicOpField` | `op`, `symbolId`, `index`, `value` | Atomic RMW on domain field |
| `AtomicOpScalar` | `op`, `symbolId`, `value` | Atomic RMW on arena scalar |
| `ReturnVertex` | `position`, `varyings` | Vertex shader output |
| `ReturnFragment` | `outputs` | Fragment shader output |

## The DSL

Shader bodies are written as TypeScript arrow functions. The walker parses `fn.toString()` at runtime — the functions are never executed. This means:

1. **Type annotations are stripped by esbuild** before runtime — the walker (acorn) only sees JavaScript.
2. **Well-known `$`-prefixed globals** are resolved by the walker, not by JavaScript name lookup.
3. **Ambient declarations** (in `types.ts`) provide TypeScript type checking during authoring without affecting runtime.

### Example: Hello Triangle

```typescript
import { gpu, compute, render, draw, drawPrep, exact, wg } from './gpu-ir';
import { tri } from './gpu-ir';

const payload = gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:tri_active': { u32: 1 } },
  domains: {
    tri: { capacity: 1, active: 'sys:tri_active', fields: {
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { unit_triangle: tri([0, 0.5, -0.5, -0.5, 0.5, -0.5]) },

  roster: [
    // Compute pass: evaluate color per frame
    compute('eval_color', exact(1), wg(1), () => {
      const time = $global.time;
      $domains.tri.color_r[0] = sin(time) * 0.5 + 0.5;
      $domains.tri.color_g[0] = sin(time + 2.094) * 0.5 + 0.5;
      $domains.tri.color_b[0] = sin(time + 4.189) * 0.5 + 0.5;
      $domains.tri.$active = u32(1);
    }),

    // System pass: set active vertex count
    drawPrep('prep_tri', 'sys:tri_active', 3),

    // Render pass: draw the triangle
    render('draw', { clear: [0, 0, 0, 1] }, [
      draw('tri_fill', 'tri', 'unit_triangle', {}, {
        vertex: (position) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {});
        },
        fragment: () => {
          const r = $domains.tri.color_r[0];
          const g = $domains.tri.color_g[0];
          const b = $domains.tri.color_b[0];
          return fragment({ color: vec4(r, g, b, 1.0) });
        },
      }),
    ]),
  ],
});
```

### Well-Known `$`-Prefixed Objects

| DSL Syntax | IR Node | Resolved Symbol |
|------------|---------|-----------------|
| `$global.time` | `LoadGlobal` | `sys:time` |
| `$scalar.X` | `LoadScalar` / `StoreScalar` | `sys:X` |
| `$domains.D.F[i]` | `LoadField` / `StoreField` | `D:F` |
| `$domains.D.$active` | `LoadScalar` / `StoreScalar` | domain's `activeLanesSymbol` |
| `$thread.x` | `Intrinsic` | `global_invocation_id.x` |
| `$thread.y` | `Intrinsic` | `global_invocation_id.y` |
| `$thread.z` | `Intrinsic` | `global_invocation_id.z` |
| `$instance.index` | `Intrinsic` | `instance_index` |
| `$vertex.index` | `Intrinsic` | `vertex_index` |

### Builtin Functions (36)

All WGSL math builtins are available as bare function calls:

- **Trig:** `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`
- **Exponential:** `exp`, `log`, `pow`, `sqrt`
- **Arithmetic:** `abs`, `min`, `max`, `clamp`, `mix`, `step`, `smoothstep`, `sign`, `fract`, `ceil`, `floor`, `round`
- **Geometric:** `length`, `distance`, `dot`, `cross`, `normalize`, `reflect`, `refract`
- **Derivative (fragment only):** `fwidth`, `dpdx`, `dpdy`
- **Custom:** `hash_u32`, `noise_simplex_2d`, `noise_simplex_3d`

### Type Casts and Constructors

```typescript
f32(x)              // Cast to f32
u32(x)              // Cast to u32 (literal args optimize to LiteralU32)
i32(x)              // Cast to i32

vec2(x, y)          // vec2<f32>
vec3(x, y, z)       // vec3<f32>
vec4(x, y, z, w)    // vec4<f32>
vec2i(x, y)         // vec2<i32>
vec2u(x, y)         // vec2<u32>
// ... and vec3i, vec3u, vec4i, vec4u
```

### Operator Mapping

JavaScript operators map to WGSL operators. Two cases require translation:

| JavaScript | WGSL (IR) |
|-----------|-----------|
| `===` | `==` |
| `!==` | `!=` |

All other operators (`+`, `-`, `*`, `/`, `%`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `&`, `|`, `^`, `<<`, `>>`) pass through unchanged.

## ir-node-rules.ts: The Rule Tables

This file is the single source of truth for how IR trees are structured. It serves four consumers:

1. **`boundary-contract.ts`** — validation walker (checks symbol references against manifest)
2. **`deps.ts`** — dependency collection (infers domain/texture access patterns)
3. **`walker.ts`** — forward compiler (DSL symbol lookup tables)
4. **Future reverse translator** — will read the same tables to decompile IR back to DSL

### Four Table Groups

**Group A — IR Node Structure:**
`EXPR_RULES` and `STMT_RULES` are exhaustive `Record<T['type'], Rule>` tables. For each IR variant, they declare:
- `refs` — which fields reference manifest symbols and what kind of symbol
- `children` — fields containing a single child `ExprIR`
- `childArrays` — fields containing an `ExprIR[]`
- `stmtChildren` / `stmtChildArrays` — same for `StatementIR`
- `exprRecords` — fields containing `Record<string, ExprIR>` (varyings, outputs)

Adding a new IR variant without a table entry is a **compile error** (enforced by the `Record` type).

**Group B — DSL Symbol Mappings:**
`BUILTIN_NAMES`, `CAST_NAMES`, `CONSTRUCT_MAP` (forward), `CONSTRUCT_INVERSE` (reverse).

**Group C — $-Chain Resolution:**
`DOLLAR_CHAIN_RULES` maps `$global`, `$scalar`, `$thread`, `$instance`, `$vertex` to their IR resolution functions. `WELL_KNOWN_ROOTS` lists all known `$`-prefixed names.

**Group D — Operator Mappings:**
`ESTREE_TO_BINOP` (forward: JS→IR), `BINOP_TO_JS` (reverse: IR→JS), `BINOP_PRECEDENCE` (for parenthesization in reverse translation).

### walkIR: Generic Table-Driven Traversal

```typescript
walkIR(stmts: StatementIR[], visitor: IRVisitor, basePath?: (string|number)[]): void
```

Pre-order traversal driven entirely by rule tables — zero `switch`/`case`. The visitor receives each node plus its rule and path. Used by `boundary-contract.ts` for validation and `deps.ts` for dependency collection.

`walkIR` is for **observe + accumulate** patterns. The future reverse translator needs a **fold** pattern (children return strings, parent composes) and will be its own recursive function reading the same tables.

## The Compilation Pipeline

### `gpu()` Call Flow

```
gpu(spec)
  │
  ├─ expandManifest(spec)        → MemoryManifest (manifest.ts)
  │
  └─ for each roster entry:
       │
       ├─ compute entry:
       │    ├─ compileShaderBody(bodyFn, ctx)    → WalkerResult (walker.ts)
       │    ├─ unwrapWalkerResult()              → StatementIR[] (or throw)
       │    ├─ auto-append activeLanes store     (if domain-dispatched)
       │    └─ inferComputeDeps(ast, manifest)   → ComputeDeps (deps.ts)
       │
       ├─ render entry:
       │    └─ for each draw call:
       │         ├─ compileShaderBody(vertexFn)  → StatementIR[]
       │         ├─ compileShaderBody(fragmentFn)→ StatementIR[]
       │         └─ inferDrawCallDeps(v, f, m)   → DrawCallDeps
       │
       └─ system entry (drawPrep):
            └─ pass through unchanged
```

### Walker (walker.ts)

The walker parses arrow function source via `acorn.parse(fn.toString())` and walks the ESTree AST to produce `StatementIR[]`. Key behaviors:

- **Diagnostic accumulation:** On error, pushes a `WalkerDiagnostic` and returns a `B.litF32(NaN)` sentinel so the walk continues finding more errors.
- **Cast optimization:** `u32(5)` becomes `LiteralU32(5)`, not `Cast('u32', LiteralF32(5))`.
- **Negative literal optimization:** `-1.5` becomes `LiteralF32(-1.5)`, not `UnaryOp('-', LiteralF32(1.5))`.
- **Index context:** Bare numeric literals in `[idx]` positions become `LiteralU32`, not `LiteralF32`.

### Dependency Inference (deps.ts)

Walks the IR tree via `walkIR` to determine resource access:
- **Compute:** tracks domains as `read` or `read_write`, textures as `read`, `write`, or `read_write`
- **Draw calls:** forces all domain access to `read` and all texture access to `sampled`

The Rust engine uses these declarations to generate correct binding group layouts and insert barriers.

## Memory Manifest

The manifest declares all GPU memory resources. The DSL accepts a compact shorthand that `manifest.ts` expands:

```typescript
// Compact (DSL input)
{ globals: { 'sys:time': 'f32' } }

// Expanded (MemoryManifest output)
{ globals: { 'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 } } }
```

### Resource Types

| Resource | Description | Symbol Pattern |
|----------|-------------|----------------|
| **Globals** | Uniform values (time, camera matrices) | `sys:name` |
| **Arena Scalars** | Per-frame read/write scalars (active lane counts) | `sys:name` |
| **Domains** | Instance arrays with named fields | domain fields: `domainId:fieldName` |
| **Textures** | 2D textures for read/write/sample | texture ID string |
| **Shape Bank** | Static vertex geometry | shape ID string |
| **Samplers** | Texture sampling configuration | sampler ID string |

## Validation (boundary-contract.ts)

The `PipelineInstallPayload` is validated by a Zod `.superRefine()` hook before crossing the WASM boundary. Validation uses `walkIR` with a visitor that:

1. Checks all `symbolId`/`textureId`/`samplerId` references exist in the manifest
2. Verifies builtin function argument counts
3. Enforces fragment-only builtins (`dpdx`, `dpdy`, `fwidth`) only appear in fragment shaders
4. Reports domain/shape/texture cross-reference errors in roster entries

Validation errors include full JSON paths for precise error localization.

## Testing

Tests live in `__tests__/`:

| File | Coverage |
|------|----------|
| `walker.test.ts` | 42 unit tests: every DSL pattern (literals, $-chains, operators, calls, control flow, assignments, returns, destructuring, error diagnostics) |
| `gate0-hello-triangle.test.ts` | End-to-end: DSL-authored hello-triangle matches hand-written fixture |

Run tests:
```bash
npx vitest run src/render/gpu-ir/__tests__/
```

## Design Decisions

### Why Arrow Functions as Shader Source?

Shader bodies are TypeScript arrow functions that are **parsed, not executed**. This gives us:
- Full IDE support (autocomplete, type checking via ambient declarations)
- Source is available at runtime via `fn.toString()`
- esbuild strips type annotations, leaving clean JavaScript for acorn to parse

### Why Acorn Instead of TypeScript Compiler API?

The previous walker used `ts.createSourceFile()` + TS AST traversal, pulling in the full TypeScript compiler (~3MB) at runtime. Since esbuild strips type annotations before bundling, we only need a JavaScript parser. Acorn is ~80KB and parses ES2022, which is all we need.

### Why Bidirectional Tables?

Every DSL↔IR mapping in `ir-node-rules.ts` has both a forward and inverse direction. The forward direction is used by the walker (DSL→IR). The inverse will be used by a future reverse translator (IR→DSL) that decompiles IR trees back into readable TypeScript for debugging and display. Both read the same tables — one source of truth, two directions.

### Why walkIR Instead of Switch/Case?

The `EXPR_RULES`/`STMT_RULES` tables encode the full recursion structure of the IR. The `walkIR` function traverses any IR tree using only these tables — no switch statements. This means:
- Adding a new IR variant requires one table entry, not updating every walker
- The table is exhaustive (compile error if an entry is missing)
- Validation, dependency inference, and future analyses all share the same traversal logic
