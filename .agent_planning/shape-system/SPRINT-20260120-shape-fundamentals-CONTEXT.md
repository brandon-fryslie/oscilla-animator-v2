# Implementation Context: shape-fundamentals

**Sprint:** Shape System Fundamentals

## Key Files

| File | Role | Changes Needed |
|------|------|----------------|
| `src/blocks/primitive-blocks.ts` | Shape block definitions | Rewrite lower() for Ellipse/Rect |
| `src/core/canonical-types.ts` | Type system | Already has 'shape', may need ShapeType enum |
| `src/compiler/ir/types.ts` | IR types | May need ShapeDescriptor type |
| `src/compiler/ir/bridges.ts` | Type→IR mapping | Update shape case |
| `src/compiler/passes-v2/pass7-schedule.ts` | Schedule generation | Update render step for 3 channels |
| `src/runtime/ScheduleExecutor.ts` | Runtime execution | Pass shape channels to render |
| `src/render/Canvas2DRenderer.ts` | Actual drawing | Use param1/param2 for dimensions |
| `src/blocks/render-blocks.ts` | RenderInstances2D | Update shape input type |
| `src/runtime/BufferPool.ts` | Buffer allocation | May need shape-specific format |

## Current State (Placeholders)

### primitive-blocks.ts (lines 64-82)
```typescript
// CURRENT - outputs rx as single float
lower: ({ctx, inputsById, config}) => {
    const rxInput = inputsById.rx;
    let rxSig;
    if (rxInput && rxInput.k === 'sig') {
        rxSig = rxInput.id;
    } else {
        rxSig = ctx.b.sigConst((config?.rx as number) ?? 0.02, signalType('float'));
    }
    const slot = ctx.b.allocSlot();
    return {
        outputsById: {
            shape: {k: 'sig', id: rxSig, slot},
        },
    };
}
```

### Canvas2DRenderer.ts (lines 73-95)
```typescript
// CURRENT - hardcoded switch
switch (shape) {
  case 0: // circle
    ctx.arc(x, y, size, 0, Math.PI * 2);
    break;
  case 1: // square
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    break;
  case 2: // triangle
    // hardcoded triangle
    break;
}
```

## Design Decisions

### Shape Channel Encoding

**Decision:** Shape is 3 separate values, not a packed struct

- `shapeType: int` - 0=ellipse, 1=rect, 2=path
- `param1: float` - rx for ellipse, width for rect
- `param2: float` - ry for ellipse, height for rect

**Rationale:**
- Maps directly to Canvas API parameters
- Easy to modulate independently (animate rx without changing ry)
- No bit-packing complexity
- Clear semantics

### Block Output Strategy

**Option A: Three separate output ports**
```typescript
outputs: [
  {id: 'shapeType', type: signalType('int')},
  {id: 'param1', type: signalType('float')},
  {id: 'param2', type: signalType('float')},
]
```
Pro: Explicit, easy to wire individually
Con: Verbose, 3 wires for one shape

**Option B: Single shape port with composite value**
```typescript
outputs: [
  {id: 'shape', type: signalType('shape')},  // internally 3 values
]
```
Pro: Clean API, single wire
Con: Need composite type handling

**Option C: Bundle as vec3**
```typescript
outputs: [
  {id: 'shape', type: signalType('vec3')},  // (type, p1, p2)
]
```
Pro: Uses existing vec infrastructure
Con: Semantic mismatch (shape isn't a vector)

**Recommendation:** Option B - single shape port, composite internal representation

### Render Pass Data

**Current:**
```typescript
interface RenderPassIR {
  shape: number | ArrayBufferView;  // single channel
}
```

**Needed:**
```typescript
interface RenderPassIR {
  shapeType: number | ArrayBufferView;
  shapeParam1: number | ArrayBufferView;
  shapeParam2: number | ArrayBufferView;
}
// OR
interface RenderPassIR {
  shape: {
    type: number | ArrayBufferView;
    param1: number | ArrayBufferView;
    param2: number | ArrayBufferView;
  };
}
```

## Canvas API Reference

```javascript
// Ellipse
ctx.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle);
ctx.ellipse(x, y, param1, param2, 0, 0, Math.PI * 2);
ctx.fill();

// Rectangle (centered)
ctx.fillRect(x - param1/2, y - param2/2, param1, param2);

// Future: Path
ctx.beginPath();
// ... path commands from topology
ctx.fill();
```

## Testing Strategy

1. **Unit tests** - Block lowering produces correct IR
2. **Integration tests** - Full compile with Ellipse/Rect
3. **Visual tests** - Manual verification in browser
4. **Regression tests** - Existing steel-thread still works

## Migration Notes

- Circle block removed (use Ellipse with rx=ry)
- Square block removed (use Rect with width=height)
- Demo patches need updating
- Tests referencing Circle/Square need updating
