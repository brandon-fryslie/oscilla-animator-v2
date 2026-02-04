# Shape-in-Instance Developer Guide

Quick reference for working with the shape field reference system.

## For Block Developers

### Creating Renderable Instances

When creating an instance that will be rendered, pass the shape field reference:

```typescript
// Array block example
const instanceId = ctx.b.createInstance(
  DOMAIN_CIRCLE,           // Domain type
  count,                   // Element count
  elementInput.id,         // ← Shape field reference (e.g., from Ellipse.shape)
  'static'                 // Lifecycle (optional)
);
```

**The shapeField should point to**:
- A Signal<shape> from a shape block (Ellipse, Rect, ProceduralStar, etc.)
- A Field<shape> if you need per-element heterogeneous shapes (rare)

### Creating Non-Renderable Instances

For instances used internally (e.g., control points), pass undefined:

```typescript
// ProceduralStar control points example
const controlInstance = ctx.b.createInstance(
  DOMAIN_CONTROL,
  totalVertices,
  undefined,  // ← No shape needed, these aren't rendered directly
  'static'
);
```

## For Users (Graph Building)

### Simplified Wiring

**Old way** (pre-2026-02-04):
```
Ellipse.shape → Array.element
Array.elements → RenderInstances2D.shape
Array.elements → GridLayout → RenderInstances2D.pos
```

**New way**:
```
Ellipse.shape → Array.element
Array.elements → GridLayout → RenderInstances2D.pos
```

That's it! The shape is automatically looked up from the instance.

### Common Patterns

#### Basic Rendering
```
Ellipse → Array → GridLayout → RenderInstances2D
  shape   element   elements      pos
```

#### With Animated Shape
```
Time → Oscillator → Ellipse.rx (animate radius)
Ellipse.shape → Array.element
Array.elements → GridLayout → RenderInstances2D.pos
```

Shape parameters can be dynamic - the shapeField just points to the shape expression.

#### Heterogeneous Shapes (Advanced)
```
Ellipse → Array → FieldMap (modify per-element) → RenderInstances2D.pos
  shape   element   (could transform shape per element)
```

Not yet implemented, but architecture supports it.

## For Compiler/Backend Developers

### Shape Lookup Flow

1. **RenderInstances2D block**:
   - No shape input port (removed)
   - Only requires pos and color inputs

2. **collectRenderTargets** (schedule-program.ts):
   ```typescript
   // Extract instanceId from position field
   const instanceId = inferFieldInstanceFromExprs(pos.id, valueExprs);

   // Look up instance
   const instanceDecl = instances.get(instanceId);

   // Get shape field reference
   const shapeFieldId = instanceDecl.shapeField;

   // Determine if signal or field
   const shape = isFieldExtent(shapeFieldId, valueExprs)
     ? { k: 'field', id: shapeFieldId, stride: ... }
     : { k: 'sig', id: shapeFieldId };
   ```

3. **buildContinuityPipeline**:
   - Shape is materialized/applied like other fields
   - StepRender receives shape as `{ k: 'sig', ... }` or `{ k: 'slot', ... }`

### Error Cases

Handle these error scenarios:

1. **Instance not found**:
   ```typescript
   if (!instanceDecl) {
     throw new Error(
       `RenderInstances2D: Instance ${instanceId} not found in instances registry. ` +
       `This indicates a compiler bug.`
     );
   }
   ```

2. **Missing shapeField**:
   ```typescript
   if (!instanceDecl.shapeField) {
     throw new Error(
       `RenderInstances2D: Instance ${instanceId} does not have a shapeField. ` +
       `Ensure the instance was created with a shape.`
     );
   }
   ```

3. **Invalid shapeField reference**:
   ```typescript
   const shapeExpr = valueExprs[shapeFieldId as number];
   if (!shapeExpr) {
     throw new Error(
       `RenderInstances2D: Shape field ${shapeFieldId} not found in valueExprs.`
     );
   }
   ```

## Testing

### Test Shape Lookup
```typescript
it('looks up shape from instance when rendering', () => {
  const patch = createPatch({
    blocks: [
      { id: 'ellipse', type: 'Ellipse', config: { rx: 0.02, ry: 0.02 } },
      { id: 'array', type: 'Array', config: { count: 10 } },
      { id: 'layout', type: 'GridLayoutUV' },
      { id: 'render', type: 'RenderInstances2D' },
    ],
    edges: [
      { from: 'ellipse.shape', to: 'array.element' },
      { from: 'array.elements', to: 'layout.elements' },
      { from: 'layout.position', to: 'render.pos' },
      // NO shape edge! It's automatic
    ],
  });

  const result = compile(patch);
  expect(result.ok).toBe(true);

  // Verify instance has shapeField
  const instance = findInstanceByDomain(result.value, DOMAIN_CIRCLE);
  expect(instance.shapeField).toBeDefined();

  // Verify render step uses shape from instance
  const renderStep = findRenderStep(result.value.schedule);
  expect(renderStep.shape).toBeDefined();
});
```

### Test Error Cases
```typescript
it('errors if instance has no shapeField', () => {
  // Create instance without shape (test helper)
  const patch = createInvalidPatch();

  const result = compile(patch);
  expect(result.ok).toBe(false);
  expect(result.error.message).toContain('does not have a shapeField');
});
```

## Migration Checklist

If you're updating existing code or graphs:

- [ ] Remove all `RenderInstances2D.shape` connections
- [ ] Ensure `Array.element` is connected to a shape block (Ellipse, etc.)
- [ ] Update any tests that reference `RenderInstances2D.shape`
- [ ] Verify all `createInstance` calls pass shapeField or undefined
- [ ] Check error messages are clear and actionable

## FAQ

**Q: Can I still use per-element shapes?**
A: Yes! If shapeField points to a Field<shape>, each element can have a different shape. The capability is preserved.

**Q: What if I don't want to render an instance?**
A: Pass `undefined` as shapeField when creating the instance. RenderInstances2D will error if you try to render it.

**Q: Can shape parameters be animated?**
A: Yes! The shapeField points to a ValueExpr, which can have dynamic signal inputs (e.g., Ellipse.rx from an Oscillator).

**Q: What about other instance attributes (material, etc.)?**
A: This pattern could extend to other instance-bound data in the future. For now, only shape is stored.

**Q: Is this a breaking change?**
A: Yes. Existing graphs with RenderInstances2D.shape connections will break. Remove the shape wire and ensure Array.element is connected to a shape.
