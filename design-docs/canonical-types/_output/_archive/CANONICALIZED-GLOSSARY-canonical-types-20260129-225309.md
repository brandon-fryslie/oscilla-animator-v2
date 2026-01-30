---
command: /canonicalize-architecture (expanded source set)
files: all spec + planning files
indexed: true
source_files:
  - design-docs/canonical-types/00-exhaustive-type-system.md
  - design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012100-constructors-helpers-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012400-unit-restructure-PLAN.md
topics:
  - type-system
  - axes
  - validation
  - migration
---

# Canonical Glossary: CanonicalType System

Generated: 2026-01-29T22:53:09Z
Supersedes: CANONICALIZED-GLOSSARY-canonical-types-20260129-075723.md

## Usage

This glossary contains authoritative definitions for all terms in the CanonicalType domain.
Use these definitions consistently across all documentation and implementation.

**Note**: Terms marked ⚠️ have unresolved ambiguities — see QUESTIONS file.

---

## Core Types

### CanonicalType
**Definition**: The single type authority for all values in the system. Composed of payload, unit, and extent.
**Type**: type
**Source**: 00-exhaustive-type-system.md:149-153
**Structure**: `{ payload: PayloadType, unit: UnitType, extent: Extent }`
**Related**: PayloadType, UnitType, Extent

### PayloadType
**Definition**: The data shape of a value. A closed set of primitive types.
**Type**: type
**Source**: 00-exhaustive-type-system.md:125-132
**Values**: float | int | bool | vec2 | vec3 | color | cameraProjection
**Note**: Implementation also has `shape` kind (8 stride) — not in spec. Planning (EVALUATION-20260129) lists 8 kinds.
**Related**: CanonicalType, payloadStride

### UnitType ⚠️
**Definition**: The semantic interpretation/unit of a value. Inseparable from payload.
**Type**: type
**Source**: 00-exhaustive-type-system.md:138-143 (5 kinds), SPRINT-unit-restructure-PLAN:P1 (8 structured kinds, LOCKED)
**Spec Values**: none | scalar | norm01 | angle(radians|degrees|phase01) | time(ms|seconds)
**Planning Values (LOCKED)**: none | scalar | norm01 | count | angle(radians|degrees|phase01) | time(ms|seconds) | space(ndc|world|view, dims:2|3) | color(rgba01)
**LOCKED**: NO `{ kind: 'var' }` in canonical type — unit variables belong in inference-only wrappers
**See**: QUESTIONS C2 for resolution
**Related**: CanonicalType

### Extent
**Definition**: The 5-axis extent describing evaluation semantics of a value.
**Type**: type
**Source**: 00-exhaustive-type-system.md:113-119
**Structure**: `{ cardinality, temporality, binding, perspective, branch }`
**Related**: CanonicalType, CardinalityAxis, TemporalityAxis, BindingAxis, PerspectiveAxis, BranchAxis

---

## Axis Pattern ⚠️

### Axis<T, V> (spec) / AxisTag<T> (implementation)
**Definition**: Polymorphic axis representation supporting either a type variable or an instantiated value.
**Type**: type
**Source**: 00-exhaustive-type-system.md:65-67 (spec), canonical-types.ts:401-403 (impl)
**Spec**: `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`
**Implementation**: `AxisTag<T> = { kind: 'default' } | { kind: 'instantiated'; value: T }`
**See**: QUESTIONS C1 for resolution
**Related**: CardinalityAxis, TemporalityAxis, BindingAxis, PerspectiveAxis, BranchAxis

---

## Extent Axes

### CardinalityAxis / CardinalityValue
**Definition**: How many lanes/elements this value represents.
**Type**: type
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:20-25
**Values**: zero | one | many(instanceRef)
**Semantics**:
- `zero`: no value / absent
- `one`: one value per frame (signal-like)
- `many(instanceRef)`: one value per lane (field-like)
**Key Rule**: Instance identity lives ONLY here

### TemporalityAxis / TemporalityValue
**Definition**: Which evaluation clock governs presence/updates.
**Type**: type
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:27-31
**Values**: continuous | discrete
**Semantics**:
- `continuous`: value defined for every frame
- `discrete`: value defined only at ticks/edges (event-like)

### BindingAxis / BindingValue
**Definition**: How values attach to identity across time/edits.
**Type**: type
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:33-38
**Values**: unbound | weak | strong | identity
**LOCKED**: NO `referent` field on any variant. Referents belong in continuity policies / StateOp args.
**See**: QUESTIONS A4 for referent migration path
**Purpose**: Prevents "lanes got reindexed and state jumped" problems

### PerspectiveAxis / PerspectiveValue
**Definition**: Which view-space/coordinate frame interpretation applies.
**Type**: type
**Source**: 11-Perspective.md:27-49
**Current Values**: `{ kind: 'default' }` (spec); future: world | view(id) | screen(id)
**Key Rule**: NOT about "2D vs 3D rendering API" — about coordinate frame semantics

### BranchAxis / BranchValue
**Definition**: Which history line/worldline this value belongs to.
**Type**: type
**Source**: 12-Branch.md:39-49
**Current Values**: `{ kind: 'default' }` (spec); future: main | preview(id) | checkpoint(id) | undo(id) | prediction(id) | speculative(id) | replay(id)
**Purpose**: Makes preview/physics/undo safe by scoping state and caches

---

## Derived Classifications

### DerivedKind
**Definition**: Classification derived from CanonicalType axes. NOT stored, NOT authoritative.
**Type**: concept
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:54-63
**Derivation Rules**:
- `event` := temporality = discrete
- `field` := cardinality = many(instance)
- `signal` := otherwise (typically one, continuous)
**Key Rule**: If you store `kind: 'sig'|'field'|'event'` as authoritative, you've created a second type system

---

## Instance Extraction Helpers ⚠️

### tryGetManyInstance (LOCKED canonical name)
**Definition**: Pure query helper. Returns InstanceRef if cardinality=many(instance), null otherwise. Never throws.
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P5 (LOCKED)
**Signature**: `tryGetManyInstance(t: CanonicalType): InstanceRef | null`
**Use in**: UI rendering, diagnostic probes, when handling incomplete types

### requireManyInstance (LOCKED canonical name)
**Definition**: Asserts field-ness. Returns InstanceRef. Throws with crisp error if not many-instanced.
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P5 (LOCKED)
**Signature**: `requireManyInstance(t: CanonicalType): InstanceRef`
**Use in**: Compiler backend, lowering, axis validation (field-expected paths)

### getManyInstance (SUPERSEDED — do not use)
**Definition**: Original spec name. Replaced by tryGetManyInstance + requireManyInstance.
**Type**: function (deprecated)
**Source**: 00-exhaustive-type-system.md:230-246
**See**: QUESTIONS C3

---

## Canonical Constructors

### canonicalSignal(payload, unit)
**Definition**: Creates CanonicalType with cardinality=one, temporality=continuous.
**Type**: function
**Source**: 00-exhaustive-type-system.md:163-175

### canonicalField(payload, unit, instance)
**Definition**: Creates CanonicalType with cardinality=many(instance), temporality=continuous.
**Type**: function
**Source**: 00-exhaustive-type-system.md:177-189
**Note**: `unit` is REQUIRED (not optional) per spec

### canonicalEventOne()
**Definition**: Creates CanonicalType for single-lane event (payload=bool, unit=none, temporality=discrete).
**Type**: function
**Source**: 00-exhaustive-type-system.md:196-208

### canonicalEventField(instance)
**Definition**: Creates CanonicalType for per-lane event.
**Type**: function
**Source**: 00-exhaustive-type-system.md:210-222

---

## Type Assertion Helpers

### requireSignalType(t)
**Definition**: Asserts signal-ness. Throws if not signal (cardinality=one, temporality=continuous).
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P6

### requireFieldType(t)
**Definition**: Asserts field-ness. Returns InstanceRef. Throws if not field.
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P7

### requireEventType(t)
**Definition**: Asserts event-ness. Throws if not event (payload=bool, unit=none, temporality=discrete).
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P8

### isSignalType(t) / isFieldType(t) / isEventType(t)
**Definition**: Boolean check helpers. Never throw. Companion to require* helpers.
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P6-P8

---

## Expression IR

### ValueExpr ⚠️
**Definition**: Unified expression IR replacing SigExpr/FieldExpr/EventExpr.
**Type**: type
**Source**: 00-exhaustive-type-system.md:333-402
**Variants**: const | external | intrinsic | kernel | state | time
**Note**: Uses `op` discriminant (not `kind`) — see QUESTIONS A1
**Key Rule**: Every ValueExpr carries `type: CanonicalType`

### ConstValue
**Definition**: Discriminated union for constant values, keyed by payload kind.
**Type**: type
**Source**: 00-exhaustive-type-system.md:293-304
**Structure**: `{ kind: 'float'|'int'|'bool'|'vec2'|'vec3'|'color'|'cameraProjection', value: ... }`
**Key Rule**: NOT `number|string|boolean` — must be payload-shaped

---

## Validation

### AxisViolation
**Definition**: Diagnostic produced by axis validation pass.
**Type**: type
**Source**: 00-exhaustive-type-system.md:422-426
**Structure**: `{ exprIndex: number, op: string, message: string }`

### validateAxes(exprs)
**Definition**: Single enforcement point for axis validity.
**Type**: function
**Source**: 00-exhaustive-type-system.md:426-444
**Key Rules**:
- MUST check: axis-shape validity per expression family/kind
- MUST NOT: inference, adapters, coercions, backend rules
- LOCKED: Enforce only TRUE invariants, not "convenient expectations"

---

## Invariants

| ID | Name | Definition | Source |
|----|------|-----------|--------|
| I1 | Single authority | No field may duplicate type authority in CanonicalType | 15-FiveAxesTypeSystem:69 |
| I2 | Explicit ops | Only explicit ops change axes | 15-FiveAxesTypeSystem:74 |
| I3 | Centralized enforcement | One frontend validation gate | 15-FiveAxesTypeSystem:80 |
| I4 | State scoping | Storage keyed by branch + instance | 15-FiveAxesTypeSystem:89 |
| I5 | Const payload match | ConstValue is discriminated by payload kind | 15-FiveAxesTypeSystem:95 |

---

## Naming Conventions

From 09-NamingConvention.md:
- **Union name**: `<Domain><Role>` → ValueExpr, CompileStep, CanonicalType
- **Variant name**: `<UnionName><Op>` → ValueExprConst, ValueExprZip
- **No mixing**: Use `Expr` everywhere, not both `Expr` and `Expression`
- **No family prefix**: Never prefix variants with signal/field/event unless union itself is that family

## Abbreviations

| Abbreviation | Expansion | Context |
|--------------|-----------|---------|
| IR | Intermediate Representation | Compiler/runtime |
| DoD | Definition of Done | Completion criteria |
| SigExpr | Signal Expression | Legacy IR (to be replaced by ValueExpr) |
| FieldExpr | Field Expression | Legacy IR (to be replaced by ValueExpr) |
| EventExpr | Event Expression | Legacy IR (to be replaced by ValueExpr) |
