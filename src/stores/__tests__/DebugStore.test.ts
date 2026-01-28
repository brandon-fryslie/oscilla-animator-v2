/**
 * DebugStore Tests
 *
 * Tests the DebugStore's history tracking lifecycle:
 * - Signal edges: track in HistoryService on hover, untrack on unhover
 * - Field edges: track field slot on hover, untrack on unhover
 * - Switching edges cleans up previous tracking
 * - Dispose cleans up all tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DebugStore } from '../DebugStore';
import { debugService } from '../../services/DebugService';
import type { ValueSlot } from '../../types';
import { canonicalType } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';

describe('DebugStore', () => {
  let store: DebugStore;

  beforeEach(() => {
    debugService.clear();
    store = new DebugStore();
  });

  describe('setHoveredEdge - signal history tracking', () => {
    it('should track signal edge in HistoryService on hover', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('sig-edge');

      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(true);
    });

    it('should untrack signal edge when hovering null', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('sig-edge');
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(true);

      store.setHoveredEdge(null);
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(false);
    });

    it('should untrack previous signal edge when switching to different edge', () => {
      const edgeMap = new Map([
        ['sig-edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
        ['sig-edge-2', { slotId: 20 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('sig-edge-1');
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge-1' })).toBe(true);

      store.setHoveredEdge('sig-edge-2');
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge-1' })).toBe(false);
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge-2' })).toBe(true);
    });

    it('should not track field edges in HistoryService', () => {
      const edgeMap = new Map([
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('field-edge');
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'field-edge' })).toBe(false);
    });

    it('should receive history values when slot is written after tracking', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('sig-edge');

      debugService.updateSlotValue(10 as ValueSlot, 0.5);
      debugService.updateSlotValue(10 as ValueSlot, 0.75);

      const history = debugService.historyService.getHistory({ kind: 'edge', edgeId: 'sig-edge' });
      expect(history).toBeDefined();
      expect(history!.writeIndex).toBe(2);
      expect(history!.buffer[0]).toBe(0.5);
      expect(history!.buffer[1]).toBe(0.75);
    });
  });

  describe('setHoveredEdge - field tracking', () => {
    it('should track field slot on hover', () => {
      const edgeMap = new Map([
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('field-edge');
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);
    });

    it('should untrack field slot when hovering null', () => {
      const edgeMap = new Map([
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('field-edge');
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

      store.setHoveredEdge(null);
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
    });

    it('should untrack previous field when switching to different edge', () => {
      const edgeMap = new Map([
        ['field-edge-1', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
        ['field-edge-2', { slotId: 31 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('field-edge-1');
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

      store.setHoveredEdge('field-edge-2');
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
      expect(debugService.isFieldTracked(31 as ValueSlot)).toBe(true);
    });
  });

  describe('setHoveredEdge - mixed transitions', () => {
    it('should clean up signal history when switching to field edge', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('sig-edge');
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(true);

      store.setHoveredEdge('field-edge');
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(false);
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);
    });

    it('should clean up field tracking when switching to signal edge', () => {
      const edgeMap = new Map([
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('field-edge');
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

      store.setHoveredEdge('sig-edge');
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(true);
    });
  });

  describe('enabled state', () => {
    it('should not track when disabled', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setEnabled(false);
      store.setHoveredEdge('sig-edge');

      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(false);
    });

    it('should not track field when disabled', () => {
      const edgeMap = new Map([
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setEnabled(false);
      store.setHoveredEdge('field-edge');

      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should untrack signal history on dispose', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('sig-edge');
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(true);

      store.dispose();
      expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'sig-edge' })).toBe(false);
    });

    it('should untrack field on dispose', () => {
      const edgeMap = new Map([
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('field-edge');
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

      store.dispose();
      expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
    });
  });

  describe('hoveredEdgeId state', () => {
    it('should be null initially', () => {
      expect(store.hoveredEdgeId).toBe(null);
    });

    it('should update on setHoveredEdge', () => {
      const edgeMap = new Map([
        ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('edge-1');
      expect(store.hoveredEdgeId).toBe('edge-1');
    });

    it('should handle unknown edge gracefully (no crash)', () => {
      debugService.setEdgeToSlotMap(new Map());

      // Unknown edge - no metadata, should still set hoveredEdgeId
      store.setHoveredEdge('unknown-edge');
      expect(store.hoveredEdgeId).toBe('unknown-edge');
    });

    it('should not re-track when setting same edge', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      store.setHoveredEdge('sig-edge');
      debugService.updateSlotValue(10 as ValueSlot, 1.0);

      // Set same edge again - should not untrack/retrack
      store.setHoveredEdge('sig-edge');
      const history = debugService.historyService.getHistory({ kind: 'edge', edgeId: 'sig-edge' });
      // History should still be there with the value
      expect(history).toBeDefined();
      expect(history!.buffer[0]).toBe(1.0);
    });
  });
});
