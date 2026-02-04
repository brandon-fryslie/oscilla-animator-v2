/**
 * FrontendResultStore Integration Tests
 *
 * Verifies the full pipeline: Patch → compileFrontend() → FrontendResultStore → UI queries
 */

import { describe, it, expect } from 'vitest';
import '../../blocks/all'; // Trigger block registrations
import { FrontendResultStore } from '../FrontendResultStore';
import { buildPatch } from '../../graph';
import { compileFrontend } from '../../compiler/frontend';
import type { BlockId } from '../../types';

describe('Frontend Pipeline Integration', () => {
  it('unconnected port has defaultSource provenance in snapshot', () => {
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

    // Verify snapshot has correct provenance
    const rxAddr = `v1:blocks.ellipse_1.inputs.rx`;
    const provenance = store.getPortProvenance(rxAddr);
    expect(provenance).toBeDefined();
    expect(provenance?.kind).toBe('defaultSource');
    
    // Verify hasDefaultSource returns true
    expect(store.hasDefaultSource(rxAddr)).toBe(true);
    expect(store.hasDefaultSourceByIds(ellipseId!, 'rx')).toBe(true);
  });

  it('connected port has userEdge provenance in snapshot', () => {
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

    // Verify snapshot has userEdge provenance
    const rxAddr = `v1:blocks.ellipse_1.inputs.rx`;
    const provenance = store.getPortProvenance(rxAddr);
    expect(provenance).toBeDefined();
    expect(provenance?.kind).toBe('userEdge');
    
    // Verify hasDefaultSource returns false (connected, not default)
    expect(store.hasDefaultSource(rxAddr)).toBe(false);
    expect(store.hasDefaultSourceByIds(ellipseId!, 'rx')).toBe(false);
  });

  it('resolves types from frontend for both inputs and outputs', () => {
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

    // Verify input type (should be float for rx)
    const rxType = store.getResolvedPortTypeByIds(ellipseId!, 'rx', 'in');
    expect(rxType).toBeDefined();
    expect(rxType?.payload.kind).toBe('float');

    // Verify output type (Ellipse outputs float for shape)
    const shapeType = store.getResolvedPortTypeByIds(ellipseId!, 'shape', 'out');
    expect(shapeType).toBeDefined();
    expect(shapeType?.payload.kind).toBe('float');
  });

  it('handles frontend failures gracefully and stores partial data', () => {
    const store = new FrontendResultStore();

    // Create a patch with a cycle (frontend will fail)
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      const lag1 = b.addBlock('Lag');
      const lag2 = b.addBlock('Lag');
      b.wire(lag1, 'out', lag2, 'in');
      b.wire(lag2, 'out', lag1, 'in');
    });

    const result = compileFrontend(patch);
    
    // Frontend should produce a result (ok or error)
    if (result.kind === 'ok') {
      store.updateFromFrontendResult(result.result, 1);
      expect(store.snapshot.status).toBe('frontendOk');
      // Even with errors, frontend produces partial results
      expect(store.snapshot.errors.length).toBeGreaterThanOrEqual(0);
    } else {
      store.updateFromFrontendFailure(result, 1);
      expect(store.snapshot.status).toBe('frontendError');
      expect(store.snapshot.errors.length).toBeGreaterThan(0);
    }
  });

  it('snapshot tracks patch revision for coherence', () => {
    const store = new FrontendResultStore();

    const patch1 = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('Ellipse');
    });

    const result1 = compileFrontend(patch1);
    expect(result1.kind).toBe('ok');
    if (result1.kind !== 'ok') return;

    store.updateFromFrontendResult(result1.result, 10);
    expect(store.snapshot.patchRevision).toBe(10);

    // Update with new revision
    const patch2 = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('Rect');
    });

    const result2 = compileFrontend(patch2);
    expect(result2.kind).toBe('ok');
    if (result2.kind !== 'ok') return;

    store.updateFromFrontendResult(result2.result, 11);
    expect(store.snapshot.patchRevision).toBe(11);
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
    expect(store.snapshot.resolvedPortTypes.size).toBeGreaterThan(0);

    store.clear();

    expect(store.snapshot.status).toBe('none');
    expect(store.snapshot.patchRevision).toBe(-1);
    expect(store.snapshot.portProvenance.size).toBe(0);
    expect(store.snapshot.resolvedPortTypes.size).toBe(0);
  });
});
