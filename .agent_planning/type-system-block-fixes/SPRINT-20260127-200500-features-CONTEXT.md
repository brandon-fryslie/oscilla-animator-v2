# Implementation Context: features Sprint

**Sprint**: Stroke Rendering and Signal Swizzle
**Generated**: 2026-01-27-200500

## Stroke Rendering

### Key Files

1. **Type Definitions**
   - `src/render/types.ts` - `PathStyle` interface (strokeColor, strokeWidth already exist)

2. **Style Building**
   - `src/runtime/RenderAssembler.ts:1120` - `buildPathStyle()` function
   - Only sets `fillColor` currently

3. **Rendering**
   - `src/render/Canvas2DRenderer.ts` - Canvas rendering
   - `src/render/SVGRenderer.ts` - SVG export

### Current PathStyle Interface
```typescript
export interface PathStyle {
  fillColor?: Color | null;
  strokeColor?: Color | null;
  strokeWidth?: number;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
}
```

### Implementation Notes

Modify `buildPathStyle()`:
```typescript
function buildPathStyle(/* params */): PathStyle {
  return {
    fillColor: /* existing logic */,
    strokeColor: /* add extraction from inputs */,
    strokeWidth: /* add extraction from inputs */,
  };
}
```

Add block inputs for stroke (options):
1. Extend RenderInstances2D with strokeColor, strokeWidth inputs
2. Create separate StrokeStyle block
3. Use combined FillStrokeStyle block

---

## Signal Swizzle

### Key Files

1. **Swizzle Evaluation**
   - `src/compiler/ir/SignalEvaluator.ts` - Contains makeVec2Sig, makeVec3Sig, makeColorSig

2. **Swizzle Patterns**
   - Single-component: `.x`, `.y`, `.z`, `.r`, `.g`, `.b`, `.a` - WORKS
   - Multi-component: `.xy`, `.rgb`, `.xyz` - THROWS "not yet supported"

### Current Error
```typescript
function makeVec2Sig(/* ... */): SigExprId {
  throw new Error('makeVec2Sig not yet supported');
}
```

### Implementation Notes

To fix, need to:
1. Allocate multi-slot return values in SignalEvaluator
2. Copy individual components into adjacent slots
3. Return the first slot, with stride indicating multi-slot

This is more complex than single-component because it requires:
- Understanding how multi-slot signals flow through the system
- Ensuring downstream consumers can read adjacent slots
- Not breaking existing single-component extraction

---

## Testing Approaches

### Stroke Rendering Test
```typescript
// In a demo or test
const render = b.addBlock('RenderInstances2D', {
  strokeColor: [1, 0, 0, 1],
  strokeWidth: 2,
});
// Verify canvas draws strokes
```

### Swizzle Test
```typescript
// If implementing
const vec = b.addBlock('MakeVec3', { x: 1, y: 2, z: 3 });
const xy = b.addBlock('Swizzle', { pattern: '.xy' });
b.wire(vec, 'out', xy, 'in');
// Verify xy output is [1, 2]
```
