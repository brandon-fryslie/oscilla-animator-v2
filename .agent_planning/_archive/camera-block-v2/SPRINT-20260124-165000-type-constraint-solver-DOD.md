# Definition of Done: type-constraint-solver

## Verifiable Criteria

1. **No fallback to scalar**: `pass2-types.ts` never calls `defaultUnitForPayload()` for polymorphic blocks
2. **Const is unit-polymorphic**: Const block's output type is `float<UnitVar>` in definition
3. **Constraint solver exists**: New pass `pass0.5-type-constraints.ts` produces `resolvedPortTypes`
4. **All types resolved or error**: Every polymorphic port has a concrete type after solving, or compilation fails with diagnostic
5. **Diagnostic is actionable**: Unresolved type errors include:
   - Which block and port
   - Why it's unconstrained (no connected edge, conflicting constraints, etc.)
   - How to fix (connect to typed consumer, set explicit type, insert adapter)
6. **Tests pass**: All 86 test files pass with 0 failures
7. **Typecheck clean**: `npm run typecheck` exits 0
8. **No new fallback paths**: No code path silently invents types for polymorphic ports

## Verification Commands

```bash
npm run typecheck           # Must exit 0
npm run test -- --run       # Must show 0 failures
```

## Negative Tests (should fail compilation with diagnostic)

- Unconnected Const block with no explicit type → error
- Const connected to two ports with different units → error (conflicting constraints)
- Chain of generics with no concrete anchor → error
