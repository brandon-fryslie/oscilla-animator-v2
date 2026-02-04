/**
 * FrontendResultStore Tests
 *
 * Verifies observable snapshot updates and query methods.
 */

import { describe, it, expect } from 'vitest';
import '../../blocks/all'; // Trigger block registrations
import { FrontendResultStore } from '../FrontendResultStore';
import { buildPatch } from '../../graph';
import { compileFrontend } from '../../compiler/frontend';
import type { BlockId } from '../../types';

describe('FrontendResultStore', () => {
  it('starts with empty snapshot', () => {
    const store = new FrontendResultStore();

    expect(store.snapshot.status).toBe('none');
    expect(store.snapshot.patchRevision).toBe(-1);
    expect(store.snapshot.portProvenance.size).toBe(0);
    expect(store.snapshot.resolvedPortTypes.size).toBe(0);
    expect(store.snapshot.backendReady).toBe(false);
  });

  it('updates snapshot from successful frontend compilation', () => {
    const store = new FrontendResultStore();

    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('Ellipse');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    store.updateFromFrontendResult(result.result, 1);

    expect(store.snapshot.status).toBe('frontendOk');
    expect(store.snapshot.patchRevision).toBe(1);
    expect(store.snapshot.backendReady).toBe(true);
    expect(store.snapshot.resolvedPortTypes.size).toBeGreaterThan(0);
  });

  it('hasDefaultSource() returns true for unconnected inputs', () => {
    const store = new FrontendResultStore();

    let ellipseId: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    store.updateFromFrontendResult(result.result, 1);

    // Check by canonical address (displayName-based, e.g. "ellipse_1")
    const rxAddr = `v1:blocks.ellipse_1.inputs.rx`;
    expect(store.hasDefaultSource(rxAddr)).toBe(true);

    // Check by ids (convenience method uses blockId → canonicalName map)
    expect(store.hasDefaultSourceByIds(ellipseId!, 'rx')).toBe(true);
  });

  it('hasDefaultSource() returns false for connected inputs', () => {
    const store = new FrontendResultStore();

    let ellipseId: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
      const constBlock = b.addBlock('Const');
      b.setConfig(constBlock, 'value', 5.0);
      b.wire(constBlock, 'out', ellipseId, 'rx');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    store.updateFromFrontendResult(result.result, 1);

    // Connected port should have 'userEdge' provenance, not 'defaultSource'
    const rxAddr = `v1:blocks.ellipse_1.inputs.rx`;
    expect(store.hasDefaultSource(rxAddr)).toBe(false);
    expect(store.getPortProvenance(rxAddr)?.kind).toBe('userEdge');

    // Check by ids
    expect(store.hasDefaultSourceByIds(ellipseId!, 'rx')).toBe(false);
  });

  it('getResolvedPortType() returns resolved types', () => {
    const store = new FrontendResultStore();

    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('Ellipse');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    store.updateFromFrontendResult(result.result, 1);

    // Ellipse output 'shape' should have a resolved type (Ellipse outputs float, not shape2d)
    const shapeAddr = `v1:blocks.ellipse_1.outputs.shape`;
    const type = store.getResolvedPortType(shapeAddr);
    expect(type).toBeDefined();
    expect(type?.payload.kind).toBe('float');
  });

  it('getResolvedPortTypeByIds() works for both inputs and outputs', () => {
    const store = new FrontendResultStore();

    let ellipseId: BlockId;
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      ellipseId = b.addBlock('Ellipse');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    store.updateFromFrontendResult(result.result, 1);

    // Input port type
    const rxType = store.getResolvedPortTypeByIds(ellipseId!, 'rx', 'in');
    expect(rxType).toBeDefined();
    expect(rxType?.payload.kind).toBe('float');

    // Output port type (Ellipse outputs float for shape)
    const shapeType = store.getResolvedPortTypeByIds(ellipseId!, 'shape', 'out');
    expect(shapeType).toBeDefined();
    expect(shapeType?.payload.kind).toBe('float');
  });

  it('clear() resets snapshot to empty state', () => {
    const store = new FrontendResultStore();
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('Ellipse');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;

    store.updateFromFrontendResult(result.result, 1);
    expect(store.snapshot.status).toBe('frontendOk');

    store.clear();

    expect(store.snapshot.status).toBe('none');
    expect(store.snapshot.patchRevision).toBe(-1);
    expect(store.snapshot.portProvenance.size).toBe(0);
    expect(store.snapshot.resolvedPortTypes.size).toBe(0);
  });

  it('handles frontend errors gracefully', () => {
    const store = new FrontendResultStore();
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const lag1 = b.addBlock('Lag');
      const lag2 = b.addBlock('Lag');
      b.wire(lag1, 'out', lag2, 'in');
      b.wire(lag2, 'out', lag1, 'in');
    });

    const result = compileFrontend(patch);
    if (result.kind === 'ok') {
      store.updateFromFrontendResult(result.result, 1);
      expect(store.snapshot.status).toBe('frontendOk');
    } else {
      store.updateFromFrontendFailure(result, 1);
      expect(store.snapshot.status).toBe('frontendError');
      expect(store.snapshot.errors.length).toBeGreaterThan(0);
    }
  });
});
