/**
 * Tests for varargs connection support in Patch model
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { PatchBuilder, type VarargConnection, type InputPort } from '../Patch';
import { registerBlock, type BlockDef } from '../../blocks/registry';
import type { BlockId } from '../../types';
import { canonicalType, unitNorm01 } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';

// Register a test block with vararg input
beforeAll(() => {
  const testBlockDef: BlockDef = {
    type: 'test.VarargBlock',
    label: 'Test Vararg',
    category: 'test',
    form: 'primitive',
    capability: 'pure',
    inputs: {
      values: {
        type: canonicalType(FLOAT, unitNorm01()),
        isVararg: true,
        varargConstraint: {
          payloadType: FLOAT,
          cardinalityConstraint: 'any',
        },
      },
    },
    outputs: {
      result: {
        type: canonicalType(FLOAT, unitNorm01()),
      },
    },
    lower: () => ({ outputsById: {} }),
  };

  const constBlockDef: BlockDef = {
    type: 'test.ConstBlock',
    label: 'Test Const',
    category: 'test',
    form: 'primitive',
    capability: 'pure',
    inputs: {},
    outputs: {
      value: {
        type: canonicalType(FLOAT, unitNorm01()),
      },
    },
    lower: () => ({ outputsById: {} }),
  };

  try {
    registerBlock(testBlockDef);
    registerBlock(constBlockDef);
  } catch (e) {
    // Blocks may already be registered in other tests
  }
});

describe('VarargConnection', () => {
  it('defines sourceAddress', () => {
    const conn: VarargConnection = {
      sourceAddress: 'blocks.b1.outputs.value',
      sortKey: 0,
    };
    expect(conn.sourceAddress).toBe('blocks.b1.outputs.value');
  });

  it('defines sortKey', () => {
    const conn: VarargConnection = {
      sourceAddress: 'blocks.b1.outputs.value',
      sortKey: 42,
    };
    expect(conn.sortKey).toBe(42);
  });

  it('allows optional alias', () => {
    const conn: VarargConnection = {
      sourceAddress: 'blocks.b1.outputs.value',
      sortKey: 0,
      alias: 'input1',
    };
    expect(conn.alias).toBe('input1');
  });
});

describe('InputPort with varargConnections', () => {
  it('allows varargConnections array on InputPort', () => {
    const port: InputPort = {
      id: 'values',
      combineMode: 'last',
      varargConnections: [
        { sourceAddress: 'blocks.b1.outputs.value', sortKey: 0 },
        { sourceAddress: 'blocks.b2.outputs.value', sortKey: 1 },
      ],
    };

    expect(port.varargConnections).toHaveLength(2);
    expect(port.varargConnections?.[0].sourceAddress).toBe('blocks.b1.outputs.value');
    expect(port.varargConnections?.[1].sourceAddress).toBe('blocks.b2.outputs.value');
  });

  it('allows empty varargConnections array', () => {
    const port: InputPort = {
      id: 'values',
      combineMode: 'last',
      varargConnections: [],
    };

    expect(port.varargConnections).toHaveLength(0);
  });

  it('allows undefined varargConnections for normal inputs', () => {
    const port: InputPort = {
      id: 'values',
      combineMode: 'last',
    };

    expect(port.varargConnections).toBeUndefined();
  });
});

describe('PatchBuilder.addVarargConnection', () => {
  it('adds vararg connection to port', () => {
    const builder = new PatchBuilder();
    const constId = builder.addBlock('test.ConstBlock');
    const varargId = builder.addBlock('test.VarargBlock');

    builder.addVarargConnection(
      varargId,
      'values',
      `blocks.${constId}.outputs.value`,
      0
    );

    const patch = builder.build();
    const block = patch.blocks.get(varargId);
    const port = block?.inputPorts.get('values');

    expect(port?.varargConnections).toHaveLength(1);
    expect(port?.varargConnections?.[0].sourceAddress).toBe(`blocks.${constId}.outputs.value`);
    expect(port?.varargConnections?.[0].sortKey).toBe(0);
  });

  it('adds multiple vararg connections', () => {
    const builder = new PatchBuilder();
    const const1 = builder.addBlock('test.ConstBlock');
    const const2 = builder.addBlock('test.ConstBlock');
    const varargId = builder.addBlock('test.VarargBlock');

    builder.addVarargConnection(
      varargId,
      'values',
      `blocks.${const1}.outputs.value`,
      0
    );
    builder.addVarargConnection(
      varargId,
      'values',
      `blocks.${const2}.outputs.value`,
      1
    );

    const patch = builder.build();
    const block = patch.blocks.get(varargId);
    const port = block?.inputPorts.get('values');

    expect(port?.varargConnections).toHaveLength(2);
    expect(port?.varargConnections?.[0].sourceAddress).toBe(`blocks.${const1}.outputs.value`);
    expect(port?.varargConnections?.[1].sourceAddress).toBe(`blocks.${const2}.outputs.value`);
  });

  it('preserves connections in order added', () => {
    const builder = new PatchBuilder();
    const const1 = builder.addBlock('test.ConstBlock');
    const const2 = builder.addBlock('test.ConstBlock');
    const const3 = builder.addBlock('test.ConstBlock');
    const varargId = builder.addBlock('test.VarargBlock');

    // Add in specific order
    builder.addVarargConnection(varargId, 'values', `blocks.${const2}.outputs.value`, 10);
    builder.addVarargConnection(varargId, 'values', `blocks.${const1}.outputs.value`, 5);
    builder.addVarargConnection(varargId, 'values', `blocks.${const3}.outputs.value`, 15);

    const patch = builder.build();
    const port = patch.blocks.get(varargId)?.inputPorts.get('values');

    // Connections preserved in add order (normalization will sort)
    expect(port?.varargConnections?.[0].sortKey).toBe(10);
    expect(port?.varargConnections?.[1].sortKey).toBe(5);
    expect(port?.varargConnections?.[2].sortKey).toBe(15);
  });

  it('allows alias on vararg connections', () => {
    const builder = new PatchBuilder();
    const constId = builder.addBlock('test.ConstBlock');
    const varargId = builder.addBlock('test.VarargBlock');

    builder.addVarargConnection(
      varargId,
      'values',
      `blocks.${constId}.outputs.value`,
      0,
      'myInput'
    );

    const patch = builder.build();
    const port = patch.blocks.get(varargId)?.inputPorts.get('values');

    expect(port?.varargConnections?.[0].alias).toBe('myInput');
  });

  it('throws for nonexistent block', () => {
    const builder = new PatchBuilder();

    expect(() =>
      builder.addVarargConnection('nonexistent' as BlockId, 'values', 'blocks.b1.outputs.value', 0)
    ).toThrow('Block nonexistent not found');
  });

  it('throws for nonexistent port', () => {
    const builder = new PatchBuilder();
    const varargId = builder.addBlock('test.VarargBlock');

    expect(() =>
      builder.addVarargConnection(varargId, 'nonexistent', 'blocks.b1.outputs.value', 0)
    ).toThrow('Input port nonexistent not found');
  });
});

describe('Patch serialization with varargs', () => {
  it('preserves vararg connections through build', () => {
    const builder = new PatchBuilder();
    const const1 = builder.addBlock('test.ConstBlock');
    const const2 = builder.addBlock('test.ConstBlock');
    const varargId = builder.addBlock('test.VarargBlock');

    builder.addVarargConnection(varargId, 'values', `blocks.${const1}.outputs.value`, 0, 'first');
    builder.addVarargConnection(varargId, 'values', `blocks.${const2}.outputs.value`, 1, 'second');

    const patch = builder.build();
    const port = patch.blocks.get(varargId)?.inputPorts.get('values');

    expect(port?.varargConnections).toHaveLength(2);
    expect(port?.varargConnections?.[0]).toEqual({
      sourceAddress: `blocks.${const1}.outputs.value`,
      sortKey: 0,
      alias: 'first',
    });
    expect(port?.varargConnections?.[1]).toEqual({
      sourceAddress: `blocks.${const2}.outputs.value`,
      sortKey: 1,
      alias: 'second',
    });
  });
});
