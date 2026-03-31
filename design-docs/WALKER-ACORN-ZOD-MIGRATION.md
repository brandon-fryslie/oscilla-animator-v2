# Walker Migration: TypeScript Compiler → acorn + Zod

## Context

The GPU-IR DSL walker (`src/render/gpu-ir/walker.ts`) transforms arrow function source text into ExprIR/StatementIR arrays. It currently uses the TypeScript compiler API (`import ts from 'typescript'`) to parse `fn.toString()` output and walk the resulting TS AST.

This works but carries a ~3MB dependency (the entire TypeScript compiler) for a task that only uses `ts.createSourceFile()` and a handful of `ts.is*()` type guards. The type annotation capability that justified choosing the TS compiler over a lighter parser turned out to be unusable — esbuild strips type annotations before runtime, so `fn.toString()` returns untyped JavaScript.

## Current Architecture

```
fn.toString()
    → ts.createSourceFile()        [TypeScript compiler, ~3MB]
    → manual ts.is*() checks       [ad-hoc pattern matching]
    → ir-builders.*()              [produce ExprIR/StatementIR]
```

The walker uses:
- `ts.createSourceFile()` — parse source text to AST
- `ts.isArrowFunction()`, `ts.isPropertyAccessExpression()`, `ts.isBinaryExpression()`, etc. — pattern match AST nodes
- `ts.SyntaxKind.*` — enum values for operator tokens

None of these require the type checker, resolver, or any other part of the TS compiler beyond the parser.

## Proposed Architecture

```
fn.toString()
    → acorn.parse()                [~80KB, ESTree-compliant]
    → Zod schemas validate/extract [declarative pattern matching]
    → ir-builders.*()              [produce ExprIR/StatementIR, unchanged]
```

### Why acorn

- **~80KB** vs ~3MB (TypeScript compiler). 97% size reduction.
- **Already a transitive dependency** — Vite/Rollup use acorn internally.
- **ESTree standard** — the AST format is well-documented, stable, and used by eslint, babel, prettier, etc. More ecosystem tooling than the TS compiler's proprietary AST format.
- **Parses everything we need** — arrow functions, property access chains, binary expressions, call expressions, destructuring, for loops, if statements. All standard JavaScript.
- **Does NOT parse TypeScript syntax** — but we don't need it. esbuild strips type annotations before `fn.toString()` runs.

### Why Zod for pattern matching

The walker currently does ad-hoc pattern matching:

```typescript
// Current: imperative checks
if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
  const obj = node.expression.text;
  if (obj === '$global') {
    return B.loadGlobal('sys:' + node.name.text);
  }
}
```

With Zod schemas over ESTree nodes, this becomes declarative:

```typescript
// Proposed: schema-driven
const DollarGlobalAccess = z.object({
  type: z.literal('MemberExpression'),
  object: z.object({ type: z.literal('Identifier'), name: z.literal('$global') }),
  property: z.object({ type: z.literal('Identifier'), name: z.string() }),
});
// → if matches, produce LoadGlobal('sys:' + result.data.property.name)
```

Benefits:
1. **Exhaustive by construction** — each ESTree pattern has a corresponding Zod schema. Missing a pattern is visible in the schema registry.
2. **Self-documenting** — the schema IS the documentation of what TS syntax maps to what IR node.
3. **Consistent with boundary-contract.ts** — the output side already uses Zod schemas. Using Zod on the input side too means one validation framework for the entire pipeline.
4. **Error messages for free** — when a pattern doesn't match, Zod tells you exactly which field failed and why. Currently the walker throws ad-hoc `new Error()` messages.

### What the Zod schemas would cover

Each schema matches an ESTree node pattern and maps it to an IR construction:

| ESTree Pattern | Zod Schema | IR Output |
|---------------|------------|-----------|
| `$global.time` | `MemberExpression { object: Identifier('$global'), property: Identifier }` | `LoadGlobal('sys:' + name)` |
| `$domains.tri.color_r[0]` | `MemberExpression { object: MemberExpression { object: Identifier('$domains'), ... }, ... }` chained with element access | `LoadField / StoreField` |
| `$thread.x` | `MemberExpression { object: Identifier('$thread'), property: Identifier('x') }` | `Intrinsic('global_invocation_id.x')` |
| `sin(x)` | `CallExpression { callee: Identifier(BUILTIN_NAME), arguments: [...] }` | `CallBuiltin(name, args)` |
| `f32(x)` | `CallExpression { callee: Identifier(CAST_NAME), arguments: [expr] }` | `Cast(name, expr)` |
| `vec4(a,b,c,d)` | `CallExpression { callee: Identifier(CONSTRUCT_NAME), arguments: [...] }` | `Construct(wgslType, args)` |
| `a + b` | `BinaryExpression { operator: '+', left, right }` | `BinaryOp('+', left, right)` |
| `const x = expr` | `VariableDeclaration { kind: 'const', declarations: [...] }` | `Let(name, expr)` |
| `let x = expr` | `VariableDeclaration { kind: 'let', declarations: [...] }` | `Var(name, expr)` |
| `domain.field[idx] = expr` | `AssignmentExpression { left: MemberExpression[...], right: expr }` | `StoreField(symbolId, idx, expr)` |
| `return vertex(pos, { varyings })` | `ReturnStatement { argument: CallExpression { callee: Identifier('vertex'), ... } }` | `ReturnVertex(pos, varyings)` |
| `return fragment({ outputs })` | `ReturnStatement { argument: CallExpression { callee: Identifier('fragment'), ... } }` | `ReturnFragment(outputs)` |
| `position.xy` | `MemberExpression { property: Identifier(SWIZZLE) }` (not a $-prefixed root) | `Swizzle(source, mask)` |
| `for (...) { ... }` | `ForStatement { init, test, update, body }` | `For(init, cond, update, body)` |
| `if (...) { ... }` | `IfStatement { test, consequent, alternate }` | `If(cond, accept, reject)` |

### ESTree vs TypeScript AST — Key Differences

| Concept | TypeScript AST | ESTree (acorn) |
|---------|---------------|----------------|
| Node type field | `node.kind` (numeric enum `ts.SyntaxKind`) | `node.type` (string, e.g. `'BinaryExpression'`) |
| Property access | `ts.isPropertyAccessExpression(node)` | `node.type === 'MemberExpression'` |
| Identifier name | `(node as ts.Identifier).text` | `node.name` |
| Binary operator | `node.operatorToken.kind` (numeric) | `node.operator` (string, e.g. `'+'`) |
| Arrow function | `ts.isArrowFunction(node)` | `node.type === 'ArrowFunctionExpression'` |
| Destructured param | `ts.isObjectBindingPattern(node.name)` | `node.type === 'ObjectPattern'` |
| Variable kind | `node.declarationList.flags & ts.NodeFlags.Let` | `node.kind === 'let'` or `'const'` |

ESTree is generally simpler — string discriminants instead of numeric enums, flatter node structure, no need for type-guard helper functions.

## Migration Plan

### Phase 1: Add acorn dependency, write ESTree Zod schemas

1. `npm install acorn` (or use the version already in node_modules via Vite)
2. Create `src/render/gpu-ir/estree-patterns.ts` — Zod schemas for all ESTree patterns the walker recognizes
3. Create `src/render/gpu-ir/walker-acorn.ts` — new walker implementation using acorn + schemas
4. Write tests: for every pattern in the current walker, assert the new walker produces identical IR output

### Phase 2: Swap and verify

1. Update `compile.ts` to import from `walker-acorn.ts` instead of `walker.ts`
2. Run Gate 0 round-trip test — must still pass (identical IR output)
3. Run all existing gate tests
4. Run visual validation in payload tester

### Phase 3: Remove TypeScript compiler dependency

1. Delete `walker.ts` (old TS-compiler-based walker)
2. Remove `import ts from 'typescript'` — no other file uses it
3. Verify bundle size reduction: `payload-tester` chunk should drop from ~3.6MB to ~600KB
4. Update `design-docs/GPU-IR-ARROW-DSL-FOUNDATION.md` to reflect the new architecture

## What Does NOT Change

- **ir-builders.ts** — unchanged, still produces ExprIR/StatementIR
- **boundary-contract.ts** — unchanged, still validates the output
- **deps.ts** — unchanged (or already migrated to use shared rule tables)
- **compile.ts** — unchanged API surface, just imports the new walker
- **types.ts** — unchanged, ambient declarations still provide IDE checking
- **All DSL syntax** — `$global.time`, `$domains.tri.color_r[0]`, `sin(x)`, etc. — identical
- **fn.toString() approach** — still the entry point; acorn parses the same source text

## Risks

| Risk | Mitigation |
|------|-----------|
| acorn doesn't parse some JS syntax we need | acorn supports ES2022+; all patterns in our walker are standard JS. Test each pattern individually. |
| ESTree Zod schemas are verbose | They're declarative and self-documenting. Verbosity is a feature — each schema is the spec for one pattern. |
| Dual walker during migration | Phase 1 tests prove identical output before Phase 2 swaps. Never ship both. |
| acorn version compatibility | Pin the version. acorn's ESTree output is stable — the spec hasn't changed in years. |

## Bundle Size Impact

| Component | Before | After |
|-----------|--------|-------|
| TypeScript compiler | ~3MB | removed |
| acorn parser | 0 (transitive only) | ~80KB (explicit) |
| Zod schemas (estree-patterns.ts) | 0 | ~5KB |
| **Net payload-tester chunk** | **~3.6MB** | **~700KB** |

## Walker Unification: Three Walkers → One

Today there are three modules that walk ExprIR/StatementIR trees:

| Module | Purpose | Walks |
|--------|---------|-------|
| `walker.ts` | DSL compilation | TypeScript AST (input) → produces IR |
| `deps.ts` | Dependency inference | ExprIR/StatementIR (output) → collects resource refs |
| `boundary-contract.ts` | Semantic validation | ExprIR/StatementIR (output) → checks ref validity |

`deps.ts` and `boundary-contract.ts` walk the SAME tree (ExprIR/StatementIR) with the SAME recursion pattern. They were partially unified via the `EXPR_RULES`/`STMT_RULES` data-driven tables in `boundary-contract.ts`, which declare each variant's children and reference fields.

This migration creates the opportunity to fully unify them:

### After migration: shared IR walk infrastructure

```
ir-node-rules.ts          ← extracted from boundary-contract.ts
  EXPR_RULES              ← Record<ExprIR['type'], { refs, children, childArrays }>
  STMT_RULES              ← Record<StatementIR['type'], { refs, children, stmtChildren, ... }>
  walkIR(stmts, visitor)  ← generic walker that follows the rule tables
        │
        ├── boundary-contract.ts  uses walkIR with a "check refs exist" visitor
        ├── deps.ts               uses walkIR with a "collect refs" visitor
        └── (future consumers)    any new IR analysis uses the same walker
```

The generic `walkIR` function takes a visitor that receives each node + its rule. The visitor decides what to do (validate, collect, transform). The recursion logic is written ONCE in `walkIR` and driven by the rule tables.

**This eliminates the "three walkers that need to stay in sync" problem.** Adding a new IR variant means:
1. Add the Zod schema variant to `boundary-contract.ts` (structural)
2. Add one entry to `EXPR_RULES` or `STMT_RULES` in `ir-node-rules.ts` (children + refs)
3. TypeScript enforces both (Record exhaustiveness + discriminated union completeness)

All three consumers — validation, deps, and any future analysis — automatically handle the new variant because they use the same walker.

`walker.ts` (the DSL compiler) remains separate because it walks a DIFFERENT tree (ESTree from acorn, not ExprIR/StatementIR). But its output is validated by the unified IR walker, closing the loop.

## Allowed Files Scope

**CRITICAL: Do NOT read any legacy JavaScript compiler, runtime, block registry, or UI code.** This work is scoped entirely to the WASM renderer boundary and the GPU-IR DSL module.

### Files you MAY read and modify

```
src/render/gpu-ir/
  ir-builders.ts           ← IR construction primitives
  types.ts                 ← Branded types + ambient declarations
  shapes.ts                ← Shape helpers
  walker.ts                ← Current TS-compiler walker (to be replaced)
  compile.ts               ← DSL compilation orchestrator
  deps.ts                  ← Dependency inference (to be unified)
  manifest.ts              ← Compact manifest expansion
  index.ts                 ← Public API
  __tests__/*.test.ts      ← Gate tests

src/render/rust/
  boundary-contract.ts     ← Zod schemas + semantic validation (to be refactored)
  fixtures/*.ts            ← Fixture payloads + DSL source (round-trip test oracles)
  worker-protocol.ts       ← Worker message types (read-only reference)
  engine.worker.ts         ← Validation call site (read-only reference)

src/payload-tester/
  dsl-eval.ts              ← DSL evaluator for the UI
  DslPayloadSplitEditor.tsx ← Split editor component
  PayloadTesterApp.tsx     ← App root
  FixtureSelector.tsx      ← Fixture list

design-docs/
  GPU-IR-ARROW-DSL-FOUNDATION.md
  BOUNDARY-CONTRACT-ZOD-MIGRATION.md
  WALKER-ACORN-ZOD-MIGRATION.md (this file)
```

### Files you MUST NOT read

- `src/compiler/**` — legacy JS compiler (being rebuilt)
- `src/runtime/**` — legacy JS runtime
- `src/blocks/**` — legacy block registry
- `src/stores/**` — MobX stores
- `src/services/**` — legacy orchestration services
- `src/ui/**` — React editor UI
- `src/graph/**` — legacy graph model
- `src/core/**` — legacy type system
- `src/types/**` — legacy type definitions
- `src/patch-dsl/**` — legacy HCL patch DSL
- Any file outside `src/render/`, `src/payload-tester/`, and `design-docs/`

## Dependencies on Other Work

- **ir-node-rules.ts extraction** — should happen AS PART of this migration (Phase 1), not separately. Extract `EXPR_RULES`/`STMT_RULES` from `boundary-contract.ts` into `ir-node-rules.ts`, add the generic `walkIR` function, rewire `deps.ts` and `boundary-contract.ts` to use it.
- **Gate 1-8 walker expansion** — if done before this migration, each gate adds cases to the old walker AND the new walker (during Phase 1). If done after, each gate only adds ESTree Zod schemas + one rule table entry. **Recommendation: do this migration before expanding gates**, to avoid double-implementing each pattern.
- **Rust catch_unwind** — independent, defense-in-depth regardless of which parser the walker uses.
