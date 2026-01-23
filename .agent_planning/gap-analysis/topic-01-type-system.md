---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md
audited: 2026-01-23T12:00:00Z
has_gaps: true
counts: { done: 18, partial: 5, wrong: 3, missing: 4, na: 3 }
---

# Topic 01: Type System

## DONE

- **PayloadType union defined**: `src/core/canonical-types.ts:120-126` — `float | int | vec2 | color | bool | shape`
- **AxisTag discriminated union**: `src/core/canonical-types.ts:138-140` — `{ kind: 'default' } | { kind: 'instantiated'; value: T }`
- **AxisTag constructors (axisDefault, axisInstantiated, isInstantiated, getAxisValue)**: `src/core/canonical-types.ts:145-168`
- **Cardinality type (zero, one, many)**: `src/core/canonical-types.ts:222-225`
- **Cardinality constructors**: `src/core/canonical-types.ts:230-246`
- **Temporality type (continuous, discrete)**: `src/core/canonical-types.ts:258-260`
- **Temporality constructors**: `src/core/canonical-types.ts:265-273`
- **Binding type (unbound, weak, strong, identity)**: `src/core/canonical-types.ts:310-314`
- **Binding constructors**: `src/core/canonical-types.ts:319-342`
- **ReferentId and ReferentRef types**: `src/core/canonical-types.ts:283-298`
- **PerspectiveId and BranchId types**: `src/core/canonical-types.ts:351-356`
- **Extent interface (5 axes)**: `src/core/canonical-types.ts:372-378`
- **Extent constructors (extentDefault, extent)**: `src/core/canonical-types.ts:383-404`
- **SignalType (payload + extent)**: `src/core/canonical-types.ts:416-420` (with extra `unit` field)
- **V0 canonical defaults (DEFAULTS_V0, FRAME_V0)**: `src/core/canonical-types.ts:469-483`
- **Axis unification rules (strict join)**: `src/core/canonical-types.ts:571-586`
- **Extent unification (all 5 axes unified independently)**: `src/core/canonical-types.ts:593-601`
- **worldToAxes migration helper**: `src/core/canonical-types.ts:619-649`
- **InstanceRef type and constructor**: `src/core/canonical-types.ts:197-208`
- **DomainTypeId branded type**: `src/core/domain-registry.ts:20`
- **InstanceId branded type**: `src/core/domain-registry.ts:26`
- **DomainType interface (id, parent, intrinsics)**: `src/core/domain-registry.ts:56-60`
- **IntrinsicSpec interface**: `src/core/domain-registry.ts:46-50`
- **Domain hierarchy with subtyping (shape, circle, rectangle, control, event)**: `src/core/domain-registry.ts:96-137`
- **isSubdomainOf recursive check**: `src/core/domain-registry.ts:154-159`
- **getIntrinsics with inheritance**: `src/core/domain-registry.ts:164-176`
- **Derived type concept helpers (signalTypeSignal, signalTypeField, signalTypeTrigger, signalTypeStatic, signalTypePerLaneEvent)**: `src/core/canonical-types.ts:658-719`
- **ResolvedExtent (IR-ready form)**: `src/core/canonical-types.ts:497-516`

## PARTIAL

- **PayloadType values**: `src/core/canonical-types.ts:120-126` — Implementation has `float | int | vec2 | color | bool | shape`. Spec requires `float | int | vec2 | vec3 | color | phase | bool | unit | shape2d | shape3d`. However, spec also says `phase` is NOT a payload (float + phase01 unit), and `unit` is NOT a payload (float + norm01 unit). The mismatch is: `vec3` (missing, but arguably T2/T3), `shape2d` vs `shape` (different name), `shape3d` (T3). Naming divergence: implementation uses `shape` instead of `shape2d`.
- **SignalType structure**: `src/core/canonical-types.ts:416-420` — Spec says `{ payload, extent }`. Implementation adds `unit: Unit` as a third field. This is an extension beyond spec. The spec's `phase` PayloadType is modeled here via `float + unit:phase01`, which is a design decision documented in the code. The Unit system is a forward implementation that isn't in the canonical spec.
- **CombineMode restrictions by PayloadType**: `src/compiler/passes-v2/combine-utils.ts:60-138` — Validation exists but uses flat string union (`CombineMode` in types/index.ts is `'last' | 'first' | 'sum' | 'average' | 'max' | 'min'`). Spec requires discriminated union `{ kind: 'numeric'; op: ... } | { kind: 'any'; op: ... } | { kind: 'bool'; op: ... }` and additional modes: `product`, `mul`, `layer`, `blend`, `or`, `and`. Several modes are missing.
- **Domain Catalog intrinsics**: `src/core/domain-registry.ts:76-90` — Spec says shape intrinsics include `centroid`, and circle intrinsics include `center`. Implementation has `position`, `bounds`, `area`, `index`, `normalizedIndex` for shape; `radius` for circle (missing `center`). Rectangle has `width, height` but missing `cornerRadius`. Control has `value, min, max` but missing `default`.
- **InstanceRef in Cardinality**: `src/core/canonical-types.ts:197-208` — InstanceRef uses plain `string` types for `domainType` and `instanceId` instead of branded `DomainTypeId` and `InstanceId` types.

## WRONG

- **PayloadType naming: `shape` vs `shape2d`**: `src/core/canonical-types.ts:126` — Spec calls this `shape2d` with 8 u32 words packed layout. Implementation uses `shape` without the word count specification. The packed layout is implemented separately in `src/runtime/RuntimeState.ts:73` as `shape2d` bank.
- **CombineMode type**: `src/types/index.ts:140-146` — Spec defines CombineMode as a discriminated union `{ kind: 'numeric'; op: 'sum' | 'avg' | 'min' | 'max' | 'mul' } | { kind: 'any'; op: 'last' | 'first' | 'layer' } | { kind: 'bool'; op: 'or' | 'and' }`. Implementation uses flat string union `'last' | 'first' | 'sum' | 'average' | 'max' | 'min'`. Missing modes: `product/mul`, `layer`, `blend`, `or`, `and`. Wrong structure.
- **DEFAULTS_V0 structure**: `src/core/canonical-types.ts:469-475` — Spec shows defaults wrapped in `{ kind: 'canonical'; value: T }` structure with `DefaultSemantics<T>` type. Implementation uses unwrapped concrete values. Minor divergence but the AxisTag pattern achieves similar intent.

## MISSING

- **Phase type semantics enforcement**: No file — Spec requires phase arithmetic rules: `phase + float → phase`, `phase * float → phase`, `phase + phase → TYPE ERROR`. No compile-time enforcement exists. Phase is represented as `float + unit:phase01` but arithmetic restrictions are not validated.
- **InstanceDecl interface in core types**: Only in `src/compiler/ir/types.ts:357-365` — Spec requires `InstanceDecl` with `maxCount`, `countExpr?: SigExprId`, `primitiveId: PrimitiveId`. IR's InstanceDecl has `count: number | 'dynamic'` and `lifecycle` but no `maxCount` (pool size) separate from count, no `primitiveId`, and no `countExpr`.
- **isField predicate function**: No file — Spec provides an explicit `isField(t: SignalType): boolean` predicate function. Not implemented. (Also missing: isSignal, isTrigger.)
- **DefaultSemantics<T> type**: No file — Spec defines `DefaultSemantics<T> = { kind: 'canonical'; value: T } | { kind: 'inherit' }` for v0 vs v1+ distinction. Not implemented.

## N/A

- **shape3d (T3 future)**: Spec explicitly marks as T3. Not applicable now.
- **Binding axis (v0: default-only)**: `src/core/canonical-types.ts:310-314` — Type exists but spec says v0 uses canonical default everywhere. The axis is stubbed correctly.
- **Perspective and Branch (v0: default-only)**: Types exist at `src/core/canonical-types.ts:351-356`. Spec says defaults-only in v0.
