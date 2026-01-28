# Implementation Context: unified-shape-foundation

**Sprint:** Unified Shape Model Foundation

## Key Files

| File | Role | Changes Needed |
|------|------|----------------|
| `src/shapes/types.ts` | Core shape types | NEW - TopologyDef, ShapeRef, ParamDef |
| `src/shapes/topologies.ts` | Built-in topologies | NEW - TOPOLOGY_ELLIPSE, TOPOLOGY_RECT |
| `src/shapes/registry.ts` | Topology lookup | NEW - getTopology() |
| `src/blocks/primitive-blocks.ts` | Shape block definitions | Rewrite lower() for Ellipse/Rect |
| `src/compiler/ir/types.ts` | IR types | Add ShapeRef handling |
| `src/compiler/passes-v2/pass7-schedule.ts` | Schedule generation | Wire shape through render step |
| `src/runtime/ScheduleExecutor.ts` | Runtime execution | Evaluate param slots, pass to renderer |
| `src/render/Canvas2DRenderer.ts` | Actual drawing | Use topology.render() dispatch |

## Current State (Placeholders)

### primitive-blocks.ts Ellipse (lines 58-76)
```typescript
// CURRENT - outputs rx as single float placeholder
lower: ({ctx, inputsById, config}) => {
    const rxInput = inputsById.rx;
    let rxSig;
    if (rxInput && rxInput.k === 'sig') {
        rxSig = rxInput.id;
    } else {
        rxSig = ctx.b.sigConst((config?.rx as number) ?? 0.02, canonicalType('float'));
    }
    const slot = ctx.b.allocSlot();
    return {
        outputsById: {
            shape: {k: 'sig', id: rxSig, slot},
        },
    };
}
```

### Canvas2DRenderer.ts (approximate)
```typescript
// CURRENT - hardcoded switch
switch (shape) {
  case 0: // circle
    ctx.arc(x, y, size, 0, Math.PI * 2);
    break;
  case 1: // square
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    break;
}
```

## Target State

### New types (src/shapes/types.ts)
```typescript
export type TopologyId = string;

export interface ParamDef {
  name: string;
  type: 'float' | 'vec2';
  default: number | { x: number; y: number };
}

export interface TopologyDef {
  readonly id: TopologyId;
  readonly params: readonly ParamDef[];
  readonly render: (ctx: CanvasRenderingContext2D, params: Record<string, number>) => void;
}

export interface ShapeRef {
  topologyId: TopologyId;
  paramSlots: SlotRef[];  // References to runtime param values
}

export type SlotRef = number;  // Index into slot array
```

### Built-in topologies (src/shapes/topologies.ts)
```typescript
export const TOPOLOGY_ELLIPSE: TopologyDef = {
  id: 'ellipse',
  params: [
    { name: 'rx', type: 'float', default: 0.02 },
    { name: 'ry', type: 'float', default: 0.02 },
    { name: 'rotation', type: 'float', default: 0 },
  ],
  render: (ctx, p) => {
    ctx.ellipse(0, 0, p.rx, p.ry, p.rotation, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const TOPOLOGY_RECT: TopologyDef = {
  id: 'rect',
  params: [
    { name: 'width', type: 'float', default: 0.04 },
    { name: 'height', type: 'float', default: 0.02 },
    { name: 'rotation', type: 'float', default: 0 },
    { name: 'cornerRadius', type: 'float', default: 0 },
  ],
  render: (ctx, p) => {
    ctx.save();
    ctx.rotate(p.rotation);
    if (p.cornerRadius > 0) {
      ctx.roundRect(-p.width/2, -p.height/2, p.width, p.height, p.cornerRadius);
    } else {
      ctx.fillRect(-p.width/2, -p.height/2, p.width, p.height);
    }
    ctx.fill();
    ctx.restore();
  }
};
```

### Updated Ellipse block lowering
```typescript
lower: ({ctx, inputsById, config}) => {
    // Get or create signals for each param
    const rxSig = getInputSignal(inputsById.rx, config?.rx ?? 0.02, ctx);
    const rySig = getInputSignal(inputsById.ry, config?.ry ?? 0.02, ctx);
    const rotSig = ctx.b.sigConst(0, canonicalType('float'));  // Default rotation

    // Allocate slots for params
    const rxSlot = ctx.b.allocSlot();
    const rySlot = ctx.b.allocSlot();
    const rotSlot = ctx.b.allocSlot();

    // Create ShapeRef
    const shapeRef: ShapeRef = {
      topologyId: 'ellipse',
      paramSlots: [rxSlot, rySlot, rotSlot],
    };

    // Output shape reference (how exactly TBD based on IR design)
    return {
        outputsById: {
            shape: {k: 'shapeRef', ref: shapeRef, paramSignals: [rxSig, rySig, rotSig]},
        },
    };
}
```

### Updated renderer
```typescript
function drawShape(ctx: CanvasRenderingContext2D, x: number, y: number, shapeRef: ShapeRef, params: number[]) {
  const topology = getTopology(shapeRef.topologyId);

  ctx.save();
  ctx.translate(x, y);

  // Build params object from slot values
  const paramObj: Record<string, number> = {};
  topology.params.forEach((def, i) => {
    paramObj[def.name] = params[i] ?? def.default;
  });

  topology.render(ctx, paramObj);
  ctx.restore();
}
```

## Design Decisions

### ShapeRef in Signal System

**Decision needed:** How does ShapeRef flow through the signal/field system?

**Option A: ShapeRef as special output kind**
- Block outputs `{k: 'shapeRef', ref: ShapeRef, paramSignals: SignalId[]}`
- Requires new output kind in IR

**Option B: Bundle params as vec3/vec4**
- Shape = (topologyIndex, param0, param1, param2)
- Uses existing vector infrastructure
- Less semantic clarity

**Option C: Separate outputs for topology + params**
- Shape block outputs multiple ports: topology, rx, ry, etc.
- More explicit, more wires

**Recommendation:** Option A - ShapeRef is a first-class concept, cleaner semantically.

### Topology Registry

Topologies registered at module load time, immutable thereafter.
Compile-time: topologyId resolved to TopologyDef
Runtime: just need the render function and param values

## Canvas API Reference

```javascript
// Ellipse (centered at origin after translate)
ctx.ellipse(0, 0, rx, ry, rotation, 0, Math.PI * 2);
ctx.fill();

// Rectangle (centered)
ctx.fillRect(-width/2, -height/2, width, height);

// Rounded rectangle (centered)
ctx.roundRect(-width/2, -height/2, width, height, cornerRadius);
ctx.fill();
```

## Testing Strategy

1. **Unit tests** - Topology registry returns correct defs
2. **Unit tests** - Block lowering produces ShapeRef
3. **Integration tests** - Full compile with Ellipse/Rect
4. **Visual tests** - Manual verification in browser (rx≠ry, width≠height)

## Migration Notes

- Old placeholder shape handling removed
- Demo patches updated to use new shape model
- Tests referencing old shape encoding updated
