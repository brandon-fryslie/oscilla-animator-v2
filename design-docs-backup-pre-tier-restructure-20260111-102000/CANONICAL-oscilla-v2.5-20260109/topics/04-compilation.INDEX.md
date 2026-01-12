# Compilation Pipeline - Indexed Summary

**Tier**: T2 (Core Architecture)
**Size**: 488 lines → ~110 lines (23% compression)

## Pipeline Stages [L19-61]
```
RawGraph → GraphNormalization → NormalizedGraph → Compilation → CompiledProgramIR
```
- **I6**: Compiler never mutates graph
- **I9**: Schedule is data

## NormalizedGraph [L65-120]
```typescript
type NormalizedGraph = {
  domains: DomainDecl[];
  nodes: Node[];
  edges: Edge[];
};
```

**Properties**:
- Explicitly closed (all derived blocks materialized)
- Fully connected (every input has one source)
- Typed ports (SignalType)
- Immutable input to compiler

**IDs**: NodeId, PortId, EdgeId, NodeRef, PortRef, EdgeRef [L84-94]

**Port Structure** [L96-119]
- Direction: in/out
- Type: SignalType (5-axis)
- Combine: CombineMode (on input port, not edge)

## Domain Declarations [L123-136]
```typescript
type DomainDecl =
  | { kind: 'domain_decl'; shape: { kind: 'fixed_count'; count } }
  | { kind: 'domain_decl'; shape: { kind: 'grid_2d'; width, height } }
  | { kind: 'domain_decl'; shape: { kind: 'voices'; maxVoices } }
  | { kind: 'domain_decl'; shape: { kind: 'mesh_vertices'; assetId } };
```
**v0 invariant**: Dense lanes 0..N-1

## Type Unification [L139-191]
**Propagation**: Two passes
1. Infer missing structure
2. Unify + resolve defaults

**Rules** [L158-165]:
```
default + default                    → default
default + instantiated(X)            → instantiated(X)
instantiated(X) + instantiated(X)    → instantiated(X)
instantiated(X) + instantiated(Y)    → TYPE ERROR
```

**Unification points**: Edge types, multi-input ops, combine point [L169-174]

**Default Resolution** [L175-191]: Use DEFAULTS_V0, FRAME_V0

## Cycle Detection [L194-217]
**Algorithm**: Tarjan's SCC
**Validation**: Every SCC must contain ≥1 stateful primitive (UnitDelay, Lag, Phasor, SampleAndHold) [L202-206]
**Error**: CycleError with suggestion [L210-217]

## Scheduling [L221-256]
**I9**: Schedule is data structure
```typescript
interface Schedule {
  steps: Step[];
  stateSlots: StateSlotDecl[];
  fieldSlots: FieldSlotDecl[];
  scalarSlots: ScalarSlotDecl[];
}
```

**Step Types** [L238-247]:
- eval_scalar, eval_field, eval_event
- state_read, state_write
- combine
- render

**Order** [L249-255]:
1. Read external inputs
2. Update time
3. Evaluate topological order
4. Process events
5. Write render sinks

## Slot Allocation [L259-285]
**I8**: Slot-addressed execution (names are UI, runtime uses indices)

**Allocation by cardinality**:
| Cardinality | Slot Type |
|-------------|-----------|
| zero | Inlined constant |
| one | ScalarSlot |
| many(domain) | FieldSlot |

**State**: `cardinality = one` → 1 cell; `many(domain)` → N cells

## CompiledProgramIR [L288-333]
No binding/perspective/branch at runtime (erased) [L301]

**Lowered Operations**:
- scalar_unary, scalar_binary [L308-309]
- field_unary, field_binary [L311-313]
- broadcast_scalar_to_field, reduce_field_to_scalar [L315-317]
- state_read, state_write [L320-321]
- event_read, event_write [L324-325]
- render_sink_write [L328]

**Loop Lowering** [L335-353]: FixedCount/Voices single loop; Grid2D with optional (x,y) helpers

## Runtime Erasure [L357-371]
Hard constraints (5-10ms budget):
- No axis tags in runtime
- No referent ids
- No domain objects (only bounds + layout constants)
- Perspective/Branch are v0 defaults only

## Structural Sharing [L374-392]
**I13**: Hash-consing - identical FieldExpr/SignalExpr subtrees share ExprId

## Cache Keys [L395-413]
**I14**: Every cache has explicit keys:
```typescript
interface CacheKey {
  time?: number;
  domain?: DomainId;
  upstreamSlots: SlotRef[];
  params: Record<string, unknown>;
  stateVersion?: number;
}
```

## Error Handling [L415-441]
**Type Errors**: axis_mismatch, domain_mismatch, invalid_phase_op, unresolved_type
**Graph Errors**: invalid_cycle, missing_input, invalid_edge
**Attribution**: Location info for UI display

## Polymorphism [L444-477]
**Generic Blocks**: Over (World, Domain) with constraints
**Monomorphization**: Each instance compiles to concrete IR, no runtime polymorphism

## Related
- [01-type-system](./01-type-system.md)
- [02-block-system](./02-block-system.md)
- [05-runtime](./05-runtime.md)
- [Invariants](../INVARIANTS.md) - I6, I8, I9, I13, I14
