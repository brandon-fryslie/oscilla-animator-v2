# WebGPU Coverage Remediation — Agent Briefing

You are implementing tickets from the `oscilla-pillars-cleanup-vm4` audit. This document is your authoritative context. Read it fully before starting any ticket.

## What This Work Is

An audit of the Oscilla Rust/WebGPU renderer found 26 places where the IR (PipelineInstallPayload, ExprIR, StatementIR) or the Rust engine **cannot represent valid WebGPU configurations**. The IR contracts (Zod on TS side, serde on Rust side) are sometimes already wide enough, but the Rust consumer code collapses the representations to scalars. Other times the contract itself is too narrow.

The audit document is at `design-docs/renderer-webgpu-coverage-audit.md`. Each ticket references a finding number from that document. **Read the specific finding before starting the ticket.**

---

## Architecture — The Four Layers

Every change in this work crosses some subset of these four layers, always top-to-bottom:

```
Layer 1: TS Contract    boundary-contract.ts     Zod schemas + TS types
Layer 2: Rust Contract  contract.rs              serde Deserialize structs/enums
Layer 3: MMU            mmu.rs                   GPU memory allocation from manifest
Layer 4: Translator     translator.rs            AST → naga::Module code generation
Layer 5: Engine         engine.rs                Pipeline install + per-frame execution
```

**The invariant**: TS types (Zod) are the single source of truth. Rust types mirror them via serde. The TS side validates with Zod (`PipelineInstallPayloadSchema.superRefine`); the Rust side deserializes with serde. They must match exactly.

### File Locations (absolute paths within repo)

| Purpose | Path |
|---------|------|
| **TS Boundary Contract** | `src/render/rust/boundary-contract.ts` |
| **Rust Contract** | `src/render/wasm/rust/oscilla-rust-renderer/src/contract.rs` |
| **Rust Engine** | `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` |
| **Rust Translator** | `src/render/wasm/rust/oscilla-rust-renderer/src/translator.rs` |
| **Rust MMU** | `src/render/wasm/rust/oscilla-rust-renderer/src/mmu.rs` |
| **Rust Naga DSL** | `src/render/wasm/rust/oscilla-rust-renderer/src/dsl.rs` |
| **IR Builders (TS)** | `src/render/gpu-ir/ir-builders.ts` |
| **DSL Compiler (TS)** | `src/render/gpu-ir/compile.ts` |
| **DSL Walker (TS)** | `src/render/gpu-ir/walker.ts` |
| **IR Node Rules** | `src/render/gpu-ir/ir-node-rules.ts` |
| **Fixtures (TS)** | `src/render/rust/fixtures/*.ts` |
| **Fixture Index** | `src/render/rust/fixtures/index.ts` |
| **Existing Tests** | `src/render/gpu-ir/__tests__/*.test.ts` |

---

## The Contract Mirror Pattern

This is the single most important pattern in this codebase. Every contract type exists in two places that must stay in sync:

### TS Side (Zod — authoritative)
```typescript
// boundary-contract.ts
export const DepthCompareSchema = z.enum(['less', 'always', 'equal', 'greater']);
```

### Rust Side (serde — must mirror)
```rust
// contract.rs
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DepthCompare {
    Less,
    Always,
    Equal,
    Greater,
}
```

### Engine Mapper (total match — must be exhaustive)
```rust
// engine.rs
fn depth_compare_for(mode: DepthCompare) -> wgpu::CompareFunction {
    match mode {
        DepthCompare::Less => wgpu::CompareFunction::Less,
        DepthCompare::Always => wgpu::CompareFunction::Always,
        DepthCompare::Equal => wgpu::CompareFunction::Equal,
        DepthCompare::Greater => wgpu::CompareFunction::Greater,
    }
}
```

**When you add a variant/field**, you touch all three locations. The Rust compiler enforces exhaustive match — adding a variant to the enum without handling it in the mapper is a compile error. This is by design.

### Naming Conventions
- **TS**: `camelCase` for fields, `kebab-case` for string enum values
- **Rust**: `snake_case` for fields via `#[serde(rename_all = "camelCase")]`, enum variants have explicit `#[serde(rename = "...")]`
- Example: TS `depthCompare: 'less-equal'` → Rust `DepthCompare::LessEqual` with `#[serde(rename_all = "kebab-case")]` or explicit `#[serde(rename = "less-equal")]`

**Watch the serde rename strategy.** Different enums use different strategies:
- `DepthCompare`: `snake_case` → values are `less`, `always`, etc.
- `StencilCompare`: `kebab-case` → values are `less-equal`, `not-equal`, etc.
- `StencilOp`: `kebab-case` → values are `increment-clamp`, etc.
- `BlendMode`: `snake_case` → values are `opaque`, `alpha`, etc.

When adding variants, match the existing strategy for that enum.

---

## Engine Architecture — Install vs Execute

`engine.rs` has two critical arms:

### Install Arm (`install_pipeline`)
Called once when a new payload arrives. For each `RosterEntry`:
1. Translates AST → naga module (via `translator.rs`)
2. Creates shader module from naga
3. Creates wgpu pipeline (compute or render)
4. Creates bind groups
5. Stores into `CompiledPass` enum variant

The `CompiledPass` enum is the **compiled representation** — it stores pre-resolved wgpu handles. This is where scalars get baked:

```rust
enum CompiledPass {
    Compute { pipeline, group0, group1, dispatch },
    DrawPrep { pipeline, bind_group },
    Render {
        pipeline: wgpu::RenderPipeline,
        bind_group: Option<wgpu::BindGroup>,
        vertex_buffer_id: String,
        draw_mode: RenderDrawMode,
        color_load_op: ColorLoadOp,      // ← SCALAR — finding #1
        color_target_id: String,          // ← SCALAR — finding #1
        depth_stencil: Option<CompiledDepthStencilAttachment>,
        viewport: [f32; 6],
        scissor_rect: [u32; 4],
    },
}
```

### Execute Arm (`execute_roster`)
Called every frame. Iterates `compiled_roster.passes` and issues GPU commands. No allocation allowed here (`StrictAllocator` guard). Only reads pre-resolved data.

**Key insight for MRT work:** The `CompiledPass::Render` fields must become vectors, AND the execute arm must iterate them to build the `color_attachments` array for `begin_render_pass`.

---

## Engine Helper Functions — The Mapper Layer

Engine.rs contains ~10 "mapper" functions between contract enums and wgpu types. These are total `match` statements with zero defaults. They are at lines 152–267:

| Function | Maps | Line |
|----------|------|------|
| `blend_state_for` | `BlendMode` → `wgpu::BlendState` | 152 |
| `cull_face_for` | `CullMode` → `Option<wgpu::Face>` | 175 |
| `depth_compare_for` | `DepthCompare` → `wgpu::CompareFunction` | 183 |
| `stencil_compare_for` | `StencilCompare` → `wgpu::CompareFunction` | 192 |
| `stencil_op_for` | `StencilOp` → `wgpu::StencilOperation` | 209 |
| `stencil_face_state_for` | `Option<StencilFaceState>` → `wgpu::StencilFaceState` | 222 |
| `depth_ops_for` | `Option<DepthLoadOp>` → `Option<wgpu::Operations<f32>>` | 239 |
| `stencil_ops_for` | `Option<StencilLoadOp>` → `Option<wgpu::Operations<u32>>` | 249 |
| `color_load_op_for` | `LoadOp` + clear color → `ColorLoadOp` | 259 |
| `build_bind_group` | `BindGroupSelection` → `Option<wgpu::BindGroup>` | 292 |
| `lookup_color_view` | target ID → view + resolve target | 349 |
| `is_depth_or_stencil_format` | format → bool | 367 |

For Phase A (contract widening), most work is adding variants to the enum + adding arms to the mapper.

---

## MMU Architecture

`mmu.rs:allocate_arena()` is a single function (~400 LOC) that:
1. Phase A: Globals → `globals_buffer` (STORAGE)
2. Phase A.5: Arena scalars → `scalars_buffer` (STORAGE)
3. Phase B: Domains → `domain_buffers` + `domain_atomic_buffers` (STORAGE, bifurcated)
4. Phase D: Shape bank → vertex + index buffers
5. Indirect buffer (single 16-byte, **finding #5**)
6. Phase C: Textures → `textures` HashMap
7. Phase E: Samplers → `samplers` HashMap
8. Phase G: Clear — write initial values

The output is `GpuMemoryArena` which the engine and translator both reference.

### Texture Allocation (finding #7, #10, #12, #15)

```rust
// mmu.rs:355–368
let texture = device.create_texture(&wgpu::TextureDescriptor {
    label: Some(texture_id),
    size: wgpu::Extent3d { width, height, depth_or_array_layers: depth },
    mip_level_count: 1,   // ← HARDCODED — finding #7
    sample_count: 1,       // ← HARDCODED — finding #7
    dimension: dim,
    format,
    usage,
    view_formats: &[],
});
```

### Format Parsing (finding #12)

```rust
// mmu.rs:512–524
fn parse_texture_format(format: &str) -> wgpu::TextureFormat {
    match format {
        "r8unorm" => Rgba8Unorm,
        "rgba8unorm" => Rgba8Unorm,
        // ... 6 more ...
        _ => wgpu::TextureFormat::Rgba8Unorm,  // ← SILENT DEFAULT — finding #12
    }
}
```

The fix for #12 is to return `Result` and propagate the error, or panic with a clear message.

---

## Translator Architecture

`translator.rs` exports three public entry points:

| Function | Input | Output |
|----------|-------|--------|
| `translate_compute_pass` | `ComputePassSpec` + arena | `ComputePassTranslation` (naga module + bound keys) |
| `translate_draw_prep` | `SystemPassSpec` + arena | `DrawPrepTranslation` (naga module) |
| `translate_render_pass` | `DrawCallSpec` + arena | `RenderPassTranslation` (naga module + bound keys) |

Each builds a `naga::Module` using the Naga DSL (`dsl.rs`), which provides `ModuleBuilder` / `FnBuilder` / `FnBodyBuilder`.

### Fragment Output (finding #2)

The critical hot spot:
```rust
// translator.rs:1794–1801
StatementIR::ReturnFragment { outputs } => {
    let key = outputs.get("color").map(|_| "color")
        .or_else(|| outputs.keys().next().map(|k| k.as_str()))
        .expect("ReturnFragment needs at least one output");
    let color = translate_expr_body(bb, ctx, &outputs[key], scope);
    bb.emit_return_value(color);
}
```

Takes one key, ignores the rest. For MRT, this must:
1. Build a struct type with N `@location(i)` members
2. Compose the struct from all outputs (sorted alphabetically — matches TS convention)
3. Return the struct

### Varyings (finding #13)

```rust
// translator.rs:1154–1167
for (i, key) in varying_keys.iter().enumerate() {
    let loc_binding = naga::Binding::Location {
        location: i as u32,
        blend_src: None,
        per_primitive: false,
        interpolation: Some(naga::Interpolation::Perspective),  // ← HARDCODED
        sampling: Some(naga::Sampling::Center),                 // ← HARDCODED
    };
    vs_members.push(naga::StructMember {
        name: Some(key.clone()),
        ty: vec4_f32_ty,   // ← HARDCODED — always vec4<f32>
        ...
    });
}
```

---

## DSL Compiler (TS Side)

The Boundary DSL at `src/render/gpu-ir/compile.ts` is how fixtures are authored. Key helpers:

```typescript
// Render target helpers
clearTarget([r,g,b,a])                // → colors: [{ textureId: 'canvas', loadOp: 'clear', ... }]
depthOnlyTarget('depth_buf')          // → colors: [], depthStencil: { ... }

// Pipeline state presets
OPAQUE   // { blendMode: 'opaque', cullMode: 'none', depthWrite: false, depthCompare: 'always' }
ALPHA_BLEND
DEPTH_TEST

// DSL orchestrators
gpu({ globals, scalars, domains, textures, shapes, samplers, roster })
compute(passId, dispatch, workgroupSize, bodyFn)
render(passId, camera, targets, drawCalls)
composite(passId, targets, drawCalls)
draw(intentId, source, pipelineState, { vertex, fragment, transform })
drawPrep(passId, activeLanesSymbol, vertexCount)
```

When you add fields to the contract (e.g., `storeOp` on color targets), you may also want to update DSL helpers to expose them ergonomically. But the helpers are optional sugar — users can always write the object literal directly.

### IR Builders (`ir-builders.ts`)

One function per ExprIR/StatementIR variant. These must stay in sync with `boundary-contract.ts`:

```typescript
export const textureLoad = (textureId: TextureId, coords: ExprIR): ExprIR =>
  ({ type: 'TextureLoad', textureId, coords }) as const;
```

If you add a field to `TextureLoad` (finding #14: mipLevel), update the builder.

---

## Existing Fixtures That Test the Boundaries

Two fixtures already exercise the capabilities this audit is remediating. They exist in the fixture directory and are registered in the index, but **they fail at the Rust engine level** because the engine doesn't support them yet:

| Fixture | File | Tests |
|---------|------|-------|
| `mrt-split` | `src/render/rust/fixtures/mrt-split.ts` | MRT — 2 color attachments, fragment returns 2 outputs |
| `depth-prepass` | `src/render/rust/fixtures/depth-prepass.ts` | Depth-only pass — zero color attachments |

**These fixtures are your validation targets for Phase E.** When your work is correct, they should render successfully in the payload tester. Run:
```bash
./scripts/get-screenshot-of-payload-tester.sh mrt-split --no-headless
./scripts/get-screenshot-of-payload-tester.sh depth-prepass --no-headless
```

Other key fixtures for regression testing:
- `multi-domain` — 2 domains, cross-domain reads (tests indirect buffer — Phase B)
- `quad-camera` — 4 cameras, render-to-texture, composite pass (tests named textures)
- `sampled-texture` — TextureSample with sampler (tests sampler infrastructure)
- `texture-blur` — TextureLoad/TextureStore (tests texture dispatch)

---

## Testing Strategy

### TS-Side Tests (Vitest)
```bash
npx vitest run src/render/gpu-ir/__tests__/    # All GPU-IR tests
npx vitest run src/render/gpu-ir/__tests__/boundary-coverage.test.ts  # Contract coverage
npx vitest run src/render/gpu-ir/__tests__/roundtrip.test.ts          # IR roundtrip
```

Key test files:
- `boundary-coverage.test.ts` — exercises boundary-contract type variants
- `roundtrip.test.ts` — IR → DSL source → IR identity check
- `gate*.test.ts` — per-fixture Zod validation + structural assertions

When you add a field or variant to the contract, add a test in `boundary-coverage.test.ts` that exercises it through `gpu()` → Zod validation.

### Rust-Side Tests
The Rust crate has minimal unit tests (mostly in `dsl_tests.rs` and `telemetry.rs`). The real validation is visual:

```bash
npm run build:rust-renderer    # Rebuild WASM
npm run dev                    # Dev server
# Then open /payload-tester.html and click the fixture
```

### Screenshot Validation (REQUIRED for rendering changes)
```bash
# For GPU-IR fixtures (requires real GPU, not headless)
./scripts/get-screenshot-of-payload-tester.sh <fixture-name> --no-headless
```

Screenshots save to `/tmp/oscilla-test-screenshots/`. **You must take and inspect a screenshot for any rendering change.** This is a hard gate — see `memory/feedback_visual_gate_required.md`.

---

## Build Commands

```bash
# Full Rust rebuild (after changing any .rs file)
npm run build:rust-renderer

# TS type check (after changing .ts files)
npm run typecheck

# Run all TS tests
npm run test

# Dev server (for visual testing)
npm run dev
```

**The Rust build is slow (~30s).** Only rebuild when you've changed `.rs` files. TS changes don't require a Rust rebuild.

---

## Phase Implementation Guide

### Phase A: Contract Widening

**Pattern**: For each task, do exactly:
1. Add variant/field to Zod schema in `boundary-contract.ts`
2. Add matching variant/field to Rust struct/enum in `contract.rs`
3. Add mapping arm in `engine.rs` (mapper function)
4. Add test case in `boundary-coverage.test.ts`
5. Run `npm run typecheck && npm run test && npm run build:rust-renderer`

**These are pure additions — no behavioral change.** Existing fixtures continue to work unchanged. No visual validation needed (no rendering change).

#### A.1: DepthCompare — add 4 missing variants
TS: Add `'never'`, `'less-equal'`, `'greater-equal'`, `'not-equal'` to `z.enum([...])` at line 167.
Rust: Add `Never`, `LessEqual`, `GreaterEqual`, `NotEqual` to `DepthCompare`. Use `#[serde(rename = "...")]` — DepthCompare currently uses `snake_case` but the TS enum uses kebab-case for these new ones. **Careful:** existing values are `less`, `always`, `equal`, `greater` (no hyphens). The new values `less-equal` have hyphens. You may need explicit `#[serde(rename = "less-equal")]` on the new variants only.
Engine: Add 4 arms to `depth_compare_for()`.

#### A.2: Depth Bias — add 3 optional fields to PipelineStateSpec
TS: Add `depthBias?: number`, `depthBiasSlopeScale?: number`, `depthBiasClamp?: number` to `PipelineStateSpecSchema`.
Rust: Add `pub depth_bias: Option<i32>`, `pub depth_bias_slope_scale: Option<f32>`, `pub depth_bias_clamp: Option<f32>` to `PipelineStateSpec`.
Engine: Read from `draw_call.pipeline_state` instead of `wgpu::DepthBiasState::default()` at line 1039.

#### A.3: Texture Format Fallback — remove silent default
Rust only: Change `mmu.rs:parse_texture_format` to return `Result<wgpu::TextureFormat, String>`. Propagate error to `allocate_arena` return. Add more format strings (at minimum: `bgra8unorm`, `r32uint`, `rg32float`, `depth24plus`, `depth32float-stencil8`, `stencil8`).

#### A.4: PrimitiveState fields — frontFace, polygonMode, unclippedDepth
TS: Add `frontFace?: 'ccw' | 'cw'`, `polygonMode?: 'fill' | 'line' | 'point'` to `PipelineStateSpecSchema`. Note: `unclippedDepth` requires a wgpu feature flag — add to contract but mark optional and don't enable the feature yet.
Rust: Add fields to `PipelineStateSpec`, add enums `FrontFace` and `PolygonMode`.
Engine: Read fields at line 1077–1087 instead of hardcoded values. Use `.unwrap_or(wgpu::FrontFace::Ccw)` for backward compatibility.

#### A.5: Store Op — add to attachment targets
TS: Add `storeOp?: 'store' | 'discard'` to color target objects and depth/stencil ops.
Rust: Add `store_op: Option<String>` (or a `StoreOp` enum) to `ColorTarget` and depth/stencil op types.
Engine: Read at lines 245, 255, 1329 instead of hardcoded `wgpu::StoreOp::Store`.

---

### Phase B: Multi-Domain Indirect Buffer

**The problem:** `mmu.rs` allocates one 16-byte indirect buffer. Multiple `System_DrawPrep` passes and `draw_indirect` calls all use offset 0 of this single buffer. Only the last write is visible.

**The fix:** Either:
- (a) Allocate one indirect buffer per domain (domain ID → buffer), or
- (b) Allocate a larger buffer with per-domain offsets (domain ID → byte offset)

Option (b) is simpler — increase buffer size to `16 * domain_count`, track offsets in the arena. The `System_DrawPrep` translator must write to the correct offset, and `engine.rs:draw_indirect` must pass the correct offset.

**Files to change:**
1. `mmu.rs` — allocate larger buffer, store offset map in `GpuMemoryArena`
2. `translator.rs` (`translate_draw_prep`) — emit the correct base offset for the store
3. `engine.rs` — `draw_indirect` call uses domain-specific offset
4. Possibly `contract.rs` / `boundary-contract.ts` — if the domain ID needs to be threaded into `System_DrawPrep` spec (check if `SystemPassSpec.activeLanesSymbol` is sufficient to derive domain)

**Validation:** The `multi-domain` fixture should show both rings. Take screenshot.

---

### Phase C: Texture & Sampler Infrastructure

See finding details in audit doc. Each task is a contract-field addition + MMU allocation change.

**Validation:** After C.1 (mipLevelCount), write a small fixture that declares a mipmapped texture and verify it allocates without error.

---

### Phase D: Vertex Layout from Shape Spec

**The problem:** engine.rs line 988 hardcodes `Float32x2` at `location(0)`. The `StaticGeometrySpec` already has the attribute map in the contract.

**The fix:**
1. Parse `VertexAttribute.format` string → `wgpu::VertexFormat` (add a mapper, same pattern as parse_texture_format but with proper error handling)
2. Build `wgpu::VertexBufferLayout.attributes` from the shape's attribute map
3. The translator must emit matching `@location` inputs in the vertex shader — verify this is already happening (it should be, via `vertex_index` / `instance_index` intrinsics)

**Validation:** Existing fixtures should still work (they all use Float32x2). Write a new fixture with a float32x3 position to prove it works.

---

### Phase E: MRT + Depth-Only

This is the **atomic cluster**. E.1 + E.2 + E.3 + E.4 should ideally be one PR because they're coupled:
- Engine must support N color attachments (E.1)
- Translator must emit N fragment outputs (E.2)
- Engine must not reject zero color attachments (E.3)
- Contract needs per-attachment blend/write mask (E.4)

**Implementation order within the PR:**
1. E.4 first — add per-attachment blend/writeMask to contract (foundation)
2. E.1 — vectorize `CompiledPass::Render` + install arm + execute arm
3. E.2 — translator builds FsOutput struct with N `@location` members
4. E.3 — remove the `first()` guard, handle empty colors array

**Validation:** `mrt-split` and `depth-prepass` fixtures must render. Take screenshots.

---

### Phase F: Translator Refinements

**The problem:** Varyings are all `vec4<f32>` with `Perspective`/`Center` interpolation.

**The fix:** The varying type and interpolation must be declared somewhere. Options:
1. Add a `varyings` field to `DrawCallSpec` that declares type + interpolation per varying key
2. Infer from the `ReturnVertex` — look at what expression type is assigned to each varying

Option 1 is cleaner (explicit > inferred). Add to `DrawCallSpec`:
```typescript
varyings?: Record<string, { type: WgslType; interpolation?: 'flat' | 'perspective' | 'linear' }>
```

**Validation:** Write a fixture that passes an integer varying with `flat` interpolation.

---

## Codebase Conventions You Must Follow

### LAW citations
Every design decision references a universal law. When your code makes a choice, cite it:
```rust
// [LAW:dataflow-not-control-flow] Total match — no default arm.
```

### Total match, no defaults
All `match` on contract enums must be exhaustive with no `_ =>` arm. The Rust compiler enforces this — a new variant without a handler is a compile error. This is the architectural defense against the drift that caused these findings.

### No feature flags
The codebase uses the strangler-fig migration pattern. There are no runtime feature flags. Tests control which pipeline runs.

### Screenshot validation gate
**Every rendering change must be visually validated.** No exceptions. Run the screenshot script and inspect the output.

### Boundary contract is the authority
When TS and Rust disagree, TS wins. Fix the Rust side. When in doubt about what's representable, look at the Zod schema first.

---

## Quick Reference — What Each Phase Touches

| Phase | boundary-contract.ts | contract.rs | engine.rs | translator.rs | mmu.rs | ir-builders.ts | compile.ts |
|-------|---------------------|-------------|-----------|---------------|--------|----------------|------------|
| A | enum/field additions | enum/field additions | mapper functions | — | A.3 only | — | — |
| B | — | — | draw_indirect offset | draw_prep offset | indirect buffer | — | — |
| C | TextureSpec, SamplerSpec, TextureLoad | mirror | — | textureLoad mip | texture/sampler alloc | textureLoad builder | — |
| D | — | VertexAttribute format | vertex buffer layout | — | — | — | — |
| E | per-attachment blend | mirror | CompiledPass vectorize | fragment multi-output | — | — | — |
| F | varying type/interpolation | mirror | — | varying struct builder | — | — | — |

---

## How to Verify Your Work

1. `npm run typecheck` — TS compiles
2. `npm run test` — all Vitest tests pass
3. `npm run build:rust-renderer` — Rust compiles (if you touched .rs files)
4. `npm run dev` + open `/payload-tester.html` — fixtures render
5. `./scripts/get-screenshot-of-payload-tester.sh <fixture> --no-headless` — visual validation

For Phase A (no rendering change), steps 1–3 are sufficient. For Phases B–F, steps 4–5 are required.
