---
indexed: true
source: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/01-type-system.md
source_mtime: 2026-02-05
original_tokens: ~3100
index_tokens: ~1100
compression: 35.5%
index_version: 2.0
---

# Index: 01-type-system.md

## Key Assertions

- **Single Type Authority**: CanonicalType is the ONLY type authority for all values [L17-41]
- **MUST NOT** store signal/field/event as authoritative — derive via `deriveKind()` [L23-31]
- **MUST** use `Axis<T, V>` (var|inst) for all axis representations [L222-237]
- **MUST** distinguish PayloadType (domain model) from TypeScript `number` (implementation detail) [L108]
- **Domain is NOT a wire value** — compile-time resource only, erased at runtime [L700-704]
- **Discrete never implicitly fills time** — requires explicit stateful operator [L344-346]
- **No implicit merges, no best effort** on axis unification [L616]
- **v0 canonical defaults**: cardinality=one, temporality=continuous, binding=unbound, perspective=default, branch=default [L215-219]
- **Binding is NOT a lattice** — nominal tags with equality-only semantics, no ordering [L368]
- **Domain alignment (v0)**: same domain iff same InstanceId [L317]
- **No var in UnitType** — unit variables only in inference-only wrappers [L184-185]
- **ConstValue kind MUST match payload kind** — validated by `constValueMatchesPayload()` [L550]
- **Instance identity lives ONLY in cardinality.many** — no separate instanceId fields [L281]
- **var branches MUST NOT escape frontend** into backend/runtime/renderer [L235]

## Definitions

- **CanonicalType** [L50-54] - Complete contract: `{ payload: PayloadType, unit: UnitType, extent: Extent }`
- **PayloadType** [L71-80] - 9-kind discriminated union (float, int, bool, vec2, vec3, color, cameraProjection, shape2d, shape3d)
- **UnitType** [L173-181] - 8 structured kinds (none, scalar, norm01, count, angle, time, space, color)
- **Extent** [L202-208] - Five-axis coordinate (cardinality, temporality, binding, perspective, branch)
- **Axis\<T, V\>** [L228-231] - Polymorphic axis: `{ kind: 'var'; var: V } | { kind: 'inst'; value: T }`
- **CardinalityValue** [L255-258] - 3-variant union (zero, one, many with InstanceRef)
- **TemporalityValue** [L324-326] - 2-variant union (continuous, discrete)
- **BindingValue** [L361-365] - 4 nominal tags (unbound, weak, strong, identity)
- **PerspectiveValue** [L399] - v0: `{ kind: 'default' }` only; v1+: world, view, screen [L402-406]
- **BranchValue** [L420] - v0: `{ kind: 'default' }` only; v1+: main, preview, checkpoint, undo, prediction, speculative, replay [L423-431]
- **InstanceRef** [L284-287] - `{ instanceId: InstanceId, domainTypeId: DomainTypeId }` (branded)
- **deriveKind()** [L445-453] - Total, deterministic: discrete→event, many→field, else→signal
- **tryDeriveKind()** [L466-469] - Returns null when axes are var; never throws
- **payloadStride()** [L102-103] - Stride from payload only (float=1, vec2=2, vec3=3, color=4, etc.)
- **tryGetManyInstance / requireManyInstance** [L293-299] - Instance extraction (try=nullable, require=throws)
- **InferenceCanonicalType** [L516-520] - Frontend-only wrapper with var branches in payload/unit
- **ConstValue** [L540-547] - Discriminated union keyed by payload kind (7 variants)
- **DomainSpec** [L655-659] - Domain type with id, parent, intrinsics
- **InstanceDecl** [L689-696] - Instance declaration with id, domainType, maxCount, lifecycle
- **CameraProjection** [L118] - Closed enum: 'orthographic' | 'perspective'

## Invariants

- **I1**: PayloadType ∈ 9-kind closed set [L71-80]
- **I2**: Every axis uses Axis<T,V> discriminated union, not optional fields [L228-231]
- **I3**: Unification: inst(X)+inst(X)→inst(X); inst(X)+inst(Y)→TYPE ERROR [L609-613]
- **I4**: Domain referenced only via Cardinality.many, not as wire value [L700-703]
- **I5**: Discrete temporality never implicitly becomes continuous [L344-346]
- **I6**: v0 defaults: cardinality=one, temporality=continuous, binding=unbound [L215-219]
- **I7**: Every instance compiles to dense lanes 0..maxCount-1 [L704]
- **I8**: Phase arithmetic: phase+float→phase, phase*float→phase, phase+phase→TYPE ERROR [L711-716]
- **I9**: CanonicalType is single type authority (I32) [L17-41]
- **I10**: ConstValue.kind must match CanonicalType.payload.kind (I36) [L550]
- **I11**: No var in UnitType — inference only (I34) [L184-185]
- **I12**: Instance identity only in cardinality.many (I32) [L281]

## Data Structures

- **CanonicalType** [L50-54] - 3 fields (payload: PayloadType, unit: UnitType, extent: Extent)
- **PayloadType** [L71-80] - 9-variant discriminated union (kind field)
- **UnitType** [L173-181] - 8-variant union with structured nesting (angle/time/space/color have sub-fields)
- **Extent** [L202-208] - 5 fields (all typed Axis specializations)
- **Axis\<T, V\>** [L228-231] - 2-variant union (var, inst)
- **CardinalityValue** [L255-258] - 3-variant union (zero, one, many+InstanceRef)
- **BindingValue** [L361-365] - 4-variant union (nominal tags, NOT a lattice)
- **ConstValue** [L540-547] - 7-variant union (keyed by payload kind)
- **InferenceCanonicalType** [L516-520] - 3 fields (extends canonical with var branches)
- **DomainSpec** [L655-659] - 3 fields (id, parent, intrinsics)
- **InstanceDecl** [L689-696] - 6 fields (id, domainType, primitiveId, maxCount, countExpr?, lifecycle)

## Dependencies

**Depends on:**
- [02-block-system.md](./02-block-system.md) - How blocks use CanonicalType [L11, L748]
- [04-compilation.md](./04-compilation.md) - Type unification and resolution [L11, L749]
- [20-type-validation.md](./20-type-validation.md) - Enforcement gate and guardrails [L11, L750]
- [21-adapter-system.md](./21-adapter-system.md) - Adapter type patterns [L11, L751]
- [GLOSSARY.md](../GLOSSARY.md) - PayloadType, Extent, CanonicalType, UnitType [L12]
- [INVARIANTS.md](../INVARIANTS.md) - I22 Safe Modulation Ranges, I32-I36 Type System Soundness [L13]

**Referenced by:**
- Type unification rules (all five axes) [L605-622]
- Block interface definitions via CanonicalType [L45-62]
- CombineMode restrictions by PayloadType [L581-601]
- Constructor contracts [L558-577]

## Decisions

- **DECISION: Single Type Authority** [L17-41] — CanonicalType is the only type representation. No parallel systems. N representations drift.
- **DECISION: CanonicalType is a triple (payload, unit, extent)** [L50-54] — Unit is first-class, not inferred or optional
- **DECISION: Axis<T,V> polymorphism** [L222-237] — var is inference variable, not "default"; inst is instantiated value
- **DECISION: UnitType has 8 structured kinds** [L168-181] — Nested families (angle, time, space, color) collapse parameterized variations
- **DECISION: Five independent axes** [L197-219] — Enables future extensibility (binding, multi-view, branching)
- **DECISION: Domain as compile-time resource, not runtime wire value** [L700-703] — Erased to loop bounds at codegen
- **DECISION: Strict axis unification (no implicit merges)** [L605-616] — Compile-time only, no best-effort heuristics
- **DECISION: Canonical defaults in v0 with extensibility in v1+** [L215-219, L393-434] — perspective and branch default-only now
- **DECISION: Phase is float with unit:phase01, has special arithmetic** [L708-716] — phase+phase is TYPE ERROR
- **DECISION: Discrete temporality never implicitly becomes continuous** [L344-346] — Explicit causality via SampleAndHold
- **DECISION: Binding is NOT a lattice** [L358-389] — Nominal tags with equality-only semantics, no ordering
- **DECISION: ConstValue discriminated by payload kind** [L535-550] — Not number|string|boolean; validated by constValueMatchesPayload()
- **DECISION: Inference types are frontend-only** [L503-531] — InferenceCanonicalType MUST NOT escape to backend/runtime
- **DECISION: deriveKind() is the only classification authority** [L438-461] — Priority: event > field > signal

## Tier Classification

**T1 (Core, foundational)** - Type system is the foundation for all compile-time guarantees and block interfaces. All other systems (blocks, compilation, binding, adapters, validation) depend critically on type contracts. Five-axis model with CanonicalType triple (payload, unit, extent).
