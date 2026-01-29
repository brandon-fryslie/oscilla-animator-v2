# Sprint: constructors-helpers - Definition of Done

**Sprint**: constructors-helpers
**Generated**: 2026-01-29T01:21:00Z

---

## Exit Criteria

This sprint is DONE when ALL of the following are true:

### Canonical Constructors

- [ ] `canonicalSignal(payload, unit?)` exists and returns cardinality=one, temporality=continuous
- [ ] `canonicalField(payload, unit, instance)` exists and returns cardinality=many, temporality=continuous
- [ ] `canonicalEventOne()` exists and returns payload=bool, unit=none, temporality=discrete, cardinality=one
- [ ] `canonicalEventField(instance)` exists and returns payload=bool, unit=none, temporality=discrete, cardinality=many

### Derived Helpers

- [ ] `DerivedKind` type exists ('signal' | 'field' | 'event')
- [ ] `deriveKind(t)` classifies based on axes
- [ ] `getManyInstance(t)` extracts instance from many-cardinality types
- [ ] `assertSignalType(t)` validates and throws for non-signals
- [ ] `assertFieldType(t)` validates and returns InstanceRef
- [ ] `assertEventType(t)` validates payload/unit/temporality for events

### Stride Helper

- [ ] `payloadStride(p)` computes stride from kind (not embedded field)

### Build

- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes

---

## Verification Commands

```bash
# Type checking
pnpm typecheck

# Verify constructors exist
grep -n "function canonicalSignal" src/core/canonical-types.ts
grep -n "function canonicalField" src/core/canonical-types.ts
grep -n "function canonicalEventOne" src/core/canonical-types.ts
grep -n "function canonicalEventField" src/core/canonical-types.ts

# Verify helpers exist
grep -n "function deriveKind" src/core/canonical-types.ts
grep -n "function getManyInstance" src/core/canonical-types.ts
grep -n "function assertSignalType" src/core/canonical-types.ts
grep -n "function assertFieldType" src/core/canonical-types.ts
grep -n "function assertEventType" src/core/canonical-types.ts
grep -n "function payloadStride" src/core/canonical-types.ts
```
