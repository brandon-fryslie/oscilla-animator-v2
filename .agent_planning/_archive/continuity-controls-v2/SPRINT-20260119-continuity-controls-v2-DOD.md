# Definition of Done: continuity-controls-v2

Sprint: Enhanced Continuity Controls
Generated: 2026-01-19

## Functional Acceptance Criteria

### SliderWithInput Component
1. [ ] SliderWithInput component exists at `src/ui/components/common/SliderWithInput.tsx`
2. [ ] Slider shows value label always visible (valueLabelDisplay="on")
3. [ ] TextField allows direct numeric input with validation
4. [ ] Slider and TextField stay synchronized
5. [ ] Invalid input (empty, non-numeric, out-of-range) handled gracefully

### Existing Control Migration
6. [ ] "Decay Curve" control uses SliderWithInput with MUI styling
7. [ ] "Time Scale" control uses SliderWithInput with MUI styling
8. [ ] Value labels always visible on both sliders
9. [ ] Controls wrapped in ThemeProvider with darkTheme

### Base Tau Duration Control
10. [ ] "Base Duration" slider with range 50-500ms, step 10ms
11. [ ] Unit label shows "ms"
12. [ ] Base duration affects transition speed (lower = faster, higher = slower)
13. [ ] Reset to Defaults resets base duration to 150ms

### Test Pulse Feature
14. [ ] "Test Pulse" button visible in controls section
15. [ ] Clicking Test Pulse causes visible movement/change in canvas
16. [ ] Pulse decays according to current Decay Curve and Time Scale settings
17. [ ] Multiple pulses can be triggered in sequence

## Technical Acceptance Criteria

1. [ ] `src/ui/components/common/SliderWithInput.tsx` created with TypeScript interface
2. [ ] `ContinuityConfig.baseTauMs` added to RuntimeState.ts
3. [ ] `setBaseTauMs` action added to ContinuityStore
4. [ ] `baseTauMs` computed getter added to ContinuityStore
5. [ ] `triggerTestPulse()` action added to ContinuityStore
6. [ ] `testPulseRequest` field added to ContinuityConfig
7. [ ] Test pulse applied in `applyContinuity()` when requested
8. [ ] No TypeScript errors (`npm run typecheck`)
9. [ ] No runtime errors in console

## Testing Criteria

1. [ ] Manual: Adjust Decay Curve slider → value label updates live
2. [ ] Manual: Type in text field → slider updates to match
3. [ ] Manual: Type out-of-range value → clamped to valid range
4. [ ] Manual: Adjust Base Duration → transitions speed changes
5. [ ] Manual: Click Test Pulse → visible movement in canvas
6. [ ] Manual: Adjust settings then Test Pulse → different decay behavior
7. [ ] Build: `npm run typecheck` passes
8. [ ] Tests: `npm test` passes (no regressions)

## Verification Steps

1. Open http://localhost:5174
2. Open Continuity panel (bottom tabs)
3. Expand CONTROLS section
4. Verify all sliders have MUI styling with always-visible value labels
5. Test each slider: drag, click track, type in text field
6. Verify Base Duration affects transition speed
7. Click Test Pulse and observe canvas for movement
8. Adjust Decay Curve to 0.3 (gentler), Test Pulse again - should decay slower at start
9. Adjust Time Scale to 2.0 (slower), Test Pulse again - should take longer to settle
10. Click Reset to Defaults - all values return to defaults
11. Check browser console - no errors

## Exit Criteria

- All functional criteria checked
- All technical criteria checked
- All testing criteria checked
- Verification steps completed without issues
- Code committed and pushed
