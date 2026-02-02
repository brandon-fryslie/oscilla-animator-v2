/**
 * Tests for varargs validation pass
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { pass4Varargs, type VarargError } from '../../../compiler/frontend/normalize-varargs';
import { PatchBuilder } from '../../Patch';
import { registerBlock, type BlockDef } from '../../../blocks/registry';
import { addressToString } from '../../../types/canonical-address';
import { getOutputAddress, getInputAddress } from '../../addressing';
import { canonicalType, unitScalar, contractClamp01 } from '../../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../../core/canonical-types';

// Register test blocks
beforeAll(() => {
  const varargBlockDef: BlockDef = {
    type: 'test.VarargPass',
    label: 'Test Vararg',
    category: 'test',
    form: 'primitive',
    capability: 'pure',
    inputs: {
      values: {
        type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()),
        isVararg: true,
        varargConstraint: {
          payloadType: FLOAT,
          cardinalityConstraint: 'any',
        },
      },
    },
    outputs: {
      result: {
        type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()),
      },
    },
    lower: () => ({ outputsById: {} }),
  };

  const constrainedVarargDef: BlockDef = {
    type: 'test.ConstrainedVararg',
    label: 'Test Constrained Vararg',
    category: 'test',
    form: 'primitive',
    capability: 'pure',
    inputs: {
      values: {
        type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()),
        isVararg: true,
        varargConstraint: {
          payloadType: FLOAT,
          cardinalityConstraint: 'any',
          minConnections: 2,
          maxConnections: 5,
        },
      },
    },
    outputs: {
      result: {
        type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()),
      },
    },
    lower: () => ({ outputsById: {} }),
  };

  const constBlockDef: BlockDef = {
    type: 'test.ConstPass',
    label: 'Test Const',
    category: 'test',
    form: 'primitive',
    capability: 'pure',
    inputs: {},
    outputs: {
      value: {
        type: canonicalType(FLOAT, unitScalar(), undefined, contractClamp01()),
      },
    },
    lower: () => ({ outputsById: {} }),
  };

  try {
    registerBlock(varargBlockDef);
    registerBlock(constrainedVarargDef);
    registerBlock(constBlockDef);
  } catch (e) {
    // Blocks may already be registered
  }
});

describe('pass4Varargs', () => {
  describe('valid patches', () => {
    it('passes patch with valid vararg connections', () => {
      const builder = new PatchBuilder();
      const const1 = builder.addBlock('test.ConstPass');
      const const2 = builder.addBlock('test.ConstPass');
      const vararg = builder.addBlock('test.VarargPass');

      // Build patch to get blocks with proper structure
      const tempPatch = builder.build();
      const const1Block = tempPatch.blocks.get(const1)!;
      const const2Block = tempPatch.blocks.get(const2)!;

      // Get proper addresses
      const addr1 = addressToString(getOutputAddress(const1Block, 'value' as any));
      const addr2 = addressToString(getOutputAddress(const2Block, 'value' as any));

      // Rebuild with proper addresses
      const builder2 = new PatchBuilder();
      const c1 = builder2.addBlock('test.ConstPass');
      const c2 = builder2.addBlock('test.ConstPass');
      const v = builder2.addBlock('test.VarargPass');

      const patch2 = builder2.build();
      const c1Block = patch2.blocks.get(c1)!;
      const c2Block = patch2.blocks.get(c2)!;

      builder2.addVarargConnection(v, 'values', addressToString(getOutputAddress(c1Block, 'value' as any)), 0);
      builder2.addVarargConnection(v, 'values', addressToString(getOutputAddress(c2Block, 'value' as any)), 1);

      const patch = builder2.build();
      const result = pass4Varargs(patch);

      if (result.kind === 'error') {
        console.log('Errors:', result.errors);
      }
      expect(result.kind).toBe('ok');
      expect(result.errors).toHaveLength(0);
    });

    it('passes patch with zero vararg connections', () => {
      const builder = new PatchBuilder();
      const vararg = builder.addBlock('test.VarargPass');

      const patch = builder.build();
      const result = pass4Varargs(patch);

      expect(result.kind).toBe('ok');
      expect(result.errors).toHaveLength(0);
    });

    it('passes patch with normal blocks (no varargs)', () => {
      const builder = new PatchBuilder();
      const const1 = builder.addBlock('test.ConstPass');
      const const2 = builder.addBlock('test.ConstPass');

      const patch = builder.build();
      const result = pass4Varargs(patch);

      expect(result.kind).toBe('ok');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid addresses', () => {
    it('errors on nonexistent block address', () => {
      const builder = new PatchBuilder();
      const vararg = builder.addBlock('test.VarargPass');

      builder.addVarargConnection(vararg, 'values', 'v1:blocks.nonexistent.outputs.value', 0);

      const patch = builder.build();
      const result = pass4Varargs(patch);

      expect(result.kind).toBe('error');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('InvalidAddress');
      expect(result.errors[0].message).toContain('invalid address');
    });

    it('errors on nonexistent port address', () => {
      const builder = new PatchBuilder();
      const const1 = builder.addBlock('test.ConstPass');
      const vararg = builder.addBlock('test.VarargPass');

      const patch = builder.build();
      const const1Block = patch.blocks.get(const1)!;

      // Invalid port name
      const invalidAddr = `v1:blocks.${const1Block.displayName || const1}.outputs.nonexistent`;

      builder.addVarargConnection(vararg, 'values', invalidAddr, 0);
      const patch2 = builder.build();
      const result = pass4Varargs(patch2);

      expect(result.kind).toBe('error');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('InvalidAddress');
    });

    it('errors on input address (must be output)', () => {
      const builder = new PatchBuilder();
      const vararg1 = builder.addBlock('test.VarargPass');
      const vararg2 = builder.addBlock('test.VarargPass');

      const patch = builder.build();
      const vararg1Block = patch.blocks.get(vararg1)!;

      // Try to connect to an input port (not allowed)
      const inputAddr = addressToString(getInputAddress(vararg1Block, 'values' as any));

      builder.addVarargConnection(vararg2, 'values', inputAddr, 0);
      const patch2 = builder.build();
      const result = pass4Varargs(patch2);

      expect(result.kind).toBe('error');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('InvalidAddress');
      expect(result.errors[0].message).toContain('must reference an output');
    });
  });

  describe('connection limits', () => {
    it('errors on too few connections', () => {
      const builder = new PatchBuilder();
      const const1 = builder.addBlock('test.ConstPass');
      const vararg = builder.addBlock('test.ConstrainedVararg'); // Requires min 2

      const patch = builder.build();
      const const1Block = patch.blocks.get(const1)!;
      const addr = addressToString(getOutputAddress(const1Block, 'value' as any));

      builder.addVarargConnection(vararg, 'values', addr, 0);
      const patch2 = builder.build();
      const result = pass4Varargs(patch2);

      expect(result.kind).toBe('error');
      const limitErrors = result.errors.filter(e => e.code === 'ConnectionLimit');
      expect(limitErrors).toHaveLength(1);
      expect(limitErrors[0].message).toContain('at least 2');
    });

    it('errors on too many connections', () => {
      const builder = new PatchBuilder();
      const vararg = builder.addBlock('test.ConstrainedVararg'); // Max 5

      const constIds = [];
      for (let i = 0; i < 6; i++) {
        constIds.push(builder.addBlock('test.ConstPass'));
      }

      const patch = builder.build();

      // Add 6 connections
      for (let i = 0; i < 6; i++) {
        const constBlock = patch.blocks.get(constIds[i])!;
        const addr = addressToString(getOutputAddress(constBlock, 'value' as any));
        builder.addVarargConnection(vararg, 'values', addr, i);
      }

      const patch2 = builder.build();
      const result = pass4Varargs(patch2);

      expect(result.kind).toBe('error');
      const limitErrors = result.errors.filter(e => e.code === 'ConnectionLimit');
      expect(limitErrors).toHaveLength(1);
      expect(limitErrors[0].message).toContain('at most 5');
    });

    it('passes with connections within limits', () => {
      const builder = new PatchBuilder();
      const vararg = builder.addBlock('test.ConstrainedVararg'); // Min 2, max 5

      const constIds = [];
      for (let i = 0; i < 3; i++) {
        constIds.push(builder.addBlock('test.ConstPass'));
      }

      const patch = builder.build();

      // Add 3 connections (within limits)
      for (let i = 0; i < 3; i++) {
        const constBlock = patch.blocks.get(constIds[i])!;
        const addr = addressToString(getOutputAddress(constBlock, 'value' as any));
        builder.addVarargConnection(vararg, 'values', addr, i);
      }

      const patch2 = builder.build();
      const result = pass4Varargs(patch2);

      if (result.kind === 'error') {
        console.log('Errors:', result.errors);
      }
      expect(result.kind).toBe('ok');
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('error details', () => {
    it('includes block and port in error where clause', () => {
      const builder = new PatchBuilder();
      const vararg = builder.addBlock('test.VarargPass');

      builder.addVarargConnection(vararg, 'values', 'v1:blocks.invalid.outputs.value', 0);

      const patch = builder.build();
      const result = pass4Varargs(patch);

      expect(result.kind).toBe('error');
      expect(result.errors[0].where.blockId).toBe(vararg);
      expect(result.errors[0].where.portId).toBe('values');
    });

    it('includes connection index for specific connection errors', () => {
      const builder = new PatchBuilder();
      const const1 = builder.addBlock('test.ConstPass');
      const vararg = builder.addBlock('test.VarargPass');

      const patch = builder.build();
      const const1Block = patch.blocks.get(const1)!;
      const addr = addressToString(getOutputAddress(const1Block, 'value' as any));

      builder.addVarargConnection(vararg, 'values', addr, 0);
      builder.addVarargConnection(vararg, 'values', 'v1:blocks.invalid.outputs.value', 1); // Invalid

      const patch2 = builder.build();
      const result = pass4Varargs(patch2);

      expect(result.kind).toBe('error');
      const addrErrors = result.errors.filter(e => e.code === 'InvalidAddress');
      expect(addrErrors[0].where.connectionIndex).toBe(1);
    });
  });

  describe('multiple errors', () => {
    it('collects all errors in a patch', () => {
      const builder = new PatchBuilder();
      const vararg1 = builder.addBlock('test.VarargPass');
      const vararg2 = builder.addBlock('test.VarargPass');

      builder.addVarargConnection(vararg1, 'values', 'v1:blocks.invalid1.outputs.value', 0);
      builder.addVarargConnection(vararg2, 'values', 'v1:blocks.invalid2.outputs.value', 0);

      const patch = builder.build();
      const result = pass4Varargs(patch);

      expect(result.kind).toBe('error');
      expect(result.errors).toHaveLength(2);
    });
  });
});
