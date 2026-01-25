# Definition of Done: port-types Sprint

**Generated:** 2026-01-25T16:00:00 (Final - spec aligned)

**Spec Reference:** `design-docs/Polymorphic-Cardinality-Spec.md`

## Exit Criteria

### P0: FromDomainId reverted to fieldOnly
- [ ] `cardinalityMode: 'fieldOnly'`
- [ ] `broadcastPolicy: 'disallowSignalMix'`
- [ ] Output port uses `signalTypeField('float', 'default')`

### P1: Port types updated for PRESERVE blocks
- [ ] Pulse: id01, value → `signalType()`
- [ ] RadiusSqrt: id01, radius, out → `signalType()`
- [ ] Jitter2D: pos, rand, out → `signalType()`
- [ ] HueFromPhase: id01, hue → `signalType()`
- [ ] SetZ: pos, z, out → `signalType()`
- [ ] FieldPolarToCartesian: angle, radius, pos → `signalType()`
- [ ] FieldCartesianToPolar: pos, angle, radius → `signalType()`

### P2: lower() guards fixed
- [ ] GoldenAngle: dual-path lower() (sig + field)
- [ ] AngularOffset: dual-path lower() (sig + field)
- [ ] Pulse: dual-path lower() (sig + field)
- [ ] RadiusSqrt: dual-path lower() (sig + field)
- [ ] Jitter2D: dual-path lower() (sig + field)
- [ ] HueFromPhase: dual-path lower() (sig + field)
- [ ] SetZ: dual-path lower() (sig + field)
- [ ] FieldPolarToCartesian: dual-path lower() (sig + field)
- [ ] FieldCartesianToPolar: dual-path lower() (sig + field)

### P3: Identity blocks verified fieldOnly
- [ ] StableIdHash: `cardinalityMode: 'fieldOnly'` (unchanged)
- [ ] DomainIndex: `cardinalityMode: 'fieldOnly'` (unchanged)

### P4: Tested and committed
- [ ] `npm run typecheck` passes
- [ ] Dev server starts without errors
- [ ] Test patch compiles: GoldenAngle output → Add input
- [ ] Animation renders correctly
- [ ] Changes committed with descriptive message

## Verification Commands

```bash
# Type check
npm run typecheck

# Start dev server
npm run dev

# In browser: Create/load patch with GoldenAngle → Add connection
# Verify no compilation errors in console
# Verify animation renders
```

## Not In Scope

- Test file fixes (pre-existing TypeScript errors)
- Rename blocks to remove "Field" prefix (§10 says this is separate UX pass)
- KernelRegistryDual implementation (§5 is architectural guidance, not immediate requirement)
- New tests for cardinality polymorphism
