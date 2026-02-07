# Implementation Context: remaining-fixes
Generated: 2026-02-06

## Key Files

### SVG GeometryDefCache
- `src/render/svg/SVGRenderer.ts` - Has `invalidateGeometryCache()` method (lines 428-433)
- `src/services/CompileOrchestrator.ts` - Hot-swap success path (line ~324)
- `src/stores/PatchStore.ts` - `currentProgram` observable

### Canvas2D dash pattern
- `src/render/canvas/Canvas2DRenderer.ts` - Lines 139-142, `dashPx` allocation

## Existing Patterns to Follow
- CompilationInspectorService already reacts to program changes via MobX
- SVGRenderer already has `dispose()` for lifecycle cleanup
- Canvas2DRenderer is a class instance with stable lifetime

## What NOT to do
- Do NOT add SVG cache clearing to CompileOrchestrator directly (would create an upward dependency from runtime to renderer)
- Do NOT add a global event system just for this
- Do NOT over-engineer the dash buffer (simple reuse is sufficient)
