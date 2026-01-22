# Sprint: adapter-editor - Editor Adapter Integration
Generated: 2026-01-22
Confidence: MEDIUM
Status: RESEARCH REQUIRED
Source: 0-Units-and-Adapters.md §B2, §B3.3 Steps 1-5

## Sprint Goal
Implement editor-side adapter attachment, auto-insertion, and UI so users can see and manage unit conversions on their connections.

## Known Elements

- Adapter blocks and registry exist (Sprint 2 prerequisite)
- Graph normalization materializes adapters (Sprint 2 prerequisite)
- Spec defines adapter attachment model (B2), auto-insertion algorithm (Steps 1-5), and UI requirements (B2.2)
- ReactFlow editor exists with type validation (`src/ui/reactFlowEditor/typeValidation.ts`)
- Patch model exists in `src/graph/Patch.ts`

## Unknowns to Resolve

1. **AdapterAttachment storage**: Should adapters be stored in the Patch model (alongside edges) or in a separate editor-only layer?
   - Research approach: Check how default sources are stored; adapters should follow same pattern
   - Impact: Determines serialization, undo/redo, and hot swap behavior

2. **Auto-insertion UX**: Should adapters be inserted automatically when connections are made, or should users explicitly request them?
   - Research approach: Check spec B3.3 Steps 1-5 for the deterministic algorithm
   - Impact: Determines editor flow and user interaction model

3. **ReactFlow integration**: How to render adapter badges on edges in ReactFlow?
   - Research approach: Check ReactFlow custom edge components and edge label features
   - Impact: Determines rendering approach and click targets

4. **Undo/redo**: How does adapter attachment interact with the undo stack?
   - Research approach: Check existing undo/redo implementation in the editor
   - Impact: Adapters are user intent (spec B2.1), must participate in undo

## Tentative Deliverables

- AdapterAttachment data model in patch/graph
- Auto-insertion algorithm (BFS on conversion graph, max chain 2)
- Adapter badge rendering on ReactFlow edges
- Click-to-inspect adapter details
- Undo/redo integration for adapter add/remove
- Connection validation with adapter suggestions

## Research Tasks

- [ ] Investigate ReactFlow custom edge rendering for adapter badges
- [ ] Determine storage location for AdapterAttachment (Patch vs. editor layer)
- [ ] Review spec B3.3 auto-insertion algorithm for implementation details
- [ ] Check undo/redo integration pattern in current editor

## Work Items (Tentative)

### P0: AdapterAttachment Data Model

#### Description
Add AdapterAttachment structure to the patch/graph model so adapters can be persisted and serialized.

#### Tentative Acceptance Criteria
- [ ] AdapterAttachment interface: `{ id, kind, side, blockId, portId, edgeId, params }`
- [ ] Patch model includes adapter attachments (likely as Map on edges)
- [ ] Serialization/deserialization works
- [ ] Hot swap preserves adapter attachments

### P1: Auto-Insertion Algorithm

#### Description
Implement the closed-registry BFS algorithm from spec B3.3 Steps 1-5 to automatically find and suggest/insert adapters when connections are made.

#### Tentative Acceptance Criteria
- [ ] Build conversion graph from adapter registry
- [ ] BFS from source (payload, unit) to target (payload, unit)
- [ ] Max path length 2 enforced
- [ ] Deterministic tie-breaking (spec Step 3)
- [ ] Side assignment policy (spec Step 4)
- [ ] Idempotent (spec Step 5)

### P2: Adapter Badge UI

#### Description
Render adapter indicators on edges in the ReactFlow editor.

#### Tentative Acceptance Criteria
- [ ] Adapter badge visible on edge near the attached port
- [ ] Badge shows adapter kind (e.g., "Phase->Rad")
- [ ] Click reveals: adapter kind, type transformation, parameters
- [ ] Non-intrusive (smaller than a full node)

### P2: Connection Validation with Adapter Suggestions

#### Description
When a user connects incompatible ports, show available adapters as suggestions.

#### Tentative Acceptance Criteria
- [ ] TYPE_MISMATCH diagnostic shown on incompatible connection
- [ ] Available adapters listed as resolution options
- [ ] User can accept adapter suggestion (auto-inserts)
- [ ] User can dismiss (connection remains invalid)

## Exit Criteria (to reach HIGH confidence)

- [ ] AdapterAttachment storage decision made (Patch model vs. editor layer)
- [ ] ReactFlow edge rendering approach confirmed (custom edge vs. edge label)
- [ ] Auto-insertion algorithm validated against spec Steps 1-5
- [ ] Undo/redo integration pattern identified

## Dependencies

- Sprint 2 (adapter-registry) must be COMPLETE before this sprint can begin
- ReactFlow editor must be functional (currently is)
- Type validation in editor must be working (currently is)

## Risks

1. **ReactFlow limitations**: Custom edge rendering may be limited
   - Mitigation: Research ReactFlow edge label and custom edge APIs
   - Fallback: Use edge markers or overlays instead of badges

2. **Undo complexity**: Adapter insertion during connection may create multi-step undo
   - Mitigation: Treat connection+adapter as single undo action
   - Mitigation: Research existing undo patterns in codebase

3. **Performance**: BFS on every connection attempt could be slow
   - Mitigation: Conversion graph is tiny (14 unit kinds, 10 edges) — BFS is O(1) in practice
