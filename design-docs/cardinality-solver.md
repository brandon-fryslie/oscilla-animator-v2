# Cardinality Solver Spec (CT/ICT-First)

This spec defines cardinality polymorphism as a first-class axis whose behavior is declared directly on CanonicalType/InferenceCanonicalType port declarations.

## 1. Goals

1. `CanonicalType` / `InferenceCanonicalType` is the single authority for cardinality behavior.
2. Per-port flexibility, propagation semantics, and instance binding are all expressible in type declarations.
3. Block-level cardinality modes are migration-only compatibility shims and are not canonical.
4. Solver output is fully concrete (`inst`) before backend/runtime.

## 2. Type Model

Cardinality axis supports vars with policy:

```ts
type CardinalityRelation = 'uniform' | 'promoteToMany';
type CardinalityAcceptance = 'oneOrMany' | 'oneOnly' | 'manyOnly';
type CardinalityInstanceBinding =
  | 'inherit'
  | { kind: 'create'; domainType: DomainTypeId };

type CardinalityPolicy = {
  relation?: CardinalityRelation;
  acceptance?: CardinalityAcceptance;
  instanceBinding?: CardinalityInstanceBinding;
};

type Cardinality =
  | { kind: 'inst'; value: CardinalityValue }
  | ({ kind: 'var'; var: CardinalityVarId } & CardinalityPolicy);
```

Default policy for var axes:
- `relation: 'uniform'`
- `acceptance: 'oneOrMany'`
- `instanceBinding: 'inherit'`

## 3. Group Semantics

Ports are in the same cardinality group iff they share the same `CardinalityVarId`.

Behavior inside a group:
- `uniform`: all group members resolve to the same cardinality.
- `promoteToMany`: many evidence propagates through the group; `oneOnly` members remain one.

Per-port bound:
- `oneOnly`: contributes/accepts only `one`.
- `manyOnly`: contributes/accepts only `many(instance)`.
- `oneOrMany`: unconstrained by bound.

Instance binding:
- `inherit`: many uses upstream instance evidence.
- `create(domainType)`: solver/lowering binds many to a created instance in that domain.

## 4. Constraint Extraction Contract

Extractor reads port types and emits constraints.

Required extraction behavior:
1. Instantiate template cardinality vars per block instance.
2. Build groups from shared var ids.
3. Emit relation constraints from each group's `relation`.
4. Emit bound constraints from each var port's `acceptance`.
5. Emit instance-source constraints from each var port's `instanceBinding`.
6. Emit edge-equality cardinality constraints for graph wires.

Legacy metadata (`cardinalityMode`, `broadcastPolicy`, etc.) may be read only as fallback while migration is incomplete.

## 5. Solver Semantics

Solver resolves:
- `CardinalityVarId -> CardinalityValue`
- `InstanceVarId -> InstanceRef`

Errors:
- one/many conflicts under required equality
- incompatible many-instance unification
- unresolved instance vars at finalize

Diagnostic expectation:
- provenance must identify declaring ports and edges, not only block type names.

## 6. Examples

### 6.1 Uniform Elementwise Block

```ts
// all ports share one group and must match
A: C(uniform, oneOrMany, inherit)
B: C(uniform, oneOrMany, inherit)
Out: C(uniform, oneOrMany, inherit)
```

### 6.2 Mixed Layout Block

```ts
// signal controls fixed to one
rows: inst(one)
cols: inst(one)

// field lane ports share promoteToMany group
elements: C(promoteToMany, oneOrMany, inherit)
position: C(promoteToMany, oneOrMany, inherit)
rotation: C(promoteToMany, oneOrMany, inherit)
```

### 6.3 Instance-Creating Transform

```ts
// input may be signal/flexible depending on block semantics
element: C(uniform, oneOnly, inherit)

// outputs are many with created instance domain
elements: C(uniform, manyOnly, create(circle))
index:    C(uniform, manyOnly, create(circle))
```

## 7. Migration Rules

1. New blocks must declare cardinality behavior in CT/ICT.
2. Existing blocks may continue using mode metadata temporarily.
3. Extraction must prefer CT/ICT declarations when both are present.
4. Migration is complete when extractor has no mode-dispatch rewrite paths.

## 8. Non-Goals

1. Runtime implicit coercion is not part of this model.
2. Adapter auto-insertion policy is separate from type authority.
3. This spec does not prescribe UI behavior for presenting cardinality policies.
