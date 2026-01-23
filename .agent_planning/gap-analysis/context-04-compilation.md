---
topic: 04
name: Compilation Pipeline
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/topics/04-compilation.md
generated: 2026-01-23T00:30:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: []
blocks: []
---

# Context: Topic 04 — Compilation Pipeline

## What the Spec Requires

1. Pipeline: RawGraph -> GraphNormalization -> NormalizedGraph -> Compilation -> CompiledProgramIR
2. Compiler never mutates the graph (I6)
3. NormalizedGraph: { domains: DomainDecl[], nodes: Node[], edges: Edge[] }
4. NormalizedGraph properties: explicitly closed, fully connected, typed ports, immutable
5. Normalization invariants: pure/deterministic rewrite, ID-stable (anchor-based), single writer
6. Anchor-based stable IDs: structNodeId = hash("structNode", anchor)
7. DomainDecl shapes: fixed_count, grid_2d, voices, mesh_vertices
8. Type propagation: two passes (propagation + unification/resolution)
9. Axis unification rules: default+default=default, default+X=X, X+X=X, X+Y=ERROR
10. Default resolution with DEFAULTS_V0 and FRAME_V0
11. Cycle detection: Tarjan's SCC; cycles need stateful primitive (UnitDelay, Lag, Phasor, SampleAndHold)
12. Schedule is data (I9): Schedule { steps, stateSlots, fieldSlots, scalarSlots }
13. Step types: eval_scalar, eval_field, eval_event, state_read, state_write, combine, render
14. Scheduling order: inputs -> time -> topological -> events -> render sinks
15. Slot-addressed execution (I8): ScalarSlot, FieldSlot, EventSlot, StateSlot
16. Slot allocation by cardinality: zero=inlined, one=ScalarSlot, many=FieldSlot
17. Stride by PayloadType: float/int/phase/bool/unit=1, vec2=2, vec3=3, color=4
18. State allocation: StateMappingScalar, StateMappingField with stable StateId
19. Expression forms: Signal path (Map, Zip, StateRead), Field path (Map, Zip, ZipSig, Broadcast)
20. Broadcast is explicit in IR (never implicit at runtime)
21. CompiledProgramIR: Lowered Ops (scalar_unary, scalar_binary, field_unary, field_binary, broadcast, reduce, state_read/write, event_read/write, render_sink_write)
22. UnaryOp: sin, cos, abs, clamp, negate; BinaryOp: add, sub, mul, div, min, max; ReduceOp: min, max, sum, avg
23. Loop lowering with compile-time constant bounds
24. Runtime erasure: no axis tags, no referent ids, no domain objects at runtime
25. Hash-consing (I13): identical subtrees share ExprId
26. Cache keys (I14): explicit CacheKey structure
27. Payload specialization: concrete IR ops with no runtime polymorphism
28. Error types: TypeError (axis_mismatch, domain_mismatch, invalid_phase_op, unresolved_type), GraphError (invalid_cycle, missing_input, invalid_edge)

## Current State (Topic-Level)

### How It Works Now

The compilation pipeline is fully operational with 7 passes: normalization (4 sub-passes), type graph (Pass 2), time model (Pass 3), dependency graph (Pass 4), SCC cycle validation (Pass 5), block lowering (Pass 6), and schedule construction (Pass 7). It produces a `CompiledProgramIR` with expression tables (SigExpr, FieldExpr, EventExpr), slot metadata, schedule, and debug index. The architecture uses expression trees rather than lowered Op-level IR, with runtime interpretation via `SignalEvaluator` and `Materializer`. Blocks register lowering functions that emit expressions via an `IRBuilder` interface.

### Patterns to Follow

- Each pass extends the previous type (NormalizedPatch -> TypedPatch -> TimeResolvedPatch -> DepGraphWithTimeModel -> AcyclicOrLegalGraph)
- IRBuilder pattern for emitting expressions — `src/compiler/ir/IRBuilder.ts`
- Block registration with `lower` function — `src/blocks/registry.ts`
- Schedule construction in Pass 7 with explicit phase ordering
- Branded numeric types for type safety — `src/compiler/ir/Indices.ts`
- SlotMetaEntry for runtime type information — `src/compiler/ir/program.ts`

## Work Items

### WI-1: Add DomainDecl to NormalizedPatch

**Status**: PARTIAL
**Spec requirement**: NormalizedGraph includes `domains: DomainDecl[]` with shape variants (fixed_count, grid_2d, voices, mesh_vertices)
**Files involved**:

| File | Role |
|------|------|
| `src/graph/passes/pass3-indexing.ts` | NormalizedPatch type |
| `src/compiler/ir/types.ts:357-365` | InstanceDecl (current analog) |
| `src/compiler/ir/patches.ts` | Pass intermediate types |

**Current state**: NormalizedPatch has no domain declarations. Domains are represented as `InstanceDecl` at IR level with `count: number | 'dynamic'` — no shape discriminants.
**Required state**: NormalizedPatch includes `domains: DomainDecl[]` where `DomainDecl = { id, shape: fixed_count | grid_2d | voices | mesh_vertices }`.
**Suggested approach**: Add `domains` field to NormalizedPatch. During normalization (Pass 1 or new sub-pass), extract domain declarations from instance-creating blocks. Map InstanceDecl shapes to DomainDecl shapes.
**Risks**: Medium — requires understanding how domains are currently implicit in instance blocks.
**Depends on**: none

### WI-2: Implement Anchor-Based Stable IDs

**Status**: PARTIAL
**Spec requirement**: Structural artifacts get stable IDs from `hash("structNode", anchor)` patterns
**Files involved**:

| File | Role |
|------|------|
| `src/graph/passes/pass1-default-sources.ts` | Default source materialization |
| `src/graph/passes/pass3-indexing.ts` | Block indexing |

**Current state**: Block ordering is deterministic (sorted by ID in pass3-indexing.ts:74), but IDs for materialized default-source blocks are not anchor-based.
**Required state**: Default source blocks get IDs like `defaultSource:<blockId>:<portName>:<in|out>`. IDs survive copy/paste/undo.
**Suggested approach**: In pass1-default-sources.ts, generate block IDs using the anchor format. Ensure hash function is deterministic and stable.
**Risks**: Low — additive. Must verify existing patches don't break.
**Depends on**: none

### WI-3: Type Propagation Pass

**Status**: PARTIAL
**Spec requirement**: Two-pass type resolution: (1) propagation (infer missing), (2) unification + resolution
**Files involved**:

| File | Role |
|------|------|
| `src/compiler/passes-v2/pass2-types.ts` | Current type validation |

**Current state**: Pass 2 only validates type compatibility on existing edges. It does not propagate types through unconnected ports or infer types for cardinality-generic blocks.
**Required state**: Full type propagation that fills in AxisTag.default values, then unification pass that resolves all defaults.
**Suggested approach**: Split Pass 2 into 2a (propagation) and 2b (unification/resolution). 2a walks the graph forward, inferring output types from input types for generic blocks. 2b resolves remaining defaults.
**Risks**: High — architectural change to type system. Needs careful design for cardinality-generic and payload-generic blocks.
**Depends on**: none

### WI-4: ReduceOp (Field-to-Scalar Reduction)

**Status**: MISSING
**Spec requirement**: `ReduceOp = 'min' | 'max' | 'sum' | 'avg'` with `reduce_field_to_scalar` op
**Files involved**:

| File | Role |
|------|------|
| `src/compiler/ir/types.ts` | Expression types |
| `src/compiler/ir/IRBuilder.ts` | Builder interface |
| `src/compiler/ir/IRBuilderImpl.ts` | Builder implementation |
| `src/runtime/Materializer.ts` | Field evaluation |

**Current state**: No reduce/fold expression type exists in SigExpr or FieldExpr.
**Required state**: New expression type `SigExprReduce { kind: 'reduce', field: FieldExprId, op: ReduceOp, type: SignalType }` or similar. IRBuilder method `sigReduce(field, op, type)`.
**Suggested approach**: Add SigExprReduce to SigExpr union. Add `sigReduce()` to IRBuilder. Implement evaluation in SignalEvaluator (iterate field buffer, apply reduce op).
**Risks**: Medium — new expression category. Need to handle dynamic field sizes.
**Depends on**: none

### WI-5: Hash-Consing for Expression Deduplication (I13)

**Status**: MISSING
**Spec requirement**: Identical expression subtrees share the same ExprId
**Files involved**:

| File | Role |
|------|------|
| `src/compiler/ir/IRBuilderImpl.ts` | Expression allocation |

**Current state**: Sequential allocation — every call to `sigConst`, `sigZip`, etc. creates a new entry regardless of whether an identical expression already exists.
**Required state**: Before creating a new expression, check if an identical one exists. Return existing ID if found.
**Suggested approach**: Add a Map from expression hash to ID in IRBuilderImpl. Before pushing to `sigExprs`/`fieldExprs`/`eventExprs`, compute structural hash and check for existing entry.
**Risks**: Low — optimization, doesn't change semantics. Hash function must handle all expression fields.
**Depends on**: none

### WI-6: Lowered Op-Level IR

**Status**: WRONG (expression tree instead of lowered Ops)
**Spec requirement**: CompiledProgramIR contains lowered Op union (scalar_unary, scalar_binary, field_unary, field_binary, etc.)
**Files involved**:

| File | Role |
|------|------|
| `src/compiler/ir/types.ts` | Current expression types |
| `src/compiler/ir/program.ts` | CompiledProgramIR |
| `src/runtime/SignalEvaluator.ts` | Signal evaluation |
| `src/runtime/Materializer.ts` | Field evaluation |

**Current state**: The IR uses expression trees (SigExpr, FieldExpr, EventExpr) with PureFn opcodes. Runtime interprets these trees.
**Required state**: Spec defines explicit Op-level IR with typed operations (scalar_unary, field_binary, etc.).
**Suggested approach**: The current expression tree approach is valid architecturally (the spec says "implementations should follow standard conventions"). Consider this a spec-vs-implementation documentation difference rather than a hard violation. The expression tree achieves the same goals. However, if literal spec compliance is required, add a lowering pass from expression trees to Op-level IR.
**Risks**: HIGH — this would be a major refactor affecting runtime evaluation. The current approach works correctly. Consider updating the spec instead.
**Depends on**: none

### WI-7: Stride-Aware Buffer Allocation

**Status**: WRONG (ValueStore does not account for stride)
**Spec requirement**: Compiler knows stride per PayloadType (float=1, vec2=2, color=4). FieldSlot buffer = laneCount * stride.
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/RuntimeState.ts:82-83` | ValueStore creation |
| `src/runtime/Materializer.ts` | Field materialization |
| `src/compiler/ir/program.ts:150-171` | SlotMetaEntry |

**Current state**: ValueStore.f64 has one slot per ValueSlot index. Multi-component values (vec2, color) are stored in the objects Map as Float32Arrays. Stride is only tracked for state slots.
**Required state**: SlotMetaEntry should record stride. Field slot allocation should account for `laneCount * stride`. All components should use dense typed arrays.
**Suggested approach**: Add `stride` field to SlotMetaEntry. Allocate field buffers based on stride in Materializer. This is partially done for state (stride exists in StateMappingField) but not for value slots.
**Risks**: Medium — performance-sensitive area. Need to ensure buffer layout is consistent.
**Depends on**: none

### WI-8: 'unit' PayloadType for Pulse

**Status**: MISSING
**Spec requirement**: PayloadType includes 'unit' for discrete events with no data
**Files involved**:

| File | Role |
|------|------|
| `src/core/canonical-types.ts:120-126` | PayloadType union |
| `src/blocks/time-blocks.ts:35` | Pulse output type |

**Current state**: Pulse uses `signalTypeTrigger('bool')`. PayloadType does not include 'unit'.
**Required state**: Add 'unit' to PayloadType. Pulse uses `payload: 'unit', temporality: discrete`.
**Suggested approach**: Add 'unit' to PayloadType union. Update pulse definition. Unit values carry no meaningful data (always 1 or "fired").
**Risks**: Low — additive type system change.
**Depends on**: none

### WI-9: Structured Error Types

**Status**: PARTIAL (string-based instead of structured)
**Spec requirement**: TypeError and GraphError discriminated unions with PortRef/NodeRef/EdgeRef locations
**Files involved**:

| File | Role |
|------|------|
| `src/compiler/compile.ts:61-67` | CompileError type |
| `src/compiler/passes-v2/pass2-types.ts` | Pass 2 errors |
| `src/compiler/passes-v2/pass5-scc.ts` | Cycle errors |

**Current state**: CompileError has `kind: string, message: string, blockId?, connectionId?, portId?`. Not fully structured.
**Required state**: Spec's TypeError and GraphError unions with typed location refs and suggested fixes.
**Suggested approach**: Define spec-compliant error types. Map internal pass errors to these structured types. Include location refs (PortRef = { kind: 'port', node: NodeRef, port: PortId }).
**Risks**: Low — primarily a type-safety improvement. Can be done incrementally.
**Depends on**: none

### WI-10: Explicit CacheKey Structure (I14)

**Status**: MISSING
**Spec requirement**: Every cache depends on explicit CacheKey { time, domain, upstreamSlots, params, stateVersion }
**Files involved**:

| File | Role |
|------|------|
| `src/runtime/RuntimeState.ts:151-166` | FrameCache |
| `src/runtime/SignalEvaluator.ts` | Signal caching |

**Current state**: Cache uses frame-stamp invalidation (sigStamps[n] vs frameId). No explicit cache keys.
**Required state**: Explicit cache key per entry that expresses stability across frames.
**Suggested approach**: For v0, the stamp-based approach is simpler and correct (everything recomputes each frame). Cache keys become valuable when some values are stable across frames. Defer to T2 unless cross-hot-swap reuse is needed now.
**Risks**: Low — optimization concern, not correctness.
**Depends on**: none

### WI-11: Payload-Specialized Opcodes

**Status**: PARTIAL
**Spec requirement**: Compiler emits payload-aware opcodes (Add_f32, Add_vec2) or single opcode with known stride
**Files involved**:

| File | Role |
|------|------|
| `src/compiler/ir/types.ts:299-341` | OpCode enum |
| `src/runtime/OpcodeInterpreter.ts` | Opcode execution |

**Current state**: OpCode.Add is used for all payload types. Runtime OpcodeInterpreter dispatches on opcode name only, not payload.
**Required state**: Either payload-specialized opcodes OR runtime evaluation that uses stride info from SlotMetaEntry.
**Suggested approach**: Add stride info to PureFn or use SlotMetaEntry.type at evaluation time to determine component count. Single opcode with known stride is the spec-approved alternative.
**Risks**: Medium — performance-sensitive. Multi-component ops (vec2 add) need correct per-component behavior.
**Depends on**: WI-7 (stride awareness)
