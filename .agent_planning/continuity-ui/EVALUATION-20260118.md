# Evaluation: Continuity System UI Features

**Date**: 2026-01-18
**Topic**: UI features to exercise and visualize the Continuity System
**Verdict**: CONTINUE

## 1. Current State

### Runtime (Complete)
The Continuity System runtime is fully implemented:
- `DomainIdentity.ts` - Element ID generation
- `ContinuityState.ts` - State management
- `ContinuityMapping.ts` - Element mapping algorithms
- `ContinuityDefaults.ts` - Canonical policies (position, radius, opacity, color)
- `ContinuityApply.ts` - Gauge and slew filters
- 78 unit/integration tests passing

### UI (Partial)
Existing UI components:
- **BlockInspector** (`src/ui/components/BlockInspector.tsx`) - Full parameter editing with sliders, numbers, etc.
- **PlaybackStore** - Time/speed control (MobX)
- **Canvas rendering** - 2D canvas with zoom/pan
- **Animation loop** in `main.ts` calling `executeFrame`/`renderFrame`
- **Patch switcher** - Can switch between predefined patches
- **LogPanel** - Diagnostic logging

Missing:
- No continuity-specific visualization
- No real-time count control UI
- No continuity state inspector
- RuntimeState.continuity not exposed to UI

### Key Insight: Array Block is the Trigger
The `Array` block in `main.ts` has a `count` param (currently 5000). Changing this value triggers domain changes that exercise the continuity system. The BlockInspector already supports editing numeric params.

## 2. What's Needed

### Tier 1: MVP (See Continuity in Action)
1. **Dynamic count control** - Edit Array block's `count` param in inspector
   - Already works via BlockInspector (edit number → recompile)
   - Need: Hot-swap that preserves RuntimeState.continuity

2. **Continuity state logging** - Log domain changes to LogPanel
   - Add logging in `ContinuityApply.applyContinuity()`
   - Show: "Domain changed: 5000→5001, mapped: 5000, new: 1"

3. **Compile-on-param-change** - Currently patches are static
   - PatchStore.updateBlockParams exists but doesn't trigger recompile
   - Need: Auto-recompile when params change

### Tier 2: Debug Tools
4. **ContinuityStore** - Expose continuity state to MobX/UI
   - Observable: target count, mapping stats, last domain change
   - Updated per-frame (batched to 5Hz to avoid overhead)

5. **Continuity inspector panel** - Dedicated dockview panel
   - Shows: active targets, slew progress, gauge offsets
   - Filter by semantic (position, radius, opacity, color)

6. **Visual element highlighting** - Show mapped vs new elements
   - Overlay mode: color-code new elements differently

### Tier 3: Advanced
7. **Policy editor** - UI to override default policies per-target
8. **Animation scrubber** - Pause/step/scrub time
9. **Slew visualization** - Graph showing slew curve over time

## 3. Dependencies

| Feature | Depends On |
|---------|------------|
| Count control | BlockInspector (exists) |
| Recompile on change | PatchStore + Compiler integration |
| Continuity logging | ScheduleExecutor integration |
| ContinuityStore | RuntimeState access in main.ts |
| Inspector panel | DockView panel registry |

## 4. Critical Path

The **minimum viable demo** to see continuity in action:

1. Wire Array block count editing → recompile → hot-swap with continuity preservation
2. Add logging to ContinuityApply so domain changes appear in LogPanel
3. Result: Change count slider, see smooth animation transition, see log messages

This requires:
- Connecting PatchStore param changes to compiler
- Implementing hot-swap in main.ts that preserves continuity state
- Adding domain change logging

## 5. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hot-swap complexity | High | Start with hard recompile, add continuity later |
| Performance overhead | Medium | Batch state updates, throttle logging |
| UI/runtime sync | Medium | Use MobX reactions, not polling |

## 6. Unknowns

1. **Is ContinuityApply being called?** - Check ScheduleExecutor has real handlers (not placeholders)
2. **Does recompile preserve RuntimeState?** - Need to verify main.ts flow
3. **What happens to canvas during recompile?** - Need smooth transition

## 7. Recommendation

**Phase 1 (HIGH confidence)**: Wire existing infrastructure
- Count slider already works in inspector
- Add recompile-on-change
- Add continuity logging
- Verify hot-swap preserves state

**Phase 2 (HIGH confidence)**: ContinuityStore + panel
- Create MobX store exposing continuity state
- Create simple inspector panel

**Phase 3 (MEDIUM confidence)**: Advanced visualization
- Element highlighting, policy editor
- Needs design decisions
