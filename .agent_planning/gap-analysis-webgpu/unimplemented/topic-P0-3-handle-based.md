# P0-3: Handle-Based Runtime Contract - UNIMPLEMENTED Items

## Item 1: Draw-Prep Bucketing Tests
**Spec says**: Verification gate 3: "Draw-prep bucketing tests (indexed vs non-indexed record emission)."
**Implementation**: `src/runtime/DrawPrepSinkTable.ts` defines the wire format for draw-prep sink tables with indexed/non-indexed regions. `src/runtime/DrawPrepSinkTablePacker.ts` implements packing. `src/compiler/ir/program.ts:414-435` defines `DrawPrepProgramIR` with indexed/non-indexed metadata. However, no dedicated test file for draw-prep bucketing exists (no `DrawPrepSinkTable.test.ts` or similar).
**Gap**: The draw-prep infrastructure is implemented but lacks a dedicated test suite verifying that indexed vs non-indexed record emission produces correct bucketed output. Tests exist implicitly through integration tests but the spec's verification gate for explicit bucketing tests is not satisfied.
**Classification**: UNIMPLEMENTED

## Item 2: Handle Round-Trip Bit-Cast Tests
**Spec says**: Verification gate 2: "Handle round-trip tests (write as float payload, decode as u32 identity)."
**Implementation**: `src/runtime/DrawPrepSinkTablePacker.ts:29-32` has `float32ToUint32Bits()` bit-cast helper. `src/runtime/__tests__/ShapeBankAllocator.test.ts` tests allocation. `src/runtime/__tests__/shape-handle-control-point-slot.test.ts` tests handle metadata. But no explicit round-trip test writes a handle as f32 into arena and reads it back as u32.
**Gap**: Bit-cast infrastructure exists but no explicit round-trip test validates the arena-handle encoding contract end-to-end.
**Classification**: UNIMPLEMENTED
