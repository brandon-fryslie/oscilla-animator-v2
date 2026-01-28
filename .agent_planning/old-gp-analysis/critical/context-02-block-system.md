---
topic: 02
name: Block System
spec_file: design-docs/CANONICAL-oscilla-v2.5-20260109/ESSENTIAL-SPEC.md
category: critical
generated: 2026-01-23T12:00:00Z
purpose: implementer-context
self_sufficient: true
blocked_by: [C-1]
blocks: []
priority: P1
---

# Context: Topic 02 — Block System (Critical)

## What the Spec Requires

1. Block has `kind` field (NOT `type`) — deprecated term
2. BlockRole: `{ kind: 'user' } | { kind: 'derived'; meta: DerivedBlockMeta }`
3. DerivedBlockMeta: defaultSource | wireState | bus | rail | lens
4. EdgeRole: user | default | busTap | auto
5. PortBinding: { id, dir, type, combine: CombineMode }
6. 4 stateful primitives: UnitDelay, Lag, Phasor, SampleAndHold
7. Cycle validation: every SCC must cross stateful boundary
8. Default sources per PayloadType

## Current State (Topic-Level)

### How It Works Now
Blocks are defined in `src/graph/Patch.ts` as interfaces with id, type, params, role, inputPorts, outputPorts. Block definitions are registered in `src/blocks/registry.ts`. BlockRole in `src/types/index.ts` has 6 variants (user, timeRoot, bus, domain, renderer, derived). DerivedBlockMeta has 4 kinds (defaultSource, wireState, lens, adapter). UnitDelay exists as a stateful primitive; Lag/Phasor/SampleAndHold do not.

### Patterns to Follow
- Block registration in blocks/registry.ts via `registerBlockDef()`
- Block compilation via `lowerBlock()` functions in blocks/*.ts
- Stateful blocks declare state slots in IR
- Tests alongside block definitions

## Work Items

### WI-3: Block.type → Block.kind rename

**Category**: CRITICAL
**Priority**: P1 — naming violation of deprecated term
**Spec requirement**: Block interface uses `kind: string` (NOT `type`)

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/graph/Patch.ts | Block interface | L40 |
| All files importing/using Block.type | References | ~50 locations |

**Current state**: `readonly type: BlockType` where BlockType = string
**Required state**: `readonly kind: string` (or `readonly kind: BlockKind`)
**Suggested approach**: Rename field, update all usages. Use find-and-replace with care to avoid colliding with discriminated union `.kind` fields.

**Depends on**: none
**Blocks**: nothing directly, but aligns terminology

---

### WI-4: Reconcile BlockRole variants with spec

**Category**: CRITICAL (pending R-4 review decision)
**Priority**: P2 — depends on user decision (R-4)
**Spec requirement**: BlockRole is only `user | derived`

**Files involved**:
| File | Role | Lines |
|------|------|-------|
| src/types/index.ts | BlockRole definition | L279-285 |
| src/types/index.ts | Helper functions | L309-331 |

**Current state**: 6 variants
**Required state**: Either 2 (per spec) or current 6 (if spec updated)
**Suggested approach**: Wait for R-4 decision. If collapsing: merge timeRoot/bus/domain/renderer into derived with appropriate meta. If keeping: update spec.

**Depends on**: R-4 decision
**Blocks**: nothing
