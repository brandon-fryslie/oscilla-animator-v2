---
topic: 01
name: Type System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md
generated: 2026-01-23T12:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: [02-block-system]
---

# Context: Topic 01 — Type System

## What the Spec Requires

1. PayloadType is a closed union: `float | int | vec2 | vec3 | color | phase | bool | unit | shape2d | shape3d`
2. PayloadType does NOT include `event` or `domain`
3. `phase` has special arithmetic: `phase + float → phase`, `phase * float → phase`, `phase + phase → TYPE ERROR`
4. `shape2d` is an opaque handle (8 u32 words) with restricted operations (equality, assignment, pass-through only)
5. AxisTag<T> is `{ kind: 'default' } | { kind: 'instantiated'; value: T }` — no optional fields
6. Cardinality: `zero | one | many(instance)` with InstanceRef
7. Temporality: `continuous | discrete`
8. Binding: `unbound | weak(referent) | strong(referent) | identity(referent)` (v0: default-only)
9. Perspective and Branch: string IDs (v0: 'global' and 'main' defaults-only)
10. Extent: 5-axis coordinate { cardinality, temporality, binding, perspective, branch } using AxisTag
11. SignalType: `{ payload: PayloadType; extent: Extent }` (two fields only)
12. V0 defaults: `{ cardinality: one, temporality: continuous, binding: unbound, perspective: 'global', branch: 'main' }`
13. DefaultSemantics<T>: `{ kind: 'canonical'; value: T } | { kind: 'inherit' }`
14. Axis unification: strict join, no implicit merges, TYPE ERROR on mismatch
15. CombineMode restrictions by PayloadType (table defining valid modes per type)
16. CombineMode invariants: no type change, no cardinality increase, no composite allocation, pure function
17. Domain hierarchy: DomainSpec with id, parent, intrinsics
18. InstanceDecl: id, domainType, primitiveId, maxCount, countExpr?, lifecycle
19. InstanceRef in Cardinality: { kind: 'instance', domainType: DomainTypeId, instanceId: InstanceId }
20. Instance alignment: same InstanceId required for aligned many values
21. Derived type predicates: isField, isSignal, isTrigger, isPerLaneEvent
22. World→Axes mapping for v2 migration

## Current State (Topic-Level)

### How It Works Now

The type system is implemented in `src/core/canonical-types.ts` with support types in `src/core/domain-registry.ts`. SignalType has three fields (payload, extent, unit) instead of the spec's two (payload, extent). The `Unit` system (phase01, radians, norm01, etc.) replaces the spec's `phase` and `unit` PayloadType variants with a separate annotation axis. PayloadType uses `shape` instead of `shape2d`. CombineMode is a flat string union in `src/types/index.ts` rather than the spec's discriminated union. All domain types and instance references work correctly but InstanceRef uses plain strings instead of branded types.

### Patterns to Follow

- Discriminated unions with `kind` discriminator throughout
- Constructor functions for all types (e.g., `cardinalityOne()`, `axisInstantiated(v)`)
- Branded type IDs (`DomainTypeId`, `InstanceId`) via `string & { readonly __brand: ... }`
- Re-exports through `src/types/index.ts` for single import point
- Type predicates as standalone functions

## Work Items

### WI-1: Add isField/isSignal/isTrigger Predicate Functions

**Status**: MISSING
**Spec requirement**: Derived type concept predicates that check cardinality+temporality combinations
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | Add predicates | After line 719 |
| `src/types/index.ts` | Re-export | After line 76 |

**Current state**: No predicate functions exist for checking Signal/Field/Trigger/PerLaneEvent patterns
**Required state**: Functions `isField(t)`, `isSignal(t)`, `isTrigger(t)`, `isPerLaneEvent(t)` checking cardinality and temporality axes
**Suggested approach**: Add functions after the derived type helpers section. Check both axes' instantiated values.
**Risks**: None - pure addition
**Depends on**: None

### WI-2: Phase Arithmetic Type Enforcement

**Status**: MISSING
**Spec requirement**: phase + phase = TYPE ERROR; phase arithmetic rules enforced at compile time
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | Phase semantics (unit:phase01) | 36 |
| `src/compiler/passes-v2/` | Compile-time validation pass | New pass or addition to existing |

**Current state**: Phase is represented as `float + unit:phase01` but no arithmetic restrictions are enforced at compile time
**Required state**: Compiler validates that phase01-unit values cannot be added to other phase01-unit values; only phase+float and phase*float are valid
**Suggested approach**: Add unit-aware arithmetic validation in the compiler passes where binary operations are lowered. Check that if both inputs have unit:phase01, emit TYPE ERROR diagnostic.
**Risks**: Requires touching compilation passes; may need unit propagation through expressions
**Depends on**: None

### WI-3: CombineMode Discriminated Union Refactor

**Status**: WRONG
**Spec requirement**: CombineMode is `{ kind: 'numeric'; op: ... } | { kind: 'any'; op: ... } | { kind: 'bool'; op: ... }`
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/types/index.ts` | Type definition | 140-146 |
| `src/compiler/passes-v2/combine-utils.ts` | Validation/usage | 1-162 |
| Multiple blocks/compiler files | Consumers | Throughout |

**Current state**: Flat string union `'last' | 'first' | 'sum' | 'average' | 'max' | 'min'`
**Required state**: Discriminated union with `numeric` (sum, avg, min, max, mul/product), `any` (last, first, layer), `bool` (or, and) categories. Missing modes: `product/mul`, `layer`, `blend`, `or`, `and`.
**Suggested approach**: Replace CombineMode type, update all usages. This is a wide refactor touching the combine-utils validation, block lowering, and potentially UI.
**Risks**: Wide refactor with many consumers. Should be done as a migration with find-and-replace.
**Depends on**: None

### WI-4: InstanceRef Use Branded Types

**Status**: PARTIAL
**Spec requirement**: InstanceRef.domainType is DomainTypeId; InstanceRef.instanceId is InstanceId
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | InstanceRef interface | 197-201 |

**Current state**: Uses `readonly domainType: string; readonly instanceId: string;`
**Required state**: Uses branded types `readonly domainType: DomainTypeId; readonly instanceId: InstanceId;`
**Suggested approach**: Import branded types from domain-registry and update the interface. Update `instanceRef()` constructor signature.
**Risks**: May require type assertions at call sites that pass plain strings
**Depends on**: None

### WI-5: Rename PayloadType `shape` to `shape2d`

**Status**: WRONG
**Spec requirement**: PayloadType uses `shape2d` for 2D shape references
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | PayloadType definition | 126 |
| Many files across codebase | All references to `'shape'` as PayloadType | Throughout |

**Current state**: PayloadType includes `'shape'`
**Required state**: PayloadType includes `'shape2d'`
**Suggested approach**: Rename `'shape'` to `'shape2d'` in PayloadType union and all usages. The runtime already uses `shape2d` for the bank name.
**Risks**: Wide rename touching blocks, compiler, runtime, and tests. Could be done with `replace_all`.
**Depends on**: None

### WI-6: Remove Unit Field from SignalType (or Reconcile with Spec)

**Status**: PARTIAL
**Spec requirement**: SignalType is `{ payload: PayloadType; extent: Extent }` — two fields only
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | SignalType interface | 416-420 |
| Many consumer files | Usage of `unit` field | Throughout |

**Current state**: SignalType has three fields: `payload`, `extent`, `unit: Unit`
**Required state**: Spec says two fields. The Unit system handles `phase` and `unit` PayloadTypes via annotation rather than separate PayloadType values.
**Suggested approach**: This is a design decision where the implementation extends the spec. The Unit system is well-integrated and provides additional type safety. Options: (a) remove Unit and reintroduce phase/unit as PayloadTypes per spec, (b) update spec to include Unit, (c) keep as-is and document the divergence. Recommend option (b) or (c) since the Unit approach is arguably better.
**Risks**: If removing Unit, many blocks that use unitPhase01() would need refactoring. If keeping, spec needs update.
**Depends on**: Decision on spec vs implementation authority for this topic

### WI-7: Add InstanceDecl to Core Types (with maxCount and primitiveId)

**Status**: MISSING
**Spec requirement**: InstanceDecl with `id, domainType, primitiveId, maxCount, countExpr?, lifecycle`
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/compiler/ir/types.ts` | Current InstanceDecl (IR-level) | 357-365 |
| `src/core/` or `src/types/` | New core-level InstanceDecl | New |

**Current state**: InstanceDecl exists only in IR types with `count: number | 'dynamic'` and no `maxCount` or `primitiveId`
**Required state**: Core-level InstanceDecl matching spec: `{ id, domainType, primitiveId, maxCount, countExpr?, lifecycle: 'static' | 'pooled' }`
**Suggested approach**: Either update the IR InstanceDecl to match spec fields, or create a separate core-level type that the IR version derives from. The spec's `maxCount` (pool size) vs dynamic count distinction is important for performance.
**Risks**: Changing InstanceDecl affects Array block, compiler passes, and runtime
**Depends on**: None

### WI-8: Add DefaultSemantics<T> Type

**Status**: MISSING
**Spec requirement**: `DefaultSemantics<T> = { kind: 'canonical'; value: T } | { kind: 'inherit' }` for distinguishing v0 vs v1+ behavior
**Files involved**:

| File | Role | Lines |
|------|------|-------|
| `src/core/canonical-types.ts` | Add type definition | Near DEFAULTS_V0 |

**Current state**: DEFAULTS_V0 uses unwrapped values directly
**Required state**: DEFAULTS_V0 structure uses DefaultSemantics wrappers (or at minimum the type is available for future use)
**Suggested approach**: Add the type definition. The actual DEFAULTS_V0 values work correctly as-is since we're in v0 where all defaults are canonical.
**Risks**: None - additive
**Depends on**: None
