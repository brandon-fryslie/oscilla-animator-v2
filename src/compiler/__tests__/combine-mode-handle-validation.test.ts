import { describe, expect, it } from 'vitest';
import { buildPatch, type Patch } from '../../graph';
import type { BlockId, CombineMode } from '../../types';
import { canonicalType, HANDLE, INT } from '../../core/canonical-types';
import { compile } from '../compile';
import { validateCombineMode } from '../backend/combine-utils';

function setInputCombineMode(
  patch: Patch,
  blockId: BlockId,
  portId: string,
  combineMode: CombineMode,
): void {
  const blocks = patch.blocks as Map<BlockId, any>;
  const block = blocks.get(blockId);
  if (!block) throw new Error(`Block ${blockId} not found`);
  const input = block.inputPorts.get(portId);
  if (!input) throw new Error(`Input port ${portId} not found on block ${blockId}`);

  const inputPorts = new Map(block.inputPorts);
  inputPorts.set(portId, { ...input, combineMode });
  blocks.set(blockId, { ...block, inputPorts });
}

function buildHandleMultiWriterPatch(): { patch: Patch; pathLayout: BlockId } {
  let pathLayout!: BlockId;
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');
    const ellipseA = b.addBlock('Ellipse');
    const ellipseB = b.addBlock('Ellipse');
    const array = b.addBlock('Array');
    pathLayout = b.addBlock('PathLayout');
    const color = b.addBlock('ColorPicker');
    const render = b.addBlock('RenderInstances2D');

    b.wire(ellipseA, 'shape', array, 'element');
    b.wire(array, 'elements', pathLayout, 'elements');
    b.wire(ellipseA, 'shape', pathLayout, 'shape', { sortKey: 0 });
    b.wire(ellipseB, 'shape', pathLayout, 'shape', { sortKey: 1 });
    b.wire(pathLayout, 'controlPoints', render, 'controlPoints');
    b.wire(color, 'color', render, 'color');
  });
  return { patch, pathLayout };
}

function buildHandleArrayMultiWriterPatch(): { patch: Patch; array: BlockId } {
  let array!: BlockId;
  const patch = buildPatch((b) => {
    b.addBlock('InfiniteTimeRoot');
    const ellipseA = b.addBlock('Ellipse');
    const ellipseB = b.addBlock('Ellipse');
    array = b.addBlock('Array');
    const pathLayout = b.addBlock('PathLayout');
    const color = b.addBlock('ColorPicker');
    const render = b.addBlock('RenderInstances2D');

    b.wire(ellipseA, 'shape', array, 'element', { sortKey: 0 });
    b.wire(ellipseB, 'shape', array, 'element', { sortKey: 1 });
    b.wire(array, 'elements', pathLayout, 'elements');
    b.wire(ellipseA, 'shape', pathLayout, 'shape');
    b.wire(pathLayout, 'controlPoints', render, 'controlPoints');
    b.wire(color, 'color', render, 'color');
  });
  return { patch, array };
}

describe('handle combine-mode validation', () => {
  it('keeps canonical INT payloads on numeric combine rules', () => {
    expect(validateCombineMode('sum', 'one', canonicalType(INT)).valid).toBe(true);
    expect(validateCombineMode('average', 'many', canonicalType(INT)).valid).toBe(true);
  });

  it('rejects arithmetic modes for canonical HANDLE types', () => {
    const result = validateCombineMode('sum', 'one', canonicalType(HANDLE));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Handle payload');
  });

  it('accepts selection-like modes for canonical HANDLE types', () => {
    expect(validateCombineMode('last', 'one', canonicalType(HANDLE)).valid).toBe(true);
    expect(validateCombineMode('first', 'one', canonicalType(HANDLE)).valid).toBe(true);
    expect(validateCombineMode('layer', 'one', canonicalType(HANDLE)).valid).toBe(true);
  });

  it('fails compilation when a handle input uses arithmetic combine mode', () => {
    const { patch, pathLayout } = buildHandleMultiWriterPatch();
    setInputCombineMode(patch, pathLayout, 'shape', 'sum');

    const result = compile(patch);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      const combineError = result.errors.find((error) =>
        error.code === 'PortTypeMismatch'
        && error.where?.blockId === pathLayout
        && error.where?.port === 'shape'
      );

      expect(combineError).toBeDefined();
      expect(combineError?.message).toBe(
        'Handle payload only supports combineMode "last", "first", "layer", "collect", or "array"',
      );
    }
  });

  it('compiles when a handle input uses layer combine mode', () => {
    const { patch, array } = buildHandleArrayMultiWriterPatch();
    setInputCombineMode(patch, array, 'element', 'layer');

    const result = compile(patch);
    expect(result.kind).toBe('ok');
  });
});
