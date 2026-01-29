# Sprint: continuity-controls-v2 - Enhanced Continuity Controls

Generated: 2026-01-19
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Enhance the ContinuityControls component with:
1. MUI Slider with input field (reusable pattern for app-wide adoption)
2. Base tau duration control (absolute time in ms)
3. Test pulse feature to preview decay/slew behavior in real-time

## User Requirements

1. **MUI Sliders with Input Field**: Replace native HTML range inputs with MUI Slider + TextField combo
   - `valueLabelDisplay="on"` - always show value label
   - High quality, generalizable implementation for app-wide reuse
   - Follow MUI dark theme styling already in place

2. **Base Tau Duration Control**: Add control for base transition time
   - Currently tau is per-semantic (position: 360ms, radius: 120ms, etc.)
   - User wants to control the base duration, applied before the multiplier

3. **Test Pulse Feature**: Inject a fake gauge adjustment to preview behavior
   - Allows seeing decay/slew effects without making actual domain changes
   - Injects a pulse into gauge buffer, lets it decay with current settings
   - Visual feedback of parameter changes in real-time

## Work Items

### P0: Create Reusable SliderWithInput Component

**Description:**
Create a high-quality, reusable MUI Slider + TextField component following the [MUI Slider with Input Field](https://mui.com/material-ui/react-slider/#slider-with-input-field) pattern.

**Acceptance Criteria:**
- [ ] New file: `src/ui/components/common/SliderWithInput.tsx`
- [ ] Uses MUI Slider with `valueLabelDisplay="on"` (always visible)
- [ ] TextField displays current value and allows direct number input
- [ ] Synchronizes slider and text field bidirectionally
- [ ] Handles edge cases: empty input, out-of-range, non-numeric
- [ ] Properly clamped to min/max range
- [ ] Configurable step, min, max, label, helperText
- [ ] Dark theme integration via existing `darkTheme` provider
- [ ] Compact layout suitable for panel sidebars

**Props Interface:**
```typescript
interface SliderWithInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  helperText?: string;
  disabled?: boolean;
  unit?: string;  // e.g., "ms" for milliseconds
}
```

**Technical Notes:**
- Follow MUI best practices from docs example
- Use Grid layout for slider + input alignment
- Handle input blur to commit value
- Consider debouncing for high-frequency slider updates

### P1: Add Base Tau Duration Control

**Description:**
Add a new slider to control base tau duration (in milliseconds) that scales all semantic taus.

**Acceptance Criteria:**
- [ ] Add `baseTauMs` to `ContinuityConfig` interface (default: 150ms)
- [ ] Add `baseTauMs` to `createContinuityConfig()` factory
- [ ] Add `setBaseTauMs` action to `ContinuityStore`
- [ ] Add `baseTauMs` computed getter to `ContinuityStore`
- [ ] Update `resetToDefaults()` to reset `baseTauMs` to 150ms
- [ ] Add SliderWithInput for "Base Duration" in ContinuityControls
  - Range: 50-500ms
  - Step: 10ms
  - Unit: "ms"
  - Helper text: "Base transition time (before multiplier)"
- [ ] Apply in `applyContinuity()`: `effectiveTau = policy.tauMs * (baseTauMs / 150) * tauMultiplier`
  - Ratio (baseTauMs / 150) normalizes around default 150ms
  - This makes baseTauMs feel like absolute time control

**Technical Notes:**
- The existing `tauMultiplier` is relative (0.5-3.0x)
- `baseTauMs` gives absolute feeling (50-500ms range)
- Formula: `effectiveTau = policyTau × (baseTauMs / CANONICAL_BASE) × tauMultiplier`
- CANONICAL_BASE = 150ms (average of semantic taus)

### P1: Migrate Existing Sliders to SliderWithInput

**Description:**
Replace the current `ControlRow` component with `SliderWithInput` for both existing controls.

**Acceptance Criteria:**
- [ ] Replace "Decay Curve" slider with SliderWithInput
- [ ] Replace "Time Scale" slider with SliderWithInput
- [ ] Remove old `ControlRow` component
- [ ] Wrap controls in `<ThemeProvider theme={darkTheme}>`
- [ ] Visual regression check: controls still fit in panel width
- [ ] Value labels always visible (valueLabelDisplay="on")

### P2: Test Pulse Feature - Store and UI

**Description:**
Add ability to inject a test pulse into continuity buffers to preview decay behavior.

**Acceptance Criteria:**
- [ ] Add `triggerTestPulse()` action to `ContinuityStore`
- [ ] Add "Test Pulse" button to ContinuityControls
- [ ] Button triggers a synthetic gauge injection on active targets
- [ ] Pulse magnitude: configurable or fixed (e.g., 50px offset for position)
- [ ] User can see the pulse decay with current settings

**Technical Notes:**
- Need to find first active position target
- Inject into gauge buffer: `gaugeBuffer[i] += pulseMagnitude`
- Runtime will naturally decay it using current config
- May need to store "pulse active" state for visual indicator

### P2: Test Pulse Feature - Runtime Integration

**Description:**
Implement the runtime mechanism to inject test pulses into active continuity targets.

**Acceptance Criteria:**
- [ ] Add `testPulseRequest` field to ContinuityConfig:
  ```typescript
  testPulseRequest?: {
    magnitude: number;      // Pulse size
    targetSemantic?: string; // 'position' | 'radius' | null (all)
    requestedAt: number;    // Frame ID or timestamp
  } | null;
  ```
- [ ] In `applyContinuity()`, check for pending pulse request
- [ ] If pulse requested and not yet applied this frame:
  - Find matching targets (by semantic or all)
  - Add magnitude to gauge buffer for all elements
  - Clear the request after applying
- [ ] Pulse applies once, then decays naturally with current settings

**Technical Notes:**
- Request pattern prevents pulse applying multiple times per frame
- Use `state.cache.frameId` to track if already applied
- Clear `testPulseRequest` after applying to prevent re-application
- Consider applying to first few elements only for performance

### P3: Visual Pulse Indicator (Optional Polish)

**Description:**
Show visual feedback when test pulse is active and decaying.

**Acceptance Criteria:**
- [ ] "Pulse Active" indicator in ContinuityControls when pulse is decaying
- [ ] Optional: show decay progress (requires tracking max gauge value)
- [ ] Indicator clears when gauge decays below threshold

**Technical Notes:**
- Could sample gauge buffer max value in `updateFromRuntime()`
- Show indicator when max > threshold (e.g., 0.1)
- This is polish - can skip if time constrained

## Dependencies

- Existing ContinuityControls component
- MUI Slider, TextField, Grid components
- darkTheme provider
- ContinuityStore MobX store
- RuntimeState.continuityConfig

## Risks

| Risk | Mitigation |
|------|------------|
| MUI Slider styling conflicts | Use ThemeProvider wrapper, test in panel context |
| Test pulse causes visual artifacts | Apply to small subset, small magnitude, decay quickly |
| Performance of pulse on large buffers | Limit to first N elements or single semantic |

## Testing

1. **Manual**: Open Continuity panel, verify sliders have MUI styling with always-visible labels
2. **Manual**: Adjust Base Duration slider, verify transitions get faster/slower
3. **Manual**: Click "Test Pulse", verify visual movement in canvas
4. **Manual**: Adjust Decay Curve/Time Scale, click Test Pulse again, verify different decay behavior
5. **Build**: `npm run typecheck` passes
6. **Tests**: Existing tests still pass

## Success Criteria

- Sliders use MUI components with always-visible value labels
- SliderWithInput is reusable for other panels
- Base tau gives intuitive absolute-time control
- Test pulse provides instant visual feedback of decay/slew settings
- No performance regression from pulse feature

## Estimated Effort

- P0 (SliderWithInput): 1 hour
- P1 (Base Tau + Migration): 1 hour
- P2 (Test Pulse): 1.5 hours
- P3 (Visual Indicator): 0.5 hours (optional)

Total: ~4 hours (3.5 hours without P3)
