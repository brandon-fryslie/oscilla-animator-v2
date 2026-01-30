---
topic: 02
name: Type System
spec_file: |
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t1_canonical-type.md
  design-docs/canonical-types/_output/CANONICAL-canonical-types-20260129-235000/type-system/t2_derived-classifications.md
category: to-review
audited: 2026-01-29
item_count: 3
---

# Topic 02: Type System — To-Review Gaps

## Items

### R-1: AxisTag<T> still present in bridges.ts
**Problem**: Spec says `AxisTag<T>` (default/instantiated) is deprecated and MUST NOT be used. Code has `type AxisTag<T> = Axis<T, never>;` in bridges.ts as a backward-compat alias.
**Evidence**: `src/compiler/ir/bridges.ts:36` — `type AxisTag<T> = Axis<T, never>;`
**Assessment**: The alias is only used locally in bridges.ts and is semantically equivalent to an axis that can never be a variable. It's not the old AxisTag with default/instantiated branches. Possibly fine as a local convenience, but should be reviewed for spec compliance. If unused, delete.

### R-2: PayloadType includes 'var' variant for inference — spec unclear on persistence
**Problem**: Implementation has `PayloadType = ConcretePayloadType | { kind: 'var'; id: string }` with `payloadVar()` constructor. Spec says PayloadType is a closed set of 7 concrete kinds with no mention of payload variables. However, the spec does discuss axis variables (`Axis.kind='var'`) for inference. It's unclear if payload variables were intentionally omitted from the spec or if they're an implementation detail that should be modeled differently.
**Evidence**: `src/core/canonical-types.ts:231-233` — PayloadType union includes var. Spec `t1_canonical-type.md:31-38` — only concrete kinds.
**Assessment**: Payload variables serve the same role as axis variables (inference-time placeholders). The spec may simply not have addressed them. The code correctly prevents payload vars from reaching backend (guard checks in `strideOf`, `payloadStride`, `defaultUnitForPayload`). Should confirm with spec author whether payload vars are intentional omission or should be added to spec.

### R-3: deriveKind() throws on uninstantiated axes rather than being total
**Problem**: Spec says `deriveKind()` is total ("handles all possible CanonicalType inputs"). Implementation throws if temporality or cardinality are not instantiated (`kind !== 'inst'`).
**Evidence**: `src/core/canonical-types.ts:703-704,710-711` — throws on var axes. Spec `t2_derived-classifications.md:35-37` — "Total: handles all possible CanonicalType inputs".
**Assessment**: The spec's "total" claim may mean total over instantiated types (post-inference). The implementation is correct for the backend path. But the function cannot be used safely during inference when axes may still be variables. May need a `tryDeriveKind()` variant or spec clarification.
