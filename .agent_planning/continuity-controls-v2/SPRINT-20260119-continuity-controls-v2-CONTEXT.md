# Implementation Context: continuity-controls-v2

## Key Files

### To Modify
- `src/ui/components/app/ContinuityControls.tsx` - Main component to enhance
- `src/stores/ContinuityStore.ts` - Add baseTauMs and testPulse actions
- `src/runtime/RuntimeState.ts` - Add baseTauMs and testPulseRequest to ContinuityConfig
- `src/runtime/ContinuityApply.ts` - Apply baseTauMs factor and test pulse

### To Create
- `src/ui/components/common/SliderWithInput.tsx` - Reusable MUI slider component

### Reference
- `src/ui/theme.ts` - darkTheme with MUI Slider styling already defined
- `src/ui/components/ConnectionMatrix.tsx` - Example of MUI usage in project
- `src/runtime/ContinuityDefaults.ts` - Canonical tau values (avg ~150ms)

## Current State

### ContinuityConfig (RuntimeState.ts:195-211)
```typescript
export interface ContinuityConfig {
  decayExponent: number;      // 0.7 default
  tauMultiplier: number;      // 1.0 default
}
```

### ContinuityStore Actions (ContinuityStore.ts)
- `setDecayExponent(value: number)`
- `setTauMultiplier(value: number)`
- `resetToDefaults()`
- `clearContinuityState()`

### ContinuityControls (ContinuityControls.tsx)
- Uses native HTML `<input type="range">`
- Custom `ControlRow` component
- Two sliders: Decay Curve, Time Scale
- Two buttons: Reset to Defaults, Clear State

## Design Decisions

### Base Tau Scaling Formula
The canonical taus vary by semantic:
- position: 360ms
- color: 150ms
- radius: 120ms
- opacity: 80ms

Average: ~150ms

Formula for effective tau:
```
effectiveTau = policyTau × (baseTauMs / 150) × tauMultiplier
```

This means:
- baseTauMs = 150ms → no change (factor = 1.0)
- baseTauMs = 75ms → half speed (factor = 0.5)
- baseTauMs = 300ms → double speed (factor = 2.0)

### Test Pulse Mechanism

**Request Pattern:**
```typescript
testPulseRequest?: {
  magnitude: number;       // Pulse size (e.g., 50 for 50px)
  targetSemantic?: string; // 'position' | null (all)
  appliedFrameId?: number; // Prevent double-apply
} | null;
```

**Application in applyContinuity():**
1. Check if `testPulseRequest` exists and hasn't been applied this frame
2. Find matching targets (position or all)
3. Add magnitude to gauge buffer elements
4. Mark request as applied (set appliedFrameId = current frame)
5. Store clears request after one frame (or keep for indicator)

**Why gauge buffer?**
- Gauge decays naturally with current settings
- No special cleanup needed
- Visible effect on all affected elements
- Works with existing decay/slew pipeline

### SliderWithInput Design

Following MUI example but simplified for compact panels:
```
┌─────────────────────────────────────┐
│ Label                          [1.0]│
│ ○───────────●───────────○           │
│ Helper text                         │
└─────────────────────────────────────┘
```

Key considerations:
- Compact: fits in 250px panel width
- Always-visible value label via valueLabelDisplay="on"
- TextField on right for direct input
- Grid layout for alignment

## MUI Integration

Project already has:
- `@mui/material` installed
- `darkTheme` in `src/ui/theme.ts` with Slider styling
- `ThemeProvider` pattern used in ConnectionMatrix

Example from theme.ts:
```typescript
MuiSlider: {
  styleOverrides: {
    root: { color: colors.primary },
    thumb: { width: 14, height: 14 },
  },
},
```

## Test Pulse Visual Behavior

When user clicks "Test Pulse":
1. All position targets get +50px offset added to gauge
2. Gauge immediately starts decaying with current `decayExponent`
3. Elements visibly shift then return to base positions
4. Decay speed controlled by `tauMultiplier` × `baseTauMs` factor

User can:
- Adjust Decay Curve to 0.3, click Test Pulse → gentler start, slower initial decay
- Adjust Time Scale to 2.0, click Test Pulse → takes longer to settle
- Adjust Base Duration to 50ms, click Test Pulse → very fast decay

## Commits Pattern

Suggested commit sequence:
1. `feat(ui): Create SliderWithInput component with MUI styling`
2. `refactor(ui): Migrate ContinuityControls to SliderWithInput`
3. `feat(runtime): Add baseTauMs to ContinuityConfig`
4. `feat(ui): Add Base Duration slider to ContinuityControls`
5. `feat(runtime): Implement test pulse injection in ContinuityApply`
6. `feat(ui): Add Test Pulse button to ContinuityControls`
