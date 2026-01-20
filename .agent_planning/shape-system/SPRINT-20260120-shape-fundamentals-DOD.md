# Definition of Done: shape-fundamentals

**Sprint:** Shape System Fundamentals
**Confidence:** HIGH

## Acceptance Criteria

### 1. Shape Encoding

- [ ] Shape represented as 3 channels throughout pipeline
- [ ] ShapeType enum: ELLIPSE=0, RECT=1, PATH=2
- [ ] Type system recognizes 'shape' as valid PayloadType
- [ ] No placeholder/fake implementations remain

### 2. Ellipse Block

- [ ] Inputs: rx (float), ry (float) with defaults
- [ ] Output: shape descriptor with type=0, param1=rx, param2=ry
- [ ] Circle convenience: works when rx=ry
- [ ] Compiles without errors
- [ ] Lowering produces correct IR

### 3. Rect Block

- [ ] Inputs: width (float), height (float) with defaults
- [ ] Output: shape descriptor with type=1, param1=width, param2=height
- [ ] Square convenience: works when width=height
- [ ] Compiles without errors
- [ ] Lowering produces correct IR

### 4. Render Pipeline

- [ ] Schedule IR carries shape channels to render pass
- [ ] Executor passes shape data to renderer
- [ ] Uniform shape (single value) works
- [ ] Per-particle shape (Field<shape>) works

### 5. Canvas Rendering

- [ ] Ellipse renders with `ctx.ellipse()` using actual rx, ry
- [ ] Rect renders with `ctx.fillRect()` using actual width, height
- [ ] Visual verification: ellipse with rx≠ry shows correct aspect ratio
- [ ] Visual verification: rect with width≠height shows correct dimensions
- [ ] No hardcoded shape constants (0, 1, 2) in renderer logic

### 6. Tests

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all existing tests)
- [ ] steel-thread.test.ts works with Ellipse
- [ ] New unit tests for Ellipse/Rect block lowering

### 7. Demo

- [ ] main.ts demo patch uses Ellipse (not Circle/Square)
- [ ] Demo renders correctly in browser

## Verification Commands

```bash
# Type check
npm run typecheck

# Run tests
npm test

# Run dev server and visually verify
npm run dev
```

## Not In Scope

- Path support (separate sprint)
- Rotation parameter for shapes
- Stroke vs fill distinction
- Corner radius for Rect
- GPU rendering
