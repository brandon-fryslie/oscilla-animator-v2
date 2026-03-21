import { describe, expect, it } from 'vitest';
import { registerAllBlocks } from '../../../blocks/all';
import { buildPatch } from '../../../graph';
import { compileFrontend } from '../../../compiler/frontend';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { portId, type BlockId } from '../../../types';
import {
  getCompatibleBlockTypesForPort,
  getCompatibleLensesForConnection,
  getCompatiblePortsForPort,
  getValidCombineModesForInput,
  getValidDefaultSourceBlockTypes,
} from '../semanticQueries';

registerAllBlocks();

describe('authoring semantic queries', () => {
  it('derives connect-to candidates from the frontend-informed port view', () => {
    const frontend = new FrontendResultStore();

    let ellipseId!: BlockId;
    let constId!: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
      constId = b.addBlock('Const');
    });

    frontend.updateFromFrontendResult(compileFrontend(patch), 1);

    const compatible = getCompatiblePortsForPort(patch, frontend, ellipseId, portId('rx'), true);
    expect(compatible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockId: constId, portId: 'out' }),
      ]),
    );
  });

  it('derives add-block suggestions from the same semantic target type', () => {
    const frontend = new FrontendResultStore();

    let ellipseId!: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
    });

    frontend.updateFromFrontendResult(compileFrontend(patch), 1);

    const compatible = getCompatibleBlockTypesForPort(patch, frontend, ellipseId, portId('rx'), true);
    expect(compatible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockType: 'Const' }),
      ]),
    );
  });

  it('derives lens candidates from the same resolved connection types', () => {
    const frontend = new FrontendResultStore();

    let ellipseId!: BlockId;
    let constId!: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
      constId = b.addBlock('Const');
      b.setConfig(constId, 'value', 0.25);
      b.wire(constId, 'out', ellipseId, 'rx');
    });

    frontend.updateFromFrontendResult(compileFrontend(patch), 1);

    const compatible = getCompatibleLensesForConnection(
      patch,
      frontend,
      constId,
      portId('out'),
      ellipseId,
      portId('rx'),
    );
    expect(compatible.map((lens) => lens.blockType)).toEqual(
      expect.arrayContaining(['Clamp', 'ScaleBias']),
    );
  });

  it('derives combine-mode options from the resolved input type', () => {
    const frontend = new FrontendResultStore();

    let ellipseId!: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
    });

    frontend.updateFromFrontendResult(compileFrontend(patch), 1);

    const modes = getValidCombineModesForInput(patch, frontend, ellipseId, portId('rx'));
    expect(modes).toContain('sum');
    expect(modes).not.toContain('and');
  });

  it('derives default-source candidates from compiler-backed source queries', () => {
    let ellipseId!: BlockId;
    const patch = buildPatch((b) => {
      ellipseId = b.addBlock('Ellipse');
    });

    const candidates = getValidDefaultSourceBlockTypes(patch, ellipseId, portId('rx'));
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockType: 'Const' }),
      ]),
    );
  });
});
