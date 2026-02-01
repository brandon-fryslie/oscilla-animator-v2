# Sprint 4: Runtime Semantic Upgrades (Optional/Deferred)

Generated: 2026-02-01T14:00:00Z
Confidence: HIGH: 0, MEDIUM: 0, LOW: 3
Status: RESEARCH REQUIRED — Do when needed, not before
Depends on: Sprints 1-3

## Sprint Goal

Implement runtime semantic upgrades: branch-scoped state, explicit lane metadata, event stamp buffers. These are real work but not required to close the P1 critical violations.

## When to Do This Sprint

Only when you need:
- Branch v1+ features (parallel timelines / preview branches)
- Hot-swap lane correctness (instance count changes without state corruption)
- Stamp-based event freshness detection

## Work Items (all LOW confidence — research required)

### Lane Identity Tracking
- Replace implicit offset math (`state[baseSlot + i]`) with explicit `(ValueExprId, instanceId, lane)` → slot mapping
- Design data structure (parallel metadata array? structured slot allocator?)
- Handle hot-swap: when instance count changes, how do lanes remap?

### Branch-Scoped State
- Key runtime state by branch identity
- State isolation model: copy-on-write per branch? Separate arrays? Keyed slots?
- Memory budget: branched state multiplies memory by branch count

### Event Stamp Buffers
- `valueStamp[ValueExprId, lane] = lastTickOrFrameWritten`
- Consumers detect "fresh" vs "stale" events via stamps
- Replace current uniform frame-start clearing with stamp-based semantics

## Dependencies
- Sprint 3 (step format): unified step model provides the dispatch foundation
- Sprint 2 (frontend solver): resolved types enable explicit lane metadata
- v1+ branch axis values (P5 #16): must be implemented before branch-scoped state

## This Sprint is Intentionally Vague

It exists for dependency tracking and completeness. Implementation planning happens when the work is actually needed.
