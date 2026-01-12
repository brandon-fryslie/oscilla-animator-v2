# Spec: Render Pipeline Primitives

**Date:** 2025-12-28
**Status:** PROPOSED
**Category:** Render Pipeline
**Priority:** Tier 1-2

---

## Overview

The render pipeline has gaps in attribute handling, clipping/masking, material support, and post-processing effects.

---

## Backlog Checklist

- [ ] Wire z-order into render assembly (static + slot-based).
- [ ] Implement PostFX render passes (canvas filters/compositing).
- [ ] Add extended per-instance attributes (rotation, scale, custom attrs).
- [ ] Add clipping/masking passes in IR and renderer.
- [ ] Expand material system (gradients/textures/procedural).
- [ ] Implement curve flattening for path rendering.

---

## Gap 1: Z-Order Not Applied (HIGH)

### Current State

**Location:** `src/editor/runtime/executor/steps/executeRenderAssemble.ts:122,289`

```typescript
header: {
  id: `instances2d-${batch.domainSlot}`,
  z: 0,  // Always 0 - ignores actual z-order
  enabled: true,
},
```

### Impact

- Render order is undefined
- Overlapping elements render in arbitrary order
- Z-index block has no effect

### Proposed Solution

```typescript
// In RenderSinkIR
interface RenderSinkIR {
  kind: "instance2d" | "path2d";
  // ... existing fields
  zOrder?: number;  // Compile-time z-order from ZIndex block
  zOrderSlot?: ValueSlot;  // Runtime z-order from signal
}

// In buildInstancesPass
function buildInstancesPass(
  batch: Instance2DBatchDescriptor,
  runtime: RuntimeState,
): Instances2DPassIR {
  // Read z-order from slot if dynamic, else use static value
  const z = batch.zOrderSlot !== undefined
    ? (runtime.values.read(batch.zOrderSlot) as number)
    : (batch.zOrder ?? 0);

  return {
    kind: "instances2d",
    header: {
      id: `instances2d-${batch.domainSlot}`,
      z,  // Use actual z-order
      enabled: true,
    },
    // ... rest
  };
}
```

### Complexity

Low - Wire z-order through batch descriptors.

---

## Gap 2: PostFX Not Implemented (MEDIUM)

### Current State

**Location:** `src/editor/runtime/canvasRenderer.ts:252-255`

```typescript
case 'postfx':
  // PostFX not implemented yet - skip silently
  console.warn('Canvas2DRenderer: PostFX passes not implemented yet');
  break;
```

### Impact

- Post-processing effects don't work
- Bloom, blur, color grading etc. unavailable

### Proposed Solution

```typescript
// PostFX pass types
interface PostFXPassIR {
  kind: "postfx";
  header: PassHeaderIR;
  effect: PostFXEffect;
  params: Record<string, number | BufferRefIR>;
}

type PostFXEffect =
  | { kind: "blur"; radiusX: number; radiusY: number }
  | { kind: "bloom"; threshold: number; intensity: number }
  | { kind: "colorGrade"; matrix: number[] }
  | { kind: "vignette"; intensity: number; softness: number };

// Implementation using Canvas2D filters
function renderPostFXPass(pass: PostFXPassIR, ctx: CanvasRenderingContext2D): void {
  switch (pass.effect.kind) {
    case "blur":
      ctx.filter = `blur(${pass.effect.radiusX}px)`;
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.filter = 'none';
      break;

    case "bloom":
      // Bloom requires multi-pass: extract bright, blur, composite
      applyBloom(ctx, pass.effect.threshold, pass.effect.intensity);
      break;

    // ... other effects
  }
}
```

### Complexity

Medium-High - Requires off-screen rendering and compositing.

---

## Gap 3: Per-Instance Attributes Limited (MEDIUM)

### Current State

**Location:** `src/editor/runtime/executor/assembleInstanceBuffers.ts`

Only supports: position, size, color, opacity.

Missing: rotation, scale (separate from size), custom attributes.

### Impact

- Can't animate rotation independently from size
- No support for custom shader attributes

### Proposed Solution

```typescript
interface InstanceAttributeSpec {
  name: string;
  type: "f32" | "vec2" | "vec4";
  slot: ValueSlot;
}

interface Instance2DBatch {
  count: number;
  domainSlot: number;
  // Standard attributes
  posXY: ValueSlot;
  size: ValueSlot;
  colorRGBA: ValueSlot;
  opacity: ValueSlot;
  // Extended attributes
  rotation?: ValueSlot;      // Per-instance rotation (radians)
  scaleXY?: ValueSlot;       // Per-instance scale (vec2)
  custom?: InstanceAttributeSpec[];  // Custom attributes
}

// In assembleInstanceBuffers.ts
function assembleInstanceBuffers(batch: Instance2DBatch, runtime: RuntimeState) {
  const result: InstanceBuffers = { /* existing */ };

  if (batch.rotation !== undefined) {
    const rotations = runtime.values.read(batch.rotation);
    result.rotation = asFloat32Buffer(rotations, batch.count);
  }

  if (batch.scaleXY !== undefined) {
    const scales = runtime.values.read(batch.scaleXY);
    result.scaleXY = asVec2Buffer(scales, batch.count);
  }

  return result;
}
```

### Complexity

Medium - Extend buffer assembly and renderer.

---

## Gap 4: Clipping/Masking Not Supported (MEDIUM)

### Current State

No clipping or masking support in IR mode.

### Impact

- Can't clip instances to shapes
- Can't use alpha masks
- Visualizations can't have bounded regions

### Proposed Solution

```typescript
// Clip/mask pass types
interface ClipRegionIR {
  kind: "rect" | "path" | "circle";
  slot?: ValueSlot;  // For dynamic regions
  static?: { x: number; y: number; w: number; h: number };  // For static
}

interface ClipGroupPassIR {
  kind: "clipGroup";
  header: PassHeaderIR;
  clip: ClipRegionIR;
  children: RenderPassIR[];  // Passes to render within clip
}

// In renderer
function renderClipGroup(pass: ClipGroupPassIR, ctx: CanvasRenderingContext2D): void {
  ctx.save();

  // Apply clip region
  ctx.beginPath();
  switch (pass.clip.kind) {
    case "rect":
      const r = pass.clip.static!;
      ctx.rect(r.x, r.y, r.w, r.h);
      break;
    case "circle":
      // ...
      break;
    case "path":
      // Build path from slot data
      break;
  }
  ctx.clip();

  // Render children
  for (const child of pass.children) {
    renderPass(child, ctx, valueStore);
  }

  ctx.restore();
}
```

### Complexity

Medium - Canvas2D has native clip support.

---

## Gap 5: Material System Limited (LOW)

### Current State

**Location:** `src/editor/runtime/executor/steps/executeRenderAssemble.ts:127-130`

```typescript
material: {
  kind: "shape2d",
  shading: "flat",
  colorSpace: "srgb",
},
```

All instances use flat shading.

### Impact

- No gradient fills
- No texture support
- No procedural materials

### Proposed Solution

```typescript
type MaterialIR =
  | { kind: "flat"; colorSpace: "srgb" | "linear" }
  | { kind: "gradient"; type: "linear" | "radial"; stops: GradientStop[] }
  | { kind: "texture"; textureId: string; mapping: "uv" | "screen" }
  | { kind: "procedural"; fn: PureFnRef };

interface GradientStop {
  offset: number;  // 0..1
  colorRGBA: number;
}

// In renderer
function applyMaterial(material: MaterialIR, ctx: CanvasRenderingContext2D): void {
  switch (material.kind) {
    case "flat":
      // Already handled via fillStyle/strokeStyle
      break;

    case "gradient":
      if (material.type === "linear") {
        const grad = ctx.createLinearGradient(/* params from material */);
        for (const stop of material.stops) {
          grad.addColorStop(stop.offset, unpackColorU32(stop.colorRGBA));
        }
        ctx.fillStyle = grad;
      }
      break;

    case "texture":
      // Requires texture atlas management
      break;
  }
}
```

### Complexity

High - Gradients are medium, textures are high.

---

## Gap 6: Curve Flattening Not Implemented (MEDIUM)

### Current State

**Location:** `src/editor/runtime/executor/steps/executeMaterializePath.ts:341`

```typescript
`executeMaterializePath: Curve flattening not implemented yet. ` +
`Bezier curves in path expressions need to be flattened to line segments.`
```

### Impact

- Bezier curves in paths don't render
- Only straight line paths work

### Proposed Solution

```typescript
// De Casteljau algorithm for curve flattening
function flattenCubicBezier(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  tolerance: number = 0.5
): Float32Array {
  const points: number[] = [];

  function subdivide(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
    dx: number, dy: number,
    depth: number
  ) {
    // Check flatness
    const ux = 3*bx - 2*ax - dx;
    const uy = 3*by - 2*ay - dy;
    const vx = 3*cx - ax - 2*dx;
    const vy = 3*cy - ay - 2*dy;
    const flatness = Math.max(ux*ux, vx*vx) + Math.max(uy*uy, vy*vy);

    if (flatness <= tolerance * tolerance || depth > 10) {
      points.push(dx, dy);
      return;
    }

    // Subdivide at midpoint
    const abx = (ax + bx) / 2, aby = (ay + by) / 2;
    const bcx = (bx + cx) / 2, bcy = (by + cy) / 2;
    const cdx = (cx + dx) / 2, cdy = (cy + dy) / 2;
    const abcx = (abx + bcx) / 2, abcy = (aby + bcy) / 2;
    const bcdx = (bcx + cdx) / 2, bcdy = (bcy + cdy) / 2;
    const midx = (abcx + bcdx) / 2, midy = (abcy + bcdy) / 2;

    subdivide(ax, ay, abx, aby, abcx, abcy, midx, midy, depth + 1);
    subdivide(midx, midy, bcdx, bcdy, cdx, cdy, dx, dy, depth + 1);
  }

  points.push(x0, y0);
  subdivide(x0, y0, x1, y1, x2, y2, x3, y3, 0);

  return new Float32Array(points);
}

// Use in path command handling
case PathCmd.CUBIC:
  const flattened = flattenCubicBezier(
    currentX, currentY,
    params[paramIdx], params[paramIdx + 1],
    params[paramIdx + 2], params[paramIdx + 3],
    params[paramIdx + 4], params[paramIdx + 5],
    tolerance
  );
  for (let i = 2; i < flattened.length; i += 2) {
    outPoints.push(flattened[i], flattened[i + 1]);
  }
  break;
```

### Complexity

Medium - Algorithm is well-known.

---

## Summary

| Gap | Severity | Complexity | Enables |
|-----|----------|------------|---------|
| Z-order | HIGH | Low | Proper render ordering |
| PostFX | MEDIUM | Medium-High | Post-processing effects |
| Extended attributes | MEDIUM | Medium | Rotation, scale animation |
| Clipping/masking | MEDIUM | Medium | Bounded regions |
| Materials | LOW | High | Gradients, textures |
| Curve flattening | MEDIUM | Medium | Bezier paths |

**Recommended order:** Z-order → Curve flattening → Clipping → Extended attributes → PostFX → Materials
