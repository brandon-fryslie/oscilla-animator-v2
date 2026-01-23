---
topic: 04
name: Compilation Pipeline
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md
audited: 2026-01-23T00:30:00Z
has_gaps: true
counts: { done: 22, partial: 8, wrong: 3, missing: 6, na: 3 }
---

# Topic 04: Compilation Pipeline

## DONE

- **Pipeline stages (RawGraph -> NormalizedGraph -> CompiledProgramIR)**: `src/compiler/compile.ts:102-318` implements Patch -> normalize -> Pass2-7 -> CompiledProgramIR
- **Compiler never mutates the graph (I6)**: Passes thread immutable `blocks`/`edges` arrays through; each pass produces new output types extending the input — `src/compiler/ir/patches.ts`
- **Graph normalization makes structure explicit**: `src/graph/passes/index.ts` runs Pass 0 (polymorphic types), Pass 1 (default sources), Pass 2 (adapters), Pass 3 (indexing)
- **NormalizedPatch has blocks + edges**: `src/graph/passes/pass3-indexing.ts:17-29` — `NormalizedPatch { patch, blockIndex, blocks, edges }`
- **Every input has source after normalization**: Pass 1 materializes default sources — `src/graph/passes/pass1-default-sources.ts`
- **IDs are string-branded types**: NodeId, StepId, ExprId, StateId, SlotId — `src/compiler/ir/Indices.ts:48-74`
- **Dense numeric indices for runtime**: NodeIndex, ValueSlot, StateSlotId, SigExprId, FieldExprId — `src/compiler/ir/Indices.ts:13-41`
- **Type checking in Pass 2**: `src/compiler/passes-v2/pass2-types.ts:277-363` validates type compatibility per edge
- **Axis unification rules (v0)**: `isTypeCompatible()` in pass2-types.ts checks payload, temporality, cardinality match
- **Cycle detection with Tarjan's SCC**: `src/compiler/passes-v2/pass5-scc.ts:47-65` — proper Tarjan algorithm
- **Cycle validation (stateful boundary required)**: `src/compiler/passes-v2/pass5-scc.ts:109-127` checks `hasStateBoundary`
- **Scheduling order (I9 - schedule is data)**: Pass 7 builds explicit step array — `src/compiler/passes-v2/pass7-schedule.ts:480-488`
- **Step types: evalSig, materialize, render, stateWrite, fieldStateWrite, evalEvent**: All present in `src/compiler/ir/types.ts:421-509`
- **Slot-addressed execution (I8)**: ValueSlot is branded number, runtime uses indices — `src/compiler/ir/Indices.ts:20`
- **ScalarSlot = ValueSlot (unified)**: Implementation note in spec allows unified slot type; implementation uses `ValueSlot` — `src/compiler/ir/Indices.ts:20`
- **State slot allocation with stride**: `IRBuilderImpl.allocStateSlot()` — `src/compiler/ir/IRBuilderImpl.ts:474-518` supports stride parameter
- **StateMappingScalar and StateMappingField**: `src/compiler/ir/types.ts:540-577` — both types defined with stable stateId, stride, initial
- **Expression forms: Signal path (Map, Zip, StateRead)**: `SigExpr` variants — `src/compiler/ir/types.ts:84-152`
- **Expression forms: Field path (Map, Zip, ZipSig, Broadcast)**: `FieldExpr` variants — `src/compiler/ir/types.ts:167-240`
- **Broadcast is explicit in IR**: `FieldExprBroadcast` — `src/compiler/ir/types.ts:195-198`
- **CompiledProgramIR output structure**: `src/compiler/ir/program.ts:53-84` — irVersion, signalExprs, fieldExprs, eventExprs, constants, schedule, outputs, slotMeta, debugIndex
- **SlotMetaEntry with storage, offset, type**: `src/compiler/ir/program.ts:150-171` — proper slot metadata

## PARTIAL

- **NormalizedGraph structure (spec: domains, nodes, edges)**: Spec requires `NormalizedGraph { domains: DomainDecl[]; nodes: Node[]; edges: Edge[] }`. Implementation has `NormalizedPatch { patch, blockIndex, blocks, edges }` — no explicit domain declarations at normalization level. Domains are declared at IR level via instances.
- **Anchor-based stable IDs for structural artifacts**: Spec requires `structNodeId = hash("structNode", anchor)` patterns. Implementation uses block ID sorting for deterministic ordering (`pass3-indexing.ts:74`) but does not implement anchor-based hashing for default sources/wire-state/bus junctions.
- **Type propagation (two passes: propagation + unification)**: Pass 2 validates compatibility but does not propagate types through unconnected ports or infer missing structure. It only checks existing edges for exact match.
- **Default resolution with DEFAULTS_V0 and FRAME_V0**: `getAxisValue()` + `DEFAULTS_V0` are used in pass2-types.ts for type comparison, but there is no explicit "resolve all defaults to concrete types" pass. Defaults are resolved implicitly where needed.
- **Scheduling order specifics**: Spec order is: (1) external inputs, (2) time, (3) topological, (4) events, (5) render. Implementation order is: evalSig, continuityMapBuild, materialize, continuityApply, evalEvent, render, stateWrite — `pass7-schedule.ts:480-488`. Missing: explicit "read external inputs" and "update time" phases (these happen in ScheduleExecutor before schedule execution).
- **Error attribution with location info**: CompileError has blockId/connectionId/portId — `src/compiler/compile.ts:61-67`. But not all error types include suggested fixes, and PortRef/NodeRef/EdgeRef spec types are not used.
- **DomainDecl shapes**: Spec defines fixed_count, grid_2d, voices, mesh_vertices. Implementation uses `InstanceDecl` with simpler `count: number | 'dynamic'` — `src/compiler/ir/types.ts:357-365`. No shape discriminants (grid_2d, voices, mesh_vertices).
- **Payload specialization at compile time**: Blocks use payload-generic patterns (Add works for float/vec2 etc) via `BlockPayloadMetadata` — `src/compiler/passes-v2/pass2-types.ts:206-244`. But no explicit payload-specialized opcode emission (`Add_f32`, `Add_vec2`). The same OpCode.Add is used regardless of payload type.

## WRONG

- **Slot allocation by cardinality (zero=inlined, one=ScalarSlot, many=FieldSlot)**: Spec distinguishes ScalarSlot, FieldSlot, EventSlot, StateSlot as separate types. Implementation uses unified `ValueSlot` for both scalar and field slots — `src/compiler/ir/Indices.ts:20`. The spec's Implementation Note allows this ("may use a unified slot type"), BUT the spec requires slot semantics to be preserved through type info stored in SlotMetaEntry. Current slotMeta does not distinguish scalar vs field purpose (uses 'object' storage for fields, 'f64' for scalars, but not semantically labeled).
- **Lowered Op types**: Spec defines explicit Op union (scalar_unary, scalar_binary, field_unary, field_binary, broadcast_scalar_to_field, reduce_field_to_scalar, state_read, state_write, event_read, event_write, render_sink_write). Implementation uses SigExpr/FieldExpr/EventExpr expression trees + Step types instead of lowered Ops. There is no Op-level IR. The expression-tree approach is a valid implementation choice but diverges from the spec's explicitly typed Op enum.
- **Stride by PayloadType table**: Spec requires stride knowledge at compile time (float=1, vec2=2, vec3=3, color=4). StateSlot allocation uses stride for state (`src/compiler/ir/IRBuilderImpl.ts:484`), but field materialization and ValueStore allocation do NOT account for payload stride. ValueStore uses `Float64Array` with one slot per value regardless of payload components. Objects map is used for multi-component values.

## MISSING

- **Hash-consing for structural sharing (I13)**: Spec requires identical SigExpr/FieldExpr subtrees to share an ExprId. Implementation uses sequential allocation — `sigExprId(this.sigExprs.length)` in `src/compiler/ir/IRBuilderImpl.ts:83`. No deduplication/hash-consing.
- **Cache keys (I14)**: Spec defines explicit `CacheKey { time, domain, upstreamSlots, params, stateVersion }`. Runtime uses stamp-based invalidation in FrameCache — `src/runtime/RuntimeState.ts:151-166`. No explicit cache key structure exists.
- **ReduceOp (reduce_field_to_scalar)**: Spec defines `ReduceOp = 'min' | 'max' | 'sum' | 'avg'` and `reduce_field_to_scalar` op. No reduce/fold operation exists in the expression forms or Step types.
- **Loop lowering with compile-time bounds**: Spec requires explicit loop constructs with compile-time constant bounds for grid_2d (with x/y helpers). Implementation uses Materializer that iterates instances at runtime — no compiled loop IR. This is a valid architectural choice but diverges from spec's "loop bounds are compile-time constants."
- **Type errors with PortRef/NodeRef/EdgeRef location**: Spec defines structured TypeError and GraphError types with specific location refs. Implementation uses string-based CompileError — `src/compiler/compile.ts:61-67`. No structured PortRef/NodeRef/EdgeRef in errors.
- **'unit' PayloadType (for pulse)**: Spec lists 'unit' as a PayloadType for pulse signals. `PayloadType` union in `src/core/canonical-types.ts:120-126` does not include 'unit'. Pulse uses `signalTypeTrigger('bool')` instead.

## N/A

- **Perspective/Branch axes**: "v0 defaults only" per spec — not implemented, correctly deferred
- **Runtime erasure of binding/perspective/branch**: N/A in v0 since these axes are not used
- **Wire-state sidecars / Bus junctions in normalization**: T2/T3 features; no bus or wire-state sidecar normalization is needed for MVP
