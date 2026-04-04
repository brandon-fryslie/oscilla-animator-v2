# C1 Block Migration Reference

## Your Mission

You are migrating blocks from the **V1 backend** to the **C1 backend**. The V1 backend compiles user graphs into JS opcodes executed by a JS runtime. The C1 backend compiles them into `PipelineInstallPayload` JSON sent to a Rust/WASM WebGPU renderer. Your job is to write C1 block definitions that lower user graph nodes into GPU-IR expressions.

## Where You Work

```
src/blocks-v2/           ← YOU WORK HERE. New C1 block definitions.
src/compiler/backend-v2/ ← C1 compilation pipeline (usually don't modify).
src/render/gpu-ir/ir-builders.ts  ← IR constructors you import.
src/compiler-tester/     ← Standalone test app for validating C1 output.
```

## Where You Do NOT Work

```
src/blocks/              ← V1 blocks. LEGACY. Never modify, never extend.
src/compiler/backend/    ← V1 backend. LEGACY. Never import from here.
src/runtime/             ← V1 JS runtime. LEGACY. Never import from here.
src/compiler/ir/program.ts ← V1 program IR. Never import.
```

**If you find yourself importing from any of those paths, stop. You're in the wrong codebase.**

## How V1 Blocks Look (DO NOT COPY THIS PATTERN)

```typescript
// ❌ V1 pattern — opcode-based, JS runtime
import { OpCode } from '../../compiler/ir/types';
import { registerBinaryMathBlock } from './register-binary-math-block';

registerBinaryMathBlock({
  type: 'Multiply',
  opcode: OpCode.Mul,          // ← opcodes don't exist in C1
  cardinalityVarName: '...',   // ← cardinality is a frontend concept
  unitBehavior: 'requireUnitless',
});
```

## How C1 Blocks Look (THIS IS THE PATTERN)

```typescript
// ✅ C1 pattern — GPU-IR expressions, WebGPU renderer
import { registerC1Block } from './index';
import { binop, litF32 } from '../render/gpu-ir/ir-builders';

registerC1Block('Multiply', {
  lower: (ctx) => ({
    kind: 'proxy',
    outputs: {
      out: binop('*', ctx.inputsById.a ?? litF32(0), ctx.inputsById.b ?? litF32(1)),
    },
  }),
});
```

---

## The C1 Pipeline (5 Phases)

Your block participates in **Phase 2** (manifest) and **Phase 4** (lowering). The pipeline handles everything else.

```
NormalizedPatch (from shared frontend)
    ↓
Phase 1: Topo Sort       ── Kahn's algorithm, sources first
    ↓
Phase 2: Harvest          ── Each block declares GPU resources (manifest)
    ↓
Phase 3: Sink Discovery   ── Find blocks with isSink: true
    ↓
Phase 4: Lowering & Fusion ── Backward walk from sinks, recursive lowering
    ↓
Phase 5: Roster Assembly   ── Sort passes by precedence → PipelineInstallPayload
```

**Entry points:**
- `compileC1(frontendResult)` — from full frontend pipeline
- `compileC1FromNormalized(patch, portTypes?)` — direct (used by compiler tester)

Both in `src/compiler/backend-v2/index.ts`.

---

## Block Definition API

### Registration

```typescript
// src/blocks-v2/index.ts
function registerC1Block(type: string, def: BlockDefC1): void
```

Each block file calls `registerC1Block()` at module load time (side-effect import). Register it in `src/blocks-v2/all.ts`:

```typescript
import './my-block';  // Side-effect only
```

### BlockDefC1 Interface

```typescript
interface BlockDefC1 {
  readonly isSink?: boolean;
  readonly manifestRequirements?: (ctx: ManifestContext) => ManifestContribution;
  readonly lower: (ctx: C1LoweringContext) => C1LoweredBlock;
}
```

### What lower() Receives

```typescript
interface C1LoweringContext {
  readonly blockId: string;
  readonly blockType: string;
  readonly config: Readonly<Record<string, unknown>>;  // Block params from user
  readonly portTypes: ReadonlyMap<PortKey, CanonicalType>;
  readonly blockIndex: number;
  readonly inputsById: Readonly<Record<string, ExprIR | null>>;  // Upstream expressions
  readonly manifest: MemoryManifest;
}
```

`inputsById` contains the **already-lowered** upstream expressions. If a port is unwired, its value is `null`. The pipeline resolves these by walking backward through edges — you never traverse the graph yourself.

### What lower() Returns

**Math blocks** (the common case) return `proxy`:
```typescript
{ kind: 'proxy', outputs: Record<string, ExprIR> }
```
Your outputs become available as `inputsById` for downstream blocks. The pipeline fuses these into the sink's shader AST automatically.

**Sink blocks** return `sink`:
```typescript
{ kind: 'sink', injectedPasses: readonly RosterEntry[], preamble?: readonly StatementIR[] }
```
Sink blocks produce compute/render passes directly. See `RenderInstances2D` for the full pattern.

---

## IR Builder Reference

Import from `src/render/gpu-ir/ir-builders.ts`. These construct `ExprIR` and `StatementIR` nodes.

### Literals
```typescript
litF32(1.5)              // f32 constant
litU32(64)               // u32 constant
litI32(-1)               // i32 constant
litBool(true)            // bool constant
```

### Math
```typescript
binop('+', a, b)         // Binary: + - * / % == != < > <= >= && || & | ^ << >>
unaryOp('-', x)          // Unary: ! - ~
callBuiltin('sin', [x])  // Builtins: sin cos tan sqrt pow abs min max dot normalize clamp mix
```

### Memory Access
```typescript
loadGlobal('sys:time')              // Read uniform buffer
loadScalar('dots:active')           // Read persistent scalar
loadField('dots:pos_x', indexExpr)  // Read domain field at instance index
storeField('dots:pos_x', idx, val)  // Write domain field (StatementIR)
```

### Types & Construction
```typescript
cast('f32', expr)                                  // Type cast
construct('vec4<f32>', [x, y, z, w])               // Vector/matrix construction
swizzle(vec, 'xy')                                 // Component swizzle
intrinsic('global_invocation_id.x')                // GPU thread index (compute)
intrinsic('instance_index')                        // Instance ID (vertex shader)
```

### Variables & Control Flow
```typescript
ref('myVar')                                       // Reference a variable
let_('myVar', expr)                                // Immutable binding (StatementIR)
var_('myVar', 'f32', expr)                         // Mutable variable (StatementIR)
assign(ref('myVar'), newValue)                     // Assignment (StatementIR)
```

### Shader Output
```typescript
returnVertex(position, { color: colorExpr })       // Vertex shader output
returnFragment({ color: ref('color') })            // Fragment shader output
```

---

## Currently Migrated Blocks

| Block | File | Kind | What It Does |
|-------|------|------|-------------|
| `InfiniteTimeRoot` | `time.ts` | proxy | Declares `sys:time` global, outputs `loadGlobal('sys:time')` |
| `Const` | `const.ts` | proxy | Outputs `litF32(config.value)` |
| `Sin` | `sin.ts` | proxy | `callBuiltin('sin', [input])` |
| `Cos` | `cos.ts` | proxy | `callBuiltin('cos', [input])` |
| `Multiply` | `multiply.ts` | proxy | `binop('*', a, b)` |
| `Add` | `add.ts` | proxy | `binop('+', a, b)` |
| `Subtract` | `subtract.ts` | proxy | `binop('-', a, b)` |
| `Divide` | `divide.ts` | proxy | `binop('/', a, b)` |
| `InstanceIndex` | `instance-index.ts` | proxy | `cast('f32', intrinsic('global_invocation_id.x'))` |
| `RenderInstances2D` | `render-instances-2d.ts` | **sink** | 3 passes: compute (field writes) + drawPrep + render |

---

## How to Migrate a Block: Step by Step

### 1. Identify the V1 block
Look in `src/blocks/<category>/` to understand what the block does. Read its `defineBlock()` call to see port names, types, and behavior. **Do not modify the V1 file.**

### 2. Create the C1 block
Create `src/blocks-v2/<block-name>.ts`. Import only from:
- `./index` (for `registerC1Block`)
- `../render/gpu-ir/ir-builders` (for IR constructors)
- `../compiler/backend-v2/types` (for type annotations, if needed)
- `../render/rust/boundary-contract` (for pass spec types, if sink)

### 3. Implement lower()
- **Math blocks:** Map V1 opcode to IR builder call. Port names in `ctx.inputsById` match the V1 block's input port names.
- **Unwired defaults:** Always provide a fallback for null inputs: `ctx.inputsById.x ?? litF32(0)`.
- **Config values:** Access via `ctx.config.value` (cast as needed, blocks store config as `Record<string, unknown>`).

### 4. Register in all.ts
Add `import './my-block';` to `src/blocks-v2/all.ts`.

### 5. Write a test
Add to `src/compiler/backend-v2/__tests__/`. Pattern:

```typescript
import { compileC1FromNormalized } from '../index';
import { PipelineInstallPayloadSchema } from '../../../render/rust/boundary-contract';

it('compiles MyBlock', () => {
  const patch = makeTestPatch();  // Build NormalizedPatch with your block
  const result = compileC1FromNormalized(patch);
  expect(result.kind).toBe('ok');
  if (result.kind !== 'ok') return;
  expect(PipelineInstallPayloadSchema.safeParse(result.payload).success).toBe(true);
});
```

### 6. Add to a compiler-tester fixture (if visual)
If the block changes rendering output, add it to a fixture in `src/compiler-tester/fixtures/` and validate:
```bash
./scripts/get-screenshot-of-compiler-tester.sh
```

---

## Sink Block Pattern (Advanced)

Sink blocks are render endpoints. They declare GPU resources in `manifestRequirements()` and produce roster entries in `lower()`. Study `src/blocks-v2/render-instances-2d.ts` — it's the canonical example.

### manifestRequirements()

Called during Phase 2. Returns GPU resource declarations:

```typescript
manifestRequirements: (ctx): ManifestContribution => ({
  globals: {
    'sys:camera': { type: 'mat4x4', isDynamic: false, defaultValue: [/*identity*/] },
  },
  arenaScalars: {
    'dots:active': { type: 'u32', clearValue: 64 },
  },
  domains: {
    dots: { capacity: 64, activeLanesSymbol: 'dots:active', fields: {
      pos_x: { type: 'f32', clearValue: 0 },
      pos_y: { type: 'f32', clearValue: 0 },
    }},
  },
  shapes: {
    dots_quad: { topology: 'triangle-list', vertexLayout: {...}, vertexData: [...] },
  },
}),
```

Manifest declarations are **idempotent** — if two blocks declare the same global with the same spec, that's fine. Conflicting specs throw an error.

### lower() for Sinks

Returns `{ kind: 'sink', injectedPasses: [...] }` with concrete pass specs. A typical 2D render sink emits:

1. **Compute pass** — writes upstream math expressions into domain fields
2. **System_DrawPrep** — sets up indirect draw args
3. **Render pass** — vertex shader reads fields, fragment shader outputs color

### Symbol Naming

- Globals: `sys:time`, `sys:camera`
- Arena scalars: `{domainId}:active`
- Domain fields: `{domainId}:{fieldName}` (e.g., `dots:pos_x`)
- Shapes: `{domainId}_{shapeName}` (e.g., `dots_quad`)
- Pass IDs: `{domainId}_eval`, `{domainId}_prep`, `{domainId}_draw`

---

## Multi-Fanout Caching

When a block's output feeds multiple downstream blocks, the `PassScopeManager` automatically caches it as a `let` variable to avoid redundant GPU computation. You don't need to do anything — this is handled by the lowering pipeline.

Trivial expressions (`VarRef`, `LiteralF32`, etc.) are always inlined, never cached.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/blocks-v2/index.ts` | `registerC1Block()`, `getC1Block()` |
| `src/blocks-v2/all.ts` | Side-effect imports (add your block here) |
| `src/blocks-v2/*.ts` | Individual block definitions |
| `src/compiler/backend-v2/index.ts` | `compileC1()`, `compileC1FromNormalized()` |
| `src/compiler/backend-v2/types.ts` | `BlockDefC1`, `C1LoweringContext`, `C1LoweredBlock` |
| `src/compiler/backend-v2/lowering.ts` | Phase 4 — backward walk, expression fusion |
| `src/compiler/backend-v2/harvester.ts` | Phase 2 — manifest collection |
| `src/compiler/backend-v2/pass-scope-manager.ts` | Multi-fanout let-variable caching |
| `src/render/gpu-ir/ir-builders.ts` | All ExprIR/StatementIR constructors |
| `src/render/rust/boundary-contract.ts` | Canonical type definitions (ExprIR, StatementIR, pass specs) |
| `src/compiler-tester/fixtures/*.ts` | Test fixtures for visual validation |

## Design Docs

| Document | Location |
|----------|----------|
| 4-Pillar Architecture | `design-docs/B0-4-Pillar-Arch-UBER.md` |
| Reference Implementations | `design-docs/B0-4-Pillar-Reference-Implementations.md` |
| Block Library Master Plan | `design-docs/B1-BLOCK-LIBRARY-MASTER-PLAN.md` |
| Demo Patch Tiers (validation targets) | `design-docs/DEMO-PATCHES.md` |
| WASM Boundary Spec | `design-docs/WASM-Boundary-Spec.md` |
