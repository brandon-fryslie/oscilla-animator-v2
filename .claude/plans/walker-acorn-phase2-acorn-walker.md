# Phase 2: Create Acorn Walker

## Goal
Replace the TypeScript compiler API (~3MB) walker with an acorn-based (~80KB) walker that produces identical StatementIR[] output, plus structured diagnostics instead of thrown errors.

## Context
Depends on Phase 1 completion (ir-node-rules.ts extracted, walkIR available). The existing walker uses `ts.createSourceFile` + TS AST traversal to parse `fn.toString()` output. Since esbuild strips type annotations before runtime, we only need basic JS parsing — acorn suffices.

## Steps

### Step 6 — Create `src/render/gpu-ir/walker-acorn.ts`

**Public API (same shape, structured result):**
```typescript
export type ShaderStage = 'compute' | 'vertex' | 'fragment';
export interface ShaderContext { readonly stage: ShaderStage; readonly manifest: MemoryManifest; }

export interface WalkerDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly source?: string;
}

export interface WalkerResult {
  readonly stmts: StatementIR[];
  readonly diagnostics: readonly WalkerDiagnostic[];
}

export function compileShaderBody(fn: Function, ctx: ShaderContext): WalkerResult
```

**Entry point:**
- `acorn.parse(fn.toString(), { ecmaVersion: 2022, locations: true })` — parses as Program
- `findArrow(program)` — walk ESTree to find first `ArrowFunctionExpression`
- Collect param names from `arrow.params` (handle `Identifier` + `ObjectPattern`)
- Walk body: `BlockStatement` → `walkBlock()`, otherwise → `walkReturnExpr()`
- acorn parse errors caught and wrapped into `WalkerDiagnostic`

**Imports from ir-node-rules.ts** (NOT defined locally):
```typescript
import {
  BUILTIN_NAMES, CAST_NAMES, CONSTRUCT_MAP,
  DOLLAR_CHAIN_RULES, WELL_KNOWN_ROOTS,
  ESTREE_TO_BINOP,
} from './ir-node-rules';
```

**ESTree → IR mapping (key differences from TS AST):**

| TS AST | ESTree (acorn) | Notes |
|--------|----------------|-------|
| `ts.isNumericLiteral(n)` | `n.type === 'Literal' && typeof n.value === 'number'` | |
| `ts.SyntaxKind.TrueKeyword` | `n.type === 'Literal' && n.value === true` | Unified `Literal` node |
| `ts.isParenthesizedExpression(n)` | N/A | ESTree has no wrapper — structural |
| `ts.isPropertyAccessExpression(n)` | `n.type === 'MemberExpression' && !n.computed` | Unified with element access |
| `ts.isElementAccessExpression(n)` | `n.type === 'MemberExpression' && n.computed` | |
| `ts.isBinaryExpression(n) + EqualsToken` | `n.type === 'AssignmentExpression'` | Separate node type in ESTree |
| `ts.isPostfixUnaryExpression(n)` (`i++`) | `n.type === 'UpdateExpression'` | |
| `binaryTokenToOp(ts.SyntaxKind.X)` | `ESTREE_TO_BINOP[node.operator] ?? node.operator` | Table lookup, not switch |
| `typeAnnotationToWgsl(typeNode)` | N/A | esbuild strips annotations; always `undefined` at runtime |

**Operator mapping:** Uses `ESTREE_TO_BINOP` from ir-node-rules.ts. For ESTree operators not in the table (the majority), pass through directly — they already match `BinaryOp` strings. Only `===`→`==` and `!==`→`!=` need translation.

**Error handling — diagnostic accumulation:**
- Helper: `addError(ctx, node, message)` → pushes `WalkerDiagnostic` with `node.loc.start`
- On error, return sentinel `B.litF32(NaN)` for expressions so walk continues and accumulates multiple diagnostics
- Never throws `new Error()` for user-facing failures

**$-chain resolution:** Uses `DOLLAR_CHAIN_RULES` from ir-node-rules.ts for simple one-level chains (`$global.X`, `$scalar.X`, `$thread.x`, `$instance.index`, `$vertex.index`). Multi-level `$domains.D.F[idx]` and `$domains.D.$active` handled procedurally (need manifest context for `activeLanesSymbol` lookup). On error (e.g., unknown domain), push diagnostic instead of throwing.

### Step 7 — Update `compile.ts` for WalkerResult

During Phase 2, compile.ts imports from `./walker-acorn`. The `compileComputeEntry` and `compileRenderEntry` functions handle `WalkerResult`:

```typescript
const result = compileShaderBody(entry.bodyFn, ctx);
if (result.diagnostics.some(d => d.severity === 'error')) {
  const msgs = result.diagnostics.map(d => `${d.line}:${d.column}: ${d.message}`).join('\n');
  throw new Error(`Shader compilation failed:\n${msgs}`);
}
const ast = result.stmts;
```

`gpu()` continues to return `PipelineInstallPayload` and throw on errors — keeps existing public API. Structured error propagation is a follow-up.

### Step 8 — Create tests: `src/render/gpu-ir/__tests__/walker-acorn.test.ts`

**Unit tests covering every pattern:**
- Literals: f32, u32 (index context), i32, bool, negative literal optimization
- $-chain: all 7 well-known patterns + error case (domainField without index)
- Binary ops: arithmetic, comparison+logical, `===`→`==` mapping, bitwise
- Unary ops: `-x`, `!x`, `~x`, negative-literal optimization
- Calls: builtin, cast with literal opt, cast non-literal, constructor
- Swizzle: `position.xy`
- Control flow: for with `UpdateExpression`, if/else, break/continue
- Declarations: const→Let, let→Var
- Assignments: local, $scalar, $domains field, $domains.$active
- Returns: vertex with varyings (property + shorthand), fragment with outputs
- Free variables → NaN placeholder
- Object destructuring params
- Error diagnostics: unknown function, bad field name, acorn parse error — all produce `WalkerDiagnostic` with line/col

**Dual-walker equivalence test (temporary — deleted in Phase 3):**
- Import both old walker and new walker
- Run same arrow functions through both
- Assert `deepEqual` on `stmts` output (ignore diagnostics)
- Test cases: hello-triangle compute/vertex/fragment bodies, for-loop, if/else, bitwise ops

### Step 9 — Verify Phase 2
```bash
npm run typecheck && npm run test
```

## Verification Checklist
- [ ] `npm run typecheck` — no type errors
- [ ] `npm run test` — all tests pass (including new walker-acorn tests)
- [ ] Dual-walker equivalence test proves identical `StatementIR[]` output for all test cases
- [ ] Walker produces `WalkerDiagnostic` (not throws) for: unknown function, bad field name, missing index, acorn parse error
- [ ] `gpu()` continues to throw on errors (public API preserved)

## Files Modified

| File | Action |
|------|--------|
| `src/render/gpu-ir/walker-acorn.ts` | **CREATE** — acorn-based walker |
| `src/render/gpu-ir/__tests__/walker-acorn.test.ts` | **CREATE** — unit tests + dual-walker equivalence |
| `src/render/gpu-ir/compile.ts` | **MODIFY** — handle WalkerResult from walker-acorn |

## Upstream Contracts — What Phase 1 Provides

This phase depends on Phase 1 having created these. Do NOT recreate or duplicate them:

- `src/render/gpu-ir/ir-node-rules.ts` with exports: `BUILTIN_NAMES`, `CAST_NAMES`, `CONSTRUCT_MAP`, `DOLLAR_CHAIN_RULES`, `WELL_KNOWN_ROOTS`, `ESTREE_TO_BINOP` (Groups B, C, D)
- `walkIR()` and `IRVisitor` also exist there but are NOT used by walker-acorn.ts (they're for boundary-contract/deps)
- The old `src/render/gpu-ir/walker.ts` still exists (needed for dual-walker equivalence test)
- `acorn` and `@types/estree` are already installed in package.json

## Downstream Contracts — DO NOT CHANGE

Phase 3 depends on the following. Changing any of these requires updating the Phase 3 plan.

### walker-acorn.ts file location and exports

Phase 3 renames this file to `walker.ts`. It must exist at `src/render/gpu-ir/walker-acorn.ts` with these exact exports:

```typescript
export type ShaderStage = 'compute' | 'vertex' | 'fragment';
export interface ShaderContext { readonly stage: ShaderStage; readonly manifest: MemoryManifest; }
export interface WalkerDiagnostic { readonly severity, line, column, message, source? }
export interface WalkerResult { readonly stmts: StatementIR[]; readonly diagnostics: readonly WalkerDiagnostic[]; }
export function compileShaderBody(fn: Function, ctx: ShaderContext): WalkerResult
```

### compile.ts import path

Phase 3 expects `compile.ts` to import from `'./walker-acorn'` (which Phase 3 changes to `'./walker'`). Do NOT use a different import path.

### Old walker.ts must still exist

Phase 3 deletes `src/render/gpu-ir/walker.ts`. Do NOT delete it in this phase — the dual-walker equivalence test needs it, and Phase 3 handles the deletion.

### Test file naming and structure

Phase 3 expects:
- `src/render/gpu-ir/__tests__/walker-acorn.test.ts` exists
- The dual-walker equivalence tests are in a clearly identifiable `describe` block (e.g., `describe('dual-walker equivalence', ...)`) so Phase 3 can delete just that section
- All other unit tests remain and will be kept after rename to `walker.test.ts`

## Key Design Decisions
1. **Diagnostic accumulation, not throws.** On error, return sentinel `B.litF32(NaN)` so walk continues and accumulates multiple diagnostics.
2. **`gpu()` continues to throw on errors.** Minimizes blast radius. Structured error propagation is a follow-up.
3. **Type annotations are already dead at runtime.** esbuild strips them. Acorn's inability to parse TS syntax is irrelevant.
4. **Operator mapping is a table, not a switch.** `ESTREE_TO_BINOP` replaces `binaryTokenToOp()` switch.
5. **Dual-walker equivalence test is temporary.** Proves correctness, deleted in Phase 3 after swap.
