/**
 * Math Blocks
 *
 * Blocks that perform mathematical operations on signals.
 */

import { registerBlock } from './registry';
import { registerBlockType } from '../compiler/ir/lowerTypes';
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
  inputs: [
    { id: 'a', label: 'A', type: signalType('float') },
    { id: 'b', label: 'B', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
});

registerBlockType({
  type: 'Add',
  inputs: [
    { portId: 'a', type: signalType('float') },
    { portId: 'b', type: signalType('float') },
  ],
  outputs: [
    { portId: 'out', type: signalType('float') },
  ],
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
  inputs: [
    { id: 'a', label: 'A', type: signalType('float') },
    { id: 'b', label: 'B', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
});

registerBlockType({
  type: 'Subtract',
  inputs: [
    { portId: 'a', type: signalType('float') },
    { portId: 'b', type: signalType('float') },
  ],
  outputs: [
    { portId: 'out', type: signalType('float') },
  ],
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
  inputs: [
    { id: 'a', label: 'A', type: signalType('float') },
    { id: 'b', label: 'B', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
});

registerBlockType({
  type: 'Multiply',
  inputs: [
    { portId: 'a', type: signalType('float') },
    { portId: 'b', type: signalType('float') },
  ],
  outputs: [
    { portId: 'out', type: signalType('float') },
  ],
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
  inputs: [
    { id: 'a', label: 'A', type: signalType('float') },
    { id: 'b', label: 'B', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
});

registerBlockType({
  type: 'Divide',
  inputs: [
    { portId: 'a', type: signalType('float') },
    { portId: 'b', type: signalType('float') },
  ],
  outputs: [
    { portId: 'out', type: signalType('float') },
  ],
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
  inputs: [
    { id: 'a', label: 'A', type: signalType('float') },
    { id: 'b', label: 'B', type: signalType('float') },
  ],
  outputs: [
    { id: 'out', label: 'Output', type: signalType('float') },
  ],
});

registerBlockType({
  type: 'Modulo',
  inputs: [
    { portId: 'a', type: signalType('float') },
    { portId: 'b', type: signalType('float') },
  ],
  outputs: [
    { portId: 'out', type: signalType('float') },
  ],
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
