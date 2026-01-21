# Sprint: legacy-cleanup - Complete RenderAssembler Migration
Generated: 2026-01-21T21:41:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal
Remove all legacy shape handling code from the render path, making resolvedShape the single source of truth.

## Scope
**Deliverables:**
- Remove determineShapeMode() fallback
- Remove renderLegacyShape() dead code
- Eliminate controlPoints side-channel
- Consolidate duplicate type guards
- Update default shape to proper ResolvedShape

## Work Items

### P0: Remove determineShapeMode() fallback path
Make resolvedShape the only shape source in the renderer.

**Acceptance Criteria:**
- [ ] Renderer uses ONLY resolvedShape (no fallback to shape field)
- [ ] determineShapeMode() function removed
- [ ] isShapeDescriptor() type guard removed from renderer
- [ ] All tests pass

**Technical Notes:**
- RenderAssembler already produces resolvedShape for all passes
- Renderer line 113-115 currently has dual-path dispatch
- Change to: `const shapeMode = convertResolvedShapeToMode(pass.resolvedShape!)`

### P1: Remove renderLegacyShape() dead code
This function handles numeric shape encoding (0=circle, 1=square, 2=triangle).

**Acceptance Criteria:**
- [ ] renderLegacyShape() function removed
- [ ] Legacy case in switch statement removed
- [ ] 'legacy' mode eliminated from ShapeMode type
- [ ] All tests pass

**Technical Notes:**
- Lines 380-400+ in Canvas2DRenderer
- Dead code path since resolvedShape always produced
- May need to update ResolvedShape to not have 'legacy' mode

### P2: Eliminate controlPoints side-channel
Control points should only be in resolvedShape, not pass-level.

**Acceptance Criteria:**
- [ ] pass.controlPoints field removed from RenderPassIR type
- [ ] Renderer reads controlPoints ONLY from resolvedShape
- [ ] RenderAssembler does not set pass.controlPoints
- [ ] Path rendering still works
- [ ] All tests pass

**Technical Notes:**
- Canvas2DRenderer lines 117-120 currently check both locations
- Update to: `const controlPoints = resolvedShape.controlPoints`
- ScheduleExecutor.ts RenderPassIR type needs update

### P3: Consolidate duplicate type guards
Move shared type guards to utility module.

**Acceptance Criteria:**
- [ ] isPathTopology() in one location only
- [ ] Duplicate removed from Canvas2DRenderer (line 49)
- [ ] Imported where needed
- [ ] All tests pass

**Technical Notes:**
- Keep in RenderAssembler.ts or move to shapes/types.ts
- Export for renderer to use

### P4: Fix default shape legacy encoding
RenderAssembler produces 0 for default shape, which is legacy.

**Acceptance Criteria:**
- [ ] Default shape produces proper ResolvedShape
- [ ] No numeric encoding in shape output
- [ ] Legacy mode completely removed from ResolvedShape type
- [ ] All tests pass

**Technical Notes:**
- Line 133 in RenderAssembler: `return 0`
- Change to return proper circle topology ResolvedShape
- May need to look up 'ellipse' or 'circle' topology

## Dependencies
- Sprint 1 & 2 complete (already done)

## Risks
| Risk | Probability | Mitigation |
|------|-------------|------------|
| Breaking path rendering | LOW | Tests exist; run integration tests |
| Missing shape topology | LOW | Default to ellipse topology |
| Type errors in consumers | LOW | TypeScript will catch |

## Files to Modify
- Modify: `src/runtime/ScheduleExecutor.ts` (RenderPassIR type)
- Modify: `src/runtime/RenderAssembler.ts` (default shape, type guards)
- Modify: `src/render/Canvas2DRenderer.ts` (remove legacy code)
