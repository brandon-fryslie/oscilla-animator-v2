# P5-3: Phased Rollout / Post-Cutover Fix-Forward - UNIMPLEMENTED Items

## Item 1: Phase C Acceptance Tests (Partial)
**Spec says**: Phase C acceptance requires:
- `src/runtime/__tests__/continuity-integration.test.ts`
- `src/runtime/__tests__/phase-continuity-offset.test.ts`
- `src/runtime/__tests__/StepDebugSession.test.ts`
- `src/ui/debug-viz/ValueRenderer.test.ts`
- `src/__tests__/forbidden-patterns.test.ts`
**Implementation**: Of these five, only two exist:
- `src/runtime/__tests__/phase-continuity-offset.test.ts` -- EXISTS
- `src/ui/debug-viz/ValueRenderer.test.ts` -- EXISTS
Missing: `continuity-integration.test.ts`, `StepDebugSession.test.ts`, `forbidden-patterns.test.ts`
**Gap**: 3 of 5 Phase C acceptance tests do not exist.
**Classification**: UNIMPLEMENTED

## Item 2: Phase D Performance Tests
**Spec says**: Bench/perf scripts should show stable frame-time variance at high instance counts.
**Implementation**: `npm run bench` exists per CLAUDE.md. Specific GPU-path performance validation under high instance counts is not verified.
**Gap**: Need to verify bench scripts cover the WebGPU path specifically.
**Classification**: UNIMPLEMENTED

## Item 3: Phase E Integration Demo
**Spec says**: Add/update a v3 demo patch exercising compile -> compute -> draw-prep -> indirect render. Ensure docs describe only current canonical behavior.
**Implementation**: Demo patches exist (`src/demo/hcl/`) but whether any exercises the full v3 steel thread (compile -> compute -> draw-prep -> indirect render) needs verification.
**Gap**: May not have a dedicated v3 steel thread demo patch.
**Classification**: UNIMPLEMENTED
