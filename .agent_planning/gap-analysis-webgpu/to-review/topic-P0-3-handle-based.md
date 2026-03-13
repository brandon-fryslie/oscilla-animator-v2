# P0-3: Handle-Based Runtime Contract - TO-REVIEW Items

## Item 1: Handle Round-Trip Tests (Float Payload Bit-Cast)
**Spec says**: Verification gate 2: "Handle round-trip tests (write as float payload, decode as u32 identity)."
**Implementation**: `src/runtime/__tests__/ShapeBankAllocator.test.ts` tests ShapeBank allocation. `src/runtime/DrawPrepSinkTablePacker.ts:29-32` implements `float32ToUint32Bits()` for bit-cast. `src/runtime/__tests__/shape-handle-control-point-slot.test.ts` tests handle metadata.
**Gap**: Need to verify that an explicit round-trip test exists for writing a handle as f32 into arena and reading it back as u32 identity. The bit-cast helper exists but the specific test case "write as float payload, decode as u32 identity" should be confirmed.
**Classification**: TO-REVIEW

## Item 2: Forbidden-Pattern Test for Object Payloads in Hot Paths
**Spec says**: Verification gate 4: "Forbidden-pattern tests blocking object payloads in execution hot paths."
**Implementation**: `src/__tests__/architecture-guardrails.test.ts` provides architectural guardrails. `src/compiler/__tests__/no-legacy-types.test.ts` blocks legacy type patterns.
**Gap**: Need to verify these tests specifically catch object-returning geometry blocks in hot paths. The architecture guardrails test exists but may not cover the exact "object payload in hot path" forbidden pattern described in the spec.
**Classification**: TO-REVIEW
