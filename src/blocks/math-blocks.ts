/**
 * Math Blocks
 *
 * Blocks that perform mathematical operations on signals.
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, strideOf, floatConst, requireInst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';

// =============================================================================
// Add
// =============================================================================

registerBlock({
  type: 'Add',
  label: 'Add',
  category: 'math',
  description: 'Adds two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      out: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || !b) {
      throw new Error('Add requires both expression inputs');
    }

    const aCard = requireInst(a.type.extent.cardinality, 'cardinality');
    const bCard = requireInst(b.type.extent.cardinality, 'cardinality');
    const isAField = aCard.kind === 'many';
    const isBField = bCard.kind === 'many';

    // Signal path
    if (!isAField && !isBField) {
      const addFn = ctx.b.opcode(OpCode.Add);
      const sigId = ctx.b.kernelZip([a.id, b.id], addFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path (or mixed signal/field with broadcast)
    if (isAField || isBField) {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField;
      if (isAField) {
        aField = a.id;
      } else {
        aField = ctx.b.broadcast(a.id, floatFieldType);
      }

      let bField;
      if (isBField) {
        bField = b.id;
      } else {
        bField = ctx.b.broadcast(b.id, floatFieldType);
      }

      const addFn = ctx.b.kernel('fieldAdd');
      const fieldId = ctx.b.kernelZip([aField, bField], addFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }

    throw new Error('Add: Invalid input types');
  },
});

// =============================================================================
// Subtract
// =============================================================================

registerBlock({
  type: 'Subtract',
  label: 'Subtract',
  category: 'math',
  description: 'Subtracts two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      out: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || !b) {
      throw new Error('Subtract requires both expression inputs');
    }

    const aCard = requireInst(a.type.extent.cardinality, 'cardinality');
    const bCard = requireInst(b.type.extent.cardinality, 'cardinality');
    const isAField = aCard.kind === 'many';
    const isBField = bCard.kind === 'many';

    // Signal path
    if (!isAField && !isBField) {
      const subFn = ctx.b.opcode(OpCode.Sub);
      const sigId = ctx.b.kernelZip([a.id, b.id], subFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (isAField || isBField) {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField;
      if (isAField) {
        aField = a.id;
      } else {
        aField = ctx.b.broadcast(a.id, floatFieldType);
      }

      let bField;
      if (isBField) {
        bField = b.id;
      } else {
        bField = ctx.b.broadcast(b.id, floatFieldType);
      }

      const subFn = ctx.b.kernel('fieldSubtract');
      const fieldId = ctx.b.kernelZip([aField, bField], subFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }

    throw new Error('Subtract: Invalid input types');
  },
});

// =============================================================================
// Multiply
// =============================================================================

registerBlock({
  type: 'Multiply',
  label: 'Multiply',
  category: 'math',
  description: 'Multiplies two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      out: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || !b) {
      throw new Error('Multiply requires both expression inputs');
    }

    const aCard = requireInst(a.type.extent.cardinality, 'cardinality');
    const bCard = requireInst(b.type.extent.cardinality, 'cardinality');
    const isAField = aCard.kind === 'many';
    const isBField = bCard.kind === 'many';

    // Signal path
    if (!isAField && !isBField) {
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const sigId = ctx.b.kernelZip([a.id, b.id], mulFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (isAField || isBField) {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField;
      if (isAField) {
        aField = a.id;
      } else {
        aField = ctx.b.broadcast(a.id, floatFieldType);
      }

      let bField;
      if (isBField) {
        bField = b.id;
      } else {
        bField = ctx.b.broadcast(b.id, floatFieldType);
      }

      const mulFn = ctx.b.kernel('fieldMultiply');
      const fieldId = ctx.b.kernelZip([aField, bField], mulFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }

    throw new Error('Multiply: Invalid input types');
  },
});

// =============================================================================
// Divide
// =============================================================================

registerBlock({
  type: 'Divide',
  label: 'Divide',
  category: 'math',
  description: 'Divides two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      out: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || !b) {
      throw new Error('Divide requires both expression inputs');
    }

    const aCard = requireInst(a.type.extent.cardinality, 'cardinality');
    const bCard = requireInst(b.type.extent.cardinality, 'cardinality');
    const isAField = aCard.kind === 'many';
    const isBField = bCard.kind === 'many';

    // Signal path
    if (!isAField && !isBField) {
      const divFn = ctx.b.opcode(OpCode.Div);
      const sigId = ctx.b.kernelZip([a.id, b.id], divFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (isAField || isBField) {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField;
      if (isAField) {
        aField = a.id;
      } else {
        aField = ctx.b.broadcast(a.id, floatFieldType);
      }

      let bField;
      if (isBField) {
        bField = b.id;
      } else {
        bField = ctx.b.broadcast(b.id, floatFieldType);
      }

      const divFn = ctx.b.kernel('fieldDivide');
      const fieldId = ctx.b.kernelZip([aField, bField], divFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }

    throw new Error('Divide: Invalid input types');
  },
});

// =============================================================================
// Modulo
// =============================================================================

registerBlock({
  type: 'Modulo',
  label: 'Modulo',
  category: 'math',
  description: 'Computes modulo of two numbers (signals or fields)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      a: STANDARD_NUMERIC_PAYLOADS,
      b: STANDARD_NUMERIC_PAYLOADS,
      out: STANDARD_NUMERIC_PAYLOADS,
    },
    semantics: 'componentwise',
  },
  inputs: {
    a: { label: 'A', type: canonicalType(FLOAT) },
    b: { label: 'B', type: canonicalType(FLOAT) },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(FLOAT) },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || !b) {
      throw new Error('Modulo requires both expression inputs');
    }

    const aCard = requireInst(a.type.extent.cardinality, 'cardinality');
    const bCard = requireInst(b.type.extent.cardinality, 'cardinality');
    const isAField = aCard.kind === 'many';
    const isBField = bCard.kind === 'many';

    // Signal path
    if (!isAField && !isBField) {
      const modFn = ctx.b.opcode(OpCode.Mod);
      const sigId = ctx.b.kernelZip([a.id, b.id], modFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (isAField || isBField) {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField;
      if (isAField) {
        aField = a.id;
      } else {
        aField = ctx.b.broadcast(a.id, floatFieldType);
      }

      let bField;
      if (isBField) {
        bField = b.id;
      } else {
        bField = ctx.b.broadcast(b.id, floatFieldType);
      }

      const modFn = ctx.b.kernel('fieldModulo');
      const fieldId = ctx.b.kernelZip([aField, bField], modFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
        },
        instanceContext: ctx.inferredInstance,
      };
    }

    throw new Error('Modulo: Invalid input types');
  },
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
    if (!x) {
      throw new Error('Noise x input is required');
    }

    const xCard = requireInst(x.type.extent.cardinality, 'cardinality');
    if (xCard.kind === 'many') {
      throw new Error('Noise x input must be a signal');
    }

    // Use Hash opcode with fixed seed=0 for deterministic noise
    const seedId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.kernelZip([x.id, seedId], hashFn, canonicalType(FLOAT));
    const outType = ctx.outTypes[0];
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

    if (!x || !y) {
      throw new Error('Length requires x and y inputs');
    }

    const xCard = requireInst(x.type.extent.cardinality, 'cardinality');
    const yCard = requireInst(y.type.extent.cardinality, 'cardinality');
    if (xCard.kind === 'many' || yCard.kind === 'many') {
      throw new Error('Length requires signal inputs');
    }

    // Compute x² + y² [+ z²]
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);

    const x2 = ctx.b.kernelZip([x.id, x.id], mulFn, canonicalType(FLOAT));
    const y2 = ctx.b.kernelZip([y.id, y.id], mulFn, canonicalType(FLOAT));
    let sumSq = ctx.b.kernelZip([x2, y2], addFn, canonicalType(FLOAT));

    if (z) {
      const zCard = requireInst(z.type.extent.cardinality, 'cardinality');
      if (zCard.kind !== 'many') {
        const z2 = ctx.b.kernelZip([z.id, z.id], mulFn, canonicalType(FLOAT));
        sumSq = ctx.b.kernelZip([sumSq, z2], addFn, canonicalType(FLOAT));
      }
    }

    const lengthId = ctx.b.kernelMap(sumSq, sqrtFn, canonicalType(FLOAT));
    const outType = ctx.outTypes[0];
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

    if (!x || !y) {
      throw new Error('Normalize requires x and y inputs');
    }

    const xCard = requireInst(x.type.extent.cardinality, 'cardinality');
    const yCard = requireInst(y.type.extent.cardinality, 'cardinality');
    if (xCard.kind === 'many' || yCard.kind === 'many') {
      throw new Error('Normalize requires signal inputs');
    }

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);
    const divFn = ctx.b.opcode(OpCode.Div);
    const maxFn = ctx.b.opcode(OpCode.Max);

    // Compute length = sqrt(x² + y² [+ z²])
    const x2 = ctx.b.kernelZip([x.id, x.id], mulFn, canonicalType(FLOAT));
    const y2 = ctx.b.kernelZip([y.id, y.id], mulFn, canonicalType(FLOAT));
    let sumSq = ctx.b.kernelZip([x2, y2], addFn, canonicalType(FLOAT));

    const hasZ = z && requireInst(z.type.extent.cardinality, 'cardinality').kind !== 'many';
    if (hasZ) {
      const z2 = ctx.b.kernelZip([z.id, z.id], mulFn, canonicalType(FLOAT));
      sumSq = ctx.b.kernelZip([sumSq, z2], addFn, canonicalType(FLOAT));
    }

    const lengthId = ctx.b.kernelMap(sumSq, sqrtFn, canonicalType(FLOAT));

    // Guard against division by zero: use max(length, epsilon)
    const epsilon = ctx.b.constant(floatConst(1e-10), canonicalType(FLOAT));
    const safeLengthId = ctx.b.kernelZip([lengthId, epsilon], maxFn, canonicalType(FLOAT));

    // Divide each component by length
    const outXId = ctx.b.kernelZip([x.id, safeLengthId], divFn, canonicalType(FLOAT));
    const outYId = ctx.b.kernelZip([y.id, safeLengthId], divFn, canonicalType(FLOAT));

    let outZId;
    if (hasZ && z) {
      outZId = ctx.b.kernelZip([z.id, safeLengthId], divFn, canonicalType(FLOAT));
    } else {
      outZId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
    }

    const outTypeX = ctx.outTypes[0];
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
