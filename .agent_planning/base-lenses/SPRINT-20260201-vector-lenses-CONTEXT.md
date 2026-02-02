# Implementation Context: Vector Component Lenses
Generated: 2026-02-01

## Research Needed Before Implementation

1. **Component extraction in IR**: Check `src/compiler/ir/IRBuilder.ts` for any existing component extraction operations. Check how vec3 signals are already handled in lowering (e.g., in math blocks that operate on vec3).

2. **Stride and buffer layout**: Vec3 has stride=3, meaning 3 floats per value. Extracting component `i` means reading at offset `i` within each stride group. Check `src/runtime/ScheduleExecutor.ts` and `src/runtime/FieldKernels.ts` for how strided values are accessed.

3. **Swizzle as alternative**: The design doc mentions swizzle. This could be a more general alternative to Extract — `swizzle(input, 'xy')` extracts two components and produces a vec2. Extract could be a degenerate case of swizzle with a single component.

4. **Existing vec3 block lowering**: Check blocks like `src/blocks/math/` for patterns that deal with multi-component payloads. The `expression.ts` block handles vec3 operations and may show the pattern.

## Key Question
Does the current IR have a way to select a single component from a multi-stride value, or does a new IR operation need to be added? This determines the implementation approach.
