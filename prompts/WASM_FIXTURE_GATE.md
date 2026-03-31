# WASM Payload Tester: Fixture Development Guide

You are implementing a new fixture for the WASM Payload Tester — a standalone web app (`/payload-tester.html`) that tests the Rust/WebGPU renderer by sending JSON payloads across the JS→WASM boundary and verifying pixels appear on a canvas.

**Your job is entirely on the JS/TypeScript side.** You are writing a JSON payload (typed as `PipelineInstallPayload`) that describes GPU memory, compute shaders, and render passes using a symbolic AST. The Rust renderer deserializes this JSON, allocates GPU memory, translates the AST to WGSL shaders via naga, compiles WebGPU pipelines, and executes them.

**You do NOT modify any Rust code.** You do NOT modify the engine, translator, MMU, or DSL. You write a `.ts` fixture file that exports a `PipelineInstallPayload` object, register it in the fixture index, and verify it renders.

---

## The Process (Overview)

1. **Decide what capability to test** — Pick one specific renderer feature (new IR variant, memory layout, shader pattern)
2. **Design the manifest** — Declare GPU memory: globals, scalars, domains (with fields), textures, shapes
3. **Write the compute pass AST** — ExprIR/StatementIR tree that runs on GPU threads
4. **Write the draw prep pass** — System pass that fills the indirect draw buffer
5. **Write the render pass AST** — Vertex shader (position + varyings) and fragment shader (color output)
6. **Register the fixture** — Import in `index.ts`, add to `PAYLOAD_FIXTURES` array
7. **Build and verify** — `npm run build:rust-renderer && npm run dev`, click fixture in UI, check canvas

---

## Essential Context: What You're Working With

### File Locations

| File | Role | You Modify? |
|------|------|------------|
| `src/render/rust/fixtures/*.ts` | Fixture payloads | **YES — create new file here** |
| `src/render/rust/fixtures/index.ts` | Fixture registry | **YES — import + register** |
| `src/render/rust/boundary-contract.ts` | TypeScript types for all IR | READ ONLY (type reference) |
| `src/render/wasm/rust/oscilla-rust-renderer/src/translator.rs` | AST → naga translation | DO NOT MODIFY |
| `src/render/wasm/rust/oscilla-rust-renderer/src/mmu.rs` | GPU memory allocation | DO NOT MODIFY |
| `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` | Pipeline install + execution | DO NOT MODIFY |
| `src/render/wasm/rust/oscilla-rust-renderer/src/dsl.rs` | Naga IR builder DSL | DO NOT MODIFY |
| `src/payload-tester/PayloadTesterApp.tsx` | UI (auto-submits on fixture click) | DO NOT MODIFY |

### Versions

- **naga**: 29.0.1
- **wgpu**: 29.0.1
- **Rust target**: `wasm32-unknown-unknown` (WebAssembly)
- **Build command**: `npm run build:rust-renderer`

### How It Works End-to-End

```
Your fixture (.ts)
    → JSON.stringify → postMessage to Worker
    → Rust: serde_json::from_str<PipelineInstallPayload>
    → MMU: allocate GPU buffers from manifest
    → Translator: for each roster entry, walk AST → naga::Module
    → wgpu: compile naga module → GPU pipeline
    → Engine: execute roster each frame (compute → draw_prep → render)
    → Canvas: pixels appear
```

---

## Step 1: Design the Manifest

The manifest declares all GPU memory your fixture needs. Every symbol referenced by your AST must be declared here.

```typescript
const myFixture: PipelineInstallPayload = {
  manifest: {
    preserveStateOnRecompile: false,  // true = hot-swap (Gate 12, not yet implemented)

    // CPU-written values the GPU reads each frame
    globals: {
      'sys:time': { type: 'f32', isDynamic: true, defaultValue: 0 },
      // Engine auto-writes sys:time = frame_count / 60.0 each tick
    },

    // GPU-writable singular values (counters, flags)
    arenaScalars: {
      'sys:active': { type: 'u32', clearValue: INSTANCE_COUNT },
      // Used by System_DrawPrep to read instance count
    },

    // Per-instance data arrays (SoA layout on GPU)
    domains: {
      my_domain: {
        capacity: INSTANCE_COUNT,            // Max instances to allocate
        activeLanesSymbol: 'sys:active',     // Scalar that holds live instance count
        fields: {
          pos_x:    { type: 'f32', clearValue: 0 },
          pos_y:    { type: 'f32', clearValue: 0 },
          color_r:  { type: 'f32', clearValue: 1 },
          // Atomic fields go to a SEPARATE physical buffer (bifurcation):
          counter:  { type: 'atomic<u32>', clearValue: 0 },
        },
      },
    },

    // GPU textures (for compute read/write or fragment sampling)
    textures: {
      // tex_name: { dimension: '2d', width: 64, height: 64, format: 'rgba8unorm', usage: ['storage', 'sampled'] }
    },

    // Static vertex/index data for shapes
    shapeBank: {
      unit_quad: {
        topology: 'triangle-list',
        vertexLayout: {
          stride: 8,  // bytes per vertex (2 × f32 = 8)
          attributes: {
            position: { format: 'float32x2', shaderLocation: 0 },
          },
        },
        vertexData: [  // Flat array of floats
          -0.05, -0.05,  0.05, -0.05,  0.05, 0.05,  // Triangle 1
          -0.05, -0.05,  0.05,  0.05, -0.05, 0.05,  // Triangle 2
        ],
      },
    },

    dataStreams: {},  // Reserved for JS-pushed per-frame arrays (Gate 10)
    samplers: {},     // For texture sampling (use with TextureSample)
  },
  roster: [ /* ... passes ... */ ],
};
```

### Manifest Rules

- **`sys:time`**: If you declare it as a global, the engine auto-writes elapsed time (seconds) each frame. Your compute pass reads it via `LoadGlobal`.
- **`activeLanesSymbol`**: Every domain needs one. Your compute pass writes the active count to this scalar. `System_DrawPrep` reads it to fill the indirect buffer's `instanceCount`.
- **Field types**: `f32`, `u32`, `i32` go to standard buffer. `atomic<u32>`, `atomic<i32>` go to a separate atomic buffer (bifurcation — see Pitfall #3).
- **Texture usage**: If a compute pass writes and a render pass reads, declare `usage: ['storage', 'sampled']`.
- **vertexCount**: Derived from shape data — `vertexData.length * 4 / stride`. For a quad with stride 8 and 12 floats: `12 * 4 / 8 = 6` vertices.

---

## Step 2: Write the Compute Pass

The compute pass runs on GPU threads in parallel. Each thread processes one instance.

```typescript
{
  type: 'Compute',
  passId: 'my_compute',
  sourceBlockIds: [],  // Reserved, always []
  workgroupSize: [64, 1, 1],  // Threads per workgroup
  dispatch: { mode: 'Domain', domainId: 'my_domain' },
  // Domain mode: dispatches ceil(capacity / workgroupSize[0]) workgroups
  // Exact mode: { mode: 'Exact', x: 8, y: 8, z: 1 }

  dependencies: {
    requiresGlobals: true,           // Set true if AST uses LoadGlobal
    domains: { my_domain: 'read_write' },  // Which domains this pass touches
    textures: {},                    // { tex_name: 'write' | 'read' | 'read_write' }
  },

  ast: [
    // Get this thread's index
    { type: 'Let', name: 'gid', value: { type: 'Intrinsic', name: 'global_invocation_id.x' } },
    // Read time
    { type: 'Let', name: 'time', value: { type: 'LoadGlobal', symbolId: 'sys:time' } },
    // Compute position
    { type: 'Let', name: 'angle', value: {
      type: 'BinaryOp', op: '+',
      left: { type: 'BinaryOp', op: '*',
        left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
        right: { type: 'LiteralF32', value: 0.1 },
      },
      right: { type: 'VarRef', name: 'time' },
    }},
    // Write to domain field at this thread's index
    { type: 'StoreField', symbolId: 'my_domain:pos_x',
      index: { type: 'VarRef', name: 'gid' },
      value: { type: 'CallBuiltin', func: 'cos', args: [{ type: 'VarRef', name: 'angle' }] },
    },
    // Always write active count
    { type: 'StoreScalar', symbolId: 'sys:active', value: { type: 'LiteralU32', value: INSTANCE_COUNT } },
  ],
}
```

### Compute Pass Rules

- **`global_invocation_id.x`**: Your thread index (0 to capacity-1). Always use this to index domain fields.
- **`Cast`**: Use `{ type: 'Cast', targetType: 'f32', expr: ... }` to convert u32 thread index to f32 for math.
- **`StoreField` index**: Must be the thread's `gid` — each thread writes its own lane.
- **`StoreScalar`**: Write active count so `System_DrawPrep` knows how many instances to draw.
- **`dependencies`**: Must accurately declare which domains/textures the AST reads/writes. But see Pitfall #1 — only declare resources you actually USE in the AST.

---

## Step 3: Add the DrawPrep Pass

This is always the same pattern. It reads the active lane count and writes the indirect draw buffer.

```typescript
{
  type: 'System_DrawPrep',
  passId: 'my_prep',
  sourceBlockIds: [],
  activeLanesSymbol: 'sys:active',  // Must match the scalar your compute writes
  vertexCount: 6,                    // Vertices per instance (from your shape)
}
```

The Rust engine generates a hardcoded compute shader that writes `[vertexCount, instanceCount, 0, 0]` to the indirect buffer.

---

## Step 4: Write the Render Pass

The render pass has a vertex shader and a fragment shader, specified as AST arrays.

```typescript
{
  type: 'Render',
  passId: 'my_render',
  sourceBlockIds: [],
  targets: {
    colors: [{ textureId: 'canvas', loadOp: 'clear', clearColor: [0, 0, 0, 1] }],
  },
  drawCalls: [{
    intentId: 'my_draw',
    source: {
      type: 'Domain',
      domainId: 'my_domain',
      sourceKind: 'Topology',
      shapeId: 'unit_quad',  // Must match a shapeBank key
    },
    pipelineState: {
      blendMode: 'opaque',
      cullMode: 'none',
      depthWrite: false,
      depthCompare: 'always',
    },
    dependencies: {
      requiresGlobals: false,
      domains: { my_domain: 'read' },
      textures: {},
    },
    vertexAst: [ /* ... */ ],
    fragmentAst: [ /* ... */ ],
  }],
}
```

### Vertex Shader AST

The vertex shader runs once per vertex per instance. It receives:
- `position` (vec2<f32>) — from the shape bank's vertex data
- `instance_index` (u32) — which instance this vertex belongs to
- `vertex_index` (u32) — which vertex within the shape

```typescript
vertexAst: [
  // Get instance index for per-instance data
  { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
  // Read per-instance position from domain
  { type: 'Let', name: 'px', value: { type: 'LoadField', symbolId: 'my_domain:pos_x', index: { type: 'VarRef', name: 'iid' } } },
  { type: 'Let', name: 'py', value: { type: 'LoadField', symbolId: 'my_domain:pos_y', index: { type: 'VarRef', name: 'iid' } } },
  // Read per-instance color for varying
  { type: 'Let', name: 'cr', value: { type: 'LoadField', symbolId: 'my_domain:color_r', index: { type: 'VarRef', name: 'iid' } } },
  {
    type: 'ReturnVertex',
    position: {
      type: 'Construct', dataType: 'vec4<f32>', args: [
        // Offset shape position by instance position
        { type: 'BinaryOp', op: '+',
          left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'x' },
          right: { type: 'VarRef', name: 'px' },
        },
        { type: 'BinaryOp', op: '+',
          left: { type: 'Swizzle', source: { type: 'VarRef', name: 'position' }, mask: 'y' },
          right: { type: 'VarRef', name: 'py' },
        },
        { type: 'LiteralF32', value: 0.0 },  // z
        { type: 'LiteralF32', value: 1.0 },  // w
      ],
    },
    // Pass per-instance data to fragment via varying
    varyings: {
      color: {
        type: 'Construct', dataType: 'vec4<f32>', args: [
          { type: 'VarRef', name: 'cr' },
          { type: 'LiteralF32', value: 0.5 },
          { type: 'LiteralF32', value: 1.0 },
          { type: 'LiteralF32', value: 1.0 },
        ],
      },
    },
  },
],
```

### Fragment Shader AST

The fragment shader runs once per pixel. It receives varyings (GPU-interpolated) by name.

```typescript
fragmentAst: [
  // 'color' is available because the vertex shader declared it in varyings
  {
    type: 'ReturnFragment',
    outputs: {
      color: { type: 'VarRef', name: 'color' },  // The interpolated varying
    },
  },
],
```

---

## Step 5: Register the Fixture

**Create file**: `src/render/rust/fixtures/my-fixture.ts`

```typescript
import type { PipelineInstallPayload } from '../boundary-contract';
export const myFixture: PipelineInstallPayload = { /* ... */ };
```

**Update registry**: `src/render/rust/fixtures/index.ts`

```typescript
import { myFixture } from './my-fixture';

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [
  // ... existing fixtures ...
  {
    id: 'my-fixture',
    name: 'My Test',  // Appears as button text in UI
    description: 'What this fixture tests.',
    payload: myFixture,
  },
];
```

---

## Step 6: Build and Verify

```bash
# Only needed if you changed Rust code (you shouldn't have):
npm run build:rust-renderer

# Start dev server:
npm run dev

# Open in browser:
# http://localhost:5784/payload-tester.html

# Click your fixture button — it auto-submits
# Status bar should show "Installed N pass(es) and started frame publication"
# Canvas should show your rendering

# Automated gate check (tests first fixture only):
APP_PORT=5784 node scripts/check-payload-tester-visible.mjs
```

---

## Pitfalls: Hard Constraints That WILL Bite You

### Pitfall 1: Unused Bindings Cause GPU Crashes

**The rule**: Only declare `domains`, `textures`, and `samplers` in `dependencies` if your AST actually uses them.

**Why**: The Rust translator declares GPU buffer bindings from your dependencies. naga (the shader validator) strips any binding the shader doesn't actually reference. Then the engine tries to create a bind group with entries for all declared dependencies — but the pipeline's auto-layout only has the bindings naga kept. Mismatch → GPU validation error → "Invalid CommandBuffer".

**Example of what breaks**:
```typescript
// BAD: declares domain in dependencies but AST never reads from it
dependencies: { requiresGlobals: false, domains: { my_domain: 'read' }, textures: {} },
fragmentAst: [
  // Returns a literal color — never reads from my_domain
  { type: 'ReturnFragment', outputs: { color: { type: 'LiteralF32', ... } } },
],
```

**Fix**: Remove unused domains/textures from dependencies, OR add AST code that actually reads from them.

The same applies to `requiresGlobals: true` — if your AST never uses `LoadGlobal`, don't set it.

### Pitfall 2: Fragment Shaders Cannot Access instance_index

**The rule**: `instance_index` is a vertex-stage-only builtin. To get per-instance data into the fragment shader, pass it as a **varying** from the vertex shader.

**What breaks**:
```typescript
// BAD: Fragment tries to read domain at instance_index
fragmentAst: [
  { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },  // CRASHES
  { type: 'Let', name: 'r', value: { type: 'LoadField', symbolId: 'domain:color_r', index: { type: 'VarRef', name: 'iid' } } },
]
```

**Fix**: Read in vertex, pass as varying:
```typescript
// GOOD: Vertex reads and passes via varying
vertexAst: [
  { type: 'Let', name: 'iid', value: { type: 'Intrinsic', name: 'instance_index' } },
  { type: 'Let', name: 'cr', value: { type: 'LoadField', symbolId: 'domain:color_r', index: { type: 'VarRef', name: 'iid' } } },
  { type: 'ReturnVertex', position: ..., varyings: {
    color: { type: 'Construct', dataType: 'vec4<f32>', args: [{ type: 'VarRef', name: 'cr' }, ...] },
  }},
],
fragmentAst: [
  { type: 'ReturnFragment', outputs: { color: { type: 'VarRef', name: 'color' } } },
]
```

### Pitfall 3: Atomic Fields Must Be in Separate Buffer

**The rule**: If a domain has BOTH `f32` fields AND `atomic<u32>` fields, the MMU automatically splits them into two physical GPU buffers. This is invisible to your fixture — just declare the fields and the Rust side handles it.

**BUT**: The vertex/fragment shader cannot use `AtomicLoadField`. WebGPU vertex/fragment stages don't support `read_write` storage, which atomics require even for reads.

**Pattern**: Compute writes atomic + copies to standard field. Render reads the standard copy.

```typescript
fields: {
  counter: { type: 'atomic<u32>', clearValue: 0 },  // Atomic (compute-only access)
  counter_copy: { type: 'f32', clearValue: 0 },      // Standard copy for rendering
},

// Compute AST:
{ type: 'AtomicOpField', op: 'Exchange', symbolId: 'domain:counter', index: gid, value: new_val },
{ type: 'StoreField', symbolId: 'domain:counter_copy', index: gid,
  value: { type: 'Cast', targetType: 'f32', expr: new_val } },

// Vertex AST (reads the copy, NOT the atomic):
{ type: 'LoadField', symbolId: 'domain:counter_copy', index: iid }
```

### Pitfall 4: All Varyings Are vec4<f32>

**The rule**: The translator currently types all varyings as `vec4<f32>`. If you need a scalar varying, pack it into a vec4 and extract the `.x` component in the fragment shader.

```typescript
// Vertex: pack scalar into vec4
varyings: {
  brightness: { type: 'Construct', dataType: 'vec4<f32>', args: [
    { type: 'VarRef', name: 'b' },     // Your scalar value
    { type: 'LiteralF32', value: 0 },   // Padding
    { type: 'LiteralF32', value: 0 },
    { type: 'LiteralF32', value: 0 },
  ]},
},

// Fragment: extract scalar
{ type: 'Let', name: 'b', value: { type: 'Swizzle', source: { type: 'VarRef', name: 'brightness' }, mask: 'x' } },
```

### Pitfall 5: Texture Read Requires Both Usage Flags

If a texture is written by compute (`'storage'`) and read by a render pass (`TextureLoad` or `TextureSample`), you must declare BOTH usages:

```typescript
usage: ['storage', 'sampled'],  // NOT just ['storage']
```

### Pitfall 6: TextureStore Coordinates Are vec2<i32>

Texture store/load coordinates must be integer vectors, not float:

```typescript
// Compute: write to texture
{ type: 'TextureStore', textureId: 'my_tex',
  coords: { type: 'Construct', dataType: 'vec2<i32>', args: [
    { type: 'Cast', targetType: 'i32', expr: { type: 'VarRef', name: 'gx' } },
    { type: 'Cast', targetType: 'i32', expr: { type: 'VarRef', name: 'gy' } },
  ]},
  value: { type: 'Construct', dataType: 'vec4<f32>', args: [r, g, b, { type: 'LiteralF32', value: 1.0 }] },
}
```

---

## Complete ExprIR Reference

Every expression type the translator currently handles:

| ExprIR type | Usage | Example |
|-------------|-------|---------|
| `LiteralF32` | Float constant | `{ type: 'LiteralF32', value: 3.14 }` |
| `LiteralU32` | Unsigned int constant | `{ type: 'LiteralU32', value: 42 }` |
| `LiteralI32` | Signed int constant | `{ type: 'LiteralI32', value: -1 }` |
| `LiteralBool` | Boolean constant | `{ type: 'LiteralBool', value: true }` |
| `Construct` | Build vector/composite | `{ type: 'Construct', dataType: 'vec4<f32>', args: [...] }` |
| `Cast` | Type conversion | `{ type: 'Cast', targetType: 'f32', expr: ... }` |
| `Swizzle` | Component access | `{ type: 'Swizzle', source: expr, mask: 'x' }` or `'xy'`, `'rgb'` |
| `IndexAccess` | Array indexing | `{ type: 'IndexAccess', target: expr, index: expr }` |
| `Intrinsic` | Hardware builtins | `'global_invocation_id.x'`, `'instance_index'`, `'vertex_index'` |
| `LoadGlobal` | Read CPU-written global | `{ type: 'LoadGlobal', symbolId: 'sys:time' }` |
| `LoadScalar` | Read GPU scalar | `{ type: 'LoadScalar', symbolId: 'sys:active' }` |
| `LoadField` | Read domain field | `{ type: 'LoadField', symbolId: 'domain:field', index: expr }` |
| `TextureSample` | Sample texture with sampler | `{ textureId, samplerId, uv: expr }` |
| `TextureLoad` | Texel fetch (integer coords) | `{ textureId, coords: expr }` |
| `AtomicLoadField` | Read atomic field (compute only) | `{ symbolId, index: expr }` |
| `AtomicLoadScalar` | Read atomic scalar | `{ symbolId }` |
| `BinaryOp` | Arithmetic/comparison/logic | `op: '+' '-' '*' '/' '%' '==' '!=' '<' '>' '<=' '>=' '&&' '||' '&' '|' '^' '<<' '>>'` |
| `UnaryOp` | Negation/not | `op: '-' '!' '~'` |
| `CallBuiltin` | Math functions | `func: 'sin' 'cos' 'tan' 'abs' 'min' 'max' 'clamp' 'pow' 'sqrt' 'floor' 'ceil' 'round' 'fract' 'sign' 'exp' 'log' 'atan2' 'asin' 'acos' 'atan' 'step' 'smoothstep' 'mix' 'length' 'distance' 'dot' 'cross' 'normalize' 'reflect' 'refract' 'dpdx' 'dpdy' 'fwidth'` |
| `VarRef` | Read variable | `{ type: 'VarRef', name: 'my_var' }` |

## Complete StatementIR Reference

| StatementIR type | Usage | Notes |
|------------------|-------|-------|
| `Let` | Immutable binding | `{ name, value: ExprIR }` |
| `Var` | Mutable variable | `{ name, dataType?: WgslType, value?: ExprIR }` |
| `Assign` | Write to mutable var | `{ target: VarRef, value: ExprIR }` |
| `StoreScalar` | Write to arena scalar | `{ symbolId, value: ExprIR }` |
| `StoreField` | Write to domain field | `{ symbolId, index: ExprIR, value: ExprIR }` |
| `TextureStore` | Write to storage texture | `{ textureId, coords: ExprIR, value: ExprIR }` |
| `If` | Conditional | `{ condition, accept: [], reject: [] }` |
| `For` | Loop | `{ init: Statement, condition: ExprIR, update: Statement, body: [] }` |
| `Break` | Exit loop | `{ type: 'Break' }` |
| `Continue` | Next iteration | `{ type: 'Continue' }` |
| `AtomicOpField` | Atomic mutation (compute only) | `{ op: 'Add'\|'Sub'\|'Max'\|'Min'\|'And'\|'Or'\|'Xor'\|'Exchange', symbolId, index, value, assignResultTo? }` |
| `AtomicOpScalar` | Atomic scalar mutation | Same pattern as AtomicOpField |
| `ReturnVertex` | Vertex shader output | `{ position: ExprIR, varyings: Record<string, ExprIR> }` |
| `ReturnFragment` | Fragment shader output | `{ outputs: { color: ExprIR } }` |

---

## Supported WgslType Values

For `Construct`, `Cast`, `Var.dataType`:

`'f32'`, `'i32'`, `'u32'`, `'bool'`, `'vec2<f32>'`, `'vec2<i32>'`, `'vec2<u32>'`, `'vec3<f32>'`, `'vec3<i32>'`, `'vec3<u32>'`, `'vec4<f32>'`, `'vec4<i32>'`, `'vec4<u32>'`

---

## Existing Fixtures (Study These)

| File | Name | Gate | What It Proves |
|------|------|------|---------------|
| `hello-triangle.ts` | Visible Triangle | 0 | Basic pipeline: compute → draw_prep → render |
| `instanced-write.ts` | Instanced Ring | 1 | global_invocation_id, Cast, Domain dispatch, 64 instances, varyings |
| `for-loop-gradient.ts` | Loop Gradient | 2 | Var, Assign, For loop, mutable accumulator, brightness varying |
| `hash-color.ts` | Hash Colors | 3 | Bitwise XOR/shift/AND, PCG hash, per-instance color via varying |
| `varying-gradient.ts` | Gradient Triangle | 5 | Per-vertex color varying, GPU interpolation |
| `texture-readwrite.ts` | Texture Pattern | 6+7 | TextureStore in compute, TextureLoad in fragment, fullscreen quad |
| `sdf-circle.ts` | SDF Circle | 8 | dpdx/dpdy/fwidth derivatives, smoothstep anti-aliasing |
| `atomic-boids.ts` | Atomic Boids | 9 | atomic<u32> field, MMU bifurcation, 10K instances, AtomicOpField |

**Start by reading `instanced-write.ts`** — it's the canonical pattern for any instanced fixture.

---

## Common Patterns

### Ring Layout (N instances in a circle)
```typescript
{ type: 'Let', name: 'angle', value: {
  type: 'BinaryOp', op: '+',
  left: { type: 'BinaryOp', op: '*',
    left: { type: 'Cast', targetType: 'f32', expr: { type: 'VarRef', name: 'gid' } },
    right: { type: 'LiteralF32', value: TAU / N },
  },
  right: { type: 'VarRef', name: 'time' },  // Rotate over time
}},
{ type: 'StoreField', symbolId: 'domain:pos_x', index: gid,
  value: { type: 'BinaryOp', op: '*',
    left: { type: 'CallBuiltin', func: 'cos', args: [angle] },
    right: { type: 'LiteralF32', value: 0.7 },  // Radius
  },
},
```

### Fullscreen Quad (for texture display or SDF)
```typescript
shapeBank: {
  fullscreen: {
    topology: 'triangle-list',
    vertexLayout: { stride: 8, attributes: { position: { format: 'float32x2', shaderLocation: 0 } } },
    vertexData: [-1,-1, 1,-1, 1,1, -1,-1, 1,1, -1,1],  // Covers entire NDC
  },
},
// Vertex: map position from [-1,1] to UV [0,1]
varyings: {
  uv: { type: 'Construct', dataType: 'vec4<f32>', args: [
    { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: pos_x, right: lit(0.5) }, right: lit(0.5) },
    { type: 'BinaryOp', op: '-', left: lit(1.0), right: { type: 'BinaryOp', op: '+', left: { type: 'BinaryOp', op: '*', left: pos_y, right: lit(0.5) }, right: lit(0.5) } },
    lit(0), lit(0),
  ]},
},
```

### sin(time) Color Animation
```typescript
// R = sin(time) * 0.5 + 0.5
{ type: 'BinaryOp', op: '+',
  left: { type: 'BinaryOp', op: '*',
    left: { type: 'CallBuiltin', func: 'sin', args: [{ type: 'VarRef', name: 'time' }] },
    right: { type: 'LiteralF32', value: 0.5 },
  },
  right: { type: 'LiteralF32', value: 0.5 },
}
// G = sin(time + 2.094) * 0.5 + 0.5  (120° phase shift)
// B = sin(time + 4.189) * 0.5 + 0.5  (240° phase shift)
```

---

## What NOT to Do

- **Do NOT modify any Rust files** — the translator, MMU, engine, and DSL are off-limits
- **Do NOT modify `PayloadTesterApp.tsx`** — the UI auto-submits when you click a fixture
- **Do NOT use `AtomicLoadField` in vertex or fragment shaders** — WebGPU doesn't support it
- **Do NOT declare dependencies your AST doesn't use** — causes bind group mismatch crashes
- **Do NOT use `requiresGlobals: true` if your AST doesn't call `LoadGlobal`** — same crash
- **Do NOT read domain fields at hardcoded index 0 in the fragment shader** — use varyings for per-instance data
- **Do NOT assume `instance_index` exists in fragment shaders** — it doesn't; pass data via varyings
