# Evaluation: RenderAssembler Legacy Cleanup
Generated: 2026-01-21T21:41:00Z
Verdict: CONTINUE

## Executive Summary

The RenderAssembler migration is **~60% complete**. Sprint 1 (extract module) and Sprint 2 (shape resolution) are done. However, significant legacy patterns remain that prevent the renderer from being a "pure sink".

## Current State

### Completed
- ✅ RenderAssembler.ts created with `assembleRenderPass()`
- ✅ ResolvedShape type added to ScheduleExecutor
- ✅ Shape resolution (topology lookup + param mapping) in assembler
- ✅ Renderer uses resolvedShape when available

### Remaining Legacy Patterns

| Pattern | Location | Lines | Impact |
|---------|----------|-------|--------|
| determineShapeMode() | Canvas2DRenderer | 336-363 | Fallback shape interpretation |
| renderLegacyShape() | Canvas2DRenderer | 380-400+ | Dead code path for numeric encoding |
| Dual controlPoints | Canvas2DRenderer/RenderAssembler | 117-120/95 | Redundant storage |
| isShapeDescriptor() duplicate | Canvas2DRenderer/RenderAssembler | 368/187 | DRY violation |
| Numeric shape default | RenderAssembler | 133 | Legacy encoding still produced |

## Analysis

### 1. determineShapeMode() Still Active
The renderer still has fallback code for when `resolvedShape` is not present. This happens because:
- Per-particle shape buffers are not supported (throws error)
- Backward compatibility maintained

**Action Required**: Make resolvedShape mandatory, remove fallback.

### 2. controlPoints Side-Channel
Control points stored in TWO places:
1. `pass.controlPoints` (legacy)
2. `resolvedShape.controlPoints` (new)

Renderer line 117-120 checks both locations.

**Action Required**: Remove `pass.controlPoints`, use only resolvedShape.

### 3. Duplicate Type Guards
`isShapeDescriptor()` and `isPathTopology()` defined in both:
- RenderAssembler.ts (lines 180-191)
- Canvas2DRenderer.ts (lines 49, 368)

**Action Required**: Consolidate to single location.

### 4. Legacy Numeric Shape Encoding
RenderAssembler line 133: `return 0; // Default shape (circle, legacy encoding)`
This perpetuates the legacy encoding.

**Action Required**: Convert to proper ResolvedShape with topology.

## Gaps Identified

### HIGH Confidence (Ready to implement)
1. **Remove determineShapeMode() fallback** - Make resolvedShape required
2. **Remove renderLegacyShape()** - Dead code after above
3. **Eliminate controlPoints side-channel** - Single source of truth
4. **Consolidate type guards** - Move to shared module

### MEDIUM Confidence (Needs research)
5. **Per-particle shape buffers** - Currently throws error, needs design

## Dependencies
- No external blockers
- Sprint 3 (RenderIR v2) can proceed in parallel but is separate initiative

## Risks
- Breaking rendering if resolvedShape logic has bugs
- Test coverage for all shape modes needed

## Recommendation
Proceed with HIGH confidence cleanup sprint. Defer per-particle shapes to separate ticket.
