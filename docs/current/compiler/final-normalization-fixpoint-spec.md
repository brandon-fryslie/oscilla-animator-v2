# Final Normalization Fixpoint Architecture Specification

## Purpose

This document specifies the **Final Normalization Fixpoint Architecture** for the compiler frontend. It replaces the existing linear normalization pipeline with a deterministic, monotone, iterative normalization engine that cleanly separates **type solving** from **structural elaboration**.

This architecture exists to permanently resolve the class of bugs caused by performing default source insertion and adapter insertion *before* types are solved. It establishes a foundation on which future elaborations (lane alignment, domain elaboration, varargs materialization, etc.) can be added without introducing ordering hacks or partial canonical types.

This is a **foundational system**. All future normalization work must conform to the invariants defined here.

---

## Core Insight

Normalization is not a sequence of passes.
Normalization is a **fixpoint computation over graph structure**, driven by deferred obligations whose discharge depends on solved types.

The compiler frontend must therefore:

1. Represent *"we need to do something later, once types are known"* explicitly.
2. Solve types *purely* from the current graph.
3. Elaborate structure *only* when justified by solved facts.
4. Iterate until no further elaboration applies.

---

## Non-Negotiable Invariants

1. **CanonicalType is never partial.**
   CanonicalType must only appear after strict finalization. No vars. No placeholders.

2. **InferenceCanonicalType is the only var-bearing type.**
   There is exactly one inference type system. No parallel draft types.

3. **Solve is pure.**
   `solve(graph) -> substitutions`
   Deterministic, side-effect free, depends only on the current graph.

4. **Elaboration is monotone.**
   Discharging an obligation only adds or rewires structure. It never removes constraints or semantic information.

5. **Convergence is structural.**
   The fixpoint terminates when *no new obligations are added* and *no elaboration plans apply*.

6. **Stable identity is deterministic.**
   Same semantic input graph -> bit-identical normalized output.

7. **Inference -> Canonical is a single boundary.**
   `finalizeInferenceType()` is the only legal conversion.

---

## High-Level Pipeline

```
Patch
  -> Composite expansion (unchanged)
  -> buildDraftGraph()
  -> finalizeNormalizationFixpoint()
       (Solve -> Derive Obligations -> Plan -> Apply)*
  -> Varargs validation
  -> Block indexing
  -> Axis validation
  -> Cycle classification
  -> Frontend result
```

---

## DraftGraph

### Purpose

DraftGraph is the *single mutable structure* operated on during normalization. It contains blocks, edges, and obligations.

### Types

```ts
ObligationId   = branded string (deterministic)
BlockId        = string
EdgeId         = string
PortName       = string
PortDir        = 'in' | 'out'

PortRef = {
  blockId: BlockId
  port: PortName
  dir: PortDir
}

BlockOrigin =
  | 'user'
  | 'compositeInternal'
  | { kind: 'elaboration', obligationId: ObligationId, role: ElaboratedRole }

EdgeOrigin =
  | 'user'
  | 'compositeInternal'
  | { kind: 'elaboration', obligationId: ObligationId, role: ElaboratedRole }

ElaboratedRole =
  | 'defaultSource'
  | 'adapter'
  | 'laneAlignHelper'
  | 'internalHelper'

EdgeRole =
  | 'userWire'
  | 'defaultWire'
  | 'implicitCoerce'
  | 'internalHelper'

DraftBlock = {
  id: BlockId
  type: BlockTypeId
  params: any
  origin: BlockOrigin
}

DraftEdge = {
  id: EdgeId
  from: PortRef
  to: PortRef
  role: EdgeRole
  origin: EdgeOrigin
}

DraftGraphMeta = {
  revision: number
  provenance: any
}

DraftGraph = {
  blocks: DraftBlock[]        // stable sorted order
  edges: DraftEdge[]          // stable sorted order
  obligations: Obligation[]   // stable sorted order
  meta: DraftGraphMeta
}
```

### Construction

`buildDraftGraph(patch: Patch): DraftGraph`

- Runs after composite expansion
- Performs lens expansion (pure structural)
- Creates `missingInputSource` obligations for every unconnected input port
- Does not insert default sources or adapters
- All arrays are deterministically sorted

---

## Obligation System

### Concept

An Obligation represents deferred elaboration that cannot yet be performed because it depends on unresolved type information.

Obligations are:
- Created deterministically
- Evaluated repeatedly
- Discharged once their dependencies are satisfied
- Otherwise remain open (waiting) or become permanently blocked

### Types

```ts
ObligationKind =
  | 'missingInputSource'
  | 'needsAdapter'
  | 'needsLaneAlignment'
  | 'needsDomainElaboration'
  | 'needsVarargMaterialization'

FactDependency =
  | { kind: 'portCanonicalizable', port: PortRef }
  | { kind: 'portPayloadResolved', port: PortRef }
  | { kind: 'portUnitResolved', port: PortRef }
  | { kind: 'portAxisResolved', port: PortRef, axis: AxisName }

ObligationStatus =
  | { kind: 'open' }
  | { kind: 'discharged', elaborated: ElaboratedArtifactRefs }
  | { kind: 'blocked', reason: string, diagIds: string[] }

ObligationAnchor = {
  port?: PortRef
  edgeId?: EdgeId
  blockId?: BlockId
  laneGroupId?: string
}

ObligationPolicyRef = {
  name: string
  version: number
}

ObligationDebug = {
  createdBy: string
  note?: string
}

Obligation = {
  id: ObligationId
  kind: ObligationKind
  anchor: ObligationAnchor
  status: ObligationStatus
  deps: FactDependency[]
  policy: ObligationPolicyRef
  debug: ObligationDebug
}
```

### Semantics

- **Open**: waiting for dependencies
- **Discharged**: elaboration applied
- **Blocked**: permanently unsupported (not waiting)

Missing facts never cause `blocked`.

---

## Type Facts

### Purpose

TypeFacts represent the current best knowledge of port types after solving, without mutating the graph.

### Types

```ts
PortKey = `${BlockId}:${PortName}:${'in'|'out'}`

PortTypeHint = {
  status: 'ok' | 'unknown' | 'conflict'
  canonical?: CanonicalType
  inference?: InferenceCanonicalType
  diagIds: string[]
}

TypeFacts = {
  ports: Map<PortKey, PortTypeHint>
}
```

### Meaning

- `ok`: `finalizeInferenceType()` would succeed
- `unknown`: partially solved, vars remain
- `conflict`: solver contradiction

---

## Elaboration Plans

### Purpose

ElaborationPlans describe structural mutations derived from obligations.

### Types

```ts
ElaboratedArtifactRefs = {
  blockIds: BlockId[]
  edgeIds: EdgeId[]
}

ElaborationPlan = {
  obligationId: ObligationId
  role: ElaboratedRole
  addBlocks?: DraftBlock[]
  addEdges?: DraftEdge[]
  replaceEdges?: {
    remove: EdgeId
    add: DraftEdge[]
  }[]
  notes?: string
}
```

### Application

`applyElaborationPlan(graph, plan): DraftGraph`

- Deterministic IDs
- Idempotent (safe to reapply)
- Bumps `meta.revision`
- Never removes semantic constraints

---

## Policy System

### Purpose

Policies encapsulate how obligations are discharged.

### Interfaces

```ts
PolicyContext = {
  graph: DraftGraph
  registry: BlockRegistry
  facts: TypeFacts
  getHint(port: PortRef): PortTypeHint
}

PolicyResult =
  | { kind: 'plan', plan: ElaborationPlan }
  | { kind: 'blocked', reason: string, diagIds: string[] }

DefaultSourcePolicy = {
  name: 'defaultSources.v1'
  version: 1
  plan(o: Obligation, ctx: PolicyContext): PolicyResult
}

AdapterPolicy = {
  name: 'adapters.v1'
  version: 1
  plan(o: Obligation, ctx: PolicyContext): PolicyResult
}
```

Policies are never responsible for dependency checks.

---

## Fixpoint Driver

### API

```ts
finalizeNormalizationFixpoint(
  graph: DraftGraph,
  registry: BlockRegistry,
  options: { maxIterations: number, trace?: boolean }
): {
  graph: DraftGraph
  facts: TypeFacts
  strict: StrictTypedGraph | null
  diagnostics: any[]
}
```

### Loop

```
repeat:
  solve graph -> substitutions
  compute TypeFacts
  derive new obligations
  plan discharges
  apply plans

until:
  no new obligations added
  AND no plans applied
```

Termination is guaranteed by monotonicity and finite graph growth.

---

## Strict Finalization

`StrictTypedGraph` is produced only if:

- All required ports are `status: 'ok'`
- No obligations are `open`
- No conflicts exist

```ts
StrictTypedGraph = {
  graph: DraftGraph
  portTypes: Map<PortKey, CanonicalType>
  diagnostics: any[]
}
```

Otherwise, `strict` is `null`.

---

## Architectural Guarantees

- No partial CanonicalTypes
- No ordering hacks
- No type-dependent elaboration before solve
- Deterministic output
- Extensible obligation system

---

## Conclusion

This architecture replaces brittle normalization passes with a principled fixpoint computation that cleanly separates inference, decision-making, and structural elaboration. All future normalization features must integrate as obligations and policies within this framework.
