---
command: /canonicalize-architecture (expanded source set + resolutions applied)
files: all spec + planning files + 99-INVARIANTS-FOR-USAGE.md
indexed: true
source_files:
  - design-docs/canonical-types/00-exhaustive-type-system.md
  - design-docs/canonical-types/15-FiveAxesTypeSystem-Conclusion.md
  - design-docs/canonical-types/99-INVARIANTS-FOR-USAGE.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012100-constructors-helpers-PLAN.md
  - .agent_planning/canonical-type-system/SPRINT-20260129-012400-unit-restructure-PLAN.md
topics:
  - type-system
  - axes
  - validation
  - migration
---

# Canonical Glossary: CanonicalType System

Generated: 2026-01-29T23:15:00Z
Supersedes: CANONICALIZED-GLOSSARY-canonical-types-20260129-225309.md

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
**Note**: Implementation also has `shape` kind (8 stride) - not in spec. Planning (EVALUATION-20260129) lists 8 kinds.
**Related**: CanonicalType, payloadStride

### UnitType
**Definition**: The semantic interpretation/unit of a value. Inseparable from payload. 8 structured kinds; NO `{ kind: 'var' }` in canonical type.
**Type**: type
**Source**: 00-exhaustive-type-system.md:138-143 (original 5 kinds), SPRINT-unit-restructure-PLAN:P1 (8 structured kinds, LOCKED)
**Canonical Values**: none | scalar | norm01 | count | angle(radians|degrees|phase01) | time(ms|seconds) | space(ndc|world|view, dims:2|3) | color(rgba01)
**LOCKED**: NO `{ kind: 'var' }` in canonical type - unit variables belong in inference-only wrappers
**Status**: RESOLVED (C2)
**Related**: CanonicalType

### Extent
**Definition**: The 5-axis extent describing evaluation semantics of a value.
**Type**: type
**Source**: 00-exhaustive-type-system.md:113-119
**Structure**: `{ cardinality, temporality, binding, perspective, branch }`
**Related**: CanonicalType, CardinalityAxis, TemporalityAxis, BindingAxis, PerspectiveAxis, BranchAxis

---

## Axis Pattern

### Axis<T, V>
**Definition**: Polymorphic axis representation supporting either a type variable or an instantiated value.
**Type**: type
**Source**: 00-exhaustive-type-system.md:65-67
**Canonical**: `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`
**Implementation**: `AxisTag<T>` is deprecated; canonical is `Axis<T, V>` (C1 resolved).
**Status**: RESOLVED (C1)
**Related**: CardinalityAxis, TemporalityAxis, BindingAxis, PerspectiveAxis, BranchAxis

---

## Extent Axes

### CardinalityAxis / CardinalityValue
**Definition**: How many lanes/elements this value represents.
**Type**: type
**Source**: 15-FiveAxesTypeSystem-Conclusion.md:20-25
**Values**: zero | one | many(instanceRef)
**Semantics**:
- `zero`: compile-time-only value, no runtime lanes, no per-frame storage. Must be lifted via explicit ops to become `one` or `many`. Const blocks emit zero. NOT "scalar" (Q1 resolved).
- `one`: one value per frame (signal-like)
- `many(instanceRef)`: one value per lane (field-like)
**Key Rule**: Instance identity lives ONLY here
**Lift Rule**: zero → one via `broadcastConstToSignal`; zero → many via `broadcastConstToField`. No implicit coercion.

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
**Semantics**: Nominal tags (NOT a lattice, NOT ordered). Unified by equality only. Intent labels constraining what ops are allowed (Q2 resolved):
- `unbound`: no continuity identity requirement; safe default
- `weak`: continuity may attempt association if referent available in operation config
- `strong`: continuity requires referent association in operation config; missing = compile error
- `identity`: continuity must preserve lane identity 1:1; if impossible = error
**LOCKED**: NO `referent` field on any variant. Referents belong in continuity policies / StateOp args (A4 resolved).
**Key Rule**: DO NOT describe as "stronger/weaker", "partial order", "lattice", "join", or "meet". Meaning is enforced where binding is consumed, not by ordering.
**Purpose**: Prevents "lanes got reindexed and state jumped" problems

### PerspectiveAxis / PerspectiveValue
**Definition**: Which view-space/coordinate frame interpretation applies.
**Type**: type
**Source**: 11-Perspective.md:27-49
**Current Values**: `{ kind: 'default' }` (v0)
**Full Domain (v1+)**: world | view(id) | screen(id) (G1 resolved - include in spec, mark non-default as future)
**Key Rule**: NOT about "2D vs 3D rendering API" - about coordinate frame semantics

### BranchAxis / BranchValue
**Definition**: Which history line/worldline this value belongs to.
**Type**: type
**Source**: 12-Branch.md:39-49
**Current Values**: `{ kind: 'default' }` (v0)
**Full Domain (v1+)**: main | preview(id) | checkpoint(id) | undo(id) | prediction(id) | speculative(id) | replay(id) (G1 resolved)
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

## Instance Extraction Helpers

### tryGetManyInstance (LOCKED canonical name)
**Definition**: Pure query helper. Returns InstanceRef if cardinality=many(instance), null otherwise. Never throws.
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P5 (LOCKED)
**Signature**: `tryGetManyInstance(t: CanonicalType): InstanceRef | null`
**Use in**: UI rendering, diagnostic probes, when handling incomplete types
**Status**: RESOLVED (C3, T1)

### requireManyInstance (LOCKED canonical name)
**Definition**: Asserts field-ness. Returns InstanceRef. Throws with crisp error if not many-instanced.
**Type**: function
**Source**: SPRINT-constructors-helpers-PLAN:P5 (LOCKED)
**Signature**: `requireManyInstance(t: CanonicalType): InstanceRef`
**Use in**: Compiler backend, lowering, axis validation (field-expected paths)
**Status**: RESOLVED (C3, T1)

### getManyInstance (SUPERSEDED - do not use)
**Definition**: Original spec name. Replaced by tryGetManyInstance + requireManyInstance.
**Type**: function (deprecated)
**Source**: 00-exhaustive-type-system.md:230-246

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

### ValueExpr
**Definition**: Unified expression IR replacing SigExpr/FieldExpr/EventExpr.
**Type**: type
**Source**: 00-exhaustive-type-system.md:333-402
**Variants**: const | external | intrinsic | kernel | state | time
**Discriminant**: `kind` (resolved A1 - consistent with all existing IR unions)
**Key Rule**: Every ValueExpr carries `type: CanonicalType`

### ConstValue
**Definition**: Discriminated union for constant values, keyed by payload kind.
**Type**: type
**Source**: 00-exhaustive-type-system.md:293-304
**Structure**: `{ kind: 'float'|'int'|'bool'|'vec2'|'vec3'|'color'|'cameraProjection', value: ... }`
**Key Rule**: NOT `number|string|boolean` - must be payload-shaped

---

## Adapter Types (RESOLVED A2)

### TypePattern
**Definition**: Extent-aware type matching pattern for adapter specs. Replaces flattened `TypeSignature`.
**Type**: type
**Source**: SPRINT-adapter-spec-PLAN (LOCKED)
**Key Rule**: Adapter matching is defined purely over CanonicalType patterns (payload/unit/extent)

### ExtentPattern
**Definition**: Pattern for matching extent axes in adapter rules.
**Type**: type
**Source**: SPRINT-adapter-spec-PLAN

### ExtentTransform
**Definition**: Description of how an adapter transforms extent axes.
**Type**: type
**Source**: SPRINT-adapter-spec-PLAN

### AdapterSpec
**Definition**: Full adapter specification with mandatory purity and stability fields.
**Type**: type
**Source**: SPRINT-adapter-spec-PLAN
**Required Fields**: `purity: 'pure'`, `stability: 'stable'`
**Location**: `src/blocks/adapter-spec.ts` (not `src/graph/adapters.ts`)

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
- **Union name**: `<Domain><Role>` -> ValueExpr, CompileStep, CanonicalType
- **Variant name**: `<UnionName><Op>` -> ValueExprConst, ValueExprZip
- **Discriminant field**: `kind` for all IR discriminated unions (A1 resolved)
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
