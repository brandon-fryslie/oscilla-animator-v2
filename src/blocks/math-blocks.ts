/**
 * Math Blocks
 *
 * Blocks that perform mathematical operations on signals.
 */

import { registerBlock, STANDARD_NUMERIC_PAYLOADS } from './registry';
import { signalType } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// Add
// =============================================================================

registerBlock({
  type: 'Add',
  label: 'Add',
  category: 'math',
  description: 'Adds two signals',
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
    a: { label: 'A', type: signalType('float') },
    b: { label: 'B', type: signalType('float') },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'sig' || !b || b.k !== 'sig') {
      throw new Error('Add inputs must be signals');
    }

    const addFn = ctx.b.opcode(OpCode.Add);
    const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], addFn, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// Subtract
// =============================================================================

registerBlock({
  type: 'Subtract',
  label: 'Subtract',
  category: 'math',
  description: 'Subtracts two signals',
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
    a: { label: 'A', type: signalType('float') },
    b: { label: 'B', type: signalType('float') },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'sig' || !b || b.k !== 'sig') {
      throw new Error('Subtract inputs must be signals');
    }

    const subFn = ctx.b.opcode(OpCode.Sub);
    const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], subFn, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// Multiply
// =============================================================================

registerBlock({
  type: 'Multiply',
  label: 'Multiply',
  category: 'math',
  description: 'Multiplies two signals',
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
    a: { label: 'A', type: signalType('float') },
    b: { label: 'B', type: signalType('float') },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'sig' || !b || b.k !== 'sig') {
      throw new Error('Multiply inputs must be signals');
    }

    const mulFn = ctx.b.opcode(OpCode.Mul);
    const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], mulFn, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// Divide
// =============================================================================

registerBlock({
  type: 'Divide',
  label: 'Divide',
  category: 'math',
  description: 'Divides two signals',
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
    a: { label: 'A', type: signalType('float') },
    b: { label: 'B', type: signalType('float') },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'sig' || !b || b.k !== 'sig') {
      throw new Error('Divide inputs must be signals');
    }

    const divFn = ctx.b.opcode(OpCode.Div);
    const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], divFn, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
  },
});

// =============================================================================
// Modulo
// =============================================================================

registerBlock({
  type: 'Modulo',
  label: 'Modulo',
  category: 'math',
  description: 'Computes modulo of two signals',
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
    a: { label: 'A', type: signalType('float') },
    b: { label: 'B', type: signalType('float') },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const a = inputsById.a;
    const b = inputsById.b;

    if (!a || a.k !== 'sig' || !b || b.k !== 'sig') {
      throw new Error('Modulo inputs must be signals');
    }

    const modFn = ctx.b.opcode(OpCode.Mod);
    const sigId = ctx.b.sigZip([a.id as SigExprId, b.id as SigExprId], modFn, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot },
      },
    };
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
    x: { label: 'X', type: signalType('float') },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
  },
  lower: ({ ctx, inputsById }) => {
    const x = inputsById.x;
    if (!x || x.k !== 'sig') {
      throw new Error('Noise x input must be a signal');
    }

    // Use Hash opcode with fixed seed=0 for deterministic noise
    const seedId = ctx.b.sigConst(0, signalType('float'));
    const hashFn = ctx.b.opcode(OpCode.Hash);
    const hashId = ctx.b.sigZip([x.id as SigExprId, seedId], hashFn, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: hashId, slot },
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
    x: { label: 'X', type: signalType('float') },
    y: { label: 'Y', type: signalType('float') },
    z: { label: 'Z', type: signalType('float'), optional: true },
  },
  outputs: {
    out: { label: 'Output', type: signalType('float') },
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

    const x2 = ctx.b.sigZip([x.id as SigExprId, x.id as SigExprId], mulFn, signalType('float'));
    const y2 = ctx.b.sigZip([y.id as SigExprId, y.id as SigExprId], mulFn, signalType('float'));
    let sumSq = ctx.b.sigZip([x2, y2], addFn, signalType('float'));

    if (z && z.k === 'sig') {
      const z2 = ctx.b.sigZip([z.id as SigExprId, z.id as SigExprId], mulFn, signalType('float'));
      sumSq = ctx.b.sigZip([sumSq, z2], addFn, signalType('float'));
    }

    const lengthId = ctx.b.sigMap(sumSq, sqrtFn, signalType('float'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: lengthId, slot },
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
    x: { label: 'X', type: signalType('float') },
    y: { label: 'Y', type: signalType('float') },
    z: { label: 'Z', type: signalType('float'), optional: true },
  },
  outputs: {
    outX: { label: 'X', type: signalType('float') },
    outY: { label: 'Y', type: signalType('float') },
    outZ: { label: 'Z', type: signalType('float') },
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
    const x2 = ctx.b.sigZip([x.id as SigExprId, x.id as SigExprId], mulFn, signalType('float'));
    const y2 = ctx.b.sigZip([y.id as SigExprId, y.id as SigExprId], mulFn, signalType('float'));
    let sumSq = ctx.b.sigZip([x2, y2], addFn, signalType('float'));

    const hasZ = z && z.k === 'sig';
    if (hasZ) {
      const z2 = ctx.b.sigZip([z.id as SigExprId, z.id as SigExprId], mulFn, signalType('float'));
      sumSq = ctx.b.sigZip([sumSq, z2], addFn, signalType('float'));
    }

    const lengthId = ctx.b.sigMap(sumSq, sqrtFn, signalType('float'));

    // Guard against division by zero: use max(length, epsilon)
    const epsilon = ctx.b.sigConst(1e-10, signalType('float'));
    const safeLengthId = ctx.b.sigZip([lengthId, epsilon], maxFn, signalType('float'));

    // Divide each component by length
    const outXId = ctx.b.sigZip([x.id as SigExprId, safeLengthId], divFn, signalType('float'));
    const outYId = ctx.b.sigZip([y.id as SigExprId, safeLengthId], divFn, signalType('float'));

    let outZId: SigExprId;
    if (hasZ) {
      outZId = ctx.b.sigZip([z.id as SigExprId, safeLengthId], divFn, signalType('float'));
    } else {
      outZId = ctx.b.sigConst(0, signalType('float'));
    }

    const slotX = ctx.b.allocSlot();
    const slotY = ctx.b.allocSlot();
    const slotZ = ctx.b.allocSlot();

    return {
      outputsById: {
        outX: { k: 'sig', id: outXId, slot: slotX },
        outY: { k: 'sig', id: outYId, slot: slotY },
        outZ: { k: 'sig', id: outZId, slot: slotZ },
      },
    };
  },
});
