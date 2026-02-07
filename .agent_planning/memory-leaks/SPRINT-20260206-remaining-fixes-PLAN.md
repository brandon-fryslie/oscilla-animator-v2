# Sprint: remaining-fixes - Complete Memory Leak Fixes
Generated: 2026-02-06
Confidence: HIGH: 2, MEDIUM: 0, LOW: 0
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Close the two remaining gaps from the original memory leak plan.

## Scope
**Deliverables:**
- SVG GeometryDefCache invalidation on hot-swap
- Canvas2D dash pattern buffer reuse

## Work Items

### P0: Wire SVG GeometryDefCache invalidation into hot-swap path
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] `SVGRenderer.invalidateGeometryCache()` is called when the program changes (hot-swap)
- [ ] After a recompile, `defIdByKey` Map does not retain entries from the previous program
- [ ] Test: compile graph A -> render SVG -> compile graph B -> verify cache was cleared

**Technical Notes:**
- `invalidateGeometryCache()` already exists and is correct
- Likely integration point: CompileOrchestrator's hot-swap success path, or through PatchStore's program change observable
- SVGRenderer is optional (not always mounted), so the call site must handle the case where no SVGRenderer exists
- Consider: should this be event-driven (renderer listens for program change) or imperative (orchestrator calls it)?
- Prefer event-driven: renderer subscribes to PatchStore.currentProgram changes via MobX reaction, calls own invalidation

### P1: Canvas2D dash pattern buffer reuse
**Confidence: HIGH**

**Acceptance Criteria:**
- [ ] `Canvas2DRenderer` does not allocate a new dash array per frame for the same dash pattern
- [ ] Rendering output is visually identical (no change in behavior)

**Technical Notes:**
- Current: `style.dashPattern.map(d => d * D)` creates new array per pass
- Fix: Allocate a reusable `dashPxBuffer: number[]` at renderer instance level, fill in-place
- Alternative: Cache computed dash arrays keyed by (dashPattern, D) since D changes per-op

## Dependencies
- None. Both items are independent of each other and of all other work.

## Risks
- SVG renderer integration: if SVGRenderer is not always instantiated, must avoid null reference. Mitigated by event-driven approach (renderer manages own lifecycle).
- Dash buffer reuse: must handle variable-length dash patterns. Mitigated by reusing array and adjusting length.
