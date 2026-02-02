# Definition of Done: Stateful & Gating Lenses
Generated: 2026-02-01

## Completion Criteria

- [ ] Slew registers and compiles correctly
- [ ] Slew state is preserved across frames (smoothing behavior works)
- [ ] Mask registers and compiles correctly
- [ ] Mask gates signals to zero when mask ≤ 0
- [ ] Deadzone registers and compiles correctly
- [ ] Deadzone zeros small magnitudes while preserving sign
- [ ] All lens blocks have `category: 'lens'`, no `adapterSpec`
- [ ] Tests pass for all three blocks
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes (no regressions)
