/**
 * useDebugMiniView Tests
 *
 * Tests the hook's data resolution behavior:
 * - Returns null when no edge hovered
 * - Returns null when metadata unavailable
 * - Returns MiniViewData with correct key, label, meta
 * - Resolves history for scalar edges via hook-owned tracking
 * - Resolves field histories via hook-owned tracking
 * - Falls back to edgeId when no label provided
 * - Polls for value updates
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { debugService } from '../../services/DebugService';
import type { ValueSlot } from '../../types';
import { canonicalType, canonicalManyDef } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import { useDebugMiniView, useDebugPortMiniView } from './useDebugMiniView';

describe('useDebugMiniView', () => {
  beforeEach(() => {
    debugService.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return null when hoveredEdgeId is null', () => {
    const { result } = renderHook(() => useDebugMiniView(null, null));
    expect(result.current).toBe(null);
  });

  it('should return null when edge has no metadata', () => {
    debugService.setEdgeToSlotMap(new Map());
    const { result } = renderHook(() => useDebugMiniView('unknown-edge', null));
    expect(result.current).toBe(null);
  });

  it('should return MiniViewData for a mapped single-instance edge', () => {
    const type = canonicalType(FLOAT);
    const edgeMap = new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);

    const { result } = renderHook(() => useDebugMiniView('edge-1', 'LFO.out → Gain.mod'));

    expect(result.current).not.toBe(null);
    expect(result.current!.key).toEqual({ kind: 'edge', edgeId: 'edge-1' });
    expect(result.current!.label).toBe('LFO.out → Gain.mod');
    expect(result.current!.meta.slotId).toBe(10);
  });

  it('should fall back to edgeId when no label provided', () => {
    const edgeMap = new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);

    const { result } = renderHook(() => useDebugMiniView('edge-1', null));

    expect(result.current!.label).toBe('edge-1');
  });

  it('should resolve history for tracked single-instance edge', () => {
    const edgeMap = new Map([
      ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);

    // Track the edge in history service
    debugService.historyService.track({ kind: 'edge', edgeId: 'sig-edge' });
    debugService.updateSlotValue(10 as ValueSlot, 0.5);

    const { result } = renderHook(() => useDebugMiniView('sig-edge', null));

    expect(result.current!.history).not.toBe(null);
    expect(result.current!.history!.buffer[0]).toBe(0.5);
    expect(result.current!.history!.writeIndex).toBe(1);
  });

  it('should auto-track history for scalar edge', () => {
    const edgeMap = new Map([
      ['sig-edge', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);

    const { result } = renderHook(() => useDebugMiniView('sig-edge', null));

    expect(result.current!.history).not.toBe(null);
  });

  it('should return null history for field edge', () => {
    const edgeMap = new Map([
      ['field-edge', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);

    const { result } = renderHook(() => useDebugMiniView('field-edge', null));

    expect(result.current!.history).toBe(null);
  });

  it('should resolve value after poll', () => {
    const edgeMap = new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);
    debugService.updateSlotValue(10 as ValueSlot, 0.42);

    const { result } = renderHook(() => useDebugMiniView('edge-1', null));

    // First poll happens immediately in useEffect
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current!.value).not.toBe(null);
    expect(result.current!.value!.kind).toBe('scalar');
    if (result.current!.value!.kind === 'scalar') {
      expect(result.current!.value!.value).toBe(0.42);
    }
  });

  it('should update value on subsequent polls', () => {
    const edgeMap = new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);
    debugService.updateSlotValue(10 as ValueSlot, 0.1);

    const { result } = renderHook(() => useDebugMiniView('edge-1', null));

    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current!.value?.kind).toBe('scalar');

    // Update value and advance timer
    debugService.updateSlotValue(10 as ValueSlot, 0.9);
    act(() => { vi.advanceTimersByTime(250); });

    if (result.current!.value?.kind === 'scalar') {
      expect(result.current!.value.value).toBe(0.9);
    }
  });

  it('should clear value when edge changes to null', () => {
    const edgeMap = new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);
    debugService.updateSlotValue(10 as ValueSlot, 0.5);

    const { result, rerender } = renderHook(
      ({ edgeId }) => useDebugMiniView(edgeId, null),
      { initialProps: { edgeId: 'edge-1' as string | null } }
    );

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).not.toBe(null);

    rerender({ edgeId: null });
    expect(result.current).toBe(null);
  });

  it('should handle getEdgeValue throwing gracefully', () => {
    const edgeMap = new Map([
      ['edge-1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);

    // Don't write any value - after runtime starts, this will throw
    // But the hook should catch and set null
    debugService.updateSlotValue(99 as ValueSlot, 1.0); // Start runtime

    const { result } = renderHook(() => useDebugMiniView('edge-1', null));

    // The poll catches the throw and sets value to null
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current!.value).toBe(null);
  });

  it('should resolve tracked field value and field histories', () => {
    const edgeMap = new Map([
      ['field-edge', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
    ]);
    debugService.setEdgeToSlotMap(edgeMap);

    const { result } = renderHook(() => useDebugMiniView('field-edge', null));
    debugService.updateFieldValue(30 as ValueSlot, new Float32Array([0.25, 0.5, 0.75, 1.0]));
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current!.value).not.toBe(null);
    expect(result.current!.value!.kind).toBe('field');
    expect(result.current!.fieldHistory).not.toBe(null);
    expect(result.current!.fieldInstanceHistory).not.toBe(null);
    expect(result.current!.fieldBufferHistory).not.toBe(null);
  });

  it('should return MiniViewData for mapped output port', () => {
    const portMap = new Map([
      ['block-1:out', { slotId: 42 as ValueSlot, type: canonicalType(FLOAT) }],
    ]);
    debugService.setPortToSlotMap(portMap);

    const { result } = renderHook(() => useDebugPortMiniView('block-1', 'out', 'before'));
    expect(result.current).not.toBe(null);
    expect(result.current!.key).toEqual({ kind: 'port', blockId: 'block-1', portName: 'out' });
    expect(result.current!.label).toBe('before');
    expect(result.current!.meta.slotId).toBe(42);
  });

  it('should return null for unmapped output port', () => {
    debugService.setPortToSlotMap(new Map());
    const { result } = renderHook(() => useDebugPortMiniView('missing', 'out', null));
    expect(result.current).toBe(null);
  });
});
