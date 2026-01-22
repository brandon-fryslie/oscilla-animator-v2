# Sprint: kernel-layer-completion - Kernel Refactor Phases 5-7

Generated: 2026-01-22T12:00:00Z
Confidence: HIGH
Status: READY FOR IMPLEMENTATION

## Sprint Goal

Complete Phases 5-7 of the kernel refactor roadmap: wire up coord-space discipline, prepare RenderIR alignment, and add sanity tests.

## Background Assessment

### Already Complete (Phases 1-4):
- ✅ OpcodeInterpreter: Clean scalar math layer with strict arity
- ✅ SignalEvaluator: Phase-domain oscillators (oscSin, etc.), easing, noise
- ✅ FieldKernels: Extracted module with documented contracts
- ✅ Materializer: Clean orchestration, no scalar math, delegates to kernels
- ✅ Documentation: Header contracts in all files

### Remaining Work (Phases 5-7):
Phase 5: Coord-space discipline at field/kernel level
Phase 6: RenderIR + renderer prep (local-space transforms)
Phase 7: Sanity tests for kernel layers

## Scope

**Deliverables:**
1. Phase 5: Document coord-space semantics in all field kernels, audit for hidden assumptions
2. Phase 6: Implement local-space renderer migration (apply instance transforms, no width/height scaling)
3. Phase 7: Add kernel sanity tests (opcode, signal, field layers)

## Work Items

### P0: Phase 5 - Coord-space discipline audit

**Status:** Partially complete (documentation in FieldKernels.ts)

**Acceptance Criteria:**
- [ ] All field kernels document their coord-space expectations
- [ ] No field kernel multiplies by viewport width/height
- [ ] Angles documented as RADIANS everywhere
- [ ] polygonVertex confirmed LOCAL-SPACE output
- [ ] circleLayout confirmed WORLD-SPACE output

**Technical Notes:**
- Most kernels already have coord-space annotations in FieldKernels.ts
- Need to verify no hidden assumptions exist

### P1: Phase 6 - Local-space renderer migration

**Status:** In progress (future-types.ts exists, bd tickets exist)

**Acceptance Criteria:**
- [ ] renderPathAtParticle applies ctx.translate/rotate/scale transforms
- [ ] Control points used directly without width/height multiplication  
- [ ] size parameter properly used for instance scaling
- [ ] rotation channel supported (optional)
- [ ] scale2 channel supported (optional anisotropic)

**Technical Notes:**
- Current renderer multiplies control points by width/height
- Target: ctx.translate(x*w, y*h); ctx.scale(size, size); draw local points
- BD tickets: oscilla-animator-v2-46m, oscilla-animator-v2-uv9

### P2: Phase 7 - Sanity tests

**Status:** Partially complete (signal-kernel-contracts.test.ts exists)

**Acceptance Criteria:**
- [ ] Opcode tests: sin/cos/tan on radians, clamp, wrap01, hash determinism
- [ ] Signal kernel tests: phase wrapping, easing monotonicity, noise determinism
- [ ] Field kernel tests: polygonVertex local-space, circleLayout world-space
- [ ] End-to-end smoke tests: regular polygon, circle layout, jittered ring

**Technical Notes:**
- Existing test: phase7-kernel-sanity.test.ts (needs verification)
- Use small typed arrays for field kernel tests
- Test numeric outputs, not just no-throw

## Dependencies

- future-types.ts already defines target DrawPathInstancesOp
- RenderAssembler already exists in src/runtime/
- BD tickets already created for much of Phase 6

## Risks

- Renderer changes may affect visual output (need visual regression test)
- Coordinate space change requires careful migration path
- Mitigation: Current renderer already has extensive comments documenting target state
