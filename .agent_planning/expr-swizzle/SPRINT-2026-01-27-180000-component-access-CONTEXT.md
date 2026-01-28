# Implementation Context: component-access

**Generated:** 2026-01-27T18:00:00
**Status:** READY FOR IMPLEMENTATION
**Plan:** SPRINT-2026-01-27-180000-component-access-PLAN.md

This document contains all technical details needed to implement the component access and swizzle feature. An agent with only this file should be able to implement the plan.

---

## 1. Create Swizzle Type Utilities

**File to create:** `/Users/bmf/code/oscilla-animator-v2/src/expr/swizzle.ts`

```typescript
/**
 * Swizzle and Component Access Utilities for Expression DSL
 *
 * GLSL-style component access patterns:
 * - Position: x, y, z (vec3)
 * - Color: r, g, b, a (color)
 * - Cross-access: x=r, y=g, z=b, w=a
 */

import { FLOAT, VEC2, VEC3, COLOR, type PayloadType } from '../core/canonical-types';

/** Position component set (vec3) */
export const POSITION_COMPONENTS = ['x', 'y', 'z'] as const;

/** Color component set (rgba) */
export const COLOR_COMPONENTS = ['r', 'g', 'b', 'a'] as const;

/** All valid component characters */
export const ALL_COMPONENTS = ['x', 'y', 'z', 'w', 'r', 'g', 'b', 'a'] as const;

/** Map component character to index */
export function componentIndex(char: string): number {
  switch (char) {
    case 'x': case 'r': return 0;
    case 'y': case 'g': return 1;
    case 'z': case 'b': return 2;
    case 'w': case 'a': return 3;
    default: return -1;
  }
}

/** Check if payload type supports component access */
export function isVectorType(payload: PayloadType): boolean {
  if (payload.kind === 'var') return false;
  return payload.kind === 'vec2' || payload.kind === 'vec3' || payload.kind === 'color';
}

/** Get max component count for a vector type */
export function vectorComponentCount(payload: PayloadType): number {
  if (payload.kind === 'var') return 0;
  switch (payload.kind) {
    case 'vec2': return 2;
    case 'vec3': return 3;
    case 'color': return 4;
    default: return 0;
  }
}

/**
 * Validate a swizzle pattern against a source type.
 * @returns Error message if invalid, undefined if valid
 */
export function validateSwizzle(pattern: string, sourceType: PayloadType): string | undefined {
  if (pattern.length === 0) {
    return 'Empty swizzle pattern';
  }
  if (pattern.length > 4) {
    return `Swizzle pattern too long: '${pattern}' (max 4 components)`;
  }

  const maxIndex = vectorComponentCount(sourceType) - 1;
  if (maxIndex < 0) {
    return `Type '${sourceType.kind}' does not support component access`;
  }

  for (const char of pattern) {
    const idx = componentIndex(char);
    if (idx < 0) {
      return `Invalid component '${char}' in swizzle pattern`;
    }
    if (idx > maxIndex) {
      return `${sourceType.kind} has no component '${char}' (max index is ${maxIndex})`;
    }
  }

  return undefined; // Valid
}

/**
 * Compute the result type of a swizzle operation.
 * Assumes pattern is valid (call validateSwizzle first).
 */
export function swizzleResultType(pattern: string): PayloadType {
  switch (pattern.length) {
    case 1: return FLOAT;
    case 2: return VEC2;
    case 3: return VEC3;
    case 4: return COLOR;
    default: throw new Error(`Invalid swizzle length: ${pattern.length}`);
  }
}

/**
 * Check if a swizzle pattern is valid for a given source type.
 */
export function isValidSwizzle(pattern: string, sourceType: PayloadType): boolean {
  return validateSwizzle(pattern, sourceType) === undefined;
}
```

---

## 2. Update Type Checker

**File to modify:** `/Users/bmf/code/oscilla-animator-v2/src/expr/typecheck.ts`

### Add imports at top:

```typescript
import { isVectorType, validateSwizzle, swizzleResultType } from './swizzle';
```

### Replace `typecheckMemberAccess` function (lines ~480-553):

```typescript
/**
 * Type check member access node (component access or block output reference).
 */
function typecheckMemberAccess(node: ExprNode & { kind: 'member' }, ctx: TypeCheckContext): ExprNode {
  // First, type-check the object expression
  const typedObject = typecheck(node.object, ctx);
  const objectType = typedObject.type!;

  // Case 1: Component access on vector type (vec2, vec3, color)
  if (isVectorType(objectType)) {
    const error = validateSwizzle(node.member, objectType);
    if (error) {
      throw new TypeError(error, node.pos, undefined, undefined,
        objectType.kind === 'vec3' ? 'Valid components: x, y, z (or r, g, b)' :
        objectType.kind === 'color' ? 'Valid components: r, g, b, a (or x, y, z, w)' :
        objectType.kind === 'vec2' ? 'Valid components: x, y (or r, g)' : undefined
      );
    }
    const resultType = swizzleResultType(node.member);
    return withType({ ...node, object: typedObject }, resultType);
  }

  // Case 2: Block output reference (existing logic)
  if (!ctx.blockRefs) {
    throw new TypeError(
      `Cannot access member '${node.member}' on type '${objectType.kind}' (not a vector type, and block references not available)`,
      node.pos,
      undefined,
      undefined,
      objectType.kind === 'float' || objectType.kind === 'int' ?
        'Scalar types do not have components. Did you mean a block reference?' : undefined
    );
  }

  // The object must be an identifier (block name)
  if (node.object.kind !== 'identifier') {
    throw new TypeError(
      'Block reference must be in the form BlockName.port (e.g., Circle1.radius)',
      node.object.pos,
      undefined,
      undefined,
      'Only simple block references are supported'
    );
  }

  const blockName = node.object.name;
  const portName = node.member;
  const shorthand = `${blockName}.${portName}`;

  // Resolve shorthand to canonical address
  const canonicalAddr = ctx.blockRefs.addressRegistry.resolveShorthand(shorthand);
  if (!canonicalAddr) {
    throw new TypeError(
      `Unknown block or port: ${shorthand}`,
      node.pos,
      undefined,
      undefined,
      `Check that block "${blockName}" exists and has an output named "${portName}"`
    );
  }

  // Resolve to get full type information
  const resolved = ctx.blockRefs.addressRegistry.resolve(addressToString(canonicalAddr));
  if (!resolved) {
    throw new TypeError(
      `Failed to resolve ${shorthand} (internal error)`,
      node.pos
    );
  }

  // Verify it's an output port
  if (resolved.kind !== 'output') {
    throw new TypeError(
      `${shorthand} is not an output port`,
      node.pos,
      undefined,
      undefined,
      resolved.kind === 'input' ? `Did you mean to reference an output instead of an input?` : undefined
    );
  }

  // Extract payload type from CanonicalType
  const payload = resolved.type.payload;

  // Validate payload type is allowed
  if (!ctx.blockRefs.allowedPayloads.includes(payload)) {
    throw new TypeError(
      `${shorthand} has type ${payload}, but only ${ctx.blockRefs.allowedPayloads.join(', ')} are allowed`,
      node.pos,
      ctx.blockRefs.allowedPayloads as PayloadType[],
      payload,
      `This expression context only accepts ${ctx.blockRefs.allowedPayloads.join(' or ')} types`
    );
  }

  return withType(node, payload);
}
```

---

## 3. Update Compiler

**File to modify:** `/Users/bmf/code/oscilla-animator-v2/src/expr/compile.ts`

### Add imports at top:

```typescript
import { isVectorType, componentIndex, swizzleResultType } from './swizzle';
```

### Replace `compileMemberAccess` function (lines ~324-345):

```typescript
/**
 * Compile member access node (component access or block output reference).
 */
function compileMemberAccess(node: ExprNode & { kind: 'member' }, ctx: CompileContext): SigExprId {
  // Type is already validated by type checker
  const objectSig = compile(node.object, ctx);
  const objectType = node.object.type!;

  // Case 1: Component access on vector type
  if (isVectorType(objectType)) {
    const pattern = node.member;
    const resultType = canonicalType(swizzleResultType(pattern));

    if (pattern.length === 1) {
      // Single component extraction
      const kernelName = getExtractionKernel(objectType, pattern);
      const fn = ctx.builder.kernel(kernelName);
      return ctx.builder.sigMap(objectSig, fn, resultType);
    } else {
      // Multi-component swizzle: extract each component and combine
      const componentSigs: SigExprId[] = [];
      for (const char of pattern) {
        const kernelName = getExtractionKernel(objectType, char);
        const fn = ctx.builder.kernel(kernelName);
        const componentSig = ctx.builder.sigMap(objectSig, fn, canonicalType(FLOAT));
        componentSigs.push(componentSig);
      }

      // Combine components into result vector
      const combineKernel = getCombineKernel(pattern.length);
      const combineFn = ctx.builder.kernel(combineKernel);
      return ctx.builder.sigZip(componentSigs, combineFn, resultType);
    }
  }

  // Case 2: Block output reference (existing logic)
  if (!ctx.blockRefs) {
    throw new Error('Block references not available - internal error (should have been caught by type checker)');
  }

  if (node.object.kind !== 'identifier') {
    throw new Error('Invalid member access object - should have been caught by type checker');
  }

  const blockName = node.object.name;
  const portName = node.member;
  const shorthand = `${blockName}.${portName}`;

  const sigId = ctx.blockRefs.get(shorthand);
  if (sigId === undefined) {
    throw new Error(`Block reference ${shorthand} not found in context - internal error (should have been caught by type checker)`);
  }

  return sigId;
}

/**
 * Get extraction kernel name for a component.
 */
function getExtractionKernel(sourceType: PayloadType, component: string): string {
  const idx = componentIndex(component);
  if (sourceType.kind === 'color') {
    return ['colorExtractR', 'colorExtractG', 'colorExtractB', 'colorExtractA'][idx];
  } else {
    // vec2 or vec3
    return ['vec3ExtractX', 'vec3ExtractY', 'vec3ExtractZ'][idx];
  }
}

/**
 * Get combine kernel name for constructing a vector.
 */
function getCombineKernel(componentCount: number): string {
  switch (componentCount) {
    case 2: return 'makeVec2Sig';
    case 3: return 'makeVec3Sig';
    case 4: return 'makeColorSig';
    default: throw new Error(`Invalid component count: ${componentCount}`);
  }
}
```

---

## 4. Add Signal Kernels

**File to modify:** `/Users/bmf/code/oscilla-animator-v2/src/runtime/SignalEvaluator.ts`

### Add these cases to `applySignalKernel` function (inside the switch statement):

```typescript
// === COMPONENT EXTRACTION (multi-slot signals) ===
// Note: These assume the signal evaluator can read multi-slot values.
// Current implementation may need extension for stride > 1 signals.

case 'vec3ExtractX': {
  if (values.length !== 3) {
    throw new Error(`Signal kernel 'vec3ExtractX' expects 3 inputs (vec3 components), got ${values.length}`);
  }
  return values[0];
}

case 'vec3ExtractY': {
  if (values.length !== 3) {
    throw new Error(`Signal kernel 'vec3ExtractY' expects 3 inputs (vec3 components), got ${values.length}`);
  }
  return values[1];
}

case 'vec3ExtractZ': {
  if (values.length !== 3) {
    throw new Error(`Signal kernel 'vec3ExtractZ' expects 3 inputs (vec3 components), got ${values.length}`);
  }
  return values[2];
}

case 'colorExtractR': {
  if (values.length !== 4) {
    throw new Error(`Signal kernel 'colorExtractR' expects 4 inputs (color components), got ${values.length}`);
  }
  return values[0];
}

case 'colorExtractG': {
  if (values.length !== 4) {
    throw new Error(`Signal kernel 'colorExtractG' expects 4 inputs (color components), got ${values.length}`);
  }
  return values[1];
}

case 'colorExtractB': {
  if (values.length !== 4) {
    throw new Error(`Signal kernel 'colorExtractB' expects 4 inputs (color components), got ${values.length}`);
  }
  return values[2];
}

case 'colorExtractA': {
  if (values.length !== 4) {
    throw new Error(`Signal kernel 'colorExtractA' expects 4 inputs (color components), got ${values.length}`);
  }
  return values[3];
}

// === VECTOR CONSTRUCTION (for swizzle results) ===

case 'makeVec2Sig': {
  if (values.length !== 2) {
    throw new Error(`Signal kernel 'makeVec2Sig' expects 2 inputs, got ${values.length}`);
  }
  // Note: This returns a multi-component value.
  // Current implementation only returns single float.
  // May need to return array or use different approach.
  throw new Error('makeVec2Sig: multi-component signal returns not yet supported');
}

case 'makeVec3Sig': {
  if (values.length !== 3) {
    throw new Error(`Signal kernel 'makeVec3Sig' expects 3 inputs, got ${values.length}`);
  }
  throw new Error('makeVec3Sig: multi-component signal returns not yet supported');
}

case 'makeColorSig': {
  if (values.length !== 4) {
    throw new Error(`Signal kernel 'makeColorSig' expects 4 inputs, got ${values.length}`);
  }
  throw new Error('makeColorSig: multi-component signal returns not yet supported');
}
```

---

## 5. Add Field Kernels

**File to modify:** `/Users/bmf/code/oscilla-animator-v2/src/runtime/FieldKernels.ts`

### Add these cases to `applyFieldKernel` function (inside the if-else chain):

```typescript
} else if (fieldOp === 'fieldExtractX') {
  // ════════════════════════════════════════════════════════════════
  // fieldExtractX: Extract X component from vec3 field
  // ────────────────────────────────────────────────────────────────
  // Inputs: [vec3 (stride 3)]
  // Output: float (stride 1)
  // ════════════════════════════════════════════════════════════════
  if (inputs.length !== 1) {
    throw new Error('fieldExtractX requires exactly 1 input (vec3)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Float32Array;
  for (let i = 0; i < N; i++) {
    outArr[i] = inArr[i * 3 + 0];
  }
} else if (fieldOp === 'fieldExtractY') {
  if (inputs.length !== 1) {
    throw new Error('fieldExtractY requires exactly 1 input (vec3)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Float32Array;
  for (let i = 0; i < N; i++) {
    outArr[i] = inArr[i * 3 + 1];
  }
} else if (fieldOp === 'fieldExtractZ') {
  if (inputs.length !== 1) {
    throw new Error('fieldExtractZ requires exactly 1 input (vec3)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Float32Array;
  for (let i = 0; i < N; i++) {
    outArr[i] = inArr[i * 3 + 2];
  }
} else if (fieldOp === 'fieldExtractR') {
  // Color extraction (stride 4)
  if (inputs.length !== 1) {
    throw new Error('fieldExtractR requires exactly 1 input (color)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Uint8ClampedArray;
  for (let i = 0; i < N; i++) {
    outArr[i] = inArr[i * 4 + 0] / 255.0;
  }
} else if (fieldOp === 'fieldExtractG') {
  if (inputs.length !== 1) {
    throw new Error('fieldExtractG requires exactly 1 input (color)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Uint8ClampedArray;
  for (let i = 0; i < N; i++) {
    outArr[i] = inArr[i * 4 + 1] / 255.0;
  }
} else if (fieldOp === 'fieldExtractB') {
  if (inputs.length !== 1) {
    throw new Error('fieldExtractB requires exactly 1 input (color)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Uint8ClampedArray;
  for (let i = 0; i < N; i++) {
    outArr[i] = inArr[i * 4 + 2] / 255.0;
  }
} else if (fieldOp === 'fieldExtractA') {
  if (inputs.length !== 1) {
    throw new Error('fieldExtractA requires exactly 1 input (color)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Uint8ClampedArray;
  for (let i = 0; i < N; i++) {
    outArr[i] = inArr[i * 4 + 3] / 255.0;
  }
} else if (fieldOp === 'fieldSwizzle_xy') {
  // ════════════════════════════════════════════════════════════════
  // fieldSwizzle_xy: Extract XY components from vec3 to vec2
  // ════════════════════════════════════════════════════════════════
  if (inputs.length !== 1) {
    throw new Error('fieldSwizzle_xy requires exactly 1 input (vec3)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Float32Array;
  for (let i = 0; i < N; i++) {
    outArr[i * 2 + 0] = inArr[i * 3 + 0]; // X
    outArr[i * 2 + 1] = inArr[i * 3 + 1]; // Y
  }
} else if (fieldOp === 'fieldSwizzle_rgb') {
  // ════════════════════════════════════════════════════════════════
  // fieldSwizzle_rgb: Extract RGB components from color to vec3
  // ════════════════════════════════════════════════════════════════
  if (inputs.length !== 1) {
    throw new Error('fieldSwizzle_rgb requires exactly 1 input (color)');
  }
  const outArr = out as Float32Array;
  const inArr = inputs[0] as Uint8ClampedArray;
  for (let i = 0; i < N; i++) {
    outArr[i * 3 + 0] = inArr[i * 4 + 0] / 255.0; // R
    outArr[i * 3 + 1] = inArr[i * 4 + 1] / 255.0; // G
    outArr[i * 3 + 2] = inArr[i * 4 + 2] / 255.0; // B
  }
}
```

---

## 6. Test Files to Create/Modify

### New tests to add to `/Users/bmf/code/oscilla-animator-v2/src/expr/__tests__/typecheck.test.ts`:

```typescript
describe('Component Access', () => {
  it('vec3.x types as float', () => {
    const ast = parse(tokenize('v.x'));
    const env = new Map([['v', VEC3]]);
    const typed = typecheck(ast, { inputs: env });
    expect(typed.type).toBe(FLOAT);
  });

  it('vec3.xy types as vec2', () => {
    const ast = parse(tokenize('v.xy'));
    const env = new Map([['v', VEC3]]);
    const typed = typecheck(ast, { inputs: env });
    expect(typed.type).toBe(VEC2);
  });

  it('color.r types as float', () => {
    const ast = parse(tokenize('c.r'));
    const env = new Map([['c', COLOR]]);
    const typed = typecheck(ast, { inputs: env });
    expect(typed.type).toBe(FLOAT);
  });

  it('color.rgb types as vec3', () => {
    const ast = parse(tokenize('c.rgb'));
    const env = new Map([['c', COLOR]]);
    const typed = typecheck(ast, { inputs: env });
    expect(typed.type).toBe(VEC3);
  });

  it('vec3.w throws error', () => {
    const ast = parse(tokenize('v.w'));
    const env = new Map([['v', VEC3]]);
    expect(() => typecheck(ast, { inputs: env })).toThrow(/no component 'w'/);
  });

  it('float.x throws error', () => {
    const ast = parse(tokenize('f.x'));
    const env = new Map([['f', FLOAT]]);
    expect(() => typecheck(ast, { inputs: env })).toThrow(/not a vector type/);
  });
});
```

---

## 7. Export from Index

**File to modify:** `/Users/bmf/code/oscilla-animator-v2/src/expr/index.ts`

Add export for swizzle utilities if needed by external code:

```typescript
// Swizzle utilities (optional export for advanced use cases)
export {
  isValidSwizzle,
  swizzleResultType,
  validateSwizzle,
  componentIndex,
} from './swizzle';
```

---

## Implementation Order

1. Create `src/expr/swizzle.ts` with type utilities
2. Add signal kernels to `SignalEvaluator.ts`
3. Update `typecheck.ts` with component access logic
4. Update `compile.ts` with component compilation
5. Add field kernels to `FieldKernels.ts`
6. Add tests
7. Run `npm run test` to verify

## Key Patterns to Follow

- **Existing pattern for member access:** See `typecheckMemberAccess` in typecheck.ts
- **Existing pattern for signal kernels:** See `applySignalKernel` in SignalEvaluator.ts
- **Existing pattern for field kernels:** See `applyFieldKernel` in FieldKernels.ts
- **Type checking pattern:** Type-check children first, then validate and compute result type
