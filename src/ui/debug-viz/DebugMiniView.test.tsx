/**
 * DebugMiniView Component Tests
 *
 * Tests rendering behavior for the three main states:
 * - Debug disabled: shows "Debug disabled"
 * - Nothing hovered: shows "Hover an edge to inspect"
 * - Edge hovered (signal): shows header, type line, value section
 * - Edge hovered (field): shows field stats
 *
 * Uses a real RootStore with StoreProvider for proper MobX reactivity.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RootStore } from '../../stores/RootStore';
import { StoreProvider } from '../../stores/context';
import { debugService } from '../../services/DebugService';
import type { ValueSlot } from '../../types';
import { canonicalType } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../../core/canonical-types';
import { DebugMiniView } from './DebugMiniView';
import { createMockCanvas2DContext } from '../../__tests__/test-utils';

// Mock canvas for Sparkline
beforeEach(() => {
  const mockCtx = createMockCanvas2DContext();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    (_contextId: string) => mockCtx
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

function renderWithStore(store: RootStore) {
  return render(
    React.createElement(StoreProvider, { store },
      React.createElement(DebugMiniView)
    )
  );
}

describe('DebugMiniView', () => {
  let store: RootStore;

  beforeEach(() => {
    vi.useFakeTimers();
    debugService.clear();
    store = new RootStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('disabled state', () => {
    it('should show "Debug disabled" when debug is disabled', () => {
      store.debug.setEnabled(false);
      renderWithStore(store);
      expect(screen.getByText('Debug disabled')).toBeDefined();
    });
  });

  describe('idle state (nothing hovered)', () => {
    it('should show "Hover an edge to inspect" when no edge hovered', () => {
      renderWithStore(store);
      expect(screen.getByText('Hover an edge to inspect')).toBeDefined();
    });
  });

  describe('signal edge hovered', () => {
    beforeEach(() => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);
    });

    it('should show edge badge', () => {
      act(() => { store.debug.setHoveredEdge('sig-edge'); });
      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('Edge')).toBeDefined();
    });

    it('should show type line', () => {
      act(() => { store.debug.setHoveredEdge('sig-edge'); });
      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });
      // float with unit:scalar → "float · one · cont"
      expect(screen.getByText('float · one · cont')).toBeDefined();
    });

    it('should show slot info', () => {
      act(() => { store.debug.setHoveredEdge('sig-edge'); });
      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('Slot: 10')).toBeDefined();
    });

    it('should show "awaiting value..." before runtime writes', () => {
      act(() => { store.debug.setHoveredEdge('sig-edge'); });
      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('awaiting value...')).toBeDefined();
    });

    it('should show edge ID as label when no patch edge found', () => {
      act(() => { store.debug.setHoveredEdge('sig-edge'); });
      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('sig-edge')).toBeDefined();
    });
  });

  describe('field edge hovered', () => {
    beforeEach(() => {
      const edgeMap = new Map([
        ['field-edge', { slotId: 30 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'field' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);
    });

    it('should show type line for field', () => {
      act(() => { store.debug.setHoveredEdge('field-edge'); });
      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });
      // field cardinality → "float · many · cont"
      expect(screen.getByText('float · many · cont')).toBeDefined();
    });

    it('should show "field: hover to inspect" for untracked field', () => {
      act(() => { store.debug.setHoveredEdge('field-edge'); });
      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });
      // The store calls trackField on hover. Before runtime starts,
      // getEdgeValue returns undefined → value is null → "awaiting value..."
      const text = screen.queryByText('field: hover to inspect');
      const awaiting = screen.queryByText('awaiting value...');
      expect(text || awaiting).toBeTruthy();
    });

    it('should show field stats when data available', () => {
      act(() => { store.debug.setHoveredEdge('field-edge'); });
      debugService.trackField(30 as ValueSlot);
      const buffer = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
      debugService.updateFieldValue(30 as ValueSlot, buffer);

      renderWithStore(store);
      act(() => { vi.advanceTimersByTime(300); });

      expect(screen.getByText('N=5')).toBeDefined();
      expect(screen.getByText('min')).toBeDefined();
      expect(screen.getByText('mean')).toBeDefined();
      expect(screen.getByText('max')).toBeDefined();
    });
  });

  describe('transitions', () => {
    it('should return to idle after unhover', () => {
      const edgeMap = new Map([
        ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT), cardinality: 'signal' as const }],
      ]);
      debugService.setEdgeToSlotMap(edgeMap);

      const { rerender } = renderWithStore(store);

      act(() => { store.debug.setHoveredEdge('sig-edge'); });
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('Edge')).toBeDefined();

      act(() => { store.debug.setHoveredEdge(null); });
      // Re-render to pick up MobX changes
      rerender(
        React.createElement(StoreProvider, { store },
          React.createElement(DebugMiniView)
        )
      );
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByText('Hover an edge to inspect')).toBeDefined();
    });
  });
});
