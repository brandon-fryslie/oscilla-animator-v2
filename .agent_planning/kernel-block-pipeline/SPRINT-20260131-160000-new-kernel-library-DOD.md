# Definition of Done: new-kernel-library
Generated: 2026-01-31-160000

## Verification Checklist

### WI-1: Canonical Kernel Set
- [ ] All listed kernels registered and tested
- [ ] A test patch renders using only registered kernels (no legacy fallback)
- [ ] `npm run test` passes
- [ ] `npm run build` passes

### WI-2: Property Tests
- [ ] `kernel-properties.test.ts` exists
- [ ] Parametrized over all registered kernels
- [ ] Finiteness, range, determinism properties tested
- [ ] All property tests pass

### WI-3: Stub Policy
- [ ] Unknown kernel → KernelNotImplemented (tested)
- [ ] No silent fallbacks (grep verified)
- [ ] Error messages include kernel name

### Sprint-Level
- [ ] Can add new kernel: register fn + property test auto-covers it
- [ ] Can remove kernel: evaluator throws KernelNotImplemented (not silent)
- [ ] Existing tests unaffected (behavior preserved)
