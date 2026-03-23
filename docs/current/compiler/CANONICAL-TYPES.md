# CANONICAL-TYPES.md

Authoritative reference for the Oscilla v2.5 type system.
All type-related code MUST conform to this document.

**Implementation**: `src/core/canonical-types.ts`
**Validation gate**: `src/compiler/frontend/axis-validate.ts`
**Guardrails**: `.claude/rules/TYPE-SYSTEM-INVARANTS.md`

---

## 1. The Canonical Type

Every value in the system has exactly one type:

```typescript
interface CanonicalType {
  readonly payload: PayloadType;   // What it's made of
  readonly unit: UnitType;         // What it measures
  readonly extent: Extent;         // Where/when/about-what
}
```

There is no other type struct. No `SignalType`, no `FieldType`, no `PortType`.
`CanonicalType` is final and resolved — it never contains type variables.

---

## 2. Payload — What It's Made Of

Closed enum of concrete value shapes:

| Kind               | Stride | Example use            |
|--------------------|--------|------------------------|
| `float`            | 1      | Amplitude, frequency   |
| `int`              | 1      | Count, index           |
| `bool`             | 1      | Toggle, event trigger  |
| `vec2`             | 2      | 2D position            |
| `vec3`             | 3      | 3D position            |
| `color`            | 4      | RGBA color             |
| `cameraProjection` | 1      | Projection enum        |

Stride is **derived** via `payloadStride(payload)`, never stored.

Singletons: `FLOAT`, `INT`, `BOOL`, `VEC2`, `VEC3`, `COLOR`, `CAMERA_PROJECTION`.

---

## 3. Unit — What It Measures

Semantic annotation on the payload:

| Kind      | Variants                          |
|-----------|-----------------------------------|
| `none`    | —                                 |
| `scalar`  | —                                 |
| `norm01`  | —                                 |
| `count`   | —                                 |
| `angle`   | `radians`, `degrees`, `phase01`   |
| `time`    | `ms`, `seconds`                   |
| `space`   | `ndc`/`world`/`view` × 2D/3D     |
| `color`   | `rgba01`                          |

Constructors: `unitNone()`, `unitScalar()`, `unitPhase01()`, `unitRadians()`, `unitNdc2()`, etc.

Unit conversion (e.g. radians → degrees) requires an **explicit adapter block**, never implicit coercion.

---

## 4. Extent — 5 Orthogonal Axes

```typescript
interface Extent {
  readonly cardinality: Axis<CardinalityValue>;   // How many instances?
  readonly temporality: Axis<TemporalityValue>;   // Varies in time?
  readonly binding: Axis<BindingValue>;           // Who owns it?
  readonly perspective: Axis<PerspectiveValue>;   // Whose viewpoint?
  readonly branch: Axis<BranchValue>;             // Which universe?
}
```

Each axis uses the `Axis<T, V>` pattern:
- `{ kind: 'inst', value: T }` — resolved (required in CanonicalType)
- `{ kind: 'var', var: V }` — inference variable (frontend-only, forbidden in backend)

### Cardinality

| Value  | Meaning                      |
|--------|------------------------------|
| `zero` | Compile-time constant (universal donor) |
| `one`  | Single value (signal)        |
| `many` | Per-instance array (field), carries `InstanceRef` |

### Temporality

| Value        | Meaning                  |
|--------------|--------------------------|
| `continuous` | Varies smoothly per frame |
| `discrete`   | Event (fires or doesn't) |

### Binding / Perspective / Branch

Default values: `unbound`, `default`, `default`. Used for advanced instance semantics.

---

## 5. Derived Kind — Computed, Never Stored

The "kind" of a value is derived from extent, never stored as a field:

```
discrete temporality        → event
many cardinality            → field
zero cardinality            → const
one cardinality + continuous → signal
```

**Rule**: All dispatch uses this derivation via extent axes. No `kind: 'signal'` stored anywhere.

---

## 6. Resolvedness Predicate

A type is resolved when **all five axes** have `kind: 'inst'` (not `kind: 'var'`).

Enforcement: `validateNoVarAxes()` in `axis-validate.ts` runs before backend lowering. Any var axis is a hard error.

The frontend type solver (`analyze-type-constraints.ts`) eliminates all variables. Post-solve, every `CanonicalType` is fully instantiated.

---

## 7. Classification Rules

There is no standalone `classifyValue()` function. The `deriveKind()` function was explicitly deleted. Instead, code dispatches directly on extent axes:

```typescript
const card = requireInst(type.extent.cardinality, 'cardinality');
const tempo = requireInst(type.extent.temporality, 'temporality');
// dispatch on card.kind and tempo.kind
```

This is enforced by CI: `no-legacy-types.test.ts` fails if `deriveKind` reappears.

---

## 8. Type Compatibility

From `isTypeCompatible(from, to)` in `analyze-type-graph.ts`:

1. **Payload**: must match exactly
2. **Unit**: must match exactly by kind
3. **Temporality**: must match exactly
4. **Cardinality**: exact match, with relaxation for cardinality-preserve and cardinality-generic blocks
5. **Instance**: for `many → many`, domain and instance ID must match

No implicit conversions. No fallback defaults. `defaultUnitForPayload` is isolated to type constructors and never participates in compatibility checks.

---

## 9. Hard Invariants

- `discrete` temporality ⟹ `bool` payload + `none` unit (event)
- `many` cardinality always carries `InstanceRef`
- `ConstValue.kind` must equal `CanonicalType.payload.kind`
- All axes `inst` at backend boundary (no vars escape frontend)
- Only explicit ops (Broadcast, adapters) change axes; math kernels preserve extent

---

## 10. The Rule

> **No other type structs allowed.**
>
> Every value's type is `CanonicalType = { payload, unit, extent }`.
> Parallel type systems are forbidden.
> This is enforced by `forbidden-patterns.test.ts` and `no-legacy-types.test.ts`.

---

## Files

| File | Role |
|------|------|
| `src/core/canonical-types.ts` | Type definitions, constructors, equality, stride |
| `src/core/inference-types.ts` | Frontend-only inference wrappers (allows vars) |
| `src/compiler/frontend/axis-validate.ts` | Single validation gate |
| `src/compiler/frontend/analyze-type-constraints.ts` | Pass 1: type inference & solving |
| `src/compiler/frontend/analyze-type-graph.ts` | Pass 2: compatibility validation |
| `src/compiler/ir/patches.ts` | `TypedPatch` interface |
| `src/__tests__/forbidden-patterns.test.ts` | CI gate: banned symbols |
| `src/compiler/__tests__/no-legacy-types.test.ts` | CI gate: legacy eradication |
| `.claude/rules/TYPE-SYSTEM-INVARANTS.md` | 17 guardrails (DO/DON'T format) |
