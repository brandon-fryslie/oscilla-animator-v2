# Shape System Evaluation

**Generated:** 2026-01-20
**Verdict:** PAUSE (needs architectural decisions)

## Current State

### What Exists

| Component | Location | Status |
|-----------|----------|--------|
| Ellipse block | `src/blocks/primitive-blocks.ts` | Placeholder - outputs rx as float |
| Rect block | `src/blocks/primitive-blocks.ts` | Placeholder - outputs width as float |
| PayloadType 'shape' | `src/core/canonical-types.ts:58` | Declared but not truly implemented |
| Shape bridge | `src/compiler/ir/bridges.ts:218-221` | Maps to `{ kind: 'number' }` placeholder |
| Shape buffer format | `src/runtime/BufferPool.ts:34` | Uses f32 (single float) |
| Canvas2DRenderer | `src/render/Canvas2DRenderer.ts:73-95` | Hardcoded: 0=circle, 1=square, 2=triangle |
| RenderInstances2D.shape | `src/blocks/render-blocks.ts:130` | Accepts `signalType('int')`, not 'shape' |

### What's Broken

1. **Shape blocks don't encode shapes** - Ellipse(rx, ry) just outputs rx, Rect(width, height) just outputs width
2. **No shape descriptor type** - No structured way to represent "ellipse with rx=0.02, ry=0.03"
3. **Renderer is disconnected** - Hardcoded switch statement, doesn't know about Ellipse/Rect params
4. **Source of truth violated** - Shape definition in 3 places that don't talk to each other

### Canvas API Reality

HTML5 Canvas 2D context supports exactly 3 primitives:
- `fillRect()` / `strokeRect()` - rectangles
- `arc()` / `ellipse()` - circles and ellipses
- Path commands - everything else (polygons, stars, beziers, etc.)

## Key Design Decision Required

**How should shape parameters flow from block definition to renderer?**

### Option A: Shape as Integer ID + Separate Size Inputs

Current approach (mostly). Shapes are just IDs (0=circle, 1=square), and size comes separately.

| Aspect | Assessment |
|--------|------------|
| Complexity | Low |
| Flexibility | Low - can't do ellipse (rx≠ry) or rectangle (w≠h) |
| Breaking changes | None |
| Verdict | **REJECTED** - Too limiting |

### Option B: Shape as Struct-in-Float (Packed Encoding)

Encode shape type + one param in a single float using bit manipulation.

| Aspect | Assessment |
|--------|------------|
| Complexity | Medium |
| Flexibility | Limited - still can't encode 2 independent params |
| Precision | Loses float precision |
| Verdict | **REJECTED** - Doesn't solve the actual problem |

### Option C: Multiple Shape Channels

Shape becomes 3 values: shapeType (int), param1 (float), param2 (float)
- Ellipse: type=1, param1=rx, param2=ry
- Rect: type=2, param1=width, param2=height
- Circle (convenience): type=1, param1=r, param2=r

| Aspect | Assessment |
|--------|------------|
| Complexity | Medium |
| Flexibility | Good - handles all 2-param shapes |
| Breaking changes | Moderate - renderer needs to accept 3 channels |
| Buffer impact | Need 3 floats per shape (or 1 int + 2 floats) |
| Verdict | **RECOMMENDED** |

### Option D: Shape Descriptor Table

Shape signal is an index into a table of shape descriptors. Table holds all shape metadata.

| Aspect | Assessment |
|--------|------------|
| Complexity | High |
| Flexibility | Maximum - arbitrary shape complexity |
| Breaking changes | Large - new runtime data structure |
| Verdict | Over-engineered for current needs |

## Recommended Approach: Option C

**Shape is 3 channels: shapeType + param1 + param2**

This maps naturally to Canvas:
- `ellipse(x, y, param1, param2, ...)` - rx=param1, ry=param2
- `fillRect(x - param1/2, y - param2/2, param1, param2)` - width=param1, height=param2
- Future path shapes can use params differently

## Dependencies

- Decision on shape encoding (above)
- Update to render IR to pass shape channels
- Renderer changes to decode shape channels

## Risks

- Breaking change to shape data flow
- Tests need updating for new shape representation
- Renderer performance (branching per shape type)

## Ambiguities to Resolve

1. Should shape be Signal<shape> or a special composite type?
2. How do per-particle shape variations work (different rx/ry per particle)?
3. Do we need shape uniformity optimization (all same shape = fast path)?

**Recommendation:** Treat shape as Signal<shape> that internally represents 3 channels. The runtime unpacks these into render pass data.
