---
parent: INDEX.md
---

# Glossary

> Authoritative definitions for all terms in this specification.
> Use these definitions consistently. When in doubt, this is the canonical source.

---

## A

### AdapterSpec
**Definition**: Full adapter specification with mandatory purity and stability fields. Describes how to insert a type-converting block between mismatched ports.
**Type**: type
**Canonical Form**: `AdapterSpec`
**Related**: [TypePattern](#typepattern), [ExtentPattern](#extentpattern), [ExtentTransform](#extenttransform)
**Source**: [Adapter Restructure](./migration/t2_adapter-restructure.md)

### Axis\<T, V\>
**Definition**: Polymorphic axis representation supporting either a type variable (inference) or an instantiated value. Resolution C1.
**Type**: type
**Canonical Form**: `Axis<T, V> = { kind: 'var'; var: V } | { kind: 'inst'; value: T }`
**Related**: [CardinalityAxis](#cardinalityaxis), [TemporalityAxis](#temporalityaxis), [BindingAxis](#bindingaxis)
**Source**: [CanonicalType](./type-system/t1_canonical-type.md)

### AxisViolation
**Definition**: Diagnostic produced by axis validation pass when a node violates axis-shape contracts.
**Type**: type
**Canonical Form**: `AxisViolation = { nodeKind: string, nodeIndex: number, message: string }` (Resolution Q11)
**Source**: [Axis Validation](./validation/t2_axis-validate.md)

## B

### BindingMismatchError
**Definition**: Structured diagnostic for binding axis unification failures. Replaces generic AxisUnificationError for binding cases.
**Type**: type
**Canonical Form**: `BindingMismatchError = { left: BindingValue, right: BindingValue, location: ..., remedy: 'insert-state-op' | 'insert-continuity-op' | 'rewire' }`
**Source**: Resolution Q9, [Diagnostics](./validation/t3_diagnostics.md)

### BindingValue
**Definition**: How values attach to identity across time/edits. Nominal tags with equality-only semantics — NOT a lattice, NOT ordered. Resolution Q2.
**Type**: type
**Canonical Form**: `BindingValue = unbound | weak | strong | identity`
**Related**: [Binding](./axes/t2_binding.md)
**Source**: [Binding](./axes/t2_binding.md)

### BranchValue
**Definition**: Which history line/worldline a value belongs to. Makes preview/undo/prediction safe by scoping state.
**Type**: type
**Canonical Form**: v0: `{ kind: 'default' }` / v1+: main | preview(id) | checkpoint(id) | undo(id) | prediction(id) | speculative(id) | replay(id)
**Source**: [Branch](./axes/t2_branch.md)

### BranchValue

## C

### CameraProjection
**Definition**: Closed string enum for camera projection modes. NOT a matrix.
**Type**: type
**Canonical Form**: `CameraProjection = 'orthographic' | 'perspective' | ...` (closed set, Resolution Q8)
**Related**: [PayloadType](#payloadtype), [ConstValue](#constvalue)
**Source**: [ConstValue](./type-system/t3_const-value.md)

### CanonicalType
**Definition**: The single type authority for all values. Composed of payload, unit, and extent.
**Type**: type
**Canonical Form**: `CanonicalType = { payload: PayloadType, unit: UnitType, extent: Extent }`
**Related**: [PayloadType](#payloadtype), [UnitType](#unittype), [Extent](#extent)
**Source**: [CanonicalType](./type-system/t1_canonical-type.md)

### CardinalityValue
**Definition**: How many lanes/elements a value represents.
**Type**: type
**Canonical Form**: `CardinalityValue = zero | one | many(instanceRef)`
**Related**: [Cardinality](./axes/t2_cardinality.md)
**Source**: [Cardinality](./axes/t2_cardinality.md)

### ConstValue
**Definition**: Discriminated union for constant values, keyed by payload kind. NOT `number | string | boolean`.
**Type**: type
**Canonical Form**: `{ kind: PayloadKind, value: ... }`
**Source**: [ConstValue](./type-system/t3_const-value.md)

### ConstValue
**Definition**: Discriminated union for constant values, keyed by payload kind. NOT `number | string | boolean`.
**Type**: type
**Canonical Form**: `{ kind: PayloadKind, value: ... }` — cameraProjection uses closed enum (Resolution Q8)
**Source**: [ConstValue](./type-system/t3_const-value.md)

## D

### DerivedKind
**Definition**: Classification (signal/field/event) derived from CanonicalType axes. NOT stored, NOT authoritative.
**Type**: concept
**Canonical Form**: `deriveKind(type): 'signal' | 'field' | 'event'`
**Related**: [Derived Classifications](./type-system/t2_derived-classifications.md)

## E

### Extent
**Definition**: The 5-axis extent describing evaluation semantics.
**Type**: type
**Canonical Form**: `Extent = { cardinality, temporality, binding, perspective, branch }`
**Related**: [CanonicalType](#canonicaltype)
**Source**: [Extent Axes](./type-system/t2_extent-axes.md)

### ExtentPattern
**Definition**: Pattern for matching extent axes in adapter rules.
**Type**: type
**Source**: [Adapter Restructure](./migration/t2_adapter-restructure.md)

### ExtentTransform
**Definition**: Description of how an adapter transforms extent axes.
**Type**: type
**Source**: [Adapter Restructure](./migration/t2_adapter-restructure.md)

## I

### InferenceCanonicalType
**Definition**: Inference-only type wrapper allowing payload and unit variables. MUST NOT escape frontend/solver boundary.
**Type**: type
**Canonical Form**: `InferenceCanonicalType = { payload: InferencePayloadType; unit: InferenceUnitType; extent: Extent }`
**Related**: [CanonicalType](#canonicaltype), [InferencePayloadType](#inferencepayloadtype)
**Source**: Resolution Q2, [Inference Types](./type-system/t2_inference-types.md)

### InferencePayloadType
**Definition**: Inference-only payload type with var branch for type variables. Only used by frontend/type solver.
**Type**: type
**Canonical Form**: `InferencePayloadType = PayloadType | { kind: 'var'; var: PayloadVarId }`
**Related**: [PayloadType](#payloadtype), [InferenceCanonicalType](#inferencecanonicaltype)
**Source**: Resolution Q2, [Inference Types](./type-system/t2_inference-types.md)

### InferenceUnitType
**Definition**: Inference-only unit type with var branch. Only used by frontend/type solver.
**Type**: type
**Canonical Form**: `InferenceUnitType = UnitType | { kind: 'var'; var: UnitVarId }`
**Related**: [UnitType](#unittype), [InferenceCanonicalType](#inferencecanonicaltype)
**Source**: Resolution Q2, [Inference Types](./type-system/t2_inference-types.md)

### InstanceRef
**Definition**: Reference to a specific instance within a domain, containing branded InstanceId and DomainTypeId.
**Type**: type
**Canonical Form**: `{ instanceId: InstanceId, domainTypeId: DomainTypeId }`
**Related**: [CardinalityValue](#cardinalityvalue)

## P

### PayloadType
**Definition**: The data shape of a value. Closed set.
**Type**: type
**Canonical Form**: `float | int | bool | vec2 | vec3 | color | cameraProjection`
**Related**: [CanonicalType](#canonicaltype), [payloadStride](#payloadstride)
**Source**: [CanonicalType](./type-system/t1_canonical-type.md)

### PerspectiveValue
**Definition**: Which coordinate frame interpretation applies to spatial values. NOT about 2D/3D rendering API.
**Type**: type
**Canonical Form**: v0: `{ kind: 'default' }` / v1+: world | view(id) | screen(id)
**Source**: [Perspective](./axes/t2_perspective.md)

### payloadStride
**Definition**: Function returning scalar lane count for a payload kind. ALWAYS derived, never stored.
**Type**: function
**Canonical Form**: `payloadStride(payload): number`
**Source**: [Derived Classifications](./type-system/t2_derived-classifications.md)

## R

### requireManyInstance
**Definition**: Asserts field-ness. Returns InstanceRef. Throws if not many-instanced. Resolution C3.
**Type**: function
**Canonical Form**: `requireManyInstance(t: CanonicalType): InstanceRef`
**Source**: [Derived Classifications](./type-system/t2_derived-classifications.md)

## T

### TemporalityValue
**Definition**: Which evaluation clock governs presence/updates.
**Type**: type
**Canonical Form**: `continuous | discrete`
**Source**: [Temporality](./axes/t2_temporality.md)

### tryDeriveKind
**Definition**: Partial helper returning DerivedKind or null when axes contain variables. Safe for UI/inference paths.
**Type**: function
**Canonical Form**: `tryDeriveKind(t: CanonicalType | InferenceCanonicalType): DerivedKind | null`
**Related**: [DerivedKind](#derivedkind), [deriveKind](./type-system/t2_derived-classifications.md)
**Source**: Resolution Q3, [Derived Classifications](./type-system/t2_derived-classifications.md)

### tryGetManyInstance
**Definition**: Pure query helper. Returns InstanceRef if cardinality=many, null otherwise. Never throws. Resolution C3.
**Type**: function
**Canonical Form**: `tryGetManyInstance(t: CanonicalType): InstanceRef | null`
**Source**: [Derived Classifications](./type-system/t2_derived-classifications.md)

### TypePattern
**Definition**: Extent-aware type matching pattern for adapter specs. Replaces flattened TypeSignature.
**Type**: type
**Source**: [Adapter Restructure](./migration/t2_adapter-restructure.md)

## U

### UnitType
**Definition**: Semantic interpretation/unit of a value. 8 structured kinds, NO var. Resolution C2.
**Type**: type
**Canonical Form**: `none | scalar | norm01 | count | angle(radians|degrees|phase01) | time(ms|seconds) | space(ndc|world|view, dims:2|3) | color(rgba01)`
**Source**: [CanonicalType](./type-system/t1_canonical-type.md)

## V

### ValueExpr
**Definition**: Unified expression IR replacing SigExpr/FieldExpr/EventExpr. Uses `kind` discriminant. Resolution A1.
**Type**: type
**Canonical Form**: `ValueExprConst | ValueExprExternal | ValueExprIntrinsic | ValueExprKernel | ValueExprState | ValueExprTime`
**Source**: [ValueExpr](./migration/t2_value-expr.md)

### validateAxes
**Definition**: Single enforcement point for axis validity. Produces AxisViolation diagnostics.
**Type**: function
**Canonical Form**: `validateAxes(exprs: readonly ValueExpr[]): AxisViolation[]`
**Source**: [Axis Validation](./validation/t2_axis-validate.md)

---

## Naming Conventions

### General Rules

- **Union name**: `<Domain><Role>` → ValueExpr, CompileStep, CanonicalType
- **Variant name**: `<UnionName><Op>` → ValueExprConst, ValueExprKernel
- **Discriminant field**: `kind` for ALL IR discriminated unions (Resolution A1)
- **No mixing**: Use `Expr` everywhere, not both `Expr` and `Expression`
- **No family prefix**: Never prefix variants with signal/field/event

### Identifier Conventions

- **Types**: PascalCase (CanonicalType, ValueExpr)
- **Functions**: camelCase, verb-first (deriveKind, validateAxes)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **Discriminant values**: camelCase (reduceField, not reduce_field)

---

## Deprecated Terms

| Deprecated | Use Instead | Notes |
|------------|-------------|-------|
| `SignalType` | `CanonicalType` | Legacy type alias — forbidden |
| `PortType` | `CanonicalType` | Legacy type alias — forbidden |
| `FieldType` | `CanonicalType` | Legacy type alias — forbidden |
| `EventType` | `CanonicalType` | Legacy type alias — forbidden |
| `ResolvedPortType` | `CanonicalType` | Legacy type alias — forbidden |
| `AxisTag<T>` | `Axis<T, V>` | Deprecated axis pattern |
| `getManyInstance` | `tryGetManyInstance` + `requireManyInstance` | Ambiguous API replaced by try/require |
| `TypeSignature` | `TypePattern` | Flattened 2-axis matching → 5-axis matching |
| `SigExpr` | `ValueExpr` | Legacy expression family |
| `FieldExpr` | `ValueExpr` | Legacy expression family |
| `EventExpr` | `ValueExpr` | Legacy expression family |

---

## Abbreviations

| Abbr | Expansion | Context |
|------|-----------|---------|
| IR | Intermediate Representation | Compiler/runtime |
| DoD | Definition of Done | Completion criteria |
