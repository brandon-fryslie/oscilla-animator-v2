# DSL Reference

Oscilla uses five domain-specific languages across its TS and Rust planes.

## Boundary IR

The intermediate representation that crosses the TypeScript → WASM boundary. Defined as Zod schemas in TypeScript and mirrored as Rust structs via `serde_json`.

| | |
|---|---|
| **Canonical definition** | `src/render/rust/boundary-contract.ts` |
| **Rust mirror** | `src/render/wasm/rust/oscilla-rust-renderer/src/contract.rs` |
| **Key type** | `PipelineInstallPayload` |
| **Format** | JSON (Zod-validated on TS side, serde-deserialized on Rust side) |

## Boundary DSL

TypeScript arrow-function DSL that compiles to Boundary IR. Fixture authors write `gpu({ ... })` specs with `compute()`, `render()`, `draw()` helpers; the compiler walks `fn.toString()` to produce `StatementIR` AST nodes.

| | |
|---|---|
| **Entry point** | `src/render/gpu-ir/index.ts` |
| **Compiler** | `src/render/gpu-ir/compile.ts` |
| **Walker** | `src/render/gpu-ir/walker.ts` |
| **IR builders** | `src/render/gpu-ir/ir-builders.ts` |
| **Reverse translator** | `src/render/gpu-ir/reverse-payload.ts` (Boundary IR → DSL source text) |
| **Fixtures** | `src/render/rust/fixtures/*.ts` |

## Naga DSL

Rust builder API that makes it ergonomic to construct Naga AST (`naga::Module`) programmatically. Used by the translator to convert Boundary IR statements into GPU shader modules.

| | |
|---|---|
| **Entry point** | `src/render/wasm/rust/oscilla-rust-renderer/src/dsl.rs` |
| **Key types** | `ModuleBuilder`, `FnBuilder`, `FnBodyBuilder` |
| **Consumer** | `src/render/wasm/rust/oscilla-rust-renderer/src/translator.rs` |
| **Reference skill** | `/oscilla-naga-dsl-reference` |

## Block DSL

TypeScript API for defining blocks in the node-graph editor. Each block declares its slots, type constraints, intrinsics, and lowering function via `defineBlock()`.

| | |
|---|---|
| **Registry** | `src/blocks/registry.ts` |
| **Block definitions** | `src/blocks/<category>/*.ts` (e.g., `math/`, `signal/`, `shape/`) |
| **Registration** | `src/blocks/all.ts` → `registerAllBlocks()` |

## Patch DSL

HCL-like text format for authoring and serializing patches (node graphs). Supports round-trip serialization: Patch ↔ HCL text.

| | |
|---|---|
| **Entry point** | `src/patch-dsl/index.ts` |
| **Lexer** | `src/patch-dsl/lexer.ts` |
| **Parser** | `src/patch-dsl/parser.ts` |
| **AST** | `src/patch-dsl/ast.ts` |
| **Serialize** | `src/patch-dsl/serialize.ts` |
| **Deserialize** | `src/patch-dsl/deserialize.ts` |
| **Demo patches** | `src/demo/hcl/*.hcl` |
