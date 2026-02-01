# Definition of Done: Per-Lane Opcode Dispatch (Q30 Option B)
Generated: 2026-02-01T09:36:00Z

## Completion Criteria

### Must-Have
1. **Zero `ctx.b.kernel('field...')` for arithmetic** — no block `lower()` emits a named kernel for any operation that is expressible as a scalar opcode
2. **Field-path math works** — graphs with field-cardinality inputs through Add/Sub/Mul/Div/Mod/Sin/Cos produce correct buffer values at runtime
3. **Broadcast works** — mixed signal+field inputs correctly broadcast the signal to field-extent before applying the opcode
4. **All existing tests pass** — no regressions
5. **New field-path tests exist** — at least one test per math block exercising the field path
6. **Enforcement test exists** — a test that prevents reintroduction of arithmetic kernel names

### Nice-to-Have
7. **Hot loop optimization** — opcodes pre-resolved to function pointers, no per-lane array allocations
8. **Benchmark evidence** — measurable improvement for field operations

## Verification

```bash
# All tests pass
npm run test

# Type check passes
npm run typecheck

# No arithmetic kernel names in block files
grep -r "ctx\.b\.kernel('field" src/blocks/ && echo "FAIL: arithmetic kernels found" || echo "PASS"

# New tests exist and pass
npx vitest run src/blocks/__tests__/math-field-paths.test.ts
npx vitest run src/blocks/__tests__/no-arithmetic-kernels.test.ts
```
