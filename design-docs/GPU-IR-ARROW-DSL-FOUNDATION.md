# GPU-IR: TypeScript Arrow Function DSL for PipelineInstallPayload

## Context

Writing WASM payload tester fixtures requires constructing deeply nested ExprIR/StatementIR JSON trees by hand. `sin(x) * 0.5 + 0.5` becomes 7 nested objects. The spirograph fixture is 270 lines; ~60% is boilerplate. We want a concise authoring DSL that compiles to `PipelineInstallPayload` — fully expressive, bare-metal (GPU model visible), dramatically less text.

## Design: Native TypeScript Arrow Functions → IR via TS Compiler API

Shader bodies are written as **typed TypeScript arrow functions**. At runtime, `fn.toString()` extracts the source, the TypeScript compiler API (`ts.createSourceFile`) parses it into a TS AST, and a custom walker transforms that AST into ExprIR/StatementIR arrays. No Vite plugin, no codegen step, no separate files. Same process, same module.

**Parser choice: TypeScript compiler API** — already a project dependency, handles type annotations on arrow params (`gid: u32, time: f32`), enforces strict typing so agents can't make type mistakes silently.

## Target Syntax: Spirograph

```typescript
import { gpu, compute, drawPrep, render, draw, quad, wg, vertex, fragment } from '@/render/gpu-ir';
import type { u32, f32, Domains } from '@/render/gpu-ir';

const N = 1000, TAU = Math.PI * 2;
const A = 13/18, B = 5/18, FREQ = 13/8, REVS = 8;

export const spirographTrace = gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: N } },
  domains: {
    pts: { capacity: N, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      color_r: 'f32', color_g: 'f32', color_b: 'f32',
    }},
  },
  shapes: { point_quad: quad(0.005) },

  roster: [
    compute('eval', 'pts', wg(64), (gid: u32, time: f32, { pts }: Domains) => {
      const rank: f32  = f32(gid) / N;
      const t: f32     = rank * (TAU * REVS) + time;
      const inner: f32 = FREQ * t;
      const hue: f32   = rank * TAU;
      pts.pos_x[gid]   = (A * cos(t) + B * cos(inner)) * 0.82;
      pts.pos_y[gid]   = (A * sin(t) - B * sin(inner)) * 0.82;
      pts.color_r[gid] = sin(hue) * 0.5 + 0.5;
      pts.color_g[gid] = sin(hue + 2.094) * 0.5 + 0.5;
      pts.color_b[gid] = sin(hue + 4.189) * 0.5 + 0.5;
    }),

    drawPrep('pts', 6),

    render('draw_pts', { clear: [0.02, 0.02, 0.04, 1] }, [
      draw('pts', 'point_quad', { blend: 'alpha' }, {
        vertex: (position: vec2f, iid: u32, { pts }: Domains) => {
          const px: f32 = pts.pos_x[iid];
          const py: f32 = pts.pos_y[iid];
          const cr: f32 = pts.color_r[iid];
          const cg: f32 = pts.color_g[iid];
          const cb: f32 = pts.color_b[iid];
          return vertex(vec4(position.x + px, position.y + py, 0.0, 1.0), {
            color: vec4(cr, cg, cb, 0.85),
          });
        },
        fragment: (color: vec4f) => {
          return fragment({ color });
        },
      }),
    ]),
  ],
});
```

## How It Works

### Step 1: fn.toString() → TS AST

```typescript
function compileShaderBody(fn: Function, context: ShaderContext): StatementIR[] {
  const source = fn.toString();
  const sf = ts.createSourceFile('shader.ts', source, ts.ScriptTarget.Latest);
  return walkArrowBody(sf, context);
}
```

The `context` carries the manifest (so `pts.pos_x` resolves to domain field) and the shader stage (compute/vertex/fragment).

### Step 2: TS AST → ExprIR/StatementIR

The walker maps TypeScript AST nodes to IR nodes:

| TypeScript | IR |
|-----------|-----|
| `const x: f32 = expr` | `Let('x', walkExpr(expr))` |
| `let x: f32 = expr` | `Var('x', 'f32', walkExpr(expr))` |
| `x = expr` | `Assign(VarRef('x'), walkExpr(expr))` |
| `pts.pos_x[gid] = expr` | `StoreField('pts:pos_x', VarRef('gid'), walkExpr(expr))` |
| `a + b` | `BinaryOp('+', walk(a), walk(b))` |
| `sin(x)` | `CallBuiltin('sin', [walk(x)])` |
| `f32(x)` | `Cast('f32', walk(x))` |
| `vec4(a,b,c,d)` | `Construct('vec4<f32>', [walk(a), ...])` |
| `position.xy` | `Swizzle(VarRef('position'), 'xy')` |
| `arr[i]` | `IndexAccess(walk(arr), walk(i))` |
| `if (c) { ... } else { ... }` | `If(walk(c), walkBlock(then), walkBlock(else))` |
| `for (init; c; upd) { ... }` | `For(walk(init), walk(c), walk(upd), walkBlock(body))` |
| `return vertex(pos, { varyings })` | `ReturnVertex(walk(pos), walkVaryings(...))` |
| `return fragment({ outputs })` | `ReturnFragment(walkOutputs(...))` |
| `42` (integer literal) | context-dependent: `LiteralU32` if u32 expected, else `LiteralF32` |
| `42.0` (float literal) | `LiteralF32(42.0)` |
| `true` / `false` | `LiteralBool` |

### Step 3: Scope analysis — shader vars vs JS constants

The walker distinguishes shader-scope from JS-scope:

- **Arrow parameters** (`gid`, `time`, `pts`): shader variables (VarRef or domain proxy)
- **`const`/`let` inside the body**: shader Let/Var bindings
- **Free variables** (`N`, `TAU`, `A`, `FREQ`): JS-side constants → `LiteralF32(N)` where `N` remains a JS expression, evaluated at runtime when the IR object is constructed

This means the generated IR code still references JS constants by name — no constant folding needed. The Vite dev server evaluates them normally.

### Step 4: Domain field resolution

When the walker encounters `pts.pos_x[gid]`:
1. `pts` matches a domain name from the manifest → this is a domain access
2. `pos_x` matches a field in that domain → symbol is `pts:pos_x`
3. In lvalue position (assignment) → `StoreField('pts:pos_x', walk(gid), walk(rhs))`
4. In rvalue position (read) → `LoadField('pts:pos_x', walk(gid))`

Similarly for scalars and globals:
- `sys.time` (matches global) → `LoadGlobal('sys:time')`
- `sys.active` (matches scalar) → `LoadScalar('sys:active')`
- `sys.active = expr` → `StoreScalar('sys:active', walk(expr))`

### Step 5: Auto-dependency inference

After the body is transformed to StatementIR[], walk the tree to collect:
- Any `LoadGlobal` → `requiresGlobals = true`
- Any `LoadField`/`StoreField` → extract domain, track read/write
- Any `TextureLoad`/`TextureSample` → texture read/sampled
- Any `TextureStore` → texture write
- Any `AtomicOpField`/`AtomicLoadField` → domain read_write

Dependencies are never manually declared. Eliminates Pitfall #1.

### Step 6: Auto active count

Domain-dispatched compute passes auto-append:
```
StoreScalar(domain.activeLanesSymbol, LiteralU32(domain.capacity))
```
Skipped if the body already stores to that scalar.

## Type System

Type annotations on arrow params and `const`/`let` bindings serve two purposes:
1. **TypeScript type checking** at author time (IDE support, agent error prevention)
2. **IR type tracking** during AST walk (determines Cast vs Construct, literal types, etc.)

### Ambient type declarations

```typescript
// gpu-ir/types.ts — these are TYPE-ONLY, never used at runtime
type u32 = number & { __brand: 'u32' };
type i32 = number & { __brand: 'i32' };
type f32 = number & { __brand: 'f32' };
type vec2f = { x: f32; y: f32 } & { __brand: 'vec2f' };
type vec3f = { x: f32; y: f32; z: f32 } & { __brand: 'vec3f' };
type vec4f = { x: f32; y: f32; z: f32; w: f32 } & { __brand: 'vec4f' };
type vec2i = { x: i32; y: i32 } & { __brand: 'vec2i' };
type vec2u = { x: u32; y: u32 } & { __brand: 'vec2u' };

// Domain field proxy types (generated from manifest or declared as interface)
type Domains = Record<string, DomainProxy>;
interface DomainProxy {
  [field: string]: { [index: number]: f32 | u32 | i32 };
}
```

### Ambient function declarations (for TypeScript checking only)

```typescript
// gpu-ir/builtins.ts — declared for type checking, never actually called
declare function sin(x: f32): f32;
declare function cos(x: f32): f32;
declare function vec4(x: f32, y: f32, z: f32, w: f32): vec4f;
declare function f32(x: u32 | i32): f32;   // cast
declare function u32(x: f32 | i32): u32;   // cast
declare function vertex(pos: vec4f, varyings: Record<string, vec4f>): void;
declare function fragment(outputs: Record<string, vec4f>): void;
// ... all 41 builtins
```

These never execute — the arrow function bodies are parsed, not run. But TypeScript checks them.

## More Examples

### Texture readwrite

```typescript
export const textureReadwrite = gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: 1 } },
  domains: { quad: { capacity: 1, active: 'sys:active', fields: { _pad: 'f32' } } },
  textures: {
    tex_color: { dim: '2d', size: [64, 64], format: 'rgba8unorm', usage: ['storage', 'sampled'] },
  },
  shapes: { fs: fullscreenQuad() },

  roster: [
    compute('fill_tex', exact(8, 8), wg(8, 8), (gx: u32, gy: u32, time: f32) => {
      const u: f32 = f32(gx) / 64.0;
      const v: f32 = f32(gy) / 64.0;
      const r: f32 = sin(u * 6.28 + time) * 0.5 + 0.5;
      const g: f32 = sin(v * 6.28 + time * 1.3) * 0.5 + 0.5;
      textureStore(tex_color, vec2i(i32(gx), i32(gy)), vec4(r, g, 0.5, 1.0));
    }),
    compute('set_active', exact(1), wg(1), () => {
      sys.active = u32(1);
    }),
    drawPrep('quad', 6),
    render('draw', { clear: [0, 0, 0, 1] }, [
      draw('quad', 'fs', {}, {
        vertex: (position: vec2f) => {
          return vertex(vec4(position.x, position.y, 0.0, 1.0), {
            uv: vec4(position.x * 0.5 + 0.5, 1.0 - (position.y * 0.5 + 0.5), 0.0, 0.0),
          });
        },
        fragment: (uv: vec4f) => {
          const tx: i32 = i32(uv.x * 63.0);
          const ty: i32 = i32(uv.y * 63.0);
          return fragment({ color: textureLoad(tex_color, vec2i(tx, ty)) });
        },
      }),
    ]),
  ],
});
```

### Atomic boids

```typescript
export const atomicBoids = gpu({
  globals: { 'sys:time': 'f32' },
  scalars: { 'sys:active': { u32: N } },
  domains: {
    boids: { capacity: N, active: 'sys:active', fields: {
      pos_x: 'f32', pos_y: 'f32',
      grid_cell: 'atomic<u32>',
      cell_val: 'f32',
    }},
  },
  shapes: { dot: quad(0.003) },

  roster: [
    compute('sim', 'boids', wg(256), (gid: u32, time: f32, { boids }: Domains) => {
      const fi: f32     = f32(gid);
      const angle: f32  = fi * (TAU / N) + time;
      const radius: f32 = 0.3 + sin(fi * 0.01 + time * 2.0) * 0.5;
      boids.pos_x[gid]  = cos(angle) * radius;
      boids.pos_y[gid]  = sin(angle) * radius;
      const cell_value: u32 = gid % u32(16) + u32(1);
      atomicExchange(boids.grid_cell, gid, cell_value);
      boids.cell_val[gid] = f32(cell_value);
    }),
    drawPrep('boids', 6),
    render('draw', { clear: [0.02, 0.02, 0.04, 1] }, [
      draw('boids', 'dot', {}, {
        vertex: (position: vec2f, iid: u32, { boids }: Domains) => {
          const px: f32 = boids.pos_x[iid];
          const py: f32 = boids.pos_y[iid];
          const cell: f32 = boids.cell_val[iid];
          const intensity: f32 = cell / 16.0;
          return vertex(vec4(position.x + px, position.y + py, 0.0, 1.0), {
            color: vec4(intensity, intensity * 0.7, 1.0, 1.0),
          });
        },
        fragment: (color: vec4f) => fragment({ color }),
      }),
    ]),
  ],
});
```

## Arrow Function Parameter Conventions

The arrow params declare what the shader stage receives. The walker uses param names + types + position to determine auto-bindings:

### Compute (domain-dispatched)
```typescript
(gid: u32, time: f32, { pts, boids }: Domains) => { ... }
```
- Param 1: `gid: u32` → `Let('gid', Intrinsic('global_invocation_id.x'))`
- Param 2: `time: f32` → `Let('time', LoadGlobal('sys:time'))`
- Param 3: destructured domains → domain proxies for field access

### Compute (exact-dispatched)
```typescript
(gx: u32, gy: u32, time: f32) => { ... }
```
- `gx` → `Intrinsic('global_invocation_id.x')`
- `gy` → `Intrinsic('global_invocation_id.y')`
- `time` → `LoadGlobal('sys:time')`

### Vertex
```typescript
(position: vec2f, iid: u32, { pts }: Domains) => { ... }
```
- `position` → vertex attribute input
- `iid: u32` → `Intrinsic('instance_index')`
- Destructured domains → domain proxies (read-only)

### Fragment
```typescript
(color: vec4f, uv: vec4f) => { ... }
```
- Each param name matches a varying declared in the vertex shader's `return vertex(..., { color, uv })`

## Manifest Compact Forms (unchanged)

```
{ pos_x: 'f32' }                 → { pos_x: { type: 'f32', clearValue: 0 } }
{ 'sys:time': 'f32' }            → { 'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 } }
{ 'sys:active': { u32: N } }     → { 'sys:active': { type: 'u32', clearValue: N } }
{ capacity: N, active: 'sym' }   → { capacity: N, activeLanesSymbol: 'sym' }
```

## Compilation Pipeline

```
gpu({...})
  ├─ [1] expandManifest(compact) → MemoryManifest
  ├─ [2] For each roster entry with arrow function body:
  │       fn.toString() → ts.createSourceFile() → TS AST
  │       Walk TS AST with manifest context → StatementIR[]
  │       Auto-append StoreScalar(activeCount) for domain compute
  ├─ [3] inferDependencies(stmts, manifest) per pass
  │       Walk IR AST → { requiresGlobals, domains, textures }
  └─ [4] assemble() → PipelineInstallPayload (exact JSON for Rust)
```

## Architectural Groundwork: Compiler Convergence

The DSL and the future block compiler must converge at the IR type boundary to maintain one source of truth. The design enforces this through separation of concerns:

### Two entry points, one IR

```
Hand authoring (DSL):     arrow function → fn.toString() → TS parser → ExprIR/StatementIR
Future compiler (blocks):  block graph → lower + schedule → ExprIR/StatementIR directly
                                              ↓
                               Both produce the same roster entry types
                                              ↓
                                    PipelineInstallPayload → Rust engine
```

### `ir-builders.ts` — shared IR construction primitives

Standalone module used by BOTH the DSL walker AND the future compiler's block lowering:

```typescript
// ir-builders.ts — no dependencies on the DSL or the compiler
import type { ExprIR, StatementIR } from '../boundary-contract';

export const lit   = (v: number): ExprIR => ({ type: 'LiteralF32', value: v });
export const litU  = (v: number): ExprIR => ({ type: 'LiteralU32', value: v });
export const ref   = (name: string): ExprIR => ({ type: 'VarRef', name });
export const binop = (op: string, left: ExprIR, right: ExprIR): ExprIR =>
  ({ type: 'BinaryOp', op, left, right });
export const call  = (func: string, args: ExprIR[]): ExprIR =>
  ({ type: 'CallBuiltin', func, args });
export const cast  = (targetType: string, expr: ExprIR): ExprIR =>
  ({ type: 'Cast', targetType, expr });
export const load  = (symbolId: string, index: ExprIR): ExprIR =>
  ({ type: 'LoadField', symbolId, index });
export const let_  = (name: string, value: ExprIR): StatementIR =>
  ({ type: 'Let', name, value });
export const store = (symbolId: string, index: ExprIR, value: ExprIR): StatementIR =>
  ({ type: 'StoreField', symbolId, index, value });
// ... complete set for all ExprIR/StatementIR variants
```

The DSL walker calls these builders when transforming TS AST nodes. The future compiler calls the same builders when lowering blocks. Same construction logic, no divergence.

### DSL functions are authoring-only

`compute()`, `render()`, `draw()` are **authoring conveniences** — they accept arrow functions and parse them. The future compiler never uses them. Instead, it builds roster entries directly:

```typescript
// Authoring path — uses compute() which parses the arrow fn
compute('eval', 'pts', wg(64), (gid: u32, time: f32, { pts }: Domains) => {
  const rank: f32 = f32(gid) / N;
  pts.pos_x[gid] = cos(rank * TAU) * 0.7;
});

// Compiler path — builds the spec directly using ir-builders
const ast = [
  let_('gid', { type: 'Intrinsic', name: 'global_invocation_id.x' }),
  let_('time', { type: 'LoadGlobal', symbolId: 'sys:time' }),
  let_('rank', binop('/', cast('f32', ref('gid')), lit(N))),
  store('pts:pos_x', ref('gid'), binop('*', call('cos', [binop('*', ref('rank'), lit(TAU))]), lit(0.7))),
];
// Compiler passes ast + manifest to assembleComputePass() directly
```

### Shared utilities

These modules serve both paths:

| Module | Used by DSL | Used by compiler | Purpose |
|--------|-------------|-----------------|---------|
| `ir-builders.ts` | walker calls these | block lowering calls these | Construct IR nodes |
| `deps.ts` | auto-infer deps from AST | same inference after lowering | Walk AST → dependency declarations |
| `manifest.ts` | expand compact manifest | compiler builds manifest from InstanceDomain blocks | Memory layout assembly |
| `shapes.ts` | `quad()`, `fullscreenQuad()` helpers | shape blocks emit same specs | Shape bank construction |

### Block ↔ DSL function equivalence (future)

Expression blocks will be defined as typed functions — the same signature as DSL arrow functions:

```typescript
// Block definition — this IS a DSL function:
const sinBlock = (x: f32): f32 => sin(x);
const ringLayout = (gid: u32, count: f32, time: f32): { x: f32, y: f32 } => {
  const angle: f32 = f32(gid) / count * TAU + time;
  return { x: cos(angle) * 0.7, y: sin(angle) * 0.7 };
};
```

The visual editor composes these functions (wiring outputs to inputs). The compiler walks the graph and composes the IR. Hand authoring writes the composition directly. Both paths produce the same IR through the same builders. Testing the DSL tests the blocks.

---

## Files to Create

```
src/render/gpu-ir/
  index.ts              — Public API: gpu, compute, render, draw, drawPrep, etc.
  types.ts              — Branded types (u32, f32, vec4f, Domains) + builtin declarations
  ir-builders.ts        — Standalone IR construction primitives (shared with future compiler)
  walker.ts             — TS AST → ExprIR/StatementIR via ir-builders (~400 lines)
  manifest.ts           — Compact → full manifest expansion (shared with future compiler)
  deps.ts               — AST walk → dependency inference (shared with future compiler)
  shapes.ts             — quad(), fullscreenQuad(), tri() (shared with future compiler)
  compile.ts            — Orchestrator: expand → parse → walk → infer → assemble
  __tests__/
    walker.test.ts      — TS expression/statement → IR correctness
    ir-builders.test.ts — Builder output matches boundary-contract types
    round-trip.test.ts  — DSL fixtures deep-equal hand-written fixture payloads
```

## Files to Read (not modify)
- `src/render/rust/boundary-contract.ts` — Target IR types (ExprIR, StatementIR, PipelineInstallPayload)
- `src/render/rust/fixtures/*.ts` — Round-trip test oracles

## Verification
1. **Walker unit tests**: every TS expression pattern → correct ExprIR, every statement pattern → correct StatementIR
2. **IR builder tests**: every builder function produces a valid ExprIR/StatementIR node (type-checked against boundary-contract)
3. **Round-trip**: Rewrite each existing fixture in DSL → `deepStrictEqual(dslOutput, handWrittenPayload)` — proves zero information loss
4. **Typecheck**: `npm run typecheck` — ambient type declarations catch mistyped shader code
5. **Visual**: Rewritten fixtures render identically in payload-tester

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `fn.toString()` breaks under minification | Fixtures are dev-only; configure Vite to skip minification for fixture files (or just don't minify in dev) |
| TS compiler API adds ~3MB to bundle | Tree-shake to import only `ts.createSourceFile` + AST types; or accept the cost for dev-only tooling |
| Source maps lost for arrow bodies | Include source text + positions in error messages from the walker |
| Ambient type declarations diverge from IR capabilities | Generate them from boundary-contract.ts types (single source of truth) |
| ir-builders drift from boundary-contract types | Unit tests assert builder output matches type discriminants; forbidden-patterns test prevents direct IR construction outside ir-builders |
