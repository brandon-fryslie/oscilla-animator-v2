# Implementation Context: Frontend Solver Completeness

Generated: 2026-02-01T14:00:00Z
Updated: 2026-02-01T15:00:00Z
Source: ChatGPT review feedback, EVALUATION-20260201-120000.md, codebase research

## 1. Cardinality Constraint Model

### Current state (verified 2026-02-01)

**Type infrastructure already exists:**
- `Cardinality = Axis<CardinalityValue, CardinalityVarId>` (`src/core/canonical-types.ts:550`)
- `Axis<T, V> = { kind: 'var', var: V } | { kind: 'inst', value: T }` (`canonical-types.ts:498-500`)
- `CardinalityVarId = Brand<string, 'CardinalityVarId'>` (`src/core/ids.ts:24`)
- `CardinalityValue = { kind: 'zero' } | { kind: 'one' } | { kind: 'many', instance: InstanceRef }` (`canonical-types.ts:545-548`)

So `Cardinality` can already represent variables (`{ kind: 'var', var: cardinalityVarId }`) — they're just never created.

**Block metadata already exists:**
- `BlockCardinalityMetadata` (`registry.ts:115-158`) with fields:
  - `cardinalityMode: 'preserve' | 'transform' | 'signalOnly' | 'fieldOnly'`
  - `laneCoupling: 'laneLocal' | 'laneCoupled'`
  - `broadcastPolicy: 'allowZipSig' | 'requireBroadcastExpr' | 'disallowSignalMix'`
- Query: `getBlockCardinalityMetadata(blockType: string)` (`registry.ts:616`)
- All math blocks declare `{ cardinalityMode: 'preserve', laneCoupling: 'laneLocal', broadcastPolicy: 'allowZipSig' }`
- Sin/Cos declare `{ cardinalityMode: 'preserve', broadcastPolicy: 'disallowSignalMix' }`
- Array block declares `{ cardinalityMode: 'transform', broadcastPolicy: 'allowZipSig' }`

**Current cardinality resolution (to be replaced):**
- `findFieldCardinalityFromUpstream()` in `analyze-type-constraints.ts:501-517` — simple upstream scan
- Used in fixpoint loop at lines 456-485 to specialize preserve-mode block outputs
- This is the prototype of the solver; it just needs generalization

### Target state

**Constraint template mapping** (no new `BlockDef` fields needed):

| `cardinalityMode` | `broadcastPolicy` | Constraint emitted |
|---|---|---|
| `preserve` | `allowZipSig` | `equal(all_inputs, all_outputs)` + allow `one` mixed with `many` (zip-broadcast) |
| `preserve` | `disallowSignalMix` | `equal(all_inputs, all_outputs)` + reject mixed cardinalities |
| `transform` | any | `fixed(output, many(instance_from_context))` |
| `signalOnly` | any | `fixed(each_port, one)` |
| `fieldOnly` | any | `require_many(each_port)` |

**Constraint types:**
```typescript
// In new file: src/compiler/frontend/solve-cardinality.ts
type CardinalityConstraint =
  | { kind: 'equal'; varId: CardinalityVarId; ports: readonly PortKey[] }
  | { kind: 'fixed'; port: PortKey; value: CardinalityValue }
  | { kind: 'zipBroadcast'; varId: CardinalityVarId; ports: readonly PortKey[] }
```

- `equal`: All ports share a union-find group. If any has a concrete value, all get it. Conflicting concrete values → error.
- `fixed`: Port has known concrete cardinality.
- `zipBroadcast`: Like `equal` but allows `one` + `many` coexistence (the `one` ports get auto-broadcast).

**Solver algorithm:**
1. Create union-find over `CardinalityVarId` groups
2. For each edge: if source port has concrete cardinality, propagate to target port's group
3. For `zipBroadcast` groups: if any port is `many(inst X)`, mark group as `many(inst X)`; `one` ports in the group get a Broadcast adapter inserted
4. After propagation: any group with no concrete value → error "cannot infer cardinality"
5. Write resolved cardinalities back to `portTypes` map

### Files to modify
- `src/compiler/frontend/solve-cardinality.ts` — **NEW FILE**: union-find solver (~100-150 lines)
- `src/compiler/frontend/analyze-type-constraints.ts` — replace `findFieldCardinalityFromUpstream` loop with `solveCardinality()` call
- **NO changes to `BlockDef` interface** — read existing `BlockCardinalityMetadata`
- **NO changes to block definition files** — existing metadata is sufficient

## 2. Instance Identity Resolution

### Current state
Backend (`lower-blocks.ts:411-428`) infers instance identity from `inferredInstance` context and rewrites output types with `withInstance(t, ref)`.

### Target state
Frontend solver resolves instance identity during Pass 1/2:
1. Instance-producing blocks (e.g., domain blocks) create concrete instance refs
2. Instance refs propagate along edges (if block A outputs `many(inst X)`, block B's connected input gets `many(inst X)`)
3. Cardinality constraint solver and instance propagation run together
4. By TypedPatch output, all `many(inst)` cardinalities have concrete refs

### Key insight
Instance propagation is just constraint propagation along edges. The same infrastructure used for cardinality unification handles instance identity.

### Files to modify
- `src/compiler/frontend/analyze-type-constraints.ts` — instance ref propagation during constraint gathering
- `src/compiler/frontend/analyze-type-graph.ts` — instance ref resolution during solving

## 3. Adapter Insertion Cleanup

### Current state
`src/compiler/frontend/normalize-adapters.ts` has comments about "temporary backward compatibility" for auto-insertion.

### Target state
- Auto-insertion stays (it's the correct design: frontend normalization with explicit adapter blocks)
- Remove "temporary" comments
- Verify no block-name lookups in adapter insertion (only `(fromType, toType)` and adapter registry)
- If block-specific adapter policy is needed, it must come from TypedPatch constraints, not runtime lookups

## 4. Performance Notes

- Union-find: O(α(n)) per operation (effectively constant)
- Instance propagation: Single pass over edges, O(E) where E = edge count
- Typical graph: 10-100 blocks, 20-200 edges → microsecond-scale solving
- No backtracking, no global search — deterministic propagation only
