# Sprint: Opcode Consolidation - Single Enforcer

Generated: 2026-02-06
Confidence: HIGH: 3, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Eliminate opcode duplication in ValueExprMaterializer by delegating to OpcodeInterpreter, enforcing the SINGLE ENFORCER architectural law.

## Scope

**Deliverables:**
1. Replace `evaluatePureFn` duplicate switch with delegation to `applyOpcode()`
2. Handle additional PureFn kinds (kernel, expr, composed) consistently
3. Add forbidden-pattern test to prevent future duplication

## Work Items

### P0: Refactor evaluatePureFn to delegate to OpcodeInterpreter

**Confidence:** HIGH

**Current Code (lines 400-447):**
```typescript
function evaluatePureFn(fn: PureFn, args: number[]): number {
  if (fn.kind === 'opcode') {
    switch (fn.opcode) {
      case 'add': return args[0] + args[1];
      // ... 26 more cases
    }
  }
  // ...
}
```

**Target Code:**
```typescript
function evaluatePureFn(fn: PureFn, args: number[]): number {
  switch (fn.kind) {
    case 'opcode':
      return applyOpcode(fn.opcode, args);
    case 'kernel':
      throw new Error(`Kernel functions not yet implemented: ${fn.name}`);
    case 'kernelResolved':
      throw new Error(`kernelResolved not yet implemented: ${fn.handle}`);
    case 'expr':
      throw new Error(`Expression evaluation not yet implemented: ${fn.expr}`);
    case 'composed': {
      let result = args[0];
      for (const op of fn.ops) {
        result = applyOpcode(op, [result]);
      }
      return result;
    }
    default: {
      const _exhaustive: never = fn;
      throw new Error(`Unknown function kind: ${(_exhaustive as PureFn).kind}`);
    }
  }
}
```

**Acceptance Criteria:**
- [ ] `evaluatePureFn` no longer contains switch on opcode names
- [ ] All 26 opcodes delegated to `applyOpcode()`
- [ ] Composed fn kind handled (matches SignalKernelLibrary pattern)
- [ ] Exhaustive switch with never pattern
- [ ] All existing tests pass

**Technical Notes:**
- Import `applyOpcode` already exists at line 26
- SignalKernelLibrary.ts provides the reference implementation pattern
- Minor semantic change: `add`/`mul` become variadic (matches spec), `select` becomes `>0` (matches spec)

---

### P1: Add forbidden-pattern test for opcode duplication

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] Test added to `src/__tests__/forbidden-patterns.test.ts`
- [ ] Test scans ValueExprMaterializer.ts for forbidden patterns
- [ ] Patterns forbidden: `case 'add':`, `case 'sin':`, etc. (opcode case statements)
- [ ] Test provides clear error message explaining the constraint

**Technical Notes:**
- Follow existing pattern in forbidden-patterns.test.ts
- Use grep/regex to detect switch cases matching opcode names
- This prevents future regression

---

### P2: Verify semantic alignment

**Confidence:** HIGH

**Acceptance Criteria:**
- [ ] Document that `add`/`mul` are now variadic (affects no current code - kernels always pass exact arity)
- [ ] Document that `select` uses `>0` not truthy (matches spec)
- [ ] Run full test suite with no failures
- [ ] Run demo apps to verify visual output unchanged

**Technical Notes:**
- Current code always passes exact arity, so variadic change has no effect
- `select` change affects edge case of exactly 0.0 condition (was truthy false, now false by >0)

## Dependencies

None - self-contained refactor.

## Risks

| Risk | Mitigation |
|------|-----------|
| Semantic drift in edge cases | Run full test suite + demos |
| Missing PureFn kind | Use exhaustive switch with never |
| Future regression | Forbidden-pattern test |
