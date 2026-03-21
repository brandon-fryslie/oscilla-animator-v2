import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../blocks/all';
import { buildPatch } from '../../graph';
import { compileFrontend } from '../../compiler/frontend';
import { FrontendResultStore } from '../FrontendResultStore';
import { PortHighlightStore } from '../PortHighlightStore';
import { portId, type BlockId } from '../../types';

registerAllBlocks();

describe('PortHighlightStore', () => {
  it('derives compatible hover targets from shared semantic queries', () => {
    const frontend = new FrontendResultStore();

    let ellipseId!: BlockId;
    let constId!: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
      constId = b.addBlock('Const');
    });

    frontend.updateFromFrontendResult(compileFrontend(patch), 1);

    const patchStore = { patch } as any;
    const highlight = new PortHighlightStore(patchStore, frontend);
    highlight.setHoveredPort(constId, portId('out'), 'output');

    expect(highlight.compatiblePorts.has(`${ellipseId}:rx`)).toBe(true);
  });
});
