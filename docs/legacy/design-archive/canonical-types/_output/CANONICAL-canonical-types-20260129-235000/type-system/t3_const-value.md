---
parent: ../INDEX.md
topic: type-system
tier: 3
---

# Type System: ConstValue (Optional)

> **Tier 3**: Use it or don't. Change freely if something works better.

**Context**: Implementation details for constant value representation.

---

## ConstValue

Constants are stored as a discriminated union keyed by payload kind, NOT as `number | string | boolean | any`.

```typescript
type ConstValue =
  | { kind: 'float'; value: number }
  | { kind: 'int'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'vec2'; value: [number, number] }
  | { kind: 'vec3'; value: [number, number, number] }
  | { kind: 'color'; value: [number, number, number, number] }
  | { kind: 'cameraProjection'; value: CameraProjection };  // closed enum

// Resolution Q8: CameraProjection is a closed string enum, NOT a matrix.
type CameraProjection = 'orthographic' | 'perspective'; // closed set — extend only by spec decision
```

## Validation

```typescript
function constValueMatchesPayload(cv: ConstValue, payload: PayloadType): boolean {
  return cv.kind === payload.kind;
}
```

This check is mandatory — a `ConstValue` with `kind: 'bool'` paired with a `payload: { kind: 'float' }` is a type error caught by the validation gate.

## Usage in ValueExpr

```typescript
type ValueExprConst = {
  readonly kind: 'const';
  readonly type: CanonicalType;
  readonly value: ConstValue;
};
```

The ConstValue's kind MUST match `type.payload.kind`.

## EventExprNever Pattern

The "never fires" event is canonically a const:
```typescript
{
  kind: 'const',
  type: canonicalEventOne(),  // discrete bool none
  value: { kind: 'bool', value: false }
}
```

---

## See Also

- [CanonicalType](./t1_canonical-type.md) - PayloadType defines valid const kinds
- [Axis Invariants](../axes/t1_axis-invariants.md) - I5 (const payload match)
