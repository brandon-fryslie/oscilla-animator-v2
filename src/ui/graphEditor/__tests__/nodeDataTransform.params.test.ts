import { describe, expect, it } from 'vitest';
import { createNodeFromBlockLike } from '../nodeDataTransform';
import { getAnyBlockDefinition } from '../../../blocks/registry';
import { registerAllBlocks } from '../../../blocks/all';
import type { BlockLike, EdgeLike } from '../types';

registerAllBlocks();

function ellipseBlock(params: Record<string, unknown> = {}): BlockLike {
  return {
    id: 'ellipse-1',
    type: 'Ellipse',
    displayName: 'Ellipse 1',
    params,
    inputPorts: new Map(),
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

    expect(paramById.get('rx')).toBe(0.02);
    expect(paramById.get('ry')).toBe(0.02);
    expect(paramById.get('rotation')).toBe(0);
    expect(paramById.get('resolution')).toBe(64);
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

    expect(node.data.params.some((param) => param.id === 'rx')).toBe(false);
    expect(node.data.params.some((param) => param.id === 'ry')).toBe(true);
  });
});

