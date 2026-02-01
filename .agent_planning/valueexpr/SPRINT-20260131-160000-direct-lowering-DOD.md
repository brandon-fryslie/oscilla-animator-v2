# Definition of Done: direct-lowering
Generated: 2026-01-31T16:00:00Z

## Hard Requirements (All Must Pass)

### 1. Zero Legacy Expression References in Production Code
- [ ] `grep -r "SigExpr[^I]" src/ --include="*.ts" -l` returns 0 files (excluding tests and `__tests__/`)
- [ ] `grep -r "FieldExpr[^I]" src/ --include="*.ts" -l` returns 0 files (excluding tests)
- [ ] `grep -r "EventExpr[^I]" src/ --include="*.ts" -l` returns 0 files (excluding tests)
- [ ] `grep -r "SigExprId" src/ --include="*.ts" -l` returns 0 files (excluding test helpers)
- [ ] `grep -r "FieldExprId" src/ --include="*.ts" -l` returns 0 files (excluding test helpers)
- [ ] `grep -r "EventExprId" src/ --include="*.ts" -l` returns 0 files (excluding test helpers)

### 2. Single Expression Table
- [ ] `CompiledProgramIR` has `valueExprs: readonly ValueExpr[]` — no wrapper types
- [ ] No `signalExprs`, `fieldExprs`, or `eventExprs` fields in program IR
- [ ] No `sigToValue`, `fieldToValue`, `eventToValue` translation maps

### 3. Direct Builder Path
- [ ] `IRBuilder` exposes `ve*` methods that return `ValueExprId`
- [ ] `getValueExprs()` returns the canonical dense array
- [ ] All block `lower()` functions use `ve*` methods

### 4. Schedule Uses ValueExprId
- [ ] All `Step` variants reference `ValueExprId`
- [ ] `ScheduleExecutor` dispatches directly on `ValueExprId` — no translation

### 5. Tests
- [ ] `npm run test` passes (all 2057+ tests)
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Tripwire test updated to catch legacy expression types (not just legacy evaluators)

## Soft Requirements
- [ ] `lowerToValueExprs.ts` deleted (no longer needed)
- [ ] Legacy `sig*`/`field*`/`event*` methods removed from IRBuilder
- [ ] Test helpers (`ir-test-helpers.ts`) updated or deleted
