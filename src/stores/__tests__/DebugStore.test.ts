/**
 * DebugStore Tests
 *
 * Focus on externally observable store behavior:
 * - active edge selection semantics
 * - polling lifecycle
 * - graceful failure handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebugStore } from '../DebugStore';
import { debugService } from '../../services/DebugService';
import type { ValueSlot } from '../../types';
import { canonicalType } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';

describe('DebugStore', () => {
  let store: DebugStore;

  beforeEach(() => {
    debugService.clear();
    store = new DebugStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    store.dispose();
    vi.useRealTimers();
  });

  it('prefers hovered edge over selected edge for activeEdgeId', () => {
    store.setSelectedDebugEdge('selected-edge');
    expect(store.activeEdgeId).toBe('selected-edge');

    store.setHoveredEdge('hovered-edge');
    expect(store.activeEdgeId).toBe('hovered-edge');

    store.setHoveredEdge(null);
    expect(store.activeEdgeId).toBe('selected-edge');
  });

  it('polls and caches scalar value for active mapped edge', () => {
    debugService.setEdgeToSlotMap(new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]));
    debugService.updateSlotValue(10 as ValueSlot, 0.42);

    store.setHoveredEdge('edge-1');
    actTick();

    expect(store.edgeValue).not.toBe(null);
    expect(store.edgeValue?.kind).toBe('scalar');
    if (store.edgeValue?.kind === 'scalar') {
      expect(store.edgeValue.value).toBe(0.42);
    }
  });

  it('handles unknown edge polling failures without throwing', () => {
    debugService.setEdgeToSlotMap(new Map());

    store.setHoveredEdge('unknown-edge');
    actTick();

    expect(store.hoveredEdgeId).toBe('unknown-edge');
    expect(store.edgeValue).toBe(null);
  });

  it('stops polling and clears cached value when disabled', () => {
    debugService.setEdgeToSlotMap(new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]));
    debugService.updateSlotValue(10 as ValueSlot, 0.9);

    store.setHoveredEdge('edge-1');
    actTick();
    expect(store.edgeValue).not.toBe(null);

    store.setEnabled(false);
    expect(store.edgeValue).toBe(null);

    debugService.updateSlotValue(10 as ValueSlot, 0.1);
    actTick();
    expect(store.edgeValue).toBe(null);
  });

  it('returns undefined for direct edge lookup when disabled', () => {
    debugService.setEdgeToSlotMap(new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]));

    store.setEnabled(false);
    expect(store.getEdgeValue('edge-1')).toBeUndefined();
  });

  function actTick(): void {
    vi.advanceTimersByTime(1000);
  }
});
