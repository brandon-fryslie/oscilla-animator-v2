# Sprint: component-access - Vec3/Color Component Access and GLSL Swizzling

**Generated:** 2026-01-27T18:00:00
**Confidence:** HIGH: 6, MEDIUM: 2, LOW: 0
**Status:** READY FOR IMPLEMENTATION
**Source:** EVALUATION-2026-01-27-180000.md

## Sprint Goal

Add GLSL-style component access (`.x`, `.y`, `.z`, `.r`, `.g`, `.b`, `.a`) and swizzle patterns (`.xy`, `.rgb`, `.zyx`) to the Expression DSL, enabling extraction of individual components or arbitrary rearrangements from vec3 and color values.

## Scope

**Deliverables:**
1. Single component access for vec3 (`.x`, `.y`, `.z` -> float)
2. Single component access for color (`.r`, `.g`, `.b`, `.a` -> float)
3. Multi-component swizzle for vec3 (`.xy`, `.xz`, `.zyx` etc -> vec2/vec3)
4. Multi-component swizzle for color (`.rgb`, `.rg`, `.bgra` etc -> vec2/vec3/color)
5. Component extraction signal kernels (`extractX`, `extractY`, `extractZ`, `extractW`)
6. Swizzle field kernels (for field-level swizzling)
7. Comprehensive test coverage

**Out of Scope:**
- VEC2 support (simpler, can add later)
- Write-mask swizzle (not applicable - expressions are pure)
- Nested swizzles (`vec.xy.x`) - future enhancement

## Work Items

---

### P0 - Add Component Extraction Signal Kernels

**Dependencies**: None
**Confidence**: HIGH
**Spec Reference**: N/A (new capability)
**Status Reference**: EVALUATION section on IR/runtime gaps

#### Description

Add signal kernels for extracting individual components from vec3 and color signal values. These are used by the compiled Expression DSL to access components like `.x` or `.r`.

Signal kernels operate on multi-component values and extract a single float:
- `vec3ExtractX`: Extract component 0 from vec3
- `vec3ExtractY`: Extract component 1 from vec3
- `vec3ExtractZ`: Extract component 2 from vec3
- `colorExtractR`: Extract component 0 from color
- `colorExtractG`: Extract component 1 from color
- `colorExtractB`: Extract component 2 from color
- `colorExtractA`: Extract component 3 from color

#### Acceptance Criteria

- [ ] `vec3ExtractX`, `vec3ExtractY`, `vec3ExtractZ` kernels implemented in `SignalEvaluator.ts`
- [ ] `colorExtractR`, `colorExtractG`, `colorExtractB`, `colorExtractA` kernels implemented
- [ ] Unit tests verify correct extraction for each component
- [ ] Error handling for wrong input arity

#### Technical Notes

Implementation location: `src/runtime/SignalEvaluator.ts` in `applySignalKernel()`.

Note: Signal-level vec3/color values are represented as slot references with stride > 1. The evaluator needs to read multi-slot values. This may require changes to how signal evaluation handles multi-component types.

Alternative: Use `SigExprZip` with component extraction opcode if signal-level multi-component is complex.

---

### P0 - Add Swizzle Type Utilities

**Dependencies**: None
**Confidence**: HIGH
**Spec Reference**: N/A (new capability)
**Status Reference**: EVALUATION section on type system

#### Description

Add utility functions for validating swizzle patterns and computing result types:

1. Component set definitions:
   - Position: `x`, `y`, `z` (vec3)
   - Color: `r`, `g`, `b`, `a` (color)
   - Cross-alias: `x`=`r`, `y`=`g`, `z`=`b`, `w`=`a`

2. Validation functions:
   - `isValidSwizzle(components: string, sourceType: PayloadType): boolean`
   - `swizzleResultType(components: string, sourceType: PayloadType): PayloadType`

3. Component index mapping:
   - `x`/`r` -> 0
   - `y`/`g` -> 1
   - `z`/`b` -> 2
   - `w`/`a` -> 3

#### Acceptance Criteria

- [ ] `POSITION_COMPONENTS = ['x', 'y', 'z']` constant defined
- [ ] `COLOR_COMPONENTS = ['r', 'g', 'b', 'a']` constant defined
- [ ] `isValidSwizzle()` correctly validates patterns for vec3 and color
- [ ] `swizzleResultType()` returns correct result type based on swizzle length
- [ ] Cross-access validated (`.r` on vec3 is OK, `.a` on vec3 is error)
- [ ] Unit tests for all validation edge cases

#### Technical Notes

Create new file: `src/expr/swizzle.ts`

Result type logic:
- 1 component -> FLOAT
- 2 components -> VEC2
- 3 components -> VEC3
- 4 components -> COLOR

---

### P0 - Extend Type Checker for Component Access

**Dependencies**: Swizzle Type Utilities
**Confidence**: HIGH
**Spec Reference**: N/A (new capability)
**Status Reference**: EVALUATION section on type checker

#### Description

Modify `typecheckMemberAccess()` in `src/expr/typecheck.ts` to handle component access on vector types.

Current behavior: Assumes all member access is block output reference.

New behavior:
1. First, type-check the object expression
2. If object type is vec3 or color:
   - Validate member as swizzle pattern using `isValidSwizzle()`
   - Compute result type using `swizzleResultType()`
   - Annotate node with `semantics: 'swizzle'` or similar marker
3. Else: Fall through to existing block reference logic

#### Acceptance Criteria

- [ ] `vec.x` on vec3 input types as FLOAT
- [ ] `vec.xy` on vec3 input types as VEC2
- [ ] `vec.xyz` on vec3 input types as VEC3
- [ ] `color.r` on color input types as FLOAT
- [ ] `color.rgb` on color input types as VEC3
- [ ] `color.rgba` on color input types as COLOR
- [ ] `vec.w` on vec3 throws "vec3 has no component 'w'"
- [ ] `color.z` on color works (alias for `.b`)
- [ ] Existing block reference tests still pass
- [ ] Member access on float/int/bool throws appropriate error

#### Technical Notes

Key changes to `typecheckMemberAccess`:
1. Call `typecheck(node.object, ctx)` to get object type
2. Check if object.type is vec3 or color
3. If so, validate and compute type using swizzle utilities
4. If not vec3/color, fall through to block reference check

Edge case: If object is identifier that could be input OR block name:
- Type env lookup takes priority (if in ctx.inputs, it's an input variable)
- Block reference only checked if not in ctx.inputs

---

### P0 - Extend Compiler for Component Access

**Dependencies**: Type Checker, Component Extraction Kernels
**Confidence**: HIGH
**Spec Reference**: N/A
**Status Reference**: EVALUATION section on compile.ts

#### Description

Modify `compileMemberAccess()` in `src/expr/compile.ts` to handle component access/swizzle:

1. Detect if member access is swizzle (object type is vec3/color)
2. For single component: Use extraction kernel
3. For multi-component swizzle: Construct new vector from extracted components

#### Acceptance Criteria

- [ ] `vec.x` compiles to `sigMap(vecSig, kernel('vec3ExtractX'), FLOAT)`
- [ ] `color.r` compiles to `sigMap(colorSig, kernel('colorExtractR'), FLOAT)`
- [ ] `vec.xy` compiles to `sigZip([extractX, extractY], makeVec2Kernel, VEC2)`
- [ ] `color.rgb` compiles correctly to VEC3
- [ ] Compilation integration test passes end-to-end
- [ ] Block reference compilation still works

#### Technical Notes

For multi-component swizzle (e.g., `.xy`), the compilation produces:
```typescript
const xSig = builder.sigMap(vecSig, kernel('vec3ExtractX'), FLOAT);
const ySig = builder.sigMap(vecSig, kernel('vec3ExtractY'), FLOAT);
const result = builder.sigZip([xSig, ySig], kernel('makeVec2'), VEC2);
```

Alternative: Use a single `swizzle` kernel with component mask if signal types support multi-component returns.

---

### P1 - Add Field-Level Component Extraction Kernels

**Dependencies**: Signal Extraction Kernels
**Confidence**: HIGH
**Spec Reference**: N/A
**Status Reference**: EVALUATION section on FieldKernels.ts

#### Description

Add field kernels for extracting components from vec3/color field arrays. These are the field-level equivalents of the signal kernels.

Field kernels operate on Float32Array buffers and extract per-element components:
- `fieldExtractX`, `fieldExtractY`, `fieldExtractZ` (from vec3 stride-3)
- `fieldExtractR`, `fieldExtractG`, `fieldExtractB`, `fieldExtractA` (from color stride-4)

#### Acceptance Criteria

- [ ] `fieldExtractX/Y/Z` implemented in `FieldKernels.ts`
- [ ] `fieldExtractR/G/B/A` implemented in `FieldKernels.ts`
- [ ] Unit tests verify correct per-element extraction
- [ ] Output buffer is correctly sized (stride 1)

#### Technical Notes

Implementation location: `src/runtime/FieldKernels.ts` in `applyFieldKernel()`.

For `fieldExtractX` on vec3 input:
```typescript
const outArr = out as Float32Array;
const inArr = inputs[0] as Float32Array;
for (let i = 0; i < N; i++) {
  outArr[i] = inArr[i * 3 + 0]; // X is component 0
}
```

---

### P1 - Add Field-Level Swizzle Kernels

**Dependencies**: Field-Level Component Extraction
**Confidence**: MEDIUM
**Spec Reference**: N/A
**Status Reference**: EVALUATION section on FieldKernels.ts

#### Description

Add field kernels for multi-component swizzle operations. These rearrange components from input vectors into new output vectors.

General swizzle approach:
- `fieldSwizzleVec3ToVec2(components: string)` - e.g., "xy", "xz", "zy"
- `fieldSwizzleVec3ToVec3(components: string)` - e.g., "zyx", "xxy"
- Similar for color

#### Acceptance Criteria

- [ ] `fieldSwizzle_xy`, `fieldSwizzle_xz`, `fieldSwizzle_yz` implemented (vec3 -> vec2)
- [ ] At least one vec3 -> vec3 swizzle implemented (`zyx` for testing)
- [ ] `fieldSwizzle_rgb` implemented (color -> vec3)
- [ ] Unit tests verify correct component reordering
- [ ] Kernel naming convention documented

#### Technical Notes

Kernel naming: `fieldSwizzle_<components>` (e.g., `fieldSwizzle_xy`, `fieldSwizzle_zyx`).

Could use a single generic kernel with component mask string, but explicit kernels are clearer and avoid runtime string parsing.

---

### P2 - Add Swizzle Syntax Highlighting Support

**Dependencies**: Type Checker
**Confidence**: MEDIUM
**Spec Reference**: N/A
**Status Reference**: N/A (new capability)

#### Description

Update the `SuggestionProvider` in `src/expr/suggestions.ts` to provide autocomplete for component access.

When cursor is after `.` on a vec3/color expression, suggest valid components:
- For vec3: `x`, `y`, `z`, and common patterns (`xy`, `xyz`)
- For color: `r`, `g`, `b`, `a`, and common patterns (`rgb`, `rgba`)

#### Acceptance Criteria

- [ ] After `.` on vec3, suggestions include `x`, `y`, `z`
- [ ] After `.` on color, suggestions include `r`, `g`, `b`, `a`
- [ ] Common multi-component patterns suggested (lower priority)
- [ ] Existing block.port suggestions still work

#### Technical Notes

This requires knowing the type of the expression before the `.`. The suggestion provider may need access to partial type inference results.

Lower priority - can be done in follow-up sprint if time-constrained.

---

### P0 - Comprehensive Test Coverage

**Dependencies**: All implementation tasks
**Confidence**: HIGH
**Spec Reference**: N/A
**Status Reference**: EVALUATION section on testing

#### Description

Add comprehensive tests for all component access and swizzle functionality.

Test categories:
1. Parser tests - verify AST structure for component access
2. Type checker tests - verify type inference for all patterns
3. Compilation tests - verify IR generation
4. Integration tests - end-to-end from expression to value

#### Acceptance Criteria

- [ ] Parser tests for `vec.x`, `vec.xy`, `color.rgb`, etc.
- [ ] Type checker tests for valid patterns (all component combinations)
- [ ] Type checker tests for invalid patterns (`.w` on vec3, `.x` on float)
- [ ] Compilation tests verify correct kernel usage
- [ ] Integration tests verify correct runtime values
- [ ] At least 20 new test cases total
- [ ] No regressions in existing tests

#### Technical Notes

Test file locations:
- `src/expr/__tests__/parser.test.ts` - parsing
- `src/expr/__tests__/typecheck.test.ts` - type checking
- `src/expr/__tests__/integration.test.ts` - end-to-end

---

## Dependencies

```
[Swizzle Type Utilities] <── [Type Checker Extension]
                               │
[Component Extraction Kernels] ├── [Compiler Extension]
                               │
                               └── [Comprehensive Tests]

[Field Extraction Kernels] <── [Field Swizzle Kernels]
                               │
                               └── [Comprehensive Tests]

[All of above] <── [Syntax Highlighting] (P2)
```

## Risks

| Risk | Mitigation |
|------|------------|
| Multi-component signal values not well supported | May need to enhance SignalEvaluator to handle stride > 1 |
| Cross-access semantics unclear | Document clearly: `.r` = `.x`, `.g` = `.y`, `.b` = `.z`, `.a` = `.w` |
| Field kernels add complexity | Start with signal-level only, add field kernels incrementally |
| Backward compatibility | Parser/AST unchanged, only type checker/compiler logic added |
