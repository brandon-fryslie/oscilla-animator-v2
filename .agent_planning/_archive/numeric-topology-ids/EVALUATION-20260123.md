# Evaluation: Numeric Topology IDs (ms5.6)

Generated: 2026-01-23T08:30:00Z
Bead: oscilla-animator-v2-ms5.6
Topic: Unify TopologyId to numeric throughout the pipeline
Verdict: **CONTINUE**

## Current State

### What Exists
- **TopologyId type**: `string` in `src/shapes/types.ts:16`
- **Registry**: `Map<TopologyId, TopologyDef>` in `src/shapes/registry.ts:19-22`
- **Built-in topologies**: `TOPOLOGY_ELLIPSE` (id: 'ellipse'), `TOPOLOGY_RECT` (id: 'rect')
- **Dynamic registration**: `registerDynamicTopology(topology: TopologyDef | PathTopologyDef): void` — caller provides `id` field
- **Path blocks**: Generate string IDs like `polygon-${sides}` in `src/blocks/path-blocks.ts:54`
- **Future types**: `future-types.ts:90` already defines `topologyId: number` for RenderIR v2 target
- **Existing plan**: Comprehensive PLAN-20260122.md, CONTEXT-20260122.md, DOD-20260122.md all accurate

### What Needs to Change
1. `TopologyId` type: `string` → `number`
2. Registry: `Map<string, TopologyDef>` → `TopologyDef[]` with array indexing
3. Built-in IDs: `'ellipse'`/`'rect'` → numeric constants 0/1
4. Dynamic registration: Return assigned numeric ID, accept `Omit<TopologyDef, 'id'>`
5. Path-blocks: Remove `id` field construction, capture returned numeric ID
6. All consumers: Type propagation forces updates (6 files importing TopologyId)

### Blockers & Dependencies
- **Parent**: oscilla-animator-v2-ms5 (Render Pipeline Technical Debt Cleanup) — OPEN
- **ms5.3** ("Resolve TopologyId string/number type mismatch") — CLOSED (recreated as ms5.6)
- **No blocking dependencies**: This can proceed independently

### Risks
- **Low risk**: Breaking type change, but TypeScript enforces exhaustive update
- **Test updates needed**: ~3 test files reference topology IDs
- **Single atomic commit**: All type changes + consumers in one commit

## Confidence: HIGH

The work is well-defined, mechanical, and fully specified in existing plan documents. TypeScript's type system guarantees completeness — if it compiles, it's correct.

## Recommendation

Execute immediately as a single HIGH-confidence sprint. The existing PLAN-20260122.md contains complete implementation instructions.
