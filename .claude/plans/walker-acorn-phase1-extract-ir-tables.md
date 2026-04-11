# Phase 1: Extract `ir-node-rules.ts` + Unify IR Walkers

## Goal
Extract shared data-driven IR tables and a generic walker from duplicated logic in `boundary-contract.ts` and `deps.ts`. No behavior changes — structural refactoring only.

## Context
Two modules (`deps.ts` and `boundary-contract.ts`) independently walk ExprIR/StatementIR trees with duplicated recursion logic. This phase extracts that into a single source of truth with bidirectional tables (forward walker + future reverse translator read the same tables).

## Steps

### Step 1 — Install dependencies
```bash
npm install acorn --save-exact
npm install --save-dev @types/estree
```

### Step 2 — Create `src/render/gpu-ir/ir-node-rules.ts`

Single source of truth for all DSL ↔ IR mappings. Four groups:

**Group A — IR node structure (from boundary-contract.ts lines 370-454):**
- Types: `RefCheck`, `ExprRule`, `StmtRule` (verbatim)
- `EXPR_RULES: Record<ExprIR['type'], ExprRule>` — exhaustive, 20 variants
- `STMT_RULES: Record<StatementIR['type'], StmtRule>` — exhaustive, 14 variants
- `BUILTIN_ARG_COUNTS: Record<BuiltinMathFunc, number>` — 32 entries
- `FRAGMENT_ONLY_BUILTINS: Set<string>` — `dpdx`, `dpdy`, `fwidth`

**Group B — DSL symbol mappings (from walker.ts, made bidirectional):**
- `BUILTIN_NAMES: Set<string>` — all known builtin function names
- `CAST_NAMES: Set<string>` — `f32`, `u32`, `i32`
- `CONSTRUCT_MAP: Record<string, WgslType>` — DSL name → WgslType (`vec4` → `vec4<f32>`)
- `CONSTRUCT_INVERSE: Record<WgslType, string>` — WgslType → DSL name — derived from CONSTRUCT_MAP

**Group C — $-chain resolution (from walker.ts, made declarative):**
```typescript
const THREAD_MAP: Record<string, string> = {
  x: 'global_invocation_id.x', y: 'global_invocation_id.y', z: 'global_invocation_id.z',
};
const INSTANCE_MAP: Record<string, string> = { index: 'instance_index' };
const VERTEX_MAP: Record<string, string> = { index: 'vertex_index' };

export const DOLLAR_CHAIN_RULES = {
  $global:   { resolve: (prop: string) => `sys:${prop}`, irType: 'LoadGlobal' as const, field: 'symbolId' as const },
  $scalar:   { resolve: (prop: string) => `sys:${prop}`, irType: 'LoadScalar' as const, field: 'symbolId' as const },
  $thread:   { resolve: (prop: string) => THREAD_MAP[prop], irType: 'Intrinsic' as const, field: 'name' as const },
  $instance: { resolve: (prop: string) => INSTANCE_MAP[prop], irType: 'Intrinsic' as const, field: 'name' as const },
  $vertex:   { resolve: (prop: string) => VERTEX_MAP[prop], irType: 'Intrinsic' as const, field: 'name' as const },
} as const;

export const WELL_KNOWN_ROOTS = new Set(['$global', '$scalar', '$domains', '$thread', '$instance', '$vertex']);
```

Note: `$domains.D.F[idx]` and `$domains.D.$active` are multi-level chains needing manifest context. Stay procedural in the walker; pattern documented for reverse translator.

**Group D — Operator mappings (bidirectional, with precedence):**
```typescript
export const ESTREE_TO_BINOP: Record<string, BinaryOp> = {
  '===': '==', '!==': '!=',
};

export const BINOP_TO_JS: Record<BinaryOp, string> = {
  '==': '===', '!=': '!==',
  '+': '+', '-': '-', '*': '*', '/': '/', '%': '%',
  '<': '<', '>': '>', '<=': '<=', '>=': '>=',
  '&&': '&&', '||': '||',
  '&': '&', '|': '|', '^': '^', '<<': '<<', '>>': '>>',
};

export const BINOP_PRECEDENCE: Record<BinaryOp, number> = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5,
  '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
  '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
```

**Generic walker (for observe + accumulate patterns):**
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

Walker implementation:
- Pre-order traversal: call `onStmt`/`onExpr` before recursing into children
- Recursion driven entirely by rule table fields (`children`, `childArrays`, `stmtChildren`, `stmtChildArrays`, `exprRecords`)
- No switch/case — tables encode recursion structure
- Guard `if (child !== undefined)` before recursing single children (handles `Var.value` being optional)
- `basePath` prepended to all paths (default: `[]`)

**Design note:** walkIR is for validation and dependency collection (observe + accumulate). The future reverse translator needs a *fold* pattern (children return strings, parent composes) — it will be its own recursive function reading the same tables, not a walkIR visitor.

### Step 3 — Rewrite `boundary-contract.ts` `validatePayloadSemantics`

**Delete** lines 370-454 (rule types + tables + helpers).

**Add import:**
```typescript
import {
  EXPR_RULES, STMT_RULES, BUILTIN_ARG_COUNTS, FRAGMENT_ONLY_BUILTINS,
  walkIR, type RefCheck,
} from '../gpu-ir/ir-node-rules';
```

**Replace** inline `validateExpr`/`validateStmt`/`validateStmts` with walkIR calls:
```typescript
// Old: validateStmts(entry.ast, [...bp, 'ast'], 'compute');
// New: walkIR(entry.ast, makeValidationVisitor('compute'), [...bp, 'ast']);
```

The validation visitor:
- `onExpr`: checks refs via `rule.refs` against manifest lookups, checks `builtinArgCount`/`fragmentOnly` specials
- `onStmt`: checks refs via `rule.refs` against manifest lookups
- `stage` captured in closure — not part of walkIR
- `lookups`, `issue()` captured from enclosing `validatePayloadSemantics` scope

Manifest setup code (lines 464-496) and roster entry validation loop (lines 578-613) stay **unchanged**.

### Step 4 — Rewrite `deps.ts`

**Delete** `DepCollector` class (lines 59-154).

**Replace** with closure-based visitor:
```typescript
import { walkIR } from './ir-node-rules';

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

Public API (`inferComputeDeps`, `inferDrawCallDeps`) unchanged. `extractDomain()` stays in deps.ts.

### Step 5 — Verify Phase 1
```bash
npm run typecheck && npm run test
```
Gate0 must pass — structural refactoring only, no behavior changes.

## Verification Checklist
- [ ] `npm run typecheck` — no type errors
- [ ] `npm run test` — all tests pass
- [ ] `boundary-contract.ts` — grep confirms no inline `switch` on `expr.type` or `stmt.type`
- [ ] `deps.ts` — grep confirms no inline `switch` on `expr.type` or `stmt.type`

## Files Modified

| File | Action |
|------|--------|
| `src/render/gpu-ir/ir-node-rules.ts` | **CREATE** — IR rule tables + DSL symbol mappings + operator tables + walkIR |
| `src/render/rust/boundary-contract.ts` | **MODIFY** — import tables, rewrite validatePayloadSemantics |
| `src/render/gpu-ir/deps.ts` | **REWRITE** — use walkIR visitor |
| `package.json` | **MODIFY** — add acorn (pinned), @types/estree (dev) |

## Downstream Contracts — DO NOT CHANGE

Phase 2 and Phase 3 depend on the following. Changing any of these requires updating the downstream plans.

### ir-node-rules.ts export surface (consumed by Phase 2's walker-acorn.ts)

Phase 2 imports these **exact names** from `./ir-node-rules`. Do not rename, remove, or change their types:

```typescript
// Group B — walker-acorn.ts imports these
BUILTIN_NAMES: Set<string>
CAST_NAMES: Set<string>
CONSTRUCT_MAP: Record<string, WgslType>

// Group C — walker-acorn.ts imports these
DOLLAR_CHAIN_RULES   // exact shape: Record<string, { resolve, irType, field }>
WELL_KNOWN_ROOTS: Set<string>

// Group D — walker-acorn.ts imports these
ESTREE_TO_BINOP: Record<string, BinaryOp>
```

### ir-node-rules.ts export surface (consumed by boundary-contract.ts and deps.ts within THIS phase)

These are also consumed by the future reverse translator, so they must remain stable:

```typescript
// Group A
EXPR_RULES: Record<ExprIR['type'], ExprRule>
STMT_RULES: Record<StatementIR['type'], StmtRule>
BUILTIN_ARG_COUNTS: Record<BuiltinMathFunc, number>
FRAGMENT_ONLY_BUILTINS: Set<string>
type RefCheck, ExprRule, StmtRule

// Walker
IRVisitor   // interface with onExpr?, onStmt?
walkIR()    // signature: (stmts, visitor, basePath?) => void
```

### Files that must still exist after Phase 1

Phase 2 needs the **old** `src/render/gpu-ir/walker.ts` to still exist (for dual-walker equivalence testing). Do NOT delete it in this phase.

### compile.ts import path

Phase 2 will change `compile.ts` to import from `./walker-acorn`. Do NOT change compile.ts's walker import in this phase — leave it importing from `./walker`.

## Key Design Decisions
1. **Bidirectional tables.** Every DSL ↔ IR mapping includes both forward and inverse directions. [LAW:one-source-of-truth]
2. **walkIR is for observe+accumulate, not fold.** Reverse translator will be its own fold function reading the same tables.
3. **walkIR passes `path` and accepts `basePath`.** Boundary-contract needs paths for `ctx.addIssue()`. Deps ignores them.
4. **Stage is closure state, not walkIR concern.** Only validation needs stage for fragment-only builtin checks.
5. **`extractDomain()` stays in deps.ts.** Domain symbol ID parsing is domain convention, not IR structure.
