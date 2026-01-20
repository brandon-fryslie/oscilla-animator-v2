# Definition of Done: Advanced Features

Sprint: advanced-features
Generated: 2026-01-19 17:12:50

## Acceptance Criteria

### Functional

- [ ] Per-semantic logging toggles work (Position, Radius, Opacity, Color)
- [ ] Checking a semantic enables console logging for that type only
- [ ] Unchecking disables logging
- [ ] Gauge inspector can be enabled/disabled via checkbox
- [ ] When enabled, dropdown shows all active continuity targets
- [ ] Selecting a target displays first 5 gauge buffer values
- [ ] Gauge values update in real-time during domain changes
- [ ] Inspector shows "No gauge data" when buffer is all zeros
- [ ] Controls survive hot-swap

### Technical

- [ ] `ContinuityConfig` extended with logging and inspector fields
- [ ] Logging check integrated into `main.ts` and `ContinuityApply.ts`
- [ ] DEBUG_CONTINUITY constant removed (replaced by config)
- [ ] MobX actions for toggling semantics, enabling inspector
- [ ] `getGaugeBufferSample()` method returns first N gauge values
- [ ] No TypeScript errors
- [ ] No runtime errors in console

### Testing

- [ ] Manual: Toggle each semantic → verify selective logging
- [ ] Manual: Enable inspector → select target → see gauge values
- [ ] Manual: Trigger domain change → gauge values update in inspector
- [ ] Manual: Disable inspector → inspector UI disappears
- [ ] Build: `npm run typecheck` passes
- [ ] Tests: `npm test` passes (no regressions)

### UX

- [ ] Advanced section collapses/expands independently of Controls
- [ ] Checkboxes have clear labels with color indicators
- [ ] Gauge values formatted clearly (3 decimal places)
- [ ] Inspector doesn't overwhelm display (limit to 5 elements)
- [ ] Loading state or "No targets" message when no continuity active
