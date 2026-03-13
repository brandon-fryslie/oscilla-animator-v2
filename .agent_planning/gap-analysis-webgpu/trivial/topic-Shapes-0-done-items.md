# Shapes 0: Shape Taxonomy Overview - DONE Items

## Item 1: ShapeHeaderV1 Metadata Structure
**Spec says**: All shape classes must be representable through "canonical ShapeHeaderV1 metadata."
**Implementation**: `src/runtime/RuntimeState.ts:23-61` defines `SHAPE_BANK_HEADER_WORDS = 16` with full `ShapeBankHeaderWord` enum and `ShapeBankHeaderRecord` interface. Rust mirror at `src/render/wasm/rust/oscilla-rust-renderer/src/memory.rs:5`. Factory function `createShapeBankHeaderV1()` at line 63.
**Gap**: None. Fully implemented and consistent across JS and Rust boundaries.
**Classification**: DONE

## Item 2: Arena-Owned Instance/State Channels
**Spec says**: All shape classes use "Arena-owned instance/state channels."
**Implementation**: Arena value store in `src/runtime/ArenaValueStore.ts`. Per-instance channels for position (posX, posY), color, scale, rotation are materialized through the render materialization pipeline (`src/compiler/backend/render-materialization-pipeline.ts`). Arena addresses are resolved via `ArenaRuntimeLayoutIR` in `src/compiler/ir/program.ts`.
**Gap**: None for currently implemented shape types (Type 1 and Type 2).
**Classification**: DONE

## Item 3: Draw-Prep Sink Metadata and Indirect Command Records
**Spec says**: All shape classes use "draw-prep sink metadata and hardware-native indirect command records."
**Implementation**: `DrawPrepSinkIR` in `src/compiler/ir/program.ts:356-412` with full indexed/nonIndexed support. `DrawPrepSinkTablePacker.ts` packs canonical sink tables. Rust renderer dispatches via `draw_indexed_indirect` and `draw_indirect` at `render.rs:212,219`. `DrawPrepProgramIR` at `program.ts:414-440` manages indexed/nonIndexed regions.
**Gap**: None. Full draw-prep pipeline implemented.
**Classification**: DONE

## Item 4: Indexed Command Stream (20-byte stride)
**Spec says**: Indexed commands use 20-byte stride.
**Implementation**: `INDIRECT_INDEXED_STRIDE_WORDS: usize = 5` at `memory.rs:9` (5 * 4 = 20 bytes). `indirectStrideBytes: 20` at `program.ts:392`. `indirectArgsWords: 5` at `shaders.ts:48`.
**Gap**: None. Exact match.
**Classification**: DONE

## Item 5: Non-Indexed Command Stream (16-byte stride)
**Spec says**: Non-indexed commands use 16-byte stride.
**Implementation**: `INDIRECT_NON_INDEXED_STRIDE_WORDS: usize = 4` at `memory.rs:10` (4 * 4 = 16 bytes). `indirectStrideBytes: 16` at `program.ts:392`.
**Gap**: None. Exact match.
**Classification**: DONE
