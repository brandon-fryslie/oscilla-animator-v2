# Definition of Done: Core Controls

Sprint: core-controls
Generated: 2026-01-19 17:12:45

## Acceptance Criteria

### Functional

- [ ] Decay exponent slider (0.1-2.0) controls gauge decay curve in real-time
- [ ] Tau multiplier slider (0.5-3.0) scales all transition times globally
- [ ] "Reset to Defaults" button restores exponent=0.7, multiplier=1.0
- [ ] "Clear Continuity State" button clears all buffers (with confirmation)
- [ ] Controls survive hot-swap (config persisted in RuntimeState)
- [ ] Controls disabled/hidden when no active continuity targets (optional)

### Technical

- [ ] `RuntimeState.continuityConfig` created with proper defaults
- [ ] `ContinuityControls.tsx` component follows existing panel styling
- [ ] MobX actions in ContinuityStore work correctly
- [ ] `decayGauge()` reads exponent from config (not hardcoded)
- [ ] Tau multiplier applied correctly in `applyContinuity()`
- [ ] No TypeScript errors
- [ ] No runtime errors in console

### Testing

- [ ] Manual test: Adjust decay exponent while spiral settling → visual change
- [ ] Manual test: Adjust tau multiplier → transitions speed up/slow down
- [ ] Manual test: Reset to defaults → controls return to initial values
- [ ] Manual test: Clear state → continuity buffers zeroed
- [ ] Build: `npm run typecheck` passes
- [ ] Tests: `npm test` passes (no regressions)

### Documentation

- [ ] Inline comments explain config integration in RuntimeState
- [ ] Help text on sliders explains what each control does
- [ ] Code follows existing patterns (MobX, React, styling)
