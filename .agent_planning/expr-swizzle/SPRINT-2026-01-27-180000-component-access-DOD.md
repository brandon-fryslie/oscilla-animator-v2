# Definition of Done: component-access

**Generated:** 2026-01-27T18:00:00
**Status:** READY FOR IMPLEMENTATION
**Plan:** SPRINT-2026-01-27-180000-component-access-PLAN.md

## Acceptance Criteria

### Component Extraction Signal Kernels

- [ ] `vec3ExtractX` kernel extracts component 0 from vec3 signal
- [ ] `vec3ExtractY` kernel extracts component 1 from vec3 signal
- [ ] `vec3ExtractZ` kernel extracts component 2 from vec3 signal
- [ ] `colorExtractR` kernel extracts component 0 from color signal
- [ ] `colorExtractG` kernel extracts component 1 from color signal
- [ ] `colorExtractB` kernel extracts component 2 from color signal
- [ ] `colorExtractA` kernel extracts component 3 from color signal
- [ ] All kernels throw on incorrect input arity
- [ ] Unit tests pass for all kernels

### Swizzle Type Utilities

- [ ] `POSITION_COMPONENTS` and `COLOR_COMPONENTS` constants defined
- [ ] `componentIndex(char)` returns correct index (x=0, y=1, z=2, w=3)
- [ ] `isValidSwizzle(pattern, sourceType)` validates correctly
- [ ] `swizzleResultType(pattern, sourceType)` returns correct PayloadType
- [ ] Cross-access works: `.r` on vec3 returns float (maps to component 0)
- [ ] Cross-access error: `.a` on vec3 throws (no 4th component)
- [ ] Unit tests cover all validation cases

### Type Checker Extension

- [ ] `vec3Input.x` type-checks to FLOAT
- [ ] `vec3Input.y` type-checks to FLOAT
- [ ] `vec3Input.z` type-checks to FLOAT
- [ ] `vec3Input.xy` type-checks to VEC2
- [ ] `vec3Input.xz` type-checks to VEC2
- [ ] `vec3Input.xyz` type-checks to VEC3
- [ ] `vec3Input.zyx` type-checks to VEC3
- [ ] `colorInput.r` type-checks to FLOAT
- [ ] `colorInput.rgb` type-checks to VEC3
- [ ] `colorInput.rgba` type-checks to COLOR
- [ ] `colorInput.bgra` type-checks to COLOR
- [ ] `vec3Input.w` throws error "vec3 has no component 'w'"
- [ ] `vec3Input.a` throws error (no 4th component)
- [ ] `floatInput.x` throws error "float is not a vector type"
- [ ] Block reference tests still pass (no regression)
- [ ] Member access on literal works (for constants)

### Compiler Extension

- [ ] `vec.x` compiles to `sigMap` with `vec3ExtractX` kernel
- [ ] `vec.xy` compiles to `sigZip` constructing VEC2
- [ ] `color.r` compiles to `sigMap` with `colorExtractR` kernel
- [ ] `color.rgb` compiles to `sigZip` constructing VEC3
- [ ] Block reference compilation still works (no regression)
- [ ] Integration test: expression with swizzle evaluates correctly

### Field-Level Kernels

- [ ] `fieldExtractX`, `fieldExtractY`, `fieldExtractZ` implemented
- [ ] `fieldExtractR`, `fieldExtractG`, `fieldExtractB`, `fieldExtractA` implemented
- [ ] At least `fieldSwizzle_xy` implemented for vec3 -> vec2
- [ ] At least `fieldSwizzle_rgb` implemented for color -> vec3
- [ ] Unit tests verify per-element extraction correctness

### Testing

- [ ] At least 5 parser tests for swizzle patterns
- [ ] At least 10 type checker tests (valid and invalid patterns)
- [ ] At least 5 compilation tests
- [ ] At least 3 integration tests (end-to-end value verification)
- [ ] All existing tests pass (no regressions)
- [ ] `npm run test` passes

### Documentation

- [ ] `src/expr/swizzle.ts` has JSDoc comments explaining swizzle semantics
- [ ] `FUNCTIONS.md` updated to document component access (future addition note)
- [ ] Inline comments explain type checker and compiler changes

## Exit Criteria

All checkboxes above must be completed. Integration tests must demonstrate:

1. Expression `myVec3.x` evaluates to the first component of myVec3
2. Expression `myColor.rgb` evaluates to a vec3 containing RGB components
3. Expression `myVec3.x + myVec3.y` evaluates correctly
4. Expression `myColor.r * 2` evaluates correctly

## Verification Command

```bash
npm run test -- --include "**/expr/**" --reporter=verbose
```

Expected: All tests pass, no type errors, no runtime exceptions.
