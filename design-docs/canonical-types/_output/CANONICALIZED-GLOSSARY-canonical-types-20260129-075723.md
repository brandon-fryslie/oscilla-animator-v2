---
command: /canonicalize-architecture design-docs/canonical-types/
files: 00-exhaustive-type-system.md 01-CanonicalTypes.md 02-How-To-Get-There.md 03-Types-Analysis.md 04-CanonicalTypes-Analysis.md 05-LitmusTest.md 06-DefinitionOfDone-90%.md 07-DefinitionOfDone-100%.md 09-NamingConvention.md 10-RulesForNewTypes.md 11-Perspective.md 12-Branch.md 14-Binding-And-Continuity.md 15-FiveAxesTypeSystem-Conclusion.md
indexed: true
source_files:
  - design-docs/canonical-types/00-exhaustive-type-system.md
  - design-docs/canonical-types/01-CanonicalTypes.md
  - design-docs/canonical-types/02-How-To-Get-There.md
  - design-docs/canonical-types/03-Types-Analysis.md
  - design-docs/canonical-types/04-CanonicalTypes-Analysis.md
  - design-docs/canonical-types/05-LitmusTest.md
  - design-docs/canonical-types/06-DefinitionOfDone-90%.md
  - design-docs/canonical-types/07-DefinitionOfDone-100%.md
  - design-docs/canonical-types/09-NamingConvention.md
  - design-docs/canonical-types/10-RulesForNewTypes.md
  - design-docs/canonical-types/11-Perspective.md
  - design-docs/canonical-types/12-Branch.md
  - design-docs/canonical-types/14-Binding-And-Continuity.md
  - design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md
---

# Canonical Glossary: CanonicalType System

Generated: 2026-01-29T07:57:23Z
Supersedes: None (first run)

## Usage

This glossary contains authoritative definitions for all terms in the CanonicalType domain.
Use these definitions consistently across all documentation and implementation.

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
**Related**: CanonicalType, payloadStride

### UnitType
**Definition**: The semantic interpretation/unit of a value. Inseparable from payload.
**Type**: type
**Source**: 00-exhaustive-type-system.md:138-143
**Values**: none | scalar | norm01 | angle(radians|degrees|phase01) | time(ms|seconds)
**Related**: CanonicalType

### Extent
**Definition**: The 5-axis extent describing evaluation semantics of a value.
**Type**: type
**Source**: 00-exhaustive-type-system.md:113-119
**Structure**: `{ cardinality, temporality, binding, perspective, branch }`
**Related**: CanonicalType, CardinalityAxis, TemporalityAxis

---

## Extent Axes

### CardinalityAxis
**Definition**: How many lanes/elements this value represents.
**Type**: type
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:20-25
**Values**: zero | one | many(instanceRef)
**Semantics**: 
- `zero`: no value / absent
- `one`: one value per frame (signal-like)
- `many(instanceRef)`: one value per lane (field-like)
**Key Rule**: Instance identity lives ONLY here

### TemporalityAxis
**Definition**: Which evaluation clock governs presence/updates.
**Type**: type
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:27-31
**Values**: continuous | discrete
**Semantics**:
- `continuous`: value defined for every frame
- `discrete`: value defined only at ticks/edges (event-like)

### BindingAxis
**Definition**: How values attach to identity across time/edits.
**Type**: type
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:33-38
**Values**: unbound | weak | strong | identity
**Purpose**: Prevents "lanes got reindexed and state jumped" problems

### PerspectiveAxis
**Definition**: Which view-space/coordinate frame interpretation applies.
**Type**: type
**Source**: 11-Perspective.md:27-49
**Values**: world | view(perspectiveId) | screen(perspectiveId)
**Key Rule**: NOT about "2D vs 3D rendering API" - about coordinate frame semantics

### BranchAxis
**Definition**: Which history line/worldline this value belongs to.
**Type**: type
**Source**: 12-Branch.md:39-49
**Values**: main | preview(id) | checkpoint(id) | undo(id) | prediction(id) | speculative(id) | replay(id)
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

## Expression IR

### ValueExpr
**Definition**: Unified expression IR replacing SigExpr/FieldExpr/EventExpr.
**Type**: type
**Source**: 00-exhaustive-type-system.md:333-402
**Variants**: const | external | intrinsic | kernel | state | time
**Key Rule**: Every ValueExpr carries `type: CanonicalType`

### ConstValue
**Definition**: Discriminated union for constant values, keyed by payload kind.
**Type**: type
**Source**: 00-exhaustive-type-system.md:293-304
**Structure**: `{ kind: 'float'|'int'|'bool'|'vec2'|'vec3'|'color'|'cameraProjection', value: ... }`
**Key Rule**: NOT `number|string|boolean` - must be payload-shaped

---

## Branded IDs

### InstanceId
**Definition**: Branded string identifying a domain instance.
**Type**: type
**Source**: 00-exhaustive-type-system.md:15
**Location**: MUST be in core/ids.ts (source of truth)

### DomainTypeId
**Definition**: Branded string identifying a domain type.
**Type**: type
**Source**: 00-exhaustive-type-system.md:16

### InstanceRef
**Definition**: Reference to a specific instance: instanceId + domainTypeId.
**Type**: type
**Source**: 00-exhaustive-type-system.md:79-82
**Structure**: `{ instanceId: InstanceId, domainTypeId: DomainTypeId }`

---

## Helpers

### deriveKind(type)
**Definition**: Derives signal/field/event classification from CanonicalType.
**Type**: function
**Source**: 00-exhaustive-type-system.md:230-239
**Returns**: 'signal' | 'field' | 'event'

### tryGetManyInstance(type)
**Definition**: TRY Extracts InstanceRef from many-cardinality types.  Used for UI and validation, does not fail if not many instanced
**Type**: function
**Source**: 00-exhaustive-type-system.md:241-246
**Returns**: InstanceRef | null

### requireManyInstance(type)
**Definition**: REQUIRE Extracts InstanceRef from many-cardinality types.  Fails if not many instanced
**Type**: function
**Source**: 00-exhaustive-type-system.md:241-246
**Returns**: InstanceRef | null

### payloadStride(payload)
**Definition**: Returns component count for a payload type.
**Type**: function
**Source**: 00-exhaustive-type-system.md:310-317
**Returns**: 1 (float/int/bool) | 2 (vec2) | 3 (vec3) | 4 (color)

---

## Constructors

### canonicalSignal(payload, unit)
**Definition**: Creates CanonicalType with cardinality=one, temporality=continuous.
**Type**: function
**Source**: 00-exhaustive-type-system.md:163-175

### canonicalField(payload, unit, instance)
**Definition**: Creates CanonicalType with cardinality=many(instance), temporality=continuous.
**Type**: function
**Source**: 00-exhaustive-type-system.md:177-189

### canonicalEventOne()
**Definition**: Creates CanonicalType for single-lane event (payload=bool, unit=none, temporality=discrete).
**Type**: function
**Source**: 00-exhaustive-type-system.md:196-208

### canonicalEventField(instance)
**Definition**: Creates CanonicalType for per-lane event.
**Type**: function
**Source**: 00-exhaustive-type-system.md:210-222

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
- Output: AxisViolation[] (AxisInvalid diagnostic category)

---

## Naming Conventions

From 09-NamingConvention.md:

- **Union name**: `<Domain><Role>` → ValueExpr, CompileStep, CanonicalType
- **Variant name**: `<UnionName><Op>` → ValueExprConst, ValueExprZip
- **No mixing**: Use `Expr` everywhere, not both `Expr` and `Expression`
- **No family prefix**: Never prefix variants with signal/field/event unless union itself is that family

---

## Abbreviations

| Abbreviation | Expansion | Context |
|--------------|-----------|---------|
| IR | Intermediate Representation | Compiler/runtime |
| DoD | Definition of Done | Completion criteria |
| SigExpr | Signal Expression | Legacy IR (to be replaced) |
| FieldExpr | Field Expression | Legacy IR (to be replaced) |
| EventExpr | Event Expression | Legacy IR (to be replaced) |
