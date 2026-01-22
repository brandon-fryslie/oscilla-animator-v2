# Evaluation: Complete Shape2D Migration - Remove All Legacy Paths
Generated: 2026-01-21T22:27:00Z

## Topic
Complete the shape2d migration by removing ALL legacy/fallback paths. The packed format infrastructure must be the ONLY method. Existing demo patches must compile and render correctly.

## Verdict: CONTINUE

Work is well-defined. No blockers.

---

## 1. Current State

### What Exists
- Packed shape2d bank infrastructure in RuntimeState (SHAPE2D_WORDS, Shape2DWord, readShape2D/writeShape2D)
- Shape combine mode validation (last/first/layer only)
- ResolvedShape type with mode: 'path' | 'primitive' (legacy removed from type)
- RenderAssembler produces ResolvedShape for renderer
- Renderer only accepts ResolvedShape (no legacy handling)

### Legacy Paths Still Present
1. **resolveShape() returns 0 for undefined shape** (line 132)
   - `return 0; // Default shape (circle, legacy encoding)`

2. **resolveShapeFully() handles numeric encoding** (lines 209-229)
   - Maps `0` → ellipse, `1` → rect, `2` → ellipse fallback

3. **resolveShapeFully() handles ArrayBufferView fallback** (lines 231-246)
   - Falls back to ellipse for unsupported per-particle shapes

---

## 2. Required Changes

### P0: Remove legacy numeric encoding support
- Change `resolveShape()` to throw if shapeSpec is undefined
- Update `resolveShapeFully()` to reject numeric input
- Ensure all blocks provide proper ShapeDescriptor

### P1: Remove ArrayBufferView fallback
- Either implement proper per-particle shape support OR
- Make it an explicit error (not silent fallback)

### P2: Update default shape to proper ShapeDescriptor
- Create DEFAULT_SHAPE constant as ShapeDescriptor (not number 0)
- Use in resolveShape when shape is undefined

### P3: Verify demos compile and render
- Run full test suite
- Test visual rendering (if possible)

---

## 3. Dependencies

- Primitive blocks (Ellipse, Rect) already use sigShapeRef with topology IDs
- RenderInstances2D block handles shape wiring
- Canvas2DRenderer already only uses resolvedShape

---

## 4. Risks

### R1: Breaking Changes (LOW)
- Some edge cases may have relied on `0` default
- Mitigation: Explicit DEFAULT_SHAPE constant

### R2: Per-Particle Shapes Not Ready (MEDIUM)
- ArrayBufferView case isn't properly implemented
- Mitigation: Make it explicit error for now
