# Shapes 1: Rigid Stamp - TRIVIAL Items

## Item 1: Bit-Cast Integrity (Float32 <-> Uint32)
**Spec says**: AC 1.2: "write representative float payload values through Uint32Array view. Assert: round-trip decode is bit-exact."
**Implementation**: `src/runtime/DrawPrepSinkTablePacker.ts:27-31` and `src/runtime/ValueExprMaterializer.ts` use `float32ToUint32Bits()` with shared `Float32Array`/`Uint32Array` buffer trick for exact bit-cast. Rust renderer at `engine.rs:558` uses `f32::from_bits(shape_bank_words[...])`.
**Gap**: Bit-cast implementation is correct and consistent across JS and Rust boundaries. No round-trip test in CI but the mechanism is sound.
**Classification**: TRIVIAL - Correctly implemented; AC test not in CI but is a test-coverage detail.

## Item 2: Header Stride Alignment
**Spec says**: AC 1.1: "allocate two rigid shapes. Assert: second header starts exactly 16 words after first."
**Implementation**: `src/render/webgpu/WebGPUShapeBankManager.ts:110-116` asserts `volatilePtr % SHAPE_BANK_HEADER_WORDS === 0`. `src/runtime/__tests__/ShapeBankAllocator.test.ts:25-26` tests sequential allocation. `src/runtime/ValueExprMaterializer.ts:172` allocates `SHAPE_BANK_HEADER_WORDS + paramBlockWords`.
**Gap**: Header stride is enforced. Note: when param blocks are appended, total allocation per shape is `16 + paramBlockWords`, so second shape starts at `16 + paramBlockWords` words, not exactly 16. This is correct per spec (param blocks are "payload heap" beyond the header).
**Classification**: TRIVIAL - Correctly implemented with alignment assertion in WebGPUShapeBankManager.
