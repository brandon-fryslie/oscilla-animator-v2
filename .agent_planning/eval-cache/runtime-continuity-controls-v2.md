# Runtime Findings: continuity-controls-v2

**Scope**: continuity-controls-v2 sprint
**Last Updated**: 2026-01-19
**Confidence**: FRESH

## SliderWithInput Component

**Component**: `src/ui/components/common/SliderWithInput.tsx`

### Verified Behavior
- Always-visible value labels via `valueLabelDisplay="on"` (line 109)
- Bidirectional sync: slider → text field and text field → slider
- Validation on blur: NaN → reset to current value, out-of-range → clamp
- Enter key commits input immediately
- Unit label support (e.g., "ms") via `InputProps.endAdornment`

### Props Interface
```typescript
{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  helperText?: string;
  disabled?: boolean;
  unit?: string;
}
```

### Edge Cases Handled
- Empty input → resets to current value
- Non-numeric input → resets to current value
- Value > max → clamped to max
- Value < min → clamped to min
- Typing in progress → local state, only commits on blur/Enter

## baseTauMs Feature

**Config Field**: `RuntimeState.continuityConfig.baseTauMs`
- Range: 50-500ms
- Default: 150ms
- Step: 10ms

### Runtime Effect
Applied as multiplicative factor in `ContinuityApply.ts`:

```typescript
const baseTauFactor = baseTauMs / 150;
const effectiveTau = policy.tauMs * baseTauFactor * tauMultiplier;
```

**Effect on transitions**:
- baseTauMs = 50ms → 3.33x faster than default
- baseTauMs = 150ms → default speed (1x)
- baseTauMs = 500ms → 3.33x slower than default

**Policies affected**: Both `slew` and `project` policies (lines 509, 528)

### Store Integration
- Getter: `ContinuityStore.baseTauMs` (computed, MobX reactive)
- Setter: `ContinuityStore.setBaseTauMs(value)` (action)
- Reset: Included in `resetToDefaults()` → 150ms

## Test Pulse Feature

**Trigger**: `ContinuityStore.triggerTestPulse(magnitude, targetSemantic?)`

### How It Works
1. User clicks "Test Pulse" button
2. Store action sets `continuityConfig.testPulseRequest = { magnitude: 50, targetSemantic: 'position' }`
3. Next frame: `applyContinuity()` checks for pulse request
4. If semantic matches (or no filter), injects magnitude into `gaugeBuffer` for all elements
5. Marks pulse as applied via `appliedFrameId` (prevents double-apply)
6. End of frame: Pulse request cleared from config

### Pulse Injection Logic (ContinuityApply.ts lines 471-491)
```typescript
if (pulseRequest && pulseRequest.appliedFrameId !== state.cache.frameId) {
  const shouldApplyPulse = !pulseRequest.targetSemantic || pulseRequest.targetSemantic === semantic;
  if (shouldApplyPulse) {
    for (let i = 0; i < bufferLength; i++) {
      targetState.gaugeBuffer[i] += magnitude;
    }
    pulseRequest.appliedFrameId = state.cache.frameId;
  }
}
```

### Cleanup
- Automatic cleanup at end of `finishContinuity()`
- Check: `appliedFrameId === state.cache.frameId` → clear request
- Allows immediate re-trigger (no cooldown)

### Visual Feedback
- Button text: "Test Pulse" → "Pulse Active..." for 2 seconds
- Border color: default → teal when active
- Helper text appears: "Watch elements move and decay..."

### Interaction with Settings
Pulse decay respects:
- `decayExponent`: Controls decay curve shape
- `tauMultiplier`: Scales decay time
- `baseTauMs`: Sets base decay speed

**Combined effect**: `effectiveTau = policyTau × (baseTauMs/150) × tauMultiplier`

## UI Layout

**Panel**: Continuity → CONTROLS section

**Order of controls**:
1. Decay Curve (0.1-2.0, step 0.1)
2. Time Scale (0.5-3.0, step 0.1)
3. Base Duration (50-500ms, step 10ms, unit="ms")
4. Test Pulse button
5. Reset to Defaults button
6. Clear State button

All sliders use `SliderWithInput` component with MUI styling.

## Testing Notes

### Manual Test Scenarios
1. **Base Duration Effect**: Set to 50ms vs 500ms → observe 10x speed difference in transitions
2. **Test Pulse Sequence**: Click pulse → observe movement → wait for decay → click again
3. **Settings Interaction**: Change decay/tau → test pulse → verify different decay behavior
4. **Text Input**: Type values, test clamping, test Enter key vs blur
5. **Reset**: Change all values → Reset to Defaults → verify 0.7, 1.0, 150ms

### Known Limitations
- Test pulse currently hardcoded to magnitude=50, semantic='position'
- Could be exposed as additional UI controls if needed
- No pulse cooldown (can spam-click)

## Build Health
- TypeScript: Compiles cleanly
- Tests: 380 passing (no regressions)
- Dependencies: MUI components imported correctly
