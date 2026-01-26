# Implementation Context: Payload Stride Object

**Sprint:** payload-stride-object
**Generated:** 2026-01-26

## Current State

### ConcretePayloadType (canonical-types.ts:157-165)
```typescript
export type ConcretePayloadType =
  | 'float'
  | 'int'
  | 'vec2'
  | 'vec3'
  | 'color'
  | 'bool'
  | 'shape'
  | 'cameraProjection';
```

### PAYLOAD_STRIDE (canonical-types.ts:223-232)
```typescript
export const PAYLOAD_STRIDE: Record<ConcretePayloadType, number> = {
  float: 1,
  int: 1,
  bool: 1,
  vec2: 2,
  vec3: 3,
  color: 4,
  shape: 8,
  cameraProjection: 1,
};
```

### strideOf() (canonical-types.ts:241-247)
```typescript
export function strideOf(type: PayloadType): number {
  if (isPayloadVar(type)) {
    throw new Error(`Cannot get stride for payload variable ${type.id} - resolve payload first`);
  }
  return PAYLOAD_STRIDE[type as ConcretePayloadType];
}
```

### The Bug (ContinuityApply.ts:321)
```typescript
const stride = semantic === 'position' ? 2 : 1;
```

### StepContinuityApply (ir/types.ts:530-538)
```typescript
export interface StepContinuityApply {
  readonly kind: 'continuityApply';
  readonly targetKey: string;
  readonly instanceId: string;
  readonly policy: ContinuityPolicy;
  readonly baseSlot: ValueSlot;
  readonly outputSlot: ValueSlot;
  readonly semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
}
```

## Target State

### ConcretePayloadType (new)
```typescript
export type ConcretePayloadType =
  | { readonly kind: 'float'; readonly stride: 1 }
  | { readonly kind: 'int'; readonly stride: 1 }
  | { readonly kind: 'bool'; readonly stride: 1 }
  | { readonly kind: 'vec2'; readonly stride: 2 }
  | { readonly kind: 'vec3'; readonly stride: 3 }
  | { readonly kind: 'color'; readonly stride: 4 }
  | { readonly kind: 'shape'; readonly stride: 8 }
  | { readonly kind: 'cameraProjection'; readonly stride: 1 };

// Singleton instances for each type
export const FLOAT: ConcretePayloadType = { kind: 'float', stride: 1 } as const;
export const INT: ConcretePayloadType = { kind: 'int', stride: 1 } as const;
export const BOOL: ConcretePayloadType = { kind: 'bool', stride: 1 } as const;
export const VEC2: ConcretePayloadType = { kind: 'vec2', stride: 2 } as const;
export const VEC3: ConcretePayloadType = { kind: 'vec3', stride: 3 } as const;
export const COLOR: ConcretePayloadType = { kind: 'color', stride: 4 } as const;
export const SHAPE: ConcretePayloadType = { kind: 'shape', stride: 8 } as const;
export const CAMERA_PROJECTION: ConcretePayloadType = { kind: 'cameraProjection', stride: 1 } as const;

// Type for the kind discriminator
export type PayloadKind = ConcretePayloadType['kind'];
```

### strideOf() (preserved for compatibility)
```typescript
export function strideOf(type: PayloadType): number {
  if (isPayloadVar(type)) {
    throw new Error(`Cannot get stride for payload variable ${type.id} - resolve payload first`);
  }
  return type.stride;
}
```

### ALLOWED_UNITS (restructured)
```typescript
const ALLOWED_UNITS: Record<PayloadKind, readonly Unit['kind'][]> = {
  float: ['scalar', 'norm01', 'phase01', 'radians', 'degrees', 'deg', 'ms', 'seconds'],
  int: ['count', 'ms'],
  vec2: ['ndc2', 'world2'],
  vec3: ['ndc3', 'world3'],
  color: ['rgba01'],
  bool: ['none'],
  shape: ['none'],
  cameraProjection: ['none'],
};
```

### StepContinuityApply (fixed)
```typescript
export interface StepContinuityApply {
  readonly kind: 'continuityApply';
  readonly targetKey: string;
  readonly instanceId: string;
  readonly policy: ContinuityPolicy;
  readonly baseSlot: ValueSlot;
  readonly outputSlot: ValueSlot;
  readonly semantic: 'position' | 'radius' | 'opacity' | 'color' | 'custom';
  readonly stride: number;  // NEW - populated from payload type at compile time
}
```

### ContinuityApply.ts (fixed)
```typescript
// OLD: const stride = semantic === 'position' ? 2 : 1;
const stride = step.stride;
```

## Files to Modify

### Core Type Changes
1. **src/core/canonical-types.ts**
   - Change ConcretePayloadType definition
   - Add factory constants (FLOAT, VEC2, etc.)
   - Add PayloadKind type alias
   - Update isConcretePayload() - check for object with kind property
   - Update payloadsEqual() - compare by kind
   - Update strideOf() - return type.stride
   - Update defaultUnitForPayload() - switch on type.kind
   - Update ALLOWED_UNITS - key by PayloadKind
   - Update isValidPayloadUnit() - use type.kind

### Comparison Updates
2. **src/compiler/ir/bridges.ts** - payload switches
3. **src/compiler/ir/signalExpr.ts** - payload switches
4. **src/compiler/passes-v2/pass1-type-constraints.ts** - payload comparisons
5. **src/ui/reactFlowEditor/typeValidation.ts** - payload comparisons
6. **src/ui/debug-viz/types.ts** - payload usage

### IR and Runtime Fix
7. **src/compiler/ir/types.ts** - Add stride to StepContinuityApply
8. **src/compiler/passes-v2/pass7-schedule.ts** - Populate stride when creating step
9. **src/runtime/ContinuityApply.ts** - Use step.stride
10. **src/projection/__tests__/level9-continuity-decoupling.test.ts** - Update test

## Migration Pattern

For each file with payload comparisons:

**Before:**
```typescript
if (payload === 'float') { ... }
switch (payload) {
  case 'vec2': ...
}
```

**After:**
```typescript
if (payload.kind === 'float') { ... }
switch (payload.kind) {
  case 'vec2': ...
}
```

For creating payload types:

**Before:**
```typescript
const type: PayloadType = 'float';
```

**After:**
```typescript
import { FLOAT } from '../core/canonical-types';
const type: PayloadType = FLOAT;
```

## Testing Strategy

1. Run `npm run typecheck` after P0 to find all broken comparisons
2. Fix comparisons file by file, running typecheck after each
3. Run `npm run test` after P1 to verify no behavioral changes
4. Add/update continuity test for color semantic after P2
5. Final full test run
