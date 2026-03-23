---
parent: ../INDEX.md
topic: migration
tier: 3
---

# Migration: Definition of Done (Optional)

> **Tier 3**: Use it or don't. Change freely if something works better.

**Context**: Checklists for verifying migration completion.

---

## 90% Done (Bulk Work Complete)

- [ ] CanonicalType uses `Axis<T, V>` (not `AxisTag<T>`)
- [ ] UnitType has 8 structured kinds (no flat kinds, no var)
- [ ] `tryGetManyInstance` + `requireManyInstance` replace `getManyInstance`
- [ ] ValueExpr unifies SigExpr/FieldExpr/EventExpr with `kind` discriminant
- [ ] All 24 legacy variants mapped to 6 ValueExpr ops
- [ ] No `instanceId` field on expressions that carry `type: CanonicalType`
- [ ] `validateAxes()` enforces axis-shape contracts
- [ ] AdapterSpec uses TypePattern/ExtentPattern with purity+stability
- [ ] ConstValue is discriminated union (not `number | boolean`)
- [ ] No `SignalType`, `PortType`, `FieldType`, `EventType` aliases exist

## 100% Done (CI Gates Pass)

- [ ] `grep -r "SignalType\|PortType\|FieldType\|EventType" src/` returns nothing
- [ ] `grep -r "ResolvedPortType" src/` returns nothing
- [ ] `grep -r "AxisTag" src/` returns nothing
- [ ] `grep -r "getManyInstance[^A-Z]" src/` returns nothing (only tryGet/require)
- [ ] `grep -r "kind: 'var'" src/core/canonical-types.ts` returns nothing in UnitType
- [ ] All tests pass with no `@ts-ignore` on type assertions
- [ ] No `any` casts related to type system without documented rationale
- [ ] Coverage: axis validation path has >90% branch coverage
- [ ] **CI gate Vitest test passes** (see below)

## CI Gate Test (Resolutions Q12/Q13)

A Vitest test MUST exist that fails CI for forbidden patterns. This is the automated enforcement gate — manual grep commands are supplementary only.

### Forbidden Patterns

```typescript
// src/__tests__/forbidden-patterns.test.ts (or similar)
// Grep-based test that FAILS CI if any pattern matches:

const FORBIDDEN = [
  { pattern: 'AxisTag<', description: 'Deprecated axis pattern' },
  { pattern: /payload:\s*\{\s*kind:\s*['"]var['"]/, description: 'Payload var outside inference', exclude: ['inference'] },
  { pattern: /UnitType.*kind:\s*['"]var['"]/, description: 'UnitType var' },
  { pattern: /SignalType|PortType|FieldType|EventType|ResolvedPortType/, description: 'Legacy type alias' },
  { pattern: /instanceId.*:/, description: 'instanceId field on expression with type', exclude: ['InstanceRef'] },
];
```

### Allowlist

Small allowlist for migration directories until cutover is complete:
- `src/compiler/passes-v2/` (legacy, excluded from build)
- Files explicitly marked with `// MIGRATION: allowlisted until <date>`

### Governance

- The allowlist MUST have an expiration date
- New entries require owner and rationale
- The test runs as part of `npm run test` (not a separate script)

## Verification Commands

```bash
# Check for legacy type aliases
rg "SignalType|PortType|FieldType|EventType|ResolvedPortType" src/ --type ts

# Check for deprecated axis pattern
rg "AxisTag" src/ --type ts

# Check for old instance helper
rg "getManyInstance[^A-Z]" src/ --type ts

# Check for unit var in canonical type
rg "kind: 'var'" src/core/canonical-types.ts

# Run type checker
npm run typecheck

# Run all tests
npm run test
```

---

## See Also

- [Rules for New Types](./t3_rules-for-new-types.md) - Governance after migration
- [ValueExpr](./t2_value-expr.md) - Core migration target
