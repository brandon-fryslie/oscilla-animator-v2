# Field Kernel Phase 2 - Definition of Done

**Created:** 2026-01-21

## Overall Phase 2 DOD

### Core Requirements
- [ ] All field kernels have complete signatures in kernel-signatures.ts
- [ ] Existing tests (544+) continue to pass
- [ ] `pnpm build` succeeds
- [ ] No runtime regressions

### Optional Enhancements (if implemented)
- [ ] Parameter renamed from `kernelName` to `fieldOp`
- [ ] Registry comment block added to applyKernel
- [ ] Field kernels extracted to separate module

## Sprint 1: Complete Kernel Signatures

### Acceptance Criteria
1. Add signatures for ALL field kernels in Materializer.ts:
   - [ ] makeVec2
   - [ ] hsvToRgb (both zip and zipSig variants)
   - [ ] jitter2d
   - [ ] fieldJitter2D
   - [ ] attract2d
   - [ ] fieldAngularOffset (already exists, verify complete)
   - [ ] fieldRadiusSqrt
   - [ ] fieldAdd
   - [ ] fieldPolarToCartesian (already exists, verify complete)
   - [ ] fieldPulse (already exists, verify complete)
   - [ ] fieldHueFromPhase (already exists, verify complete)
   - [ ] applyOpacity
   - [ ] circleLayout (already exists, verify complete)
   - [ ] circleAngle (already exists, verify complete)
   - [ ] polygonVertex
   - [ ] starVertex
   - [ ] fieldGoldenAngle (already exists, verify complete)

2. Each signature includes:
   - [ ] Input parameter units and descriptions
   - [ ] Output unit and description
   - [ ] Coord-space annotation where applicable

3. Verification:
   - [ ] All tests pass
   - [ ] Build succeeds
   - [ ] TypeScript types compile

## Sprint 2: Naming Refinement (Optional)

### Acceptance Criteria
1. [ ] Rename `kernelName` parameter to `fieldOp` in:
   - applyKernel function signature
   - applyKernelZipSig function signature
   - All internal references (21 occurrences)

2. [ ] Update error messages to use new parameter name

3. Verification:
   - [ ] All tests pass
   - [ ] Build succeeds

## Sprint 3: Registry Comments (Optional)

### Acceptance Criteria
1. [ ] Add explicit registry comment block at line ~650 (before applyKernel):
   ```typescript
   /**
    * ════════════════════════════════════════════════════════════════════════
    * FIELD KERNEL REGISTRY
    * ════════════════════════════════════════════════════════════════════════
    *
    * Field kernels operate on typed array buffers (vec2/color/float).
    * They are COORD-SPACE AGNOSTIC - blocks define world/local semantics.
    *
    * REGISTERED KERNELS:
    * - makeVec2, hsvToRgb, jitter2d, attract2d, fieldAngularOffset
    * - fieldRadiusSqrt, fieldAdd, fieldPolarToCartesian, fieldPulse
    * - fieldHueFromPhase, fieldJitter2D, fieldGoldenAngle
    *
    * ZIPZIG KERNELS:
    * - applyOpacity, hsvToRgb, circleLayout, circleAngle
    * - polygonVertex, starVertex
    */
   ```

2. Verification:
   - [ ] Build succeeds

## Sprint 4: Extract Field Kernels (Future/Optional)

### Acceptance Criteria
1. [ ] Create `src/runtime/FieldKernels.ts`
2. [ ] Move applyKernel implementation to new file
3. [ ] Move applyKernelZipSig implementation to new file
4. [ ] Export both functions
5. [ ] Import and use in Materializer.ts
6. [ ] Update any internal imports

7. Verification:
   - [ ] All tests pass
   - [ ] Build succeeds
   - [ ] No circular dependencies
