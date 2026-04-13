# DSL Reference

Oscilla has five domain-specific languages across its TS and Rust planes, plus two builder APIs that are not DSLs but are worth documenting alongside them.

---

## 1. Patch DSL

HCL-based text format for serializing patches (node graphs). Round-trips cleanly: Patch <-> HCL text. Uses a hand-written lexer and recursive-descent parser. The lexer/parser are shared with the Composite HCL DSL (discriminated by `patch` vs `composite` header).

| | |
|---|---|
| **Entry point** | `src/patch-dsl/index.ts` |
| **Lexer** | `src/patch-dsl/lexer.ts` |
| **Parser** | `src/patch-dsl/parser.ts` |
| **AST** | `src/patch-dsl/ast.ts` |
| **Serialize** | `src/patch-dsl/serialize.ts` |
| **Deserialize** | `src/patch-dsl/deserialize.ts` |
| **Emit helpers** | `src/patch-dsl/hcl-emit-utils.ts` |
| **Demo patches** | `src/demo/hcl/*.hcl` |
| **Tests** | `src/patch-dsl/__tests__/` |

### Key concepts
- `patch "name" { ... }` header discriminates from composite documents
- Blocks declare type + ID + params + inline `outputs {}` for edges
- `locals {}` blocks define reusable values (expanded at parse time)
- Deterministic serialization (sorted keys) for clean diffs and round-trip identity
- Top-level `view {}` block stores editor layout metadata (positions, zoom)

---

## 2. Composite HCL DSL

HCL-based text format for composite block definitions. Shares the Patch DSL's lexer and parser but has its own serializer/deserializer. The **only DSL with an interactive in-app editor** (dual-view: visual graph + HCL textarea, bidirectionally synchronized through MobX).

| | |
|---|---|
| **Serialize** | `src/patch-dsl/composite-serialize.ts` |
| **Deserialize** | `src/patch-dsl/composite-deserialize.ts` |
| **Editor UI** | `src/ui/components/CompositeEditor.tsx` (689 lines, ReactFlow + port exposure) |
| **HCL text pane** | `src/ui/components/CompositeEditorDslSidebar.tsx` (textarea + bidirectional sync) |
| **Editor store** | `src/stores/CompositeEditorStore.ts` (963 lines, single state authority) |
| **Store adapter** | `src/ui/graphEditor/CompositeStoreAdapter.ts` |
| **Editor panel** | `src/ui/dockview/panels/CompositeEditorPanel.tsx` |
| **Type definitions** | `src/blocks/composite-types.ts` |
| **Round-trip tests** | `src/patch-dsl/__tests__/composite-roundtrip.test.ts` (28 tests) |
| **Integration tests** | `src/patch-dsl/__tests__/composite-store-integration.test.ts` |
| **CSS** | `src/ui/components/CompositeEditor.css`, `CompositeEditorDslSidebar.css` |

### Key concepts
- `composite "TypeName" { ... }` header with metadata (label, category, capability)
- `block "Type" "localId" { params; outputs { port = target.port } }` for internal blocks
- `expose_input` / `expose_output` blocks map internal ports to the composite's external interface
- Deterministic serialization (alphabetically sorted) for round-trip identity
- Bidirectional sync: graph changes -> debounced HCL update (paused during focus); HCL edit -> apply on blur
- `CompositeEditorStore.toHCL()` / `fromHCL()` are the serialization boundary
- Block positions are editor-only state (not serialized in HCL)

### Related: Composite Builder API (not a DSL)

Fluent builder for code-defined composite blocks (used by 4 library composites). Produces the same `CompositeBlockDef` type as the HCL deserializer.

| | |
|---|---|
| **Builder** | `src/blocks/composites/builder.ts` |
| **Library composites** | `src/blocks/composites/library/` (SmoothNoise, PingPong, ColorCycle, DelayedTrigger) |
| **Loader / persistence** | `src/blocks/composites/loader.ts`, `persistence.ts` |
| **Expansion (compiler)** | `src/compiler/frontend/composite-expansion.ts` |

---

## 3. Expression DSL

User-facing math expression language (`sin(phase * 2) + 0.5`) with a proper four-stage compiler pipeline: hand-written lexer -> recursive-descent parser -> bottom-up typechecker -> IR compiler. Used inside Expression blocks for inline math. Grammar is **frozen** (changes require a migration plan per `GRAMMAR.md`).

| | |
|---|---|
| **Entry point** | `src/expr/index.ts` — `compileExpression()` |
| **Lexer** | `src/expr/lexer.ts` (23 token kinds, character state machine) |
| **Parser** | `src/expr/parser.ts` (7 precedence levels, recursive descent) |
| **AST** | `src/expr/ast.ts` |
| **Typechecker** | `src/expr/typecheck.ts` (19 built-in functions, vector ops, swizzle, coercion rules) |
| **Compiler** | `src/expr/compile.ts` (typed AST -> V1 IR via BlockIRBuilder) |
| **Multiline preprocessor** | `src/expr/program.ts` (variable aliases via token-level substitution) |
| **Swizzle validation** | `src/expr/swizzle.ts` |
| **Suggestions** | `src/expr/suggestions.ts` (Levenshtein "did you mean?" for typos) |
| **Constants** | `src/expr/constants.ts` (pi, tau, e, etc.) |
| **Grammar spec** | `src/expr/GRAMMAR.md` (**FROZEN** — EBNF, precedence table, design rationale) |
| **Expression block (V1)** | `src/blocks/math/expression.ts` |
| **Tests** | `src/expr/__tests__/` (typecheck, program, integration) |

### Key concepts
- Operators: arithmetic (`+ - * / %`), comparison (`< > <= >= == !=`), logical (`&& || !`), ternary (`? :`)
- 19 built-in functions: `sin cos tan abs floor ceil round sqrt pow min max clamp mix step smoothstep fract sign length normalize`
- Vector constructors: `vec2(x,y)`, `vec3(x,y,z)`, `vec4(x,y,z,w)` + swizzle (`.xy`, `.rgb`, etc.)
- Multiline: lines before last are variable assignments (`x = expr`), last line is the output expression
- Type coercion: int->float (safe), float->int (forbidden), scalar->vector (broadcast)
- Error messages include source positions and "did you mean?" suggestions

---

## 4. Boundary DSL

TypeScript arrow-function DSL that compiles to Boundary IR (`PipelineInstallPayload`). Fixture authors write `gpu({ manifest, roster })` specs with `compute()`, `render()`, `draw()` helpers. The compiler calls `fn.toString()` on arrow functions, parses with acorn, and walks the ESTree AST to produce `ExprIR`/`StatementIR` nodes.

| | |
|---|---|
| **Entry point** | `src/render/gpu-ir/index.ts` — `gpu()`, `compute()`, `render()`, `draw()` |
| **Compiler** | `src/render/gpu-ir/compile.ts` |
| **ESTree walker** | `src/render/gpu-ir/walker.ts` (arrow fn AST -> ExprIR/StatementIR) |
| **IR builders** | `src/render/gpu-ir/ir-builders.ts` (constructors for 25 ExprIR + 14 StatementIR variants) |
| **Operator/builtin rules** | `src/render/gpu-ir/ir-node-rules.ts` (single source of truth for walker + reverse translator) |
| **Manifest helpers** | `src/render/gpu-ir/manifest.ts` |
| **Shape helpers** | `src/render/gpu-ir/shapes.ts` |
| **Stdlib functions** | `src/render/gpu-ir/stdlib.ts` |
| **Dependency inference** | `src/render/gpu-ir/deps.ts` |

### Key concepts
- Proxy objects (`$global`, `$domains`, `$thread`) capture property access as IR nodes
- `fn.toString()` dependency means minification/transpilation will break this DSL
- Free variables silently become `NaN` (no error) — known issue
- `ir-node-rules.ts` is the single table driving both forward compilation and reverse translation
- `ir-builders.ts` is shared between the DSL walker and the C1 block compiler

### Related: Boundary IR (not a DSL)

The wire format (JSON) that crosses compile/runtime boundaries. The canonical schema lives in TypeScript.

| | |
|---|---|
| **Canonical definition** | `src/legacy/pipeline-install-contract.ts` (Zod schemas) |
| **Key type** | `PipelineInstallPayload = { manifest, roster, functions? }` |

---

## 5. Block DSL (V1 + C1)

TypeScript APIs for defining blocks in the node-graph editor. Two registries coexist during migration.

### V1 Block DSL (legacy — do not extend)

Declarative registration via `defineBlock()` with factory abstractions for common patterns. Type-safe port declarations with full `CanonicalType` metadata.

| | |
|---|---|
| **Registry** | `src/blocks/registry.ts` — `defineBlock()`, `registerBlock()` |
| **Block definitions** | `src/blocks/<category>/*.ts` (math/, signal/, shape/, etc.) |
| **Registration** | `src/blocks/all.ts` -> `registerAllBlocks()` |
| **Composite registration** | `src/blocks/composites/` |

### Pillars Block DSL (current migration surface)

Value-based block definitions exported from `src/pillars/blocks/`. Blocks validate config, declare manifest contributions, and lower into bundle or intent outputs through the `BlockDefinition<TConfig, TLowerArgs>` contract.

| | |
|---|---|
| **Public contract** | `src/pillars/block-api.ts` — `BlockDefinition`, `ManifestContribution`, lowering types |
| **Block definitions** | `src/pillars/blocks/*.ts` |
| **Registration** | `src/pillars/blocks/index.ts` via the `ALL_BLOCKS` array |
| **Registry builder** | `src/pillars/frontend/registry.ts` |
| **Current blocks** | ParticlePool, Clock, ExpressionModifier, DrawBundle, TextureGrid, Materialize |

---
