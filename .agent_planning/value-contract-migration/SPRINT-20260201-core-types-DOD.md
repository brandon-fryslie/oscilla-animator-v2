# Definition of Done: Core Types Sprint
Generated: 2026-02-01

## Completion Criteria

1. **ValueContract type exists** with 4 kinds (none, clamp01, wrap01, clamp11)
2. **CanonicalType has contract field** (optional, backward compatible)
3. **InferenceCanonicalType has contract field** (optional)
4. **typesEqual() compares contracts** (undefined treated as none)
5. **contractsCompatible() implements strength ordering** (strong→weak OK, weak→strong needs adapter)
6. **Adapter-spec TypePattern supports contract** matching
7. **All existing tests pass** (`npm run test`) — zero breaking changes
8. **Type check passes** (`npm run typecheck`)
9. **No existing block or adapter code needs changes** (optional field = backward compat)
