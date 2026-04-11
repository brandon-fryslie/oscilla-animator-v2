# Walker Migration: TypeScript Compiler → acorn + Unified IR Walk

## Context

The GPU-IR DSL walker (`src/render/gpu-ir/walker.ts`) transforms arrow function source text into ExprIR/StatementIR arrays. It currently uses the TypeScript compiler API (`import ts from 'typescript'`) to parse `fn.toString()` output and walk the resulting TS AST.

This works but carries a ~3MB dependency (the entire TypeScript compiler) for a task that only uses `ts.createSourceFile()` and a handful of `ts.is*()` type guards. The type annotation capability that justified choosing the TS compiler over a lighter parser turned out to be unusable — esbuild strips type annotations before runtime, so `fn.toString()` returns untyped JavaScript.

Additionally, three modules independently walk ExprIR/StatementIR trees with duplicated recursion logic. This migration unifies the IR walkers and replaces the TS compiler with acorn.

**acorn is runtime production infrastructure, not a dev convenience.** Users author DSL live in the application. The parser runs in the hot path. It must be fast, small, stable, and treated with the same rigor as any production dependency — pinned version, CI-tested, security-monitored.

## Goals

1. Replace `typescript` (~3MB) with `acorn` (~80KB) for source parsing — 97% size reduction
2. Unify all ExprIR/StatementIR tree walkers into a single shared `walkIR` function
3. Produce structured, user-facing error diagnostics with source positions for all failure modes
4. No behavior changes — identical IR output, identical validation

## Current Architecture

```
fn.toString()
    → ts.createSourceFile()        [TypeScript compiler, ~3MB]
    → manual ts.is*() checks       [ad-hoc pattern matching]
    → ir-builders.*()              [produce ExprIR/StatementIR]
```

Three independent IR tree walkers:

| Module | Purpose | Problem |
|--------|---------|---------|
| `walker.ts` | DSL compilation (TS AST → IR) | Different input tree, stays separate |
| `deps.ts` | Dependency inference (IR → dep declarations) | Manual case statements, duplicates recursion |
| `boundary-contract.ts` | Semantic validation (IR → diagnostics) | Has rule tables but own inline walker |

`deps.ts` and `boundary-contract.ts` walk the SAME IR tree with the SAME recursion pattern but DIFFERENT implementations. Both must be updated when an IR variant is added.

## Proposed Architecture

```
fn.toString()
    → acorn.parse()                [~80KB, ESTree-compliant, production runtime]
    → ESTree → IR transformation   [typed via @types/estree, errors with source positions]
    → ir-builders.*()              [produce ExprIR/StatementIR, unchanged]
    → PipelineInstallPayloadSchema.safeParse()  [Zod structural + semantic validation]
```

Unified IR walker:

```
ir-node-rules.ts
  EXPR_RULES              ← Record<ExprIR['type'], ExprRule>  (exhaustive)
  STMT_RULES              ← Record<StatementIR['type'], StmtRule>  (exhaustive)
  walkIR(stmts, visitor)  ← ONE generic walker, data-driven by rule tables
        │
        ├── boundary-contract.ts  → walkIR with validation visitor (Zod .superRefine)
        ├── deps.ts               → walkIR with collection visitor
        ├── (future) IR printer   → walkIR with string-emission visitor (IR → DSL text)
        └── (future) any analysis → same walker, new visitor
```

### Why acorn

- **~80KB** vs ~3MB (TypeScript compiler). 97% size reduction.
- **Already a transitive dependency** — Vite/Rollup use acorn internally.
- **ESTree standard** — well-documented, stable, used by eslint, babel, prettier. More ecosystem tooling than the TS compiler's proprietary AST format.
- **Production-proven** — Vite uses it at dev-server request time. Svelte uses it in the browser at runtime. It is not a dev-only tool.
- **Parses everything we need** — arrow functions, property access chains, binary expressions, call expressions, destructuring, for loops, if statements. All standard JavaScript.
- **Does NOT parse TypeScript syntax** — but we don't need it. esbuild strips type annotations before `fn.toString()` runs.

### Zod usage in this system

Zod is used for **output-side validation** (ExprIR/StatementIR → Rust boundary) via `boundary-contract.ts`. This is correct and stays.

Zod is NOT used for **input-side pattern matching** (ESTree → IR transformation). This is deliberate:
- ESTree already has string `type` discriminants → TypeScript narrowing works natively
- `@types/estree` provides compile-time type safety for the walker code
- acorn guarantees valid ESTree output — there is nothing to validate on the input
- Every ESTree tool (eslint, babel, acorn-walk) uses `node.type` checks — it's the idiomatic approach
- The output Zod validation already catches any IR the walker produces incorrectly

### ESTree vs TypeScript AST — Key Differences

| Concept | TypeScript AST | ESTree (acorn) |
|---------|---------------|----------------|
| Node type field | `node.kind` (numeric enum) | `node.type` (string, e.g. `'BinaryExpression'`) |
| Property access | `ts.isPropertyAccessExpression(node)` | `node.type === 'MemberExpression'` |
| Element access | `ts.isElementAccessExpression(node)` | `MemberExpression` with `computed: true` |
| Identifier name | `(node as ts.Identifier).text` | `node.name` |
| Binary operator | `node.operatorToken.kind` (numeric) | `node.operator` (string, e.g. `'+'`) |
| Assignment | `BinaryExpression` with `EqualsToken` | `AssignmentExpression` (separate node type) |
| Postfix `i++` | `PostfixUnaryExpression` | `UpdateExpression` |
| Parenthesized | `ParenthesizedExpression` | Does not exist (structural) |
| Arrow function | `ts.isArrowFunction(node)` | `node.type === 'ArrowFunctionExpression'` |
| Destructured param | `ts.isObjectBindingPattern` | `node.type === 'ObjectPattern'` |
| Variable kind | `declarationList.flags & NodeFlags.Let` | `node.kind === 'let'` or `'const'` |
| Literals | Separate `NumericLiteral`, `TrueKeyword`, `FalseKeyword` | Unified `Literal` with `typeof value` |
| Type annotations | Present (but stripped by esbuild) | Not present |

Operator mapping: `===` → `==`, `!==` → `!=`. All other operators pass through as strings matching `BinaryOp`.

## Error Quality Requirements

**This is runtime production infrastructure. Users will see these errors.** Every failure mode must produce a structured diagnostic with:

1. **Source position** — line and column from the ESTree node's `loc` field (acorn populates this when `locations: true` is passed)
2. **Human-readable message** — what went wrong, in terms the DSL author understands
3. **Context** — what was expected vs what was found

The walker MUST NOT throw bare `new Error()` messages. It MUST return a result type:

```typescript
interface WalkerResult {
  stmts: StatementIR[];
  diagnostics: WalkerDiagnostic[];
}

interface WalkerDiagnostic {
  severity: 'error' | 'warning';
  line: number;
  column: number;
  message: string;
  source?: string;  // the source text snippet, if available
}
```

If `diagnostics` contains any errors, the pipeline stops. The DSL editor shows the diagnostics with source positions. The user never sees "Unsupported expression: MemberExpression."

### Error examples — what users should see

| Bad DSL input | Error message |
|--------------|---------------|
| `$domains.tri.color_z[0]` | `Line 3, col 6: Field 'color_z' does not exist on domain 'tri'. Available fields: color_r, color_g, color_b` |
| `sin(x, y)` | `Line 5, col 2: sin() expects 1 argument, got 2` |
| `foo(x)` | `Line 4, col 2: Unknown function 'foo'. Did you mean: sin, cos, tan, ...?` |
| `$global.nonexistent` | `Line 2, col 14: Global 'sys:nonexistent' not in manifest. Available globals: sys:time` |
| `let x = ;` | `Line 3, col 8: Unexpected token (acorn parse error)` |
| `$domains.tri.pos_x = 1.0` | `Line 6, col 2: Cannot assign to domain field without index. Use $domains.tri.pos_x[idx] = ...` |

### Three layers of error reporting

| Layer | When | Source | Error format |
|-------|------|--------|-------------|
| **acorn parse** | Source text is not valid JS | `acorn.parse()` throws | Catch, wrap with source position → `WalkerDiagnostic` |
| **Walker transform** | Valid JS but unrecognized/invalid DSL pattern | Walker encounters unsupported ESTree node | Accumulate `WalkerDiagnostic` with node `loc` |
| **Zod validation** | Valid IR but semantic cross-reference failure | `PipelineInstallPayloadSchema.safeParse()` | Zod issues with paths → displayed in status bar |

All three produce structured diagnostics. None throws bare exceptions. The user sees a unified error experience regardless of which layer caught the problem.

## Hard Constraints

These are NON-NEGOTIABLE. Deviation is a bug.

1. **MUST unify IR walkers.** After this migration, `deps.ts` and `boundary-contract.ts` MUST both use the shared `walkIR` function from `ir-node-rules.ts`. They MUST NOT have their own recursion logic. The `validatePayloadSemantics` function in `boundary-contract.ts` MUST be rewritten to use `walkIR` with a validation visitor — it MUST NOT keep its own inline walker that happens to import the tables. ONE walker, multiple visitors.

2. **MUST produce structured diagnostics.** The walker MUST NOT throw `new Error()` for user-facing failures. It MUST return `{ stmts, diagnostics }`. acorn parse errors MUST be caught and wrapped into the same diagnostic format.

3. **MUST NOT read legacy code.** See Allowed Files Scope below.

4. **MUST preserve identical IR output.** The acorn walker MUST produce byte-for-byte identical ExprIR/StatementIR as the current TS-compiler walker for all inputs. Dual-walker equivalence tests MUST verify this before the swap.

5. **MUST rename `walker-acorn.ts` → `walker.ts` after swap.** Do not leave `-acorn` in the final filename. The implementation detail of which parser is used should not leak into the module name.

6. **acorn MUST be a direct dependency, pinned.** Not relied upon as a transitive dep. `npm install acorn` with an exact version.

## Migration Plan

### Phase 1: Extract ir-node-rules.ts + unify IR walkers

**Step 1 — Install dependencies**

```bash
npm install acorn
npm install --save-dev @types/estree
```

**Step 2 — Create `src/render/gpu-ir/ir-node-rules.ts`**

Extract from `boundary-contract.ts`:
- `RefCheck` type, `ExprRule`/`StmtRule` interfaces
- `EXPR_RULES` table (`Record<ExprIR['type'], ExprRule>` — exhaustive)
- `STMT_RULES` table (`Record<StatementIR['type'], StmtRule>` — exhaustive)
- `BUILTIN_ARG_COUNTS` table (`Record<BuiltinMathFunc, number>` — exhaustive)
- `FRAGMENT_ONLY_BUILTINS` set

Add generic walker:
- `IRVisitor` interface: `{ onExpr?(expr, rule, path), onStmt?(stmt, rule, path) }`
- `walkIR(stmts, visitor)` — entry point, iterates + recurses using rule tables
- Recursion driven entirely by `rule.children`, `rule.childArrays`, `rule.stmtChildren`, `rule.stmtChildArrays`, `rule.exprRecords` — no switch/case in the walker itself

**Step 3 — Rewrite `boundary-contract.ts` `validatePayloadSemantics`**

Replace the inline walker with a `walkIR` call. The validation visitor receives each node + its rule, checks refs against manifest lookups, calls `ctx.addIssue()`. The function body shrinks from ~120 lines to ~30 lines (manifest setup + walkIR call with visitor).

**Step 4 — Rewrite `deps.ts`**

Replace the `DepCollector` class with a `walkIR` visitor:
```typescript
walkIR(stmts, {
  onExpr(e) {
    if (e.type === 'LoadGlobal') usesGlobals = true;
    // ... collect refs
  },
  onStmt(s) {
    if (s.type === 'StoreField') domainWrites.add(extractDomain(s.symbolId));
    // ... collect refs
  },
});
```

Public API (`inferComputeDeps`, `inferDrawCallDeps`) unchanged.

**Step 5 — Run tests**

`npm run test` — gate0 must pass. `npm run typecheck` — clean. No behavioral changes — only structural refactoring.

### Phase 2: Create acorn walker

**Step 6 — Create `src/render/gpu-ir/walker-acorn.ts`**

Same public API but returns structured result:
```typescript
export function compileShaderBody(fn: Function, ctx: ShaderContext): WalkerResult
```

Where `WalkerResult = { stmts: StatementIR[], diagnostics: WalkerDiagnostic[] }`.

Parsing: `acorn.parse(source, { ecmaVersion: 2022, locations: true })` → find `ArrowFunctionExpression`.

`locations: true` is required — every ESTree node gets a `loc: { start: { line, column }, end: { line, column } }` field. The walker uses this for diagnostic source positions.

Error handling: acorn parse errors are caught and converted to `WalkerDiagnostic`. Walker transform errors are accumulated (not thrown) with the node's source position.

**Step 7 — Update `compile.ts` for `WalkerResult`**

`compile.ts` currently expects `compileShaderBody` to return `StatementIR[]`. Update it to handle `WalkerResult` — check diagnostics, propagate errors to the caller. The `gpu()` function should return errors instead of throwing if the walker produces diagnostics.

**Step 8 — Create `src/render/gpu-ir/__tests__/walker-acorn.test.ts`**

Unit tests covering every pattern:
- Literals (f32, u32 index, i32, bool, negative)
- $-chain resolution (all well-known patterns: `$global`, `$scalar`, `$domains`, `$thread`, `$instance`, `$vertex`)
- Binary ops (arithmetic, comparison, logical, bitwise, `===`→`==` mapping)
- Unary ops (`-`, `!`, `~`, negative-literal optimization)
- Calls (builtins, casts with literal optimization, constructors)
- Swizzle fallback (`position.xy`)
- Control flow (for with `UpdateExpression`, if/else, break, continue)
- Declarations (const→Let, let→Var)
- Assignments (local, `$scalar`, `$domains` field, `$domains.$active`)
- Returns (vertex with varyings, fragment with outputs, shorthand properties)
- Free variables → NaN placeholder
- Object destructuring params
- **Error diagnostics**: bad field name → diagnostic with line/col, unknown function → diagnostic, missing index → diagnostic

**Dual-walker equivalence test** (temporary): Import both old and new walker, run same arrow functions through both, assert `deepEqual` on the `stmts` output (ignore diagnostics since old walker throws instead).

**Step 9 — Run tests**

All walker-acorn tests + gate0 must pass.

### Phase 3: Swap and clean up

**Step 10 — Swap import in `compile.ts`**

`import { compileShaderBody, type ShaderContext, type WalkerResult } from './walker-acorn';`

**Step 11 — Run all tests**

`npm run test` — gate0 exercises the new walker through the full pipeline.

**Step 12 — Delete old walker, rename new**

- Delete `walker.ts` (old TS-compiler-based walker)
- Rename `walker-acorn.ts` → `walker.ts`
- Update import in `compile.ts`
- Delete dual-walker equivalence test
- `typescript` stays as devDependency (used by tsc). The runtime `import ts` is gone.

**Step 13 — Verify**

- `npm run test` — all pass
- `npm run typecheck` — clean
- `npm run build` — payload-tester chunk should drop from ~3.6MB to ~700KB
- Visual verification in payload tester — same rendering output

## What the Zod schemas would cover (ESTree pattern table)

For reference, these are the ESTree patterns the acorn walker must handle. Each maps to an IR construction via `ir-builders`:

| ESTree Pattern | IR Output |
|---------------|-----------|
| `$global.X` → `MemberExpression { object: Identifier('$global'), property: Identifier }` | `LoadGlobal('sys:' + name)` |
| `$scalar.X` → `MemberExpression { object: Identifier('$scalar'), ... }` | `LoadScalar('sys:' + name)` |
| `$domains.D.F[idx]` → chained `MemberExpression` + computed access | `LoadField('D:F', idx)` / `StoreField` |
| `$domains.D.$active` → `MemberExpression` with `$active` property | `LoadScalar / StoreScalar` via domain's `activeLanesSymbol` |
| `$thread.x/y/z` → `MemberExpression { object: Identifier('$thread') }` | `Intrinsic('global_invocation_id.x/y/z')` |
| `$instance.index` | `Intrinsic('instance_index')` |
| `$vertex.index` | `Intrinsic('vertex_index')` |
| `sin(x)` → `CallExpression { callee: Identifier(BUILTIN) }` | `CallBuiltin(name, args)` |
| `f32(x)` → `CallExpression { callee: Identifier(CAST) }` | `Cast(name, expr)` — optimize literal args |
| `vec4(a,b,c,d)` → `CallExpression { callee: Identifier(CONSTRUCT) }` | `Construct(wgslType, args)` |
| `a + b` → `BinaryExpression` | `BinaryOp(op, left, right)` |
| `-x` → `UnaryExpression` | `UnaryOp('-', expr)` — optimize negative literals |
| `const x = expr` → `VariableDeclaration { kind: 'const' }` | `Let(name, expr)` |
| `let x = expr` → `VariableDeclaration { kind: 'let' }` | `Var(name, expr)` |
| `x = expr` → `AssignmentExpression` with `Identifier` LHS | `Assign(VarRef, expr)` |
| `$domains.D.F[idx] = expr` → `AssignmentExpression` with chained LHS | `StoreField(symbolId, idx, expr)` |
| `$scalar.X = expr` / `$domains.D.$active = expr` | `StoreScalar(symbolId, expr)` |
| `return vertex(pos, { varyings })` → `ReturnStatement` | `ReturnVertex(pos, varyings)` |
| `return fragment({ outputs })` → `ReturnStatement` | `ReturnFragment(outputs)` |
| `position.xy` → `MemberExpression` (not $-prefixed) | `Swizzle(source, mask)` |
| `for (...) { ... }` → `ForStatement` | `For(init, cond, update, body)` |
| `if (...) { ... }` → `IfStatement` | `If(cond, accept, reject)` |
| `break` / `continue` | `Break` / `Continue` |

## Future: IR → DSL Reverse Translation

The unified `walkIR` function enables a reverse translator (IR → DSL text) as a visitor:

```typescript
walkIR(stmts, {
  onExpr(expr, rule, path) {
    // Emit DSL text representation of this expression
  },
  onStmt(stmt, rule, path) {
    // Emit DSL text representation of this statement
  },
});
```

This is a pretty-printer, not a parser. No acorn needed. It uses the same `ir-node-rules.ts` tables and `walkIR` function, just with a string-emission visitor instead of a validation or collection visitor. This makes the DSL truly bijective: `DSL text ↔ ExprIR/StatementIR`.

## Files Modified

| File | Action |
|------|--------|
| `src/render/gpu-ir/ir-node-rules.ts` | **CREATE** — extracted rule tables + shared `walkIR` |
| `src/render/gpu-ir/walker-acorn.ts` | **CREATE** → renamed to `walker.ts` after swap |
| `src/render/gpu-ir/__tests__/walker-acorn.test.ts` | **CREATE** — unit tests + dual-walker equivalence |
| `src/render/rust/boundary-contract.ts` | **MODIFY** — import tables, rewrite `validatePayloadSemantics` to use `walkIR` |
| `src/render/gpu-ir/deps.ts` | **REWRITE** — use `walkIR` visitor |
| `src/render/gpu-ir/compile.ts` | **MODIFY** — handle `WalkerResult`, swap walker import |
| `src/render/gpu-ir/walker.ts` | **DELETE** (old TS-compiler walker) |
| `package.json` | **MODIFY** — add acorn (pinned), @types/estree (dev) |

Files UNCHANGED: `ir-builders.ts`, `types.ts`, `shapes.ts`, `manifest.ts`, `index.ts`, all Zod schema definitions in boundary-contract.ts, dsl-eval.ts, payload tester UI components.

## Bundle Size Impact

| Component | Before | After |
|-----------|--------|-------|
| TypeScript compiler (runtime) | ~3MB | removed |
| acorn parser | 0 (transitive only) | ~80KB (explicit, pinned) |
| ir-node-rules.ts | 0 | ~3KB |
| **Net payload-tester chunk** | **~3.6MB** | **~700KB** |

Production bundle (main app) impact depends on whether DSL authoring is included in the main entry point or lazy-loaded. If lazy-loaded, acorn only loads when the DSL editor opens.

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

## Risks

| Risk | Mitigation |
|------|-----------|
| acorn doesn't parse some JS syntax we need | acorn supports ES2022+; all patterns in our walker are standard JS. Test each pattern individually. |
| Dual walker during migration | Phase 2 equivalence tests prove identical output before Phase 3 swaps. Never ship both. |
| acorn version compatibility | Pin exact version. acorn's ESTree output is stable — the spec hasn't changed in years. |
| `walkIR` visitor API too simple for future needs | Visitor receives the node AND its rule. Can always extend the visitor interface without changing the walker. |
| Walker diagnostics change error behavior | Old walker threw; new walker accumulates. `compile.ts` must check diagnostics and propagate. Test that errors still prevent installation. |

## Dependencies on Other Work

- **ir-node-rules.ts extraction** — happens AS PART of this migration (Phase 1). Not a separate task. Extract tables, add `walkIR`, rewire both consumers.
- **Gate 1-8 walker expansion** — if done before this migration, each gate adds cases to the old walker AND the new walker during Phase 2. If done after, each gate only adds to the acorn walker. **Recommendation: do this migration before expanding gates**, to avoid double-implementing each pattern.
- **Rust catch_unwind** — independent, defense-in-depth regardless of which parser the walker uses.
- **IR → DSL reverse translator** — enabled by this migration (uses `walkIR` with a printer visitor). Can be built after this migration completes.

## Verification Checklist

1. `npm run test` — gate0-hello-triangle round-trip passes at EVERY phase boundary
2. `npm run typecheck` — no type errors
3. `npm run build` — builds successfully, payload-tester chunk ≤ 800KB
4. Dual-walker equivalence test proves identical `StatementIR[]` output for all test inputs
5. Walker produces `WalkerDiagnostic` (not throws) for: unknown function, bad field name, missing index, acorn parse error
6. `boundary-contract.ts` `validatePayloadSemantics` uses `walkIR` — grep confirms no inline `switch` on `expr.type` or `stmt.type`
7. `deps.ts` uses `walkIR` — grep confirms no inline `switch` on `expr.type` or `stmt.type`
8. Visual verification in payload tester — same rendering output for hello-triangle fixture
