# User Response: Graph Normalization Sprint Plan

**Date**: 2026-01-03
**Response**: APPROVED (with modifications)

## Approved Plan Files
- `.agent_planning/graph-normalization/PLAN-2026-01-03-121815.md` (with modifications below)
- `.agent_planning/graph-normalization/DOD-2026-01-03-121815.md`

## Modifications from Review

### 1. BusBlocks Clarification
- BusBlocks are BOTH user-created (Buses) AND system-created (Rails)
- Default buses (phaseA, energy, palette, progress) are system-created
- **DEFERRED**: Bus normalization to later iteration
- **THIS SPRINT**: Focus on default source blocks only

### 2. Use Existing EdgeRole
- Plan said: `role?: "user" | "structural"` (simple string)
- **CHANGE**: Use discriminated union `EdgeRole` already implemented
- Default source edges use: `{ kind: "default", meta: { defaultSourceBlockId } }`

### 3. Remove StructuralMapping from NormalizedGraph
- Plan had: `mapping: StructuralMapping` in NormalizedGraph
- **CHANGE**: Remove mapping field entirely
- Role metadata IS the mapping (read `role.meta.target` for reverse lookup)
- Diagnostics system handles correlation, not normalization

### 4. Compiler Must Not Access Roles
- **ADD**: `CompilerBlock = Omit<Block, 'role'>`
- **ADD**: `CompilerEdge = Omit<Edge, 'role'>`
- **ADD**: `CompilerGraph { blocks: CompilerBlock[], edges: CompilerEdge[] }`
- **ADD**: `toCompilerGraph()` stripping function at boundary
- TypeScript enforces compiler cannot access role fields

### 5. Confirmed Decisions
- EAGER normalization (cached, invalidated on edits)
- Move materialization from compiler to editor (GraphNormalizer)
- Caching + invalidation approach approved
- Simple ID algorithm: `${blockId}_default_${slotId}`
- Undo/redo operates on RawGraph only

## Updated Architecture

```
PatchStore (RawGraph)
     ↓
normalize() → NormalizedGraph { blocks with roles, edges with roles }
     ↓
toCompilerGraph() → CompilerGraph { blocks WITHOUT roles, edges WITHOUT roles }
     ↓
Compiler (TypeScript prevents role access)
     ↓
Diagnostics ← correlates with NormalizedGraph roles for UI
```

## Sprint Scope (Final)

**In Scope:**
1. Type System (RawGraph, NormalizedGraph, CompilerGraph, Anchor)
2. GraphNormalizer (default sources only, not buses)
3. PatchStore Integration (caching, invalidation)
4. toCompilerGraph() boundary function

**Deferred:**
- Bus normalization (system-created default buses)
- Wire-state blocks
- Incremental normalization

## Next Step
`/do:it graph-normalization` to begin implementation
