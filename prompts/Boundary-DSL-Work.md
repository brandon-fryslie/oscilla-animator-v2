# Boundary DSL Reference — WGSL Function Registration & Naga Transplant

## Architecture

The Boundary DSL compiles TypeScript arrow functions into `PipelineInstallPayload` JSON, which crosses the JS→Rust/WASM boundary. The Rust renderer deserializes the payload and translates its IR (ExprIR/StatementIR) into Naga AST, which compiles to WGSL for WebGPU.

```
TS arrow fns  →  walker.ts (acorn)  →  ExprIR/StatementIR
                                             ↓
compile.ts  →  PipelineInstallPayload  →  JSON to Rust worker
                                             ↓
contract.rs (serde)  →  translator.rs  →  Naga Module  →  WGSL  →  WebGPU
```

### Key Files

**TypeScript (Boundary DSL):**
| File | Role |
|------|------|
| `src/render/rust/boundary-contract.ts` | Canonical Zod schemas — single source of truth for all IR types |
| `src/render/gpu-ir/compile.ts` | Orchestrator: `gpu()`, `compute()`, `render()`, `draw()` entry points |
| `src/render/gpu-ir/walker.ts` | Parses arrow fn bodies via acorn, emits StatementIR/ExprIR |
| `src/render/gpu-ir/ir-builders.ts` | Shared IR constructors (used by DSL walker and future block compiler) |
| `src/render/gpu-ir/ir-node-rules.ts` | Table-driven validation rules — source of truth for both walker and reverse translator |
| `src/render/gpu-ir/stdlib.ts` | WGSL function definitions (hash_u32, noise_simplex_2d, noise_simplex_3d) |
| `src/render/gpu-ir/reverse-payload.ts` | Boundary IR → DSL source text (reverse translator) |
| `src/render/gpu-ir/deps.ts` | Auto-infer buffer dependencies from AST walk |
| `src/render/rust/fixtures/*.ts` | End-to-end test fixtures |

**Rust (Renderer):**
| File | Role |
|------|------|
| `src/render/wasm/rust/oscilla-rust-renderer/src/contract.rs` | Serde mirror of boundary-contract.ts |
| `src/render/wasm/rust/oscilla-rust-renderer/src/translator.rs` | IR → Naga Module translation |
| `src/render/wasm/rust/oscilla-rust-renderer/src/dsl.rs` | Naga DSL (ModuleBuilder/FnBuilder/FnBodyBuilder) |
| `src/render/wasm/rust/oscilla-rust-renderer/src/wgsl_functions.rs` | WGSL function parsing + Naga arena transplant |
| `src/render/wasm/rust/oscilla-rust-renderer/src/engine.rs` | WebGPU pipeline creation and frame dispatch |

## WGSL Function Registration

A general-purpose feature on PipelineInstallPayload — not stdlib-specific. Users can register arbitrary WGSL functions callable from the DSL.

### Contract

Two-field contract: `name` (callable name = WGSL entrypoint) + `wgsl` (source string, may include private helpers).

```typescript
// boundary-contract.ts
WgslFunction = { name: string, wgsl: string, entrypoint: string }

// PipelineInstallPayload includes:
functions: WgslFunction[]
```

**[LAW:one-source-of-truth]** The WGSL source string IS the interface declaration. No separate `args`/`returnType` fields. Metadata extraction (arg types, return type) uses `wgsl_reflect` on the TS side.

### Data Flow

1. **TS**: `stdlib.ts` defines functions as `WgslFunction` objects with raw WGSL source
2. **TS**: `compile.ts` merges STDLIB + user functions into payload unconditionally (no tree-shaking — GPU driver handles dead code elimination)
3. **Rust**: `wgsl_functions.rs` parses WGSL via `naga::front::wgsl::parse_str()` at install time
4. **Rust**: `transplant_referenced_functions()` scans StatementIR for stdlib calls, transplants into target module
5. **Rust**: `translator.rs` resolves `CallBuiltin` nodes against `ctx.stdlib_handles` for transplanted functions

### Naga Arena Transplant

Functions are copied between Naga modules via full handle remapping in `wgsl_functions.rs`:

- **`transplant_function()`**: Deep-copies a function from a parsed module into the target module, remapping all arena handles (types, expressions, constants, global expressions)
- **`TransplantCtx`**: Tracks handle mappings during transplant
- **`ensure_transplanted()`**: Idempotent — name-based dedup prevents double-transplant
- Expression remapping handles all Naga Expression variants exhaustively
- Statement remapping handles Call, Emit, If, Loop, Store, etc.
- Empty Emit ranges (valid Naga IR from WGSL frontend) → `Block::new()`

**Naga 29 specifics:**
- `const_expressions` renamed to `global_expressions`
- `AccelerationStructure`/`RayQuery` are struct variants (not unit)
- `Handle::new()` is private — cannot construct handles directly
- Functions require `diagnostic_filter_leaf` field
- `CooperativeMatrix` variant must be covered in type match

### Current Limitations

- Only compute passes support stdlib calls (`translate_compute_pass()` accepts `parsed_functions`)
- Render pass translator doesn't yet accept `parsed_functions`
- `entrypoint` field should be collapsed into `name` (they must match)
- `wgsl_reflect` integration not yet complete (metadata extraction at registration time)

## Design Decisions

### Renderer as Dumb Executor
All decisions must be resolved in the compiled IR. The renderer should contain zero conditional logic — no branching on `load_op` values, no runtime feature detection. If the renderer checks a value to decide what to do, that decision belongs in the IR compiler.

### Ortho Camera Convention
Origin-centered, [-1,1] visible range (matches professional 3D tools). Camera defaults: `centerX: 0, centerY: 0`.

### MSAA
4x MSAA enabled globally in the engine. Three-point wiring:
1. Pipeline `MultisampleState` with `sample_count`
2. MSAA texture created at init (`msaa_view` field on engine)
3. Render pass: MSAA view as `color_view`, surface as `resolve_target`

## Applicable Design Rules

- **Table-driven validation**: `EXPR_RULES`/`STMT_RULES` in `ir-node-rules.ts` are the single source of truth. Walker, validator, and reverse translator all read the same tables. No switch statements for structural dispatch.
- **Bidirectional tables**: Forward (DSL→IR) and inverse (IR→DSL) mappings live in the same tables. See `memory/feedback_walker_table_extraction.md`.
- **walkIR vs fold**: `walkIR` (void visitor) for observe+accumulate (validation, dep collection). Reverse translator uses recursive fold (children return strings, parent composes). Both read shared rule tables. See `memory/feedback_walkir_vs_fold.md`.
- **Helpers return parameter type**: DSL helpers like `exact()`, `domainSource()` return the same union type the function parameter expects — never a narrower custom type.
- **No default-conditional emission**: Always emit one canonical form. Never branch on "is this the default value?"
- **Visual validation required**: GPU-IR fixture changes must be validated with `scripts/get-screenshot-of-payload-tester.sh <fixture-name> --no-headless`.
