# Shape Field Reference in InstanceDecl - Design Decision

**Date**: 2026-02-04
**Status**: Implemented
**Decision**: Store shape field reference in InstanceDecl instead of requiring separate shape input on RenderInstances2D

## Problem

Prior to this change, rendering instances required wiring both position AND shape to RenderInstances2D:

```
Ellipse.shape → Array.element → Array.elements ─┬→ GridLayout → RenderInstances2D.pos
                                                 └→ RenderInstances2D.shape
```

This created unnecessary wiring complexity because:
1. **Duplicate wiring**: Same data (Array.elements) wired to two different ports
2. **Type redundancy**: Both pos and shape fields carry the same instanceId
3. **Coupling violation**: Shape is intrinsically bound to the instance but flows separately

## Solution

Store a reference to the shape field in InstanceDecl when the instance is created. RenderInstances2D automatically looks up the shape via the instanceId from the position field.

### New Flow

```
Ellipse.shape → Array.element → Array.elements → GridLayout → RenderInstances2D.pos
                                      ↓
                        (stored in InstanceDecl.shapeField)
```

### Key Changes

1. **InstanceDecl gains shapeField**
   ```typescript
   export interface InstanceDecl {
     readonly id: InstanceId;
     readonly domainType: DomainTypeId;
     readonly count: number | 'dynamic';
     readonly lifecycle: 'static' | 'dynamic' | 'pooled';
     readonly identityMode: 'stable' | 'none';
     readonly elementIdSeed?: number;
     readonly shapeField?: ValueExprId; // ← NEW
   }
   ```

2. **Array block stores shape reference**
   ```typescript
   // Array.lower()
   const instanceId = ctx.b.createInstance(
     DOMAIN_CIRCLE,
     count,
     elementInput.id  // ← Store shape field reference
   );
   ```

3. **RenderInstances2D.shape input removed**
   - No shape port in block definition
   - Backend looks up shape from InstanceDecl.shapeField

4. **Backend automatically resolves shape**
   ```typescript
   // schedule-program.ts collectRenderTargets()
   const instanceDecl = instances.get(instanceId);
   const shapeFieldId = instanceDecl.shapeField;
   const shape = isFieldExtent(shapeFieldId, valueExprs)
     ? { k: 'field', id: shapeFieldId, stride: ... }
     : { k: 'sig', id: shapeFieldId };
   ```

## Benefits

### 1. Simplified Wiring (Primary Goal)
**Before**: Two connections from Array
**After**: One connection from Array → Layout → RenderInstances2D

Reduces cognitive load and graph complexity.

### 2. ONE SOURCE OF TRUTH (Architectural)
**Shape data lives in the field** (Array.elements), **InstanceDecl just points to it**.

This is not duplication - InstanceDecl stores a *reference* (like an index), not a copy of the data. The shape field remains the single source of truth.

### 3. Preserves Heterogeneous Shape Capability
The system still supports both:
- **Signal<shape>**: All elements share one shape (common case)
- **Field<shape>**: Each element can have different shape (advanced case)

The shapeField can point to either. When rendering:
- If shapeFieldId resolves to a Signal → uniform shape
- If shapeFieldId resolves to a Field → per-element shapes

This capability is preserved even though it's not currently used.

### 4. Type Safety
Impossible to wire mismatched shapes and positions - they're inherently coupled via the instance.

### 5. Hot-Swap Compatible
When Ellipse parameters change:
1. New shapeRef ValueExprId created
2. Array recreates instance with new shapeField
3. InstanceDecl updated
4. RenderInstances2D picks up new shape automatically

No additional migration logic needed.

## Trade-offs

### shapeField is Optional
Not all instances are meant for rendering (e.g., control point instances in ProceduralStar are internal data structures). Making shapeField optional allows these use cases.

If RenderInstances2D encounters an instance without shapeField, it throws a clear error:
```
RenderInstances2D: Instance inst-123 does not have a shapeField.
Ensure the instance was created with a shape (e.g., Array block with Ellipse.shape as element).
```

### createInstance Signature Change
All instance-creating blocks must pass shapeField (or undefined for non-renderable instances).

**Migration**: Update all createInstance call sites to pass shapeField parameter.

## Implementation Details

### Modified Files
1. `src/compiler/ir/types.ts` - Add shapeField to InstanceDecl
2. `src/compiler/ir/IRBuilder.ts` - Update createInstance interface
3. `src/compiler/ir/IRBuilderImpl.ts` - Update createInstance implementation
4. `src/blocks/instance/array.ts` - Pass elementInput.id as shapeField
5. `src/blocks/render/render-instances-2d.ts` - Remove shape input port
6. `src/compiler/backend/schedule-program.ts` - Look up shape from InstanceDecl

### Error Handling
Three new error cases with clear messages:
1. **Instance not found**: Compiler bug - instanceId inferred but doesn't exist
2. **Missing shapeField**: Instance created without shape for renderable use case
3. **Invalid shapeField reference**: shapeField points to non-existent ValueExpr

All errors provide actionable context for debugging.

## Alternatives Considered

### 1. Optional Shape Input on RenderInstances2D
**Approach**: Make shape input optional. If not wired, look up from InstanceDecl.
**Rejected**: Creates two ways to do the same thing. Confusing. Users wouldn't know when to use which approach.

### 2. Different Block Types
**Approach**: RenderInstancesUniform2D (uses InstanceDecl shape) vs RenderInstancesHeterogeneous2D (requires shape field).
**Rejected**: Adds complexity. Most users won't use heterogeneous shapes. The proposed solution handles both cases transparently.

### 3. Store Shape Value in InstanceDecl
**Approach**: Store the actual shape data in InstanceDecl, not a reference.
**Rejected**: Violates ONE SOURCE OF TRUTH. Shape would exist in both InstanceDecl and as a field value. Creates sync problems.

## Future Considerations

### Per-Element Heterogeneous Shapes
Currently unused but preserved. If needed in the future:
- Create a Field<shape> (e.g., via FieldMap transforming Array.elements)
- Array stores this field as shapeField
- RenderInstances2D automatically detects it's a field and renders per-element

No architectural changes needed - capability already exists.

### Instance Metadata Expansion
This pattern (storing field references in InstanceDecl) could extend to other instance-bound data:
- Material properties
- Animation state
- Per-instance uniforms

Consider if other "instance attributes" should follow this pattern.

## Validation

### Test Coverage
- Existing tests updated to remove shape wiring
- New tests validate automatic shape lookup
- Error cases tested (missing shapeField, invalid reference)

### Backward Compatibility
**Breaking change**: Existing graphs with RenderInstances2D.shape connections will break.

**Migration path**: Remove shape wire, ensure Array.element is connected to a shape block (e.g., Ellipse).

## Conclusion

This change significantly simplifies the user experience (one connection instead of two) while maintaining architectural cleanliness (ONE SOURCE OF TRUTH) and preserving advanced capabilities (heterogeneous shapes).

The implementation is clean, errors are clear, and the pattern could extend to other instance-bound attributes in the future.

**Verdict**: Approved and implemented.
