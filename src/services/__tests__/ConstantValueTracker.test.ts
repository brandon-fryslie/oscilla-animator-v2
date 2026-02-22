import { describe, expect, it } from 'vitest';
import { buildPatch } from '../../graph/Patch';
import { extractConstantValues } from '../ConstantValueTracker';
import type { BlockId } from '../../types';

import '../../blocks/all';

describe('ConstantValueTracker', () => {
  it('extracts literal Const values for unmapped edges', () => {
    let constId!: BlockId;
    const patch = buildPatch((b) => {
      constId = b.addBlock('Const');
      b.setConfig(constId, 'value', 7);
    });

    const result = extractConstantValues(patch, [
      { edgeId: 'e0', fromBlockId: constId, fromPort: 'out' },
    ]);

    const constant = result.get('e0');
    expect(constant).toBeDefined();
    expect(constant?.value).toBe(7);
    expect(constant?.reason).toBe('const-block');
  });

  it('derives computed constants through simple math chains', () => {
    let addId!: BlockId;
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      b.setConfig(c1, 'value', 2);
      const c2 = b.addBlock('Const');
      b.setConfig(c2, 'value', 3);
      addId = b.addBlock('Add');
      b.wire(c1, 'out', addId, 'a');
      b.wire(c2, 'out', addId, 'b');
    });

    const result = extractConstantValues(patch, [
      { edgeId: 'e1', fromBlockId: addId, fromPort: 'out' },
    ]);

    const constant = result.get('e1');
    expect(constant).toBeDefined();
    expect(constant?.value).toBe(5);
    expect(constant?.reason).toBe('computed-constant');
  });

  it('uses per-port default source values when evaluating computed constants', () => {
    let addId!: BlockId;
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      b.setConfig(c1, 'value', 2);
      addId = b.addBlock('Add');
      b.setPortDefault(addId, 'b', 4);
      b.wire(c1, 'out', addId, 'a');
    });

    const result = extractConstantValues(patch, [
      { edgeId: 'e2', fromBlockId: addId, fromPort: 'out' },
    ]);

    const constant = result.get('e2');
    expect(constant).toBeDefined();
    expect(constant?.value).toBe(6);
    expect(constant?.reason).toBe('computed-constant');
  });

  it('ignores disabled incoming edges when resolving constants', () => {
    let addId!: BlockId;
    const patch = buildPatch((b) => {
      const active = b.addBlock('Const');
      b.setConfig(active, 'value', 2);
      const disabled = b.addBlock('Const');
      b.setConfig(disabled, 'value', 100);
      addId = b.addBlock('Add');
      b.wire(active, 'out', addId, 'a');
      b.wire(disabled, 'out', addId, 'b', { enabled: false });
      b.setPortDefault(addId, 'b', 4);
    });

    const result = extractConstantValues(patch, [
      { edgeId: 'e_disabled', fromBlockId: addId, fromPort: 'out' },
    ]);

    const constant = result.get('e_disabled');
    expect(constant).toBeDefined();
    expect(constant?.value).toBe(6);
    expect(constant?.reason).toBe('computed-constant');
  });

  it('uses registry default values during computed-constant evaluation', () => {
    let lerpId!: BlockId;
    const patch = buildPatch((b) => {
      const start = b.addBlock('Const');
      b.setConfig(start, 'value', 0);
      const end = b.addBlock('Const');
      b.setConfig(end, 'value', 10);
      lerpId = b.addBlock('Lerp');
      b.wire(start, 'out', lerpId, 'a');
      b.wire(end, 'out', lerpId, 'b');
      // t intentionally unconnected -> uses defaultSourceConst(0.5)
    });

    const result = extractConstantValues(patch, [
      { edgeId: 'e3', fromBlockId: lerpId, fromPort: 'out' },
    ]);

    const constant = result.get('e3');
    expect(constant).toBeDefined();
    expect(constant?.value).toBe(5);
    expect(constant?.reason).toBe('computed-constant');
  });

  it('extracts CameraProjectionConst as a typed constant', () => {
    let projectionId!: BlockId;
    const patch = buildPatch((b) => {
      projectionId = b.addBlock('CameraProjectionConst');
      b.setConfig(projectionId, 'value', 1);
    });

    const result = extractConstantValues(patch, [
      { edgeId: 'e4', fromBlockId: projectionId, fromPort: 'out' },
    ]);

    const constant = result.get('e4');
    expect(constant).toBeDefined();
    expect(constant?.value).toBe('perspective');
    expect(constant?.type.payload.kind).toBe('cameraProjection');
  });
});
