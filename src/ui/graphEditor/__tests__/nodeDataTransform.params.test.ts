import { describe, expect, it } from 'vitest';
import { createNodeFromBlockLike } from '../nodeDataTransform';
import type { BlockLike, EdgeLike, InputPortLike } from '../types';
import type { BlockId, PortId } from '../../../types';

/**
 * A self-describing input port whose single inline control mirrors what
 * PatchStoreAdapter emits for a default-sourced Const input (control id is
 * `${portId}:value`, targeting the binding source param).
 */
function controllablePort(portId: string, label: string, value: number): InputPortLike {
  return {
    id: portId,
    label,
    controls: [{
      id: `${portId}:value`,
      label,
      value,
      hint: { kind: 'slider', min: 0, max: 1, step: 0.001 },
      target: {
        kind: 'bindingSourceParam',
        blockId: 'ellipse-1' as BlockId,
        portId: portId as PortId,
        sourceBlockType: 'Const',
        sourceOutputPortId: 'out' as PortId,
        paramId: 'value',
      },
    }],
  };
}

function ellipseBlock(): BlockLike {
  return {
    id: 'ellipse-1',
    type: 'Ellipse',
    typeLabel: 'Ellipse',
    displayName: 'Ellipse 1',
    params: {},
    inputPorts: new Map([
      ['rx', controllablePort('rx', 'Radius X', 0.02)],
      ['ry', controllablePort('ry', 'Radius Y', 0.02)],
      ['rotation', controllablePort('rotation', 'Rotation', 0)],
      ['resolution', controllablePort('resolution', 'Resolution', 64)],
    ]),
    outputPorts: new Map([
      ['shape', { id: 'shape', label: 'shape' }],
      ['controlPoints', { id: 'controlPoints', label: 'controlPoints' }],
    ]),
    controls: [],
  };
}

describe('createNodeFromBlockLike controllable params', () => {
  it('projects unconnected exposed inputs\' controls as node params', () => {
    const block = ellipseBlock();

    const node = createNodeFromBlockLike(
      block,
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
      typeLabel: 'Const',
      displayName: 'Const 1',
      params: { value: 0.1 },
      inputPorts: new Map(),
      outputPorts: new Map([['out', { id: 'out', label: 'out' }]]),
      controls: [],
    };
    const edge: EdgeLike = {
      id: 'e1',
      sourceBlockId: source.id,
      sourcePortId: 'out',
      targetBlockId: block.id,
      targetPortId: 'rx',
    };

    const node = createNodeFromBlockLike(
      block,
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
