import { describe, expect, it } from 'vitest';
import { createNodeFromBlockLike } from '../nodeDataTransform';
import { getAnyBlockDefinition } from '../../../blocks/registry';
import { registerAllBlocks } from '../../../blocks/all';
import type { BlockLike, EdgeLike } from '../types';
import type { BlockId, PortId } from '../../../types';

registerAllBlocks();

function ellipseBlock(params: Record<string, unknown> = {}): BlockLike {
  return {
    id: 'ellipse-1',
    type: 'Ellipse',
    displayName: 'Ellipse 1',
    params,
    inputPorts: new Map([
      ['rx', {
        id: 'rx',
        combineMode: 'last',
        binding: {
          kind: 'resolved',
          writerCount: 1,
          sourceKind: 'defaultSource',
          sourceBlockType: 'Const',
          sourcePortId: 'out',
          chain: [],
          controls: [{
            id: 'value',
            label: 'Radius X',
            value: 0.02,
            hint: { kind: 'slider', min: 0.005, max: 0.08, step: 0.001 },
            target: {
              kind: 'bindingSourceParam',
              blockId: 'ellipse-1' as BlockId,
              portId: 'rx' as PortId,
              sourceBlockType: 'Const',
              sourceOutputPortId: 'out' as PortId,
              paramId: 'value',
            },
          }],
        },
      }],
      ['ry', {
        id: 'ry',
        combineMode: 'last',
        binding: {
          kind: 'resolved',
          writerCount: 1,
          sourceKind: 'defaultSource',
          sourceBlockType: 'Const',
          sourcePortId: 'out',
          chain: [],
          controls: [{
            id: 'value',
            label: 'Radius Y',
            value: 0.02,
            hint: { kind: 'slider', min: 0.005, max: 0.08, step: 0.001 },
            target: {
              kind: 'bindingSourceParam',
              blockId: 'ellipse-1' as BlockId,
              portId: 'ry' as PortId,
              sourceBlockType: 'Const',
              sourceOutputPortId: 'out' as PortId,
              paramId: 'value',
            },
          }],
        },
      }],
      ['rotation', {
        id: 'rotation',
        combineMode: 'last',
        binding: {
          kind: 'resolved',
          writerCount: 1,
          sourceKind: 'defaultSource',
          sourceBlockType: 'Const',
          sourcePortId: 'out',
          chain: [],
          controls: [{
            id: 'value',
            label: 'Rotation',
            value: 0,
            hint: { kind: 'slider', min: 0, max: 6.28, step: 0.01 },
            target: {
              kind: 'bindingSourceParam',
              blockId: 'ellipse-1' as BlockId,
              portId: 'rotation' as PortId,
              sourceBlockType: 'Const',
              sourceOutputPortId: 'out' as PortId,
              paramId: 'value',
            },
          }],
        },
      }],
      ['resolution', {
        id: 'resolution',
        combineMode: 'last',
        binding: {
          kind: 'resolved',
          writerCount: 1,
          sourceKind: 'defaultSource',
          sourceBlockType: 'Const',
          sourcePortId: 'out',
          chain: [],
          controls: [{
            id: 'value',
            label: 'Resolution',
            value: 64,
            hint: { kind: 'slider', min: 16, max: 128, step: 1 },
            target: {
              kind: 'bindingSourceParam',
              blockId: 'ellipse-1' as BlockId,
              portId: 'resolution' as PortId,
              sourceBlockType: 'Const',
              sourceOutputPortId: 'out' as PortId,
              paramId: 'value',
            },
          }],
        },
      }],
    ]),
    outputPorts: new Map([
      ['shape', { id: 'shape' }],
      ['controlPoints', { id: 'controlPoints' }],
    ]),
  };
}

describe('createNodeFromBlockLike controllable params', () => {
  it('projects unconnected exposed const defaults as controllable params', () => {
    const block = ellipseBlock();
    const blockDef = getAnyBlockDefinition(block.type);
    expect(blockDef).toBeDefined();

    const node = createNodeFromBlockLike(
      block,
      blockDef!,
      [],
      new Map([[block.id, block]]),
      { x: 0, y: 0 },
    );
    const paramById = new Map(node.data.params.map((param) => [param.id, param.value]));

    expect(paramById.get('rx:value')).toBe(0.02);
    expect(paramById.get('ry:value')).toBe(0.02);
    expect(paramById.get('rotation:value')).toBe(0);
    expect(paramById.get('resolution:value')).toBe(64);
  });

  it('omits connected exposed inputs from controllable params', () => {
    const block = ellipseBlock();
    const source: BlockLike = {
      id: 'const-1',
      type: 'Const',
      displayName: 'Const 1',
      params: { value: 0.1 },
      inputPorts: new Map(),
      outputPorts: new Map([['out', { id: 'out' }]]),
    };
    const edge: EdgeLike = {
      id: 'e1',
      sourceBlockId: source.id,
      sourcePortId: 'out',
      targetBlockId: block.id,
      targetPortId: 'rx',
    };
    const blockDef = getAnyBlockDefinition(block.type);
    expect(blockDef).toBeDefined();

    const node = createNodeFromBlockLike(
      block,
      blockDef!,
      [edge],
      new Map([
        [source.id, source],
        [block.id, block],
      ]),
      { x: 0, y: 0 },
    );

    expect(node.data.params.some((param) => param.id === 'rx:value')).toBe(false);
    expect(node.data.params.some((param) => param.id === 'ry:value')).toBe(true);
  });
});
