# Sprint: kernel-layer-completion - Kernel Refactor Phases 5-7

Generated: 2026-01-22T12:00:00Z
Completed: 2026-01-22T12:30:00Z
Confidence: HIGH
Status: ✅ COMPLETE

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

**Status:** ✅ COMPLETE

**Acceptance Criteria:**
- [x] All field kernels document their coord-space expectations
- [x] No field kernel multiplies by viewport width/height
- [x] Angles documented as RADIANS everywhere
- [x] polygonVertex confirmed LOCAL-SPACE output
- [x] circleLayout confirmed WORLD-SPACE output
- [x] Comprehensive field-kernel-contracts.test.ts added (32 tests)

**Technical Notes:**
- FieldKernels.ts has complete coord-space annotations
- All kernel functions verified through unit tests
- Tests verify coord-space contracts explicitly

### P1: Phase 6 - Local-space renderer migration

**Status:** ✅ COMPLETE

**Acceptance Criteria:**
- [x] renderPathAtParticle applies ctx.scale(sizePx, sizePx) transform
- [x] Control points used directly without width/height multiplication  
- [x] size parameter properly used for instance scaling (D * size where D = min(w,h))
- [x] rotation channel documented (future-ready via ctx.rotate)
- [x] scale2 channel documented (future-ready via ctx.scale anisotropic)

**Technical Notes:**
- Commit: bfa13c1 "feat(renderer): implement local-space path rendering (Phase 6)"
- Renderer now uses canvas transforms for instance placement
- Size converted to pixels via D = min(width, height) for isotropy
- Control points drawn in LOCAL-SPACE (no width/height multipliers)

### P2: Phase 7 - Sanity tests

**Status:** ✅ COMPLETE

**Acceptance Criteria:**
- [x] Opcode tests: sin/cos/tan on radians, clamp, wrap01, hash determinism
- [x] Signal kernel tests: phase wrapping, easing monotonicity, noise determinism  
- [x] Field kernel tests: polygonVertex local-space, circleLayout world-space
- [x] End-to-end smoke tests: regular polygon, circle layout, jittered ring

**Test Files:**
- `src/runtime/__tests__/OpcodeInterpreter.test.ts` - 37 tests
- `src/runtime/__tests__/signal-kernel-contracts.test.ts` - full coverage
- `src/runtime/__tests__/field-kernel-contracts.test.ts` - 32 tests (with layout kernels)
- `src/runtime/__tests__/phase7-kernel-sanity.test.ts` - end-to-end
- `src/runtime/__tests__/integration.test.ts` - full pipeline

## Additional Work: 15-layout.md Migration

### P3: Layout Kernel Implementation

**Status:** ✅ COMPLETE

**Work Done:**
- [x] Implemented `lineLayout` kernel in FieldKernels.ts
- [x] Implemented `gridLayout` kernel in FieldKernels.ts
- [x] Added tests for new layout kernels (8 tests)
- [x] Created `CircleLayout` block using circleLayout kernel
- [x] Created `LineLayout` block using lineLayout kernel
- [x] Migrated `GridLayout` block to use gridLayout kernel

**Technical Notes:**
- New layout kernels produce WORLD-SPACE vec2 positions in [0,1]
- Layout blocks use fieldZipSig with intrinsic fields (normalizedIndex/index)
- Old LayoutSpec approach still available in LinearLayout for compatibility

## Dependencies

- future-types.ts already defines target DrawPathInstancesOp
- RenderAssembler already exists in src/runtime/
- BD tickets already created for much of Phase 6

## Summary

All kernel refactor phases (5, 6, 7) and layout kernel migration are now complete.
The kernel layer is stable, well-tested, and follows proper coord-space discipline.
The system is now at the "safe to add features and blocks" milestone.

## Commits Made

1. `03f962a` - feat(runtime): Add comprehensive field kernel contract tests
2. `bfa13c1` - feat(renderer): implement local-space path rendering (Phase 6)
3. `1454ea8` - docs: mark kernel refactor phases 5-7 complete
4. `a7ac7c2` - feat(kernels): implement lineLayout and gridLayout field kernels
5. `5d6cb61` - feat(blocks): add CircleLayout and LineLayout blocks using field kernels
6. `b19055b` - refactor(blocks): migrate GridLayout to use gridLayout kernel
