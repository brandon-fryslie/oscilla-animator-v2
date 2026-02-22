# Unit Annotation Guide

This guide describes unit annotations for canonical value types.

## Core Rule

Define units on `canonicalType` / `canonicalMany` and keep unit checks at compile time.

## Common Units

- `none`
- `count`
- `angle.turns`
- `angle.radians`
- `angle.degrees`
- `time.ms`
- `time.seconds`
- `space.world`
- `space.ndc`
- `color.rgba01`

## One-Cardinality Example

```ts
import { canonicalType, FLOAT, unitTurns } from '../core/canonical-types';

const phaseType = canonicalType(FLOAT, unitTurns());
```

## Many-Cardinality Example

```ts
import { canonicalMany, FLOAT, unitWorld3 } from '../core/canonical-types';
import { instanceRef } from '../core/canonical-types';

const posType = canonicalMany(FLOAT, unitWorld3(), instanceRef('items', 'main'));
```

## Adapter Guidance

If two connected ports disagree on units, resolve with an explicit adapter block rather than implicit conversion in kernels.

## Migration Checklist

1. Declare units directly on port canonical types.
2. Remove ad-hoc conversion math from block lowering.
3. Keep compatibility decisions in frontend type policies.
4. Validate with `just check` after each slice.
