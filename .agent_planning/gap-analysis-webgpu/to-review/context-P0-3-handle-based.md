# Context: P0-3 - Handle-Based Runtime Contract

## Target State
- All geometry/shape data referenced by u32 numeric handles, not JS objects
- Arena stores numeric payloads only (f32)
- ShapeBank stores ShapeHeaderV1 records (16 words / 64 bytes) + payload heap
- Blocks pass handles by value, no object references in hot loops
- Producers write numeric channels + allocate ShapeBank headers
- Transformers mutate numeric channels, forward handles
- Draw-prep reads handles, resolves headers, emits indirect commands
- Multi-shape batching with indexed/non-indexed separation
- Handle round-trip bit-cast tests
- Forbidden-pattern tests for object payloads

## Current State
Core handle system is implemented (DONE):
- **ShapeBank with Uint32Array**: `src/runtime/RuntimeState.ts:108-127` -- `ShapeBankState` with packed u32 bank
- **ShapeHeaderV1 (16 words)**: `src/runtime/RuntimeState.ts:23-42` -- `SHAPE_BANK_HEADER_WORDS = 16`, enum covers all header fields
- **Header read/write**: `src/runtime/RuntimeState.ts:188-236` -- `readShapeBankHeader()`, `writeShapeBankHeader()`
- **Handle metadata sidecar**: `src/runtime/RuntimeState.ts:90-93,241-261` -- topologyId and controlPointSlot per handle
- **Frame-volatile allocator**: `src/runtime/RuntimeState.ts:161-183` -- `resetShapeBankFrameAllocator()`, `allocShapeBankWords()`
- **Arena is f32-only**: `src/compiler/ir/program.ts:467` -- `SlotMetaEntry.storage: 'f32' | 'i32' | 'u32'`
- **DrawPrepProgramIR**: `src/compiler/ir/program.ts:414-435` -- indexed/nonIndexed regions, stride words, record counts
- **DrawPrepSinkTablePacker**: `src/runtime/DrawPrepSinkTablePacker.ts` -- packs sink records for GPU consumption
- **WebGPU ShapeBank Manager**: `src/render/webgpu/WebGPUShapeBankManager.ts` -- GPU-side shape bank sync
- **ShapeBank allocator tests**: `src/runtime/__tests__/ShapeBankAllocator.test.ts`
- **Shape handle tests**: `src/runtime/__tests__/shape-handle-control-point-slot.test.ts`

Items for review:
- Handle round-trip bit-cast test (f32 -> u32 identity)
- Forbidden-pattern test coverage for object payloads

## Files Involved
- `src/runtime/__tests__/ShapeBankAllocator.test.ts` - Review for round-trip test
- `src/__tests__/architecture-guardrails.test.ts` - Review for object-payload forbidden patterns
- `src/compiler/__tests__/no-legacy-types.test.ts` - Review for legacy type coverage

## Suggested Approach
1. Check if ShapeBankAllocator test includes explicit float-to-uint32 round-trip
2. Check architecture guardrails for "object payload in hot path" pattern
3. Add missing test cases if needed

## Risks
- Low risk: tests may exist under different descriptions than spec names
