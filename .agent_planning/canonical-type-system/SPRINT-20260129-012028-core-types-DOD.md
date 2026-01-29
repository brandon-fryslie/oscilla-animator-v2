# Sprint: core-types - Definition of Done

**Sprint**: core-types
**Generated**: 2026-01-29T01:20:28Z

---

## Exit Criteria

This sprint is DONE when ALL of the following are true:

### Type System

- [ ] `Axis<T, V>` exists with `var` and `inst` discriminants
- [ ] All 5 axis type aliases exist: `CardinalityAxis`, `TemporalityAxis`, `BindingAxis`, `PerspectiveAxis`, `BranchAxis`
- [ ] `InstanceRef` uses branded `InstanceId` and `DomainTypeId`
- [ ] `PerspectiveValue` is `{ kind: 'default' }` union
- [ ] `BranchValue` is `{ kind: 'default' }` union
- [ ] `BindingValue` matches spec (with or without referent per user decision)
- [ ] `Extent` uses typed axis aliases

### Helpers

- [ ] `axisVar<T, V>(v: V)` factory exists
- [ ] `axisInst<T, V>(value: T)` factory exists
- [ ] `isAxisVar()` type guard exists
- [ ] `isAxisInst()` type guard exists
- [ ] `DEFAULT_BINDING`, `DEFAULT_PERSPECTIVE`, `DEFAULT_BRANCH` constants exist

### Cleanup

- [ ] Old `AxisTag<T>` deleted
- [ ] Old `axisDefault()`, `axisInstantiated()`, `isInstantiated()`, `getAxisValue()` deleted
- [ ] Old `PerspectiveId`, `BranchId` string aliases deleted

### Build

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (or failures are documented as follow-up work)

---

## Verification Commands

```bash
# Type checking
pnpm typecheck

# Verify Axis type exists with var/inst
grep -n "kind: 'var'" src/core/canonical-types.ts
grep -n "kind: 'inst'" src/core/canonical-types.ts

# Verify axis aliases
grep -n "CardinalityAxis" src/core/canonical-types.ts
grep -n "TemporalityAxis" src/core/canonical-types.ts

# Verify InstanceRef uses branded IDs
grep -A3 "interface InstanceRef" src/core/canonical-types.ts

# Verify old types removed
grep -n "AxisTag" src/core/canonical-types.ts  # Should return nothing
grep -n "axisDefault" src/core/canonical-types.ts  # Should return nothing
```
