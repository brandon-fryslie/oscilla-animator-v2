# Definition of Done: legacy-deletion
Generated: 2026-01-31T16:00:00Z

## Hard Requirements

### 1. No Legacy Expression Types Exist
- [ ] `SigExpr`, `FieldExpr`, `EventExpr` type definitions deleted from types.ts
- [ ] `SigExprId`, `FieldExprId`, `EventExprId` deleted from Indices.ts
- [ ] No file under src/ (including tests) imports these types

### 2. Bridge Pass Deleted
- [ ] `lowerToValueExprs.ts` does not exist
- [ ] `lowerToValueExprs.test.ts` does not exist
- [ ] No `lowerToValueExprs` call in compile.ts

### 3. Builder is ValueExpr-Only
- [ ] IRBuilder interface has only `ve*` methods
- [ ] No `sig*`/`field*`/`event*` methods
- [ ] No legacy expression arrays in IRBuilderImpl

### 4. Tripwire Enforcement Active
- [ ] Test file exists that greps production code for banned patterns
- [ ] Test passes (no violations)
- [ ] Banned list includes all legacy identifiers

### 5. Tests
- [ ] `npm run test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
