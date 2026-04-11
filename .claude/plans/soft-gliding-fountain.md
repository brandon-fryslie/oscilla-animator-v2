# Phase 1: Extract `ir-node-rules.ts` + Unify IR Walkers

## Context

Two modules (`boundary-contract.ts` lines 370-614 and `deps.ts` lines 59-154) independently walk ExprIR/StatementIR trees with duplicated recursion logic. `boundary-contract.ts` already has the right abstraction (data-driven rule tables), while `deps.ts` uses exhaustive switch/case. This phase extracts the tables into a shared module and replaces both walkers with a single generic `walkIR`.

No behavior changes — structural refactoring only.

## Step 1 — Install dependencies

```bash
npm install acorn --save-exact
npm install --save-dev @types/estree
```

These are needed by Phase 2 (acorn walker), but the plan specifies installing them now.

## Step 2 — Create `src/render/gpu-ir/ir-node-rules.ts`

New file. Single source of truth for IR structure tables, DSL symbol mappings, operator tables, and generic walker.

**Imports from** `../rust/boundary-contract`: `ExprIR`, `StatementIR`, `BuiltinMathFunc`, `BinaryOp`, `WgslType` (all types).

### Group A — IR node structure tables

Move verbatim from `boundary-contract.ts` lines 376-454:
- `RefCheck` type
- `ExprRule` interface
- `StmtRule` interface
- `BUILTIN_ARG_COUNTS` constant (32 entries)
- `FRAGMENT_ONLY_BUILTINS` constant
- `EXPR_RULES` constant (20 variants)
- `STMT_RULES` constant (14 variants)

All exported.

### Group B — DSL symbol mappings (from walker.ts, made bidirectional)

Move from `walker.ts` lines 38-57, add inverse:
- `BUILTIN_NAMES: Set<string>` — 36 entries
- `CAST_NAMES: Set<string>` — `f32`, `u32`, `i32`
- `CONSTRUCT_MAP: Record<string, WgslType>` — 9 entries
- `CONSTRUCT_INVERSE: Record<WgslType, string>` — derived from CONSTRUCT_MAP via `Object.entries().reduce()`

### Group C — $-chain resolution (from walker.ts, made declarative)

Extract from walker.ts `tryResolveDollarChain` logic (lines ~395-449):
- `THREAD_MAP`, `INSTANCE_MAP`, `VERTEX_MAP` (private constants)
- `DOLLAR_CHAIN_RULES` — declarative record mapping `$global`/`$scalar`/`$thread`/`$instance`/`$vertex` to `{ resolve, irType, field }`
- `WELL_KNOWN_ROOTS: Set<string>` — moved from walker.ts line 57

Note: `$domains` chains require manifest context and stay procedural in walker.ts.

### Group D — Operator mappings (bidirectional, with precedence)

New tables (not currently extracted from either file — walker.ts uses TS SyntaxKind enum):
- `ESTREE_TO_BINOP: Record<string, BinaryOp>` — `'==='` → `'=='`, `'!=='` → `'!='`
- `BINOP_TO_JS: Record<BinaryOp, string>` — inverse + identity for all 17 ops
- `BINOP_PRECEDENCE: Record<BinaryOp, number>` — 13 precedence levels

### Generic walkIR

```typescript
export interface IRVisitor {
  onExpr?: (expr: ExprIR, rule: ExprRule, path: readonly (string | number)[]) => void;
  onStmt?: (stmt: StatementIR, rule: StmtRule, path: readonly (string | number)[]) => void;
}

export function walkIR(
  stmts: readonly StatementIR[],
  visitor: IRVisitor,
  basePath?: readonly (string | number)[],
): void
```

Implementation:
- Two internal functions: `walkExpr(expr, path)` and `walkStmt(stmt, path)`
- Pre-order: call visitor callback, then recurse children
- Recursion driven entirely by rule table fields — no switch/case
- `rule.children`: guard `if (child !== undefined)` before recursing (handles `Var.value` optional)
- `rule.childArrays`: iterate array, recurse each
- `rule.stmtChildren`/`stmtChildArrays`: same for statements
- `rule.exprRecords`: iterate `Object.entries()`, recurse each value
- `basePath` defaults to `[]`, prepended to all paths
- Top-level: iterate stmts array with index in path

## Step 3 — Rewrite `boundary-contract.ts` validation

**Delete** lines 370-454 (RefCheck, ExprRule, StmtRule, BUILTIN_ARG_COUNTS, FRAGMENT_ONLY_BUILTINS, EXPR_RULES, STMT_RULES).

**Add import:**
```typescript
import {
  EXPR_RULES, STMT_RULES, BUILTIN_ARG_COUNTS, FRAGMENT_ONLY_BUILTINS,
  walkIR, type RefCheck, type ExprRule, type StmtRule,
} from '../gpu-ir/ir-node-rules';
```

**Replace** `validateExpr`, `validateStmt`, `validateStmts` (lines 500-575) with a single walkIR call using a validation visitor factory:

```typescript
function makeValidationVisitor(stage: Stage): IRVisitor {
  return {
    onExpr(expr, rule, path) {
      // ref checks (same logic as current validateExpr lines 504-510)
      // special: builtinArgCount + fragmentOnly (same as lines 512-521)
    },
    onStmt(stmt, rule, path) {
      // ref checks (same logic as current validateStmt lines 538-544)
    },
  };
}
```

Then replace each `validateStmts(entry.ast, [...bp, 'ast'], 'compute')` call with:
```typescript
walkIR(entry.ast, makeValidationVisitor('compute'), [...bp, 'ast']);
```

The roster validation loop (lines 577-613) stays unchanged — only the AST walking calls change.

**Key detail:** `lookups`, `issue()`, `REF_LABELS` remain as closure state in `validatePayloadSemantics`. The visitor factory captures them. `stage` is the factory parameter.

## Step 4 — Rewrite `deps.ts`

**Delete** `DepCollector` class (lines 59-154).

**Replace** with closure-based `collectDeps` function using walkIR:

```typescript
function collectDeps(stmts: readonly StatementIR[]) {
  let usesGlobals = false;
  const domainReads = new Set<string>();
  const domainWrites = new Set<string>();
  const textureReads = new Set<string>();
  const textureWrites = new Set<string>();

  walkIR(stmts, {
    onExpr(e) {
      if (e.type === 'LoadGlobal') usesGlobals = true;
      if (e.type === 'LoadField') domainReads.add(extractDomain(e.symbolId));
      if (e.type === 'AtomicLoadField') domainReads.add(extractDomain(e.symbolId));
      if (e.type === 'TextureSample') textureReads.add(e.textureId);
      if (e.type === 'TextureLoad') textureReads.add(e.textureId);
    },
    onStmt(s) {
      if (s.type === 'StoreField') domainWrites.add(extractDomain(s.symbolId));
      if (s.type === 'AtomicOpField') domainWrites.add(extractDomain(s.symbolId));
      if (s.type === 'TextureStore') textureWrites.add(s.textureId);
    },
  });

  return { usesGlobals, domainReads, domainWrites, textureReads, textureWrites };
}
```

Public API (`inferComputeDeps`, `inferDrawCallDeps`) unchanged — they call `collectDeps` instead of `new DepCollector`.

`computeDomainAccess()` and `computeTextureAccess()` logic moves into the public functions (merge reads/writes into access level records).

`extractDomain()` stays in deps.ts.

## Step 5 — Verify

```bash
npm run typecheck && npm run test
```

## Files Modified

| File | Action |
|------|--------|
| `src/render/gpu-ir/ir-node-rules.ts` | **CREATE** |
| `src/render/rust/boundary-contract.ts` | **MODIFY** — delete tables, import from ir-node-rules, replace inline walkers with walkIR |
| `src/render/gpu-ir/deps.ts` | **REWRITE** — replace DepCollector with walkIR-based collectDeps |
| `package.json` | **MODIFY** — add acorn + @types/estree |

## DO NOT change

- `src/render/gpu-ir/walker.ts` — Phase 2 needs it for dual-walker equivalence testing
- `src/render/gpu-ir/compile.ts` — Phase 2 changes its walker import
- Any test files — behavior is unchanged

## Verification Checklist

- `npm run typecheck` passes
- `npm run test` passes (gate0 hello-triangle test is the key one)
- `grep -n 'switch.*\.type' src/render/rust/boundary-contract.ts` — no inline switches on expr/stmt type
- `grep -n 'switch.*\.type' src/render/gpu-ir/deps.ts` — no inline switches on expr/stmt type
- `EXPR_RULES` and `STMT_RULES` are exhaustive (Record<ExprIR['type'],...> enforces at compile time)
