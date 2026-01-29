---
topic: 02
name: Axis Enforcement
spec_file: design-docs/canonical-types/03-Types-Analysis.md
category: critical
audited: 2026-01-29T00:03:26Z
item_count: 1
priority_reasoning: Without axis enforcement, the type system cannot prevent invalid IR nodes
---

# Topic 02: Axis Enforcement — Critical Gaps (FINAL)

## Items

### C-4: Pure axis validation pass (constrained scope)

**Problem**: Nothing prevents nonsense combinations like FieldExprBroadcast with cardinality=one, or EventExpr without discrete temporality.

**Required invariants**:
- SigExpr kinds: `type.extent.cardinality = one`
- FieldExpr kinds: `type.extent.cardinality = many(instance)`
- EventExpr kinds: `type.extent.temporality = discrete`, `type.payload.kind = 'bool'`, `type.unit.kind = 'none'`

**CONSTRAINED SCOPE — this pass is a pure checker**:

**MUST check**:
1. Axis-shape validity per expression family (Sig/Field/Event)
2. Axis-shape validity per expression kind (e.g., SigExprTime → continuous, EventExpr → discrete+bool+none)

**MUST NOT do**:
- Type inference
- Adapter insertion
- Scheduling/cycle legality
- Any "helpful coercions"
- Any backend-only legality rules
- Duplicated authority checks (e.g., "FieldExpr must not contain instanceId" — that's compile-time TypeScript)

**Output**: Single consolidated diagnostic category: `AxisInvalid`

**When it runs**: AFTER normalization/inference, BEFORE backend entry.

**Gating**: No backend entry without passing. U-1 (ValueExpr IR) MUST NOT START until C-4 is implemented and passing.

**Depends on**: C-1 (EventExpr must have type first)
