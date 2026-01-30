/**
 * Math Blocks
 *
 * Blocks that perform mathematical operations on signals.
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from './registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../core/ids';
import { canonicalType, canonicalField, strideOf, floatConst } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';
import type { SigExprId, FieldExprId } from '../compiler/ir/Indices';

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
      throw new Error('Add requires both inputs');
    }

    // Signal path
    if (a.k === 'sig' && b.k === 'sig') {
      const addFn = ctx.b.opcode(OpCode.Add);
      const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], addFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path (or mixed signal/field with broadcast)
    if (a.k === 'field' || b.k === 'field') {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField: FieldExprId;
      if (a.k === 'field') {
        aField = a.id;
      } else if (a.k === 'sig') {
        aField = ctx.b.Broadcast(a.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Add field path');
      }

      let bField: FieldExprId;
      if (b.k === 'field') {
        bField = b.id;
      } else if (b.k === 'sig') {
        bField = ctx.b.Broadcast(b.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Add field path');
      }

      const addFn = ctx.b.kernel('fieldAdd');
      const fieldId = ctx.b.fieldZip([aField as FieldExprId, bField as FieldExprId], addFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
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
      throw new Error('Subtract requires both inputs');
    }

    // Signal path
    if (a.k === 'sig' && b.k === 'sig') {
      const subFn = ctx.b.opcode(OpCode.Sub);
      const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], subFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (a.k === 'field' || b.k === 'field') {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField: FieldExprId;
      if (a.k === 'field') {
        aField = a.id;
      } else if (a.k === 'sig') {
        aField = ctx.b.Broadcast(a.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Subtract field path');
      }

      let bField: FieldExprId;
      if (b.k === 'field') {
        bField = b.id;
      } else if (b.k === 'sig') {
        bField = ctx.b.Broadcast(b.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Subtract field path');
      }

      const subFn = ctx.b.kernel('fieldSubtract');
      const fieldId = ctx.b.fieldZip([aField as FieldExprId, bField as FieldExprId], subFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
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
      throw new Error('Multiply requires both inputs');
    }

    // Signal path
    if (a.k === 'sig' && b.k === 'sig') {
      const mulFn = ctx.b.opcode(OpCode.Mul);
      const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], mulFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (a.k === 'field' || b.k === 'field') {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField: FieldExprId;
      if (a.k === 'field') {
        aField = a.id;
      } else if (a.k === 'sig') {
        aField = ctx.b.Broadcast(a.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Multiply field path');
      }

      let bField: FieldExprId;
      if (b.k === 'field') {
        bField = b.id;
      } else if (b.k === 'sig') {
        bField = ctx.b.Broadcast(b.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Multiply field path');
      }

      const mulFn = ctx.b.kernel('fieldMultiply');
      const fieldId = ctx.b.fieldZip([aField as FieldExprId, bField as FieldExprId], mulFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
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
      throw new Error('Divide requires both inputs');
    }

    // Signal path
    if (a.k === 'sig' && b.k === 'sig') {
      const divFn = ctx.b.opcode(OpCode.Div);
      const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], divFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (a.k === 'field' || b.k === 'field') {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField: FieldExprId;
      if (a.k === 'field') {
        aField = a.id;
      } else if (a.k === 'sig') {
        aField = ctx.b.Broadcast(a.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Divide field path');
      }

      let bField: FieldExprId;
      if (b.k === 'field') {
        bField = b.id;
      } else if (b.k === 'sig') {
        bField = ctx.b.Broadcast(b.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Divide field path');
      }

      const divFn = ctx.b.kernel('fieldDivide');
      const fieldId = ctx.b.fieldZip([aField as FieldExprId, bField as FieldExprId], divFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
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
      throw new Error('Modulo requires both inputs');
    }

    // Signal path
    if (a.k === 'sig' && b.k === 'sig') {
      const modFn = ctx.b.opcode(OpCode.Mod);
      const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], modFn, canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Field path
    if (a.k === 'field' || b.k === 'field') {
      const outType = ctx.outTypes[0];
      const floatFieldType = { ...outType, payload: FLOAT, unit: { kind: 'scalar' as const } };

      let aField: FieldExprId;
      if (a.k === 'field') {
        aField = a.id;
      } else if (a.k === 'sig') {
        aField = ctx.b.Broadcast(a.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Modulo field path');
      }

      let bField: FieldExprId;
      if (b.k === 'field') {
        bField = b.id;
      } else if (b.k === 'sig') {
        bField = ctx.b.Broadcast(b.id, floatFieldType);
      } else {
        throw new Error('Unexpected input type for Modulo field path');
      }

      const modFn = ctx.b.kernel('fieldModulo');
      const fieldId = ctx.b.fieldZip([aField as FieldExprId, bField as FieldExprId], modFn, outType);
      const slot = ctx.b.allocSlot();

      return {
        outputsById: {
          out: { k: 'field', id: fieldId, slot, type: outType, stride: strideOf(outType.payload) },
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
    if (!x || x.k !== 'sig') {
      throw new Error('Noise x input must be a signal');
    }

    // Use Hash opcode with fixed seed=0 for deterministic noise
    const seedId = ctx.b.sigConst(floatConst(0), canonicalType(FLOAT));
    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.sigZip([x.id as SigExprId, seedId], hashFn, canonicalType(FLOAT));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: hashId, slot, type: outType, stride: strideOf(outType.payload) },
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

    if (!x || x.k !== 'sig' || !y || y.k !== 'sig') {
      throw new Error('Length requires x and y signal inputs');
    }

    // Compute x² + y² [+ z²]
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);

    const x2 = ctx.b.sigZip([x.id as SigExprId, x.id as SigExprId], mulFn, canonicalType(FLOAT));
    const y2 = ctx.b.sigZip([y.id as SigExprId, y.id as SigExprId], mulFn, canonicalType(FLOAT));
    let sumSq = ctx.b.sigZip([x2, y2], addFn, canonicalType(FLOAT));

    if (z && z.k === 'sig') {
      const z2 = ctx.b.sigZip([z.id as SigExprId, z.id as SigExprId], mulFn, canonicalType(FLOAT));
      sumSq = ctx.b.sigZip([sumSq, z2], addFn, canonicalType(FLOAT));
    }

    const lengthId = ctx.b.sigMap(sumSq, sqrtFn, canonicalType(FLOAT));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: lengthId, slot, type: outType, stride: strideOf(outType.payload) },
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

    if (!x || x.k !== 'sig' || !y || y.k !== 'sig') {
      throw new Error('Normalize requires x and y signal inputs');
    }

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const addFn = ctx.b.opcode(OpCode.Add);
    const sqrtFn = ctx.b.opcode(OpCode.Sqrt);
    const divFn = ctx.b.opcode(OpCode.Div);
    const maxFn = ctx.b.opcode(OpCode.Max);

    // Compute length = sqrt(x² + y² [+ z²])
    const x2 = ctx.b.sigZip([x.id as SigExprId, x.id as SigExprId], mulFn, canonicalType(FLOAT));
    const y2 = ctx.b.sigZip([y.id as SigExprId, y.id as SigExprId], mulFn, canonicalType(FLOAT));
    let sumSq = ctx.b.sigZip([x2, y2], addFn, canonicalType(FLOAT));

    const hasZ = z && z.k === 'sig';
    if (hasZ) {
      const z2 = ctx.b.sigZip([z.id as SigExprId, z.id as SigExprId], mulFn, canonicalType(FLOAT));
      sumSq = ctx.b.sigZip([sumSq, z2], addFn, canonicalType(FLOAT));
    }

    const lengthId = ctx.b.sigMap(sumSq, sqrtFn, canonicalType(FLOAT));

    // Guard against division by zero: use max(length, epsilon)
    const epsilon = ctx.b.sigConst(floatConst(1e-10), canonicalType(FLOAT));
    const safeLengthId = ctx.b.sigZip([lengthId, epsilon], maxFn, canonicalType(FLOAT));

    // Divide each component by length
    const outXId = ctx.b.sigZip([x.id as SigExprId, safeLengthId], divFn, canonicalType(FLOAT));
    const outYId = ctx.b.sigZip([y.id as SigExprId, safeLengthId], divFn, canonicalType(FLOAT));

    let outZId: SigExprId;
    if (hasZ) {
      outZId = ctx.b.sigZip([z.id as SigExprId, safeLengthId], divFn, canonicalType(FLOAT));
    } else {
      outZId = ctx.b.sigConst(floatConst(0), canonicalType(FLOAT));
    }

    const outTypeX = ctx.outTypes[0];
    const outTypeY = ctx.outTypes[1];
    const outTypeZ = ctx.outTypes[2];
    const slotX = ctx.b.allocSlot();
    const slotY = ctx.b.allocSlot();
    const slotZ = ctx.b.allocSlot();

    return {
      outputsById: {
        outX: { k: 'sig', id: outXId, slot: slotX, type: outTypeX, stride: strideOf(outTypeX.payload) },
        outY: { k: 'sig', id: outYId, slot: slotY, type: outTypeY, stride: strideOf(outTypeY.payload) },
        outZ: { k: 'sig', id: outZId, slot: slotZ, type: outTypeZ, stride: strideOf(outTypeZ.payload) },
      },
    };
  },
});
