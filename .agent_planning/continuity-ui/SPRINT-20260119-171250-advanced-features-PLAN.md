# Sprint: advanced-features - Continuity Panel Advanced Features

Generated: 2026-01-19 17:12:50
Confidence: HIGH
Status: READY FOR IMPLEMENTATION (after core-controls)

## Sprint Goal

Add advanced debugging features to continuity panel: gauge buffer inspector and per-semantic logging controls.

## Scope

**Deliverables:**
1. Gauge buffer inspector showing actual buffer values for selected target
2. Per-semantic debug logging toggles (position, radius, opacity, color)
3. Advanced collapsible section in panel UI

## Dependencies

- Sprint: core-controls (must be completed first)
  - Provides ContinuityConfig in RuntimeState
  - Provides collapsible section pattern
  - Provides MobX action patterns

## Work Items

### P0: Extend ContinuityConfig for Advanced Features

**Acceptance Criteria:**
- [ ] `ContinuityConfig` extended with:
  ```typescript
  interface ContinuityConfig {
    decayExponent: number;
    tauMultiplier: number;
    // NEW:
    debugLogSemantics: Set<string>;      // Which semantics to log
    showGaugeInspector: boolean;
    inspectedTargetId: string | null;    // StableTargetId or null
  }
  ```
- [ ] Defaults: `debugLogSemantics = new Set()`, `showGaugeInspector = false`, `inspectedTargetId = null`
- [ ] Config persisted across hot-swap

**Technical Notes:**
- File: `src/runtime/RuntimeState.ts`
- Initialize in `createRuntimeState()`

### P0: Update Logging to Check Config

**Acceptance Criteria:**
- [ ] Domain change logging in `main.ts` checks `state.continuityConfig.debugLogSemantics`
- [ ] Only logs for semantic if it's in the set (or if set is empty = log all)
- [ ] Existing DEBUG_CONTINUITY constant removed (replaced by config)
- [ ] Console logs from `ContinuityApply.ts` also check config

**Technical Notes:**
- File: `src/main.ts` - Update `logDomainChange()` or equivalent
- File: `src/runtime/ContinuityApply.ts` - Update DEBUG_CONTINUITY checks
- Helper function: `shouldLogSemantic(config, semantic) => boolean`

### P1: Create AdvancedControls Component

**Acceptance Criteria:**
- [ ] New component: `src/ui/components/app/ContinuityAdvancedControls.tsx`
- [ ] Renders in collapsible "Advanced" section (default: collapsed)
- [ ] **Logging Toggles**:
  - [ ] Checkboxes for: Position, Radius, Opacity, Color
  - [ ] Checking a box adds to `debugLogSemantics` set
  - [ ] Unchecking removes from set
  - [ ] Visual indication of which are currently logging
- [ ] **Gauge Inspector Toggle**:
  - [ ] Checkbox: "Show Gauge Inspector"
  - [ ] When checked, enables inspector display
- [ ] MobX observer for reactivity

**Technical Notes:**
- Follow styling from ContinuityControls
- Use semantic role constants from spec (not magic strings)
- Checkboxes should be properly labeled with colors matching target items

### P1: Create GaugeInspector Component

**Acceptance Criteria:**
- [ ] New component: `src/ui/components/app/GaugeInspector.tsx`
- [ ] Only renders when `continuityConfig.showGaugeInspector === true`
- [ ] Shows dropdown to select target (by semantic:instanceId:port)
- [ ] When target selected:
  - [ ] Displays first 5 elements of gauge buffer
  - [ ] Format: `[i]: gauge=X.XXX`
  - [ ] Updates in real-time (5Hz from store)
- [ ] Shows "No gauge data" when selected target has zero gauge
- [ ] Shows "Select a target" when no target selected

**Technical Notes:**
- ContinuityStore needs to expose `getGaugeBufferSample(targetId: string, count: number): number[]`
- Sample only first N elements to avoid overwhelming display
- Consider fixed-width font for alignment
- Color-code positive (green) vs negative (red) gauge values

### P2: Extend ContinuityStore with Advanced Actions

**Acceptance Criteria:**
- [ ] `@action toggleDebugSemantic(semantic: string): void` - adds/removes from set
- [ ] `@action setShowGaugeInspector(show: boolean): void`
- [ ] `@action setInspectedTarget(targetId: string | null): void`
- [ ] `@computed get availableTargets(): string[]` - list of active target IDs
- [ ] `getGaugeBufferSample(targetId, count)` method

**Technical Notes:**
- File: `src/stores/ContinuityStore.ts`
- `toggleDebugSemantic` needs to modify Set in config (trigger reactivity)
- `availableTargets` derived from `state.continuity.targets.keys()`

### P2: Integrate Advanced Section into Panel

**Acceptance Criteria:**
- [ ] ContinuityPanel imports `<ContinuityAdvancedControls />`
- [ ] Renders in collapsible "Advanced" section below "Controls"
- [ ] Section default: collapsed
- [ ] Expand/collapse state independent from Controls section
- [ ] GaugeInspector renders below Advanced controls when enabled

**Technical Notes:**
- File: `src/ui/components/app/ContinuityPanel.tsx`
- Use separate `advancedExpanded` state
- Structure:
  ```
  [▼] Controls
    ...sliders...
  [▶] Advanced
    (when expanded:)
    ...logging toggles...
    ...gauge inspector toggle...
    (if inspector enabled:)
    ...GaugeInspector component...
  Recent Changes
  Active Targets
  Mappings
  ```

## Risks

| Risk | Mitigation |
|------|------------|
| Gauge buffer access race condition | Store updates at 5Hz, buffers updated per-frame; sample during store update |
| Set mutation not triggering MobX | Use observable.set or explicitly trigger reactions |
| Too much logging spam | Default to empty set (no logging); user must opt-in |

## Testing

1. **Manual**: Toggle position logging → see console logs for position targets only
2. **Manual**: Toggle multiple semantics → see logs for all checked
3. **Manual**: Uncheck all → no logs
4. **Manual**: Enable gauge inspector → see dropdown of targets
5. **Manual**: Select target → see gauge buffer values (if non-zero)
6. **Manual**: During domain change → gauge values update in real-time
7. **Build**: `npm run typecheck` passes
8. **Tests**: Existing tests still pass

## Success Criteria

- User can selectively enable/disable logging per semantic role
- User can inspect gauge buffer values for any active target
- Inspector updates in real-time during domain changes
- No performance degradation from inspector sampling (5Hz max)
- UI remains clean and organized (collapsible sections)

## Implementation Order

1. Extend ContinuityConfig
2. Update logging to check config
3. Add ContinuityStore actions
4. Create AdvancedControls component
5. Create GaugeInspector component
6. Integrate into panel
7. Test end-to-end
