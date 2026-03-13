# Context: P0-3 - Handle-Based Runtime Contract - UNIMPLEMENTED Items

## Target State
1. **Draw-prep bucketing tests**: Explicit tests that verify indexed and non-indexed record emission produces correctly bucketed indirect command output.
2. **Handle round-trip tests**: Tests that write a u32 handle into arena as f32, read it back, and verify the identity survives the round-trip.

## Current State

### Draw-Prep Bucketing
- `src/runtime/DrawPrepSinkTable.ts` - Wire format defined (header, record, descriptor schemas)
- `src/runtime/DrawPrepSinkTablePacker.ts` - Packing logic implemented
- `src/compiler/ir/program.ts:414-435` - `DrawPrepProgramIR` with indexed/non-indexed metadata
- `src/compiler/ir/program.ts:363-412` - `DrawPrepSinkIR` with `drawMode`, `indirectRegion`, `indirectStrideBytes`
- No test file found matching `DrawPrepSinkTable*.test.ts` or `draw-prep*.test.ts`

### Handle Round-Trip
- `src/runtime/DrawPrepSinkTablePacker.ts:29-32` - `float32ToUint32Bits()` bit-cast helper
- `src/runtime/__tests__/ShapeBankAllocator.test.ts` - Tests allocation but not bit-cast round-trip
- `src/runtime/__tests__/shape-handle-control-point-slot.test.ts` - Tests metadata, not f32<->u32 encoding

## Files Involved
- `src/runtime/__tests__/` - Needs new test files:
  - `DrawPrepSinkTable.test.ts` (bucketing tests)
  - Update `ShapeBankAllocator.test.ts` or new file for round-trip tests

## Suggested Approach
1. **Bucketing tests**: Create a test that constructs a `DrawPrepProgramIR` with mixed indexed and non-indexed sinks, runs the packer, and verifies:
   - Indexed records appear in the indexed region
   - Non-indexed records appear in the non-indexed region
   - Stride words match (5 for indexed, 4 for non-indexed)
   - Record counts match
2. **Round-trip tests**: Create a test that:
   - Writes a known u32 handle value to a Float32Array using DataView/bit-cast
   - Reads it back and verifies the u32 identity is preserved
   - Tests edge cases (0, MAX_UINT32, typical topology indices)

## Risks
- Low risk: these are test gaps, not functionality gaps
- The underlying code is implemented and works (used in production rendering)
