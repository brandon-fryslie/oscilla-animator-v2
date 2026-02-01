/**
 * Math Blocks
 *
 * Blocks that perform mathematical operations on signals and fields.
 * All binary blocks are cardinality-polymorphic via alignInputs().
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from './registry';
import { canonicalType, strideOf, floatConst } from '../core/canonical-types';
import { FLOAT } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';
import { alignInputs } from './lower-utils';

// =============================================================================
// Helper: binary math block lower function factory
// =============================================================================

function binaryMathLower(opName: string, opCode: OpCode) {
  return ({ ctx, inputsById }: { ctx: any; inputsById: any }) => {
    const a = inputsById.a;
    const b = inputsById.b;
    if (!a || !b) throw new Error(`${opName} requires both inputs`);

    const outType = ctx.outTypes[0];
    const [aId, bId] = alignInputs(a.id, a.type, b.id, b.type, outType, ctx.b);
    const resultId = ctx.b.kernelZip([aId, bId], ctx.b.opcode(opCode), outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: resultId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  };
}

// Shared cardinality + payload config for binary math blocks
const BINARY_MATH_CONFIG = {
  form: 'primitive' as const,
  capability: 'pure' as const,
  cardinality: {
    cardinalityMode: 'preserve' as const,
    laneCoupling: 'laneLocal' as const,
    broadcastPolicy: 'allowZipSig' as const,
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      out: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise' as const,
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
};

// =============================================================================
// Add
// =============================================================================

registerBlock({
  type: 'Add',
  label: 'Add',
  category: 'math',
  description: 'Adds two numbers (signals or fields)',
  ...BINARY_MATH_CONFIG,
  lower: binaryMathLower('Add', OpCode.Add),
});

// =============================================================================
// Subtract
// =============================================================================

registerBlock({
  type: 'Subtract',
  label: 'Subtract',
  category: 'math',
  description: 'Subtracts two numbers (signals or fields)',
  ...BINARY_MATH_CONFIG,
  lower: binaryMathLower('Subtract', OpCode.Sub),
});

// =============================================================================
// Multiply
// =============================================================================

registerBlock({
  type: 'Multiply',
  label: 'Multiply',
  category: 'math',
  description: 'Multiplies two numbers (signals or fields)',
  ...BINARY_MATH_CONFIG,
  lower: binaryMathLower('Multiply', OpCode.Mul),
});

// =============================================================================
// Divide
// =============================================================================

registerBlock({
  type: 'Divide',
  label: 'Divide',
  category: 'math',
  description: 'Divides two numbers (signals or fields)',
  ...BINARY_MATH_CONFIG,
  lower: binaryMathLower('Divide', OpCode.Div),
});

// =============================================================================
// Modulo
// =============================================================================

registerBlock({
  type: 'Modulo',
  label: 'Modulo',
  category: 'math',
  description: 'Computes modulo of two numbers (signals or fields)',
  ...BINARY_MATH_CONFIG,
  lower: binaryMathLower('Modulo', OpCode.Mod),
});

// =============================================================================
// Noise
// =============================================================================

registerBlock({
  type: 'Noise',
  label: 'Noise',
  category: 'math',
  description: 'Deterministic procedural noise. Output in [0, 1)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    x: { label: 'X', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const x = inputsById.x;
    if (!x) throw new Error('Noise x input is required');

    // Use Hash opcode with fixed seed=0 for deterministic noise
    const outType = ctx.outTypes[0];
    const seedId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.kernelZip([x.id, seedId], hashFn, outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: hashId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Length
// =============================================================================

registerBlock({
  type: 'Length',
  label: 'Length',
  category: 'math',
  description: 'Euclidean length (magnitude) of a 2D or 3D vector',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    x: { label: 'X', type: canonicalType(FLOAT) },
    y: { label: 'Y', type: canonicalType(FLOAT) },
    z: { label: 'Z', type: canonicalType(FLOAT), optional: true },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const x = inputsById.x;
    const y = inputsById.y;
    const z = inputsById.z;
    if (!x || !y) throw new Error('Length requires x and y inputs');

    const outType = ctx.outTypes[0];
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);

    // x² + y² [+ z²] → sqrt
    const x2 = ctx.b.kernelZip([x.id, x.id], mulFn, outType);
    const y2 = ctx.b.kernelZip([y.id, y.id], mulFn, outType);
    let sumSq = ctx.b.kernelZip([x2, y2], addFn, outType);

    if (z) {
      const z2 = ctx.b.kernelZip([z.id, z.id], mulFn, outType);
      sumSq = ctx.b.kernelZip([sumSq, z2], addFn, outType);
    }

    const lengthId = ctx.b.kernelMap(sumSq, sqrtFn, outType);
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { id: lengthId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Normalize
// =============================================================================

registerBlock({
  type: 'Normalize',
  label: 'Normalize',
  category: 'math',
  description: 'Normalize a 2D or 3D vector to unit length',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    x: { label: 'X', type: canonicalType(FLOAT) },
    y: { label: 'Y', type: canonicalType(FLOAT) },
    z: { label: 'Z', type: canonicalType(FLOAT), optional: true },
  },
  outputs: {
    outX: { label: 'X', type: canonicalType(FLOAT) },
    outY: { label: 'Y', type: canonicalType(FLOAT) },
    outZ: { label: 'Z', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const x = inputsById.x;
    const y = inputsById.y;
    const z = inputsById.z;
    if (!x || !y) throw new Error('Normalize requires x and y inputs');

    const outTypeX = ctx.outTypes[0];
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);
    const divFn = ctx.b.opcode(OpCode.Div);
    const maxFn = ctx.b.opcode(OpCode.Max);

    // length = sqrt(x² + y² [+ z²])
    const x2 = ctx.b.kernelZip([x.id, x.id], mulFn, outTypeX);
    const y2 = ctx.b.kernelZip([y.id, y.id], mulFn, outTypeX);
    let sumSq = ctx.b.kernelZip([x2, y2], addFn, outTypeX);

    if (z) {
      const z2 = ctx.b.kernelZip([z.id, z.id], mulFn, outTypeX);
      sumSq = ctx.b.kernelZip([sumSq, z2], addFn, outTypeX);
    }

    const lengthId = ctx.b.kernelMap(sumSq, sqrtFn, outTypeX);

    // Guard against division by zero
    const epsilon = ctx.b.constant(floatConst(1e-10), canonicalType(FLOAT));
    const safeLengthId = ctx.b.kernelZip([lengthId, epsilon], maxFn, outTypeX);

    // Divide each component by length
    const outXId = ctx.b.kernelZip([x.id, safeLengthId], divFn, outTypeX);
    const outYId = ctx.b.kernelZip([y.id, safeLengthId], divFn, outTypeX);

    let outZId;
    if (z) {
      outZId = ctx.b.kernelZip([z.id, safeLengthId], divFn, outTypeX);
    } else {
      outZId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    }

    const outTypeY = ctx.outTypes[1];
    const outTypeZ = ctx.outTypes[2];
    const slotX = ctx.b.allocSlot();
    const slotY = ctx.b.allocSlot();
    const slotZ = ctx.b.allocSlot();

    return {
      outputsById: {
        outX: { id: outXId, slot: slotX, type: outTypeX, stride: strideOf(outTypeX.payload) },
        outY: { id: outYId, slot: slotY, type: outTypeY, stride: strideOf(outTypeY.payload) },
        outZ: { id: outZId, slot: slotZ, type: outTypeZ, stride: strideOf(outTypeZ.payload) },
      },
    };
  },
});
