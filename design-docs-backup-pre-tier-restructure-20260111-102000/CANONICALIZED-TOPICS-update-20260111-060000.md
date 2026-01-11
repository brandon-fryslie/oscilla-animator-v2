---
command: /canonicalize-architecture design-docs/ design-docs/final-System-Invariants/
run_type: UPDATE
indexed: true
canonical_base: design-docs/CANONICAL-oscilla-v2.5-20260109/
timestamp: 2026-01-11T06:00:00Z
---

# Topic Breakdown Update

**Status**: Proposing Topic 15 (Graph Editor UI)
**Created**: 2026-01-11T06:00:00Z
**Existing Topics**: 14
**Proposed New Topics**: 1

---

## Proposed New Topic

### 15: Graph Editor UI (`graph-editor-ui`)

**Primary Sources**: `design-docs/spec/10-linear-graph-editor.md`

**Tier Classification**:

**T3 (Optional)** - `t3_linear-auto-layout.md`:
- Auto-layout algorithm (left-to-right upstream→downstream)
- Chain traversal rules (no-reversal semantics)
- Pivot block detection
- Perspective rotation interaction
- Focus/dimming visual states
- Keyboard/mouse navigation
- Merge/split point rendering
- Edge bundling and visualization
- "Can change freely - UI implementation detail"

**Rationale for T3**:
- This is UI implementation specification, not core architecture
- Layout algorithm can be replaced without affecting graph semantics
- Interaction patterns can evolve based on user feedback
- No runtime or compiler dependencies
- Similar tier level to Topic 14 (Modulation Table UI)

**Key Concepts** (to include in GLOSSARY.md):
- Chain (reachable blocks without direction reversal)
- Pivot Block (multiple in/out, rotation point)
- Focused Subgraph (bright, current chain)
- Dimmed Subgraph (faded, not in chain)
- Perspective Rotation (change focused path)

**Dependencies**: None (self-contained)

**Dependents**: None (optional UI layer)

---

## Updated Topics Table

| # | Topic Slug | Title | Description | T1 Files | T2 Files | T3 Files | Status |
|---|------------|-------|-------------|----------|----------|----------|--------|
| 01 | `type-system` | Type System | Five-axis type model | core-types | block-roles, constraints | diagnostics, examples | Existing |
| 02 | `block-system` | Block System | Compute units and roles | — | blocks, primitives | examples | Existing |
| 03 | `time-system` | Time System | Time sources and rails | time-root | phase-system | examples | Existing |
| 04 | `compilation` | Compilation | Graph normalization and IR | — | normalization, ir-contract | examples | Existing |
| 05 | `runtime` | Runtime | Execution model and state | — | state-slots, scheduling | examples | Existing |
| 06 | `renderer` | Renderer | Render pipeline and sinks | — | pipeline | batching | Existing |
| 07 | `diagnostics-system` | Diagnostics | Structured diagnostics | — | hub, events | payload-specs | Existing |
| 08 | `observation-system` | Observation | Runtime state capture | — | debug-graph, taps | queries | Existing |
| 08b | `diagnostic-rules-engine` | Rules Engine | Heuristic problem detection | — | rules-a-h | evidence | Existing |
| 09 | `debug-ui` | Debug UI | Non-technical inspection | — | probe-mode, trace | — | Existing |
| 10 | `power-user-debugging` | Power User Debug | Advanced observation (post-MVP) | — | trace-events | technical-panel | Existing |
| 11 | `continuity-system` | Continuity | Anti-jank architecture | — | phase-offset, reconciliation | — | Existing |
| 12 | `event-hub` | Event Hub | Event coordination spine | — | typed-events, decoupling | — | Existing |
| 13 | `event-diagnostics-integration` | Event-Diagnostics | How events drive diagnostics | — | subscriptions | snapshots | Existing |
| 14 | `modulation-table-ui` | Modulation Table UI | Table view for connections (UI only) | — | — | transforms, adapters, lenses | Existing |
| **15** | **`graph-editor-ui`** | **Graph Editor UI** | **Linear auto-layout editor** | **—** | **—** | **linear-auto-layout** | **NEW** |

---

## Topic Relationships (Updated)

```
Foundational (T1):
  01-type-system
    ↓

Core Architecture (T2):
  02-block-system ← 03-time-system
    ↓
  04-compilation
    ↓
  05-runtime → 06-renderer
    ↓
  11-continuity-system

Diagnostics/Observation (T2):
  12-event-hub → 13-event-diagnostics-integration
                    ↓
  07-diagnostics-system ← 08b-diagnostic-rules-engine
         ↓
  08-observation-system
         ↓
  09-debug-ui ← 10-power-user-debugging

UI Layer (T3):
  14-modulation-table-ui (port connections)
  15-graph-editor-ui     (block layout)    ← NEW
```

---

## Suggested Reading Order (Updated)

**For newcomers**:
1. SUMMARY
2. 01-type-system (T1)
3. 02-block-system (T2)
4. 03-time-system (T2)
5. 04-compilation (T2)
6. 09-debug-ui (T2) - if interested in user-facing features

**For UI implementers**:
1. INVARIANTS
2. 02-block-system (understand blocks/edges)
3. 15-graph-editor-ui (T3) ← NEW - layout and interaction patterns
4. 14-modulation-table-ui (T3) - another UI example

**For core implementers**:
1. INVARIANTS
2. 01-type-system through 06-renderer (T1+T2 core)
3. GLOSSARY

---

## Source Document Assignment (Updated)

| Source Document | Assigned To Topic | Coverage |
|-----------------|-------------------|----------|
| [existing 54 sources] | [existing topics 01-14] | [as before] |
| **spec/10-linear-graph-editor.md** | **15-graph-editor-ui** | **Full** |
| [6 conversation exports] | ARCHIVED | Design history |

---

## Integration Notes

### Topic 15 Content Structure

Proposed `topics/15-graph-editor-ui.md` outline:

```markdown
# Graph Editor UI: Linear Auto-Layout

## Overview
- Automatic positioning philosophy
- No manual drag-and-drop

## Chain Traversal Semantics
- Definition and rules
- No-reversal constraint
- Tree-not-line behavior

## Layout Algorithm
- Primary axis (left-to-right)
- Merge point stacking
- Split point fan-out
- Selected block emphasis

## Perspective Rotation
- Pivot block detection
- Context menu interaction
- Effect on visible chain

## Visual States
- Focused (full opacity)
- In chain (full opacity)
- Dimmed (30% opacity)
- Hovered
- Selected (glow)

## Interactions
- Selection (click)
- Refocus (click dimmed)
- Inspect (double-click)
- Rotate (right-click)
- Navigation (arrow keys, Tab, Escape)

## Edge Rendering
- In-chain vs dimmed
- Bundling for multiple edges

## Implementation Requirements
- Required state (selectedBlockId, focusedChain, perspectiveHint)
- Layout engine needs
- Integration with SelectionStore
```

---

## Tier Distribution (After Update)

| Tier | Files | Topics |
|------|-------|--------|
| T1 (Foundational) | 1 | 1 (type-system core-types only) |
| T2 (Structural) | ~25 | 13 (most topics have T2 content) |
| T3 (Optional) | ~30 | 10 (examples, UI specs, advanced features) |

**New**: Topic 15 adds 1 T3 file, maintaining the pattern of UI specs being T3.

---

## Summary

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Topics** | 14 | 15 | +1 |
| **Source documents** | 54 | 55 | +1 (only linear-graph-editor; 6 archived) |
| **T1 files** | 1 | 1 | — |
| **T2 files** | ~25 | ~25 | — |
| **T3 files** | ~30 | ~31 | +1 |

---

**RECOMMENDATION**: Add Topic 15 as proposed - clean integration, no dependencies, appropriate tier classification.

---

**END OF TOPICS UPDATE**
