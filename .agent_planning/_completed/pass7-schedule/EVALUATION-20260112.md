# Pass 7 Schedule Construction Evaluation

**Date**: 2026-01-12
**Status**: CONTINUE - Implementation blocked by stub, ready to plan

## Current State

### Pass 7 Stub Implementation (`src/compiler/passes-v2/pass7-schedule.ts`)
- Returns empty `steps` array (line 79)
- Properly converts `TimeModelIR` to `TimeModel` (lines 98-106)
- Gets domains from `unlinkedIR.builder.getDomains()` (line 76)
- Allocates zero state slots (line 82)
- Has correct ScheduleIR interface definition (lines 35-50)

### What the Runtime Expects (`src/runtime/ScheduleExecutor.ts`)
- Lines 95-213: Iterates through `schedule.steps` in order
- Expects step types: `evalSig`, `materialize`, `render`, `stateWrite`
- Each step type has specific contract:
  - `evalSig`: Evaluates signal (SigExprId), stores in ValueSlot using slotMeta offset
  - `materialize`: Materializes field (FieldExprId), domain, stores buffer in slot
  - `render`: Assembles render pass with position/color/size fields for a domain
  - `stateWrite`: Writes signal value to state slot (executed in phase 2)
- Executes in TWO phases: non-stateWrite (phase 1), then stateWrite (phase 2)

### Step Types (`src/compiler/ir/types.ts` lines 286-317)
```typescript
StepEvalSig: { kind, expr: SigExprId, target: ValueSlot }
StepMaterialize: { kind, field: FieldExprId, domain: DomainId, target: ValueSlot }
StepRender: { kind, domain: DomainId, position, color, size? }
StepStateWrite: { kind, stateSlot: StateSlotId, value: SigExprId }
```

## Data Available for Step Generation

### From UnlinkedIRFragments (Pass 6 output)
- `builder: IRBuilder` - Contains all built expressions
- `blockOutputs: Map<BlockIndex, Map<string, ValueRefPacked>>` - Per-block output ValueRefs
- `errors: CompileError[]` - Compilation errors

### From IRBuilderImpl Methods
- `getSigExprs()`: readonly SigExpr[] (lines 306-308)
- `getFieldExprs()`: readonly FieldExpr[] (lines 310-312)
- `getEventExprs()`: readonly EventExpr[] (lines 314-316)
- `getDomains()`: ReadonlyMap<DomainId, DomainDef> (lines 318-320)
- `getSigSlots()`: ReadonlyMap<SigExprId, ValueSlot> (lines 322-324)
- `getFieldSlots()`: ReadonlyMap<FieldExprId, ValueSlot> (lines 326-328)
- `getSlotCount()`: number (lines 234-236)

### From AcyclicOrLegalGraph (Pass 5 output)
- `graph: DepGraph` - Node/edge dependencies
- `sccs: readonly SCC[]` - Strongly connected components (topological order)
- `blocks: readonly Block[]` - Block instances
- `edges: readonly NormalizedEdge[]` - Normalized edges
- `timeModel: TimeModelIR` - Time model from Pass 3

## Render Block Identification

Render blocks are identified by:
- `capability: 'render'` in BlockDef (src/blocks/registry.ts line 60)
- Examples: RenderInstances2D, RenderCircle, RenderRect (src/blocks/render-blocks.ts)
- They are sinks: no outputs, consume position/color/size/domain fields
- lowering functions return empty `outputsById` (render-blocks.ts lines 47-49, 89-91, 135-137)

## Key Ambiguities (RESOLVED)

1. **Which signals/fields need steps?**
   - Answer: Only signals/fields with registered slots need evalSig/materialize steps
   - IRBuilder.getSigSlots() and getFieldSlots() track what was registered

2. **Topological Ordering**:
   - Answer: Use reverse SCC order (already fixed in Pass 6)
   - evalSig before materialize before render (phases within schedule)

3. **Render Step Construction**:
   - Answer: Scan blocks array, check capability === 'render'
   - For each render block, find inputs (position, color, size, domain) from blockOutputs reverse map

4. **State handling**:
   - Answer: For MVP, no state steps needed (demo patch has no stateful blocks)

## Implementation Strategy

Pass 7 needs to:

1. **Identify render blocks**: Scan validated.blocks, check `getBlockDefinition(type).capability === 'render'`

2. **Build render steps**: For each render block:
   - Find domain input (from wiring or default)
   - Find position, color, size inputs from Pass 6 blockOutputs
   - Create `StepRender` with field IDs

3. **Build materialize steps**: For each field referenced by render:
   - Create `StepMaterialize` with field ID, domain ID, target slot

4. **Build evalSig steps**: For each signal with a registered slot:
   - Create `StepEvalSig` with signal ID and target slot

5. **Order steps**: Phase order (evalSig → materialize → render)

## Test Expectations

From `steel-thread.test.ts`:
- Expects `schedule.steps.length > 0` (line 101)
- Expects at least one render step: `renderSteps.length === 1` (line 105)
- Runtime execution should produce RenderFrameIR with passes

## Verdict

**CONTINUE** - Clear path to implementation. Main work is step generation algorithm.
