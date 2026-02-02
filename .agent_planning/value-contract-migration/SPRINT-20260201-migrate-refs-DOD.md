# Definition of Done: Migrate References Sprint
Generated: 2026-02-01

## Completion Criteria

1. **`norm01` kind does not exist** in UnitType union (compile error if referenced)
2. **`phase01` angle unit does not exist** — replaced by `turns`
3. **All block definitions compile** with new type representations
4. **All adapter blocks compile** with updated TypePattern
5. **All UI components compile** with updated switch/case logic
6. **All tests pass** (`npm run test`)
7. **Type check passes** (`npm run typecheck`)
8. **No string literal `'norm01'` or `'phase01'` exists** in any .ts file (grep check)
9. **Exhaustive switch patterns** catch any missed references at compile time
