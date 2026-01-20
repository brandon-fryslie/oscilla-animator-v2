# Sprint: core-controls - Continuity Panel Core Controls

Generated: 2026-01-19 17:12:45
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Add essential debugging controls to the continuity panel: decay exponent slider, tau multiplier slider, and reset functionality.

## Scope

**Deliverables:**
1. ContinuityConfig in RuntimeState for persisting control values
2. ContinuityControls component with sliders and buttons
3. MobX actions in ContinuityStore for control updates
4. Integration of controls with existing ContinuityApply.ts logic

## Work Items

### P0: Add ContinuityConfig to RuntimeState

**Acceptance Criteria:**
- [ ] `RuntimeState.continuityConfig` field added with type:
  ```typescript
  interface ContinuityConfig {
    decayExponent: number;      // Default: 0.7
    tauMultiplier: number;      // Default: 1.0
  }
  ```
- [ ] Created in `createRuntimeState()` with default values
- [ ] Preserved across hot-swap (not cleared during recompile)
- [ ] Accessible from `ContinuityApply.applyContinuity()`

**Technical Notes:**
- File: `src/runtime/RuntimeState.ts`
- Add interface definition and field to RuntimeState type
- File: `src/runtime/index.ts` (or wherever createRuntimeState lives)
- Initialize config with defaults in creation function

### P0: Create ContinuityControls Component

**Acceptance Criteria:**
- [ ] New file: `src/ui/components/app/ContinuityControls.tsx`
- [ ] Renders collapsible "Controls" section (default: collapsed)
- [ ] Decay Exponent slider: range 0.1-2.0, step 0.1, default 0.7
  - Label: "Decay Curve"
  - Help text: "<0.7 = gentler start, >0.7 = more linear"
- [ ] Tau Multiplier slider: range 0.5-3.0, step 0.1, default 1.0
  - Label: "Time Scale"
  - Help text: "Multiplier for all transition times"
- [ ] "Reset to Defaults" button
- [ ] "Clear Continuity State" button (with confirmation)
- [ ] MobX observer for live updates

**Technical Notes:**
- Use consistent styling with existing ContinuityPanel
- Sliders should show current value next to label
- Confirmation dialog for "Clear State" can be simple `window.confirm()` for now
- Controls should be disabled when no active continuity targets exist (optional polish)

### P0: Extend ContinuityStore with Actions

**Acceptance Criteria:**
- [ ] `@action setDecayExponent(value: number): void` - updates RuntimeState.continuityConfig
- [ ] `@action setTauMultiplier(value: number): void` - updates RuntimeState.continuityConfig
- [ ] `@action resetToDefaults(): void` - resets config to 0.7, 1.0
- [ ] `@action clearContinuityState(): void` - clears all continuity buffers
- [ ] Observable getters for current values: `decayExponent`, `tauMultiplier`

**Technical Notes:**
- File: `src/stores/ContinuityStore.ts`
- Actions call through to main.ts to update RuntimeState
- May need to expose `runtimeState` ref to ContinuityStore, or add bridge functions in main.ts
- Consider: `rootStore.continuity.runtimeStateRef` for direct access

### P1: Update decayGauge() to Read Config

**Acceptance Criteria:**
- [ ] `decayGauge()` reads exponent from `state.continuityConfig.decayExponent` instead of hardcoded 0.7
- [ ] Falls back to 0.7 if config is undefined (safety)
- [ ] Exponent changes take effect immediately on next frame

**Technical Notes:**
- File: `src/runtime/ContinuityApply.ts`
- Modify signature: `decayGauge(..., state: RuntimeState)`
- Update calls to `decayGauge()` in `applyContinuity()` to pass state

### P1: Apply Tau Multiplier to Policies

**Acceptance Criteria:**
- [ ] All tau values from policies multiplied by `state.continuityConfig.tauMultiplier`
- [ ] Applies in `applyContinuity()` before calling `applySlewFilter()` and `decayGauge()`
- [ ] Multiplier changes take effect immediately

**Technical Notes:**
- File: `src/runtime/ContinuityApply.ts`
- In `applyContinuity()`, compute: `effectiveTau = policy.tauMs * (state.continuityConfig?.tauMultiplier ?? 1.0)`
- Use `effectiveTau` for all slew and decay operations in that frame

### P2: Integrate Controls into ContinuityPanel

**Acceptance Criteria:**
- [ ] ContinuityPanel imports and renders `<ContinuityControls />` at top
- [ ] Controls appear in collapsible section (default collapsed to avoid clutter)
- [ ] Section header: "Controls" with expand/collapse arrow
- [ ] No visual regression to existing sections

**Technical Notes:**
- File: `src/ui/components/app/ContinuityPanel.tsx`
- Use simple React state for collapse/expand (`useState<boolean>(false)`)
- Render ContinuityControls only when expanded (avoid unnecessary updates)

## Dependencies

- Existing ContinuityPanel component
- Existing ContinuityStore (MobX)
- RuntimeState.continuity (existing)
- Active continuity targets (for testing)

## Risks

| Risk | Mitigation |
|------|------------|
| Config changes mid-slew cause artifacts | Test empirically; likely smooth due to per-frame application |
| Performance overhead of config access | Negligible (simple field read); can verify with perf trace |
| State synchronization between store and runtime | Use direct RuntimeState ref or bridge functions in main.ts |

## Testing

1. **Manual**: Load app, open continuity panel, expand controls section
2. **Functional**: Adjust decay exponent while spiral is settling → visually verify smoothness changes
3. **Functional**: Adjust tau multiplier → verify transitions speed up/slow down
4. **Functional**: Click "Reset to Defaults" → sliders return to 0.7 and 1.0
5. **Functional**: Click "Clear State" → confirm dialog → all continuity buffers zeroed
6. **Build**: `npm run typecheck` passes
7. **Tests**: Existing tests still pass (no regressions)

## Success Criteria

- User can adjust decay curve and time scale in real-time
- Changes apply immediately to active continuity operations
- Controls are easy to find and use (collapsible section in panel)
- No performance degradation from config access
