# Implementation Context: unit-annotations

**Sprint**: Unit Annotation System
**Generated**: 2026-01-20T05:16:00

## Design Sketch

### NumericUnit Type

```typescript
// In src/core/canonical-types.ts
type NumericUnit =
  | 'phase'      // [0, 1) cyclic
  | 'radians'    // [0, 2π) or unbounded
  | 'degrees'    // [0, 360) or unbounded
  | 'normalized' // [0, 1] clamped
  | 'ms'         // milliseconds
  | 'seconds'    // seconds
  | 'scalar';    // dimensionless number
```

### Extended CanonicalType

```typescript
interface CanonicalType {
  payload: PayloadType;
  extent?: Extent;
  unit?: NumericUnit;  // NEW: optional unit annotation
}

// Helper with unit
function canonicalType(payload: PayloadType, unit?: NumericUnit): CanonicalType {
  return { payload, unit };
}
```

### Kernel Signature Declaration

```typescript
// In a new file or extension to existing
interface KernelSignature {
  name: string;
  inputs: Array<{
    index: number;
    expectedUnit?: NumericUnit;
    description?: string;
  }>;
  output: {
    unit?: NumericUnit;
    description?: string;
  };
}

// Example declarations
const KERNEL_SIGNATURES: Record<string, KernelSignature> = {
  'sin': {
    name: 'sin',
    inputs: [{ index: 0, expectedUnit: 'phase', description: 'Phase [0,1)' }],
    output: { unit: 'scalar', description: 'Sine value [-1,1]' },
  },
  'sinRad': {
    name: 'sinRad',
    inputs: [{ index: 0, expectedUnit: 'radians', description: 'Angle in radians' }],
    output: { unit: 'scalar', description: 'Sine value [-1,1]' },
  },
};
```

### Validation Insertion Points

| Option | Location | Pros | Cons |
|--------|----------|------|------|
| Pass 2 (typing) | After type inference | Early detection | Types not fully resolved |
| Pass 4 (wiring) | During edge validation | All types known | Mixed concerns |
| New Pass 5.5 | After wiring, before codegen | Clean separation | Extra pass |

**Recommendation**: Extend Pass 4 (wiring validation) since it already validates type compatibility.

### Auto-Conversion Options

| Option | Behavior | Use Case |
|--------|----------|----------|
| Explicit only | User must add conversion blocks | Maximum safety |
| Auto with warning | Compiler inserts conversion, emits warning | Pragmatic |
| Auto silent | Compiler inserts conversion silently | Convenient but hidden |

**Recommendation**: Auto with warning - helps users learn the system while not blocking work.

## Files to Modify

| File | Change |
|------|--------|
| `src/core/canonical-types.ts` | Add NumericUnit, extend CanonicalType |
| `src/compiler/passes-v2/pass4-wiring.ts` | Add unit validation |
| `src/runtime/SignalEvaluator.ts` | Add kernel signatures |
| `src/runtime/Materializer.ts` | Add kernel signatures |
| `src/blocks/*.ts` | Add unit annotations to blocks |

## Related Spec Sections

- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/03-time-system.md` - Phase arithmetic rules
- `design-docs/CANONICAL-oscilla-v2.5-20260109/topics/02-type-system.md` - Type definitions
