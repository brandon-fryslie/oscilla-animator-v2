/**
 * Tests for DebugService - Runtime Value Observation
 *
 * Tests the full debug data flow:
 * Runtime tap → DebugService.updateSlotValue → DebugService.getEdgeValue → UI
 *
 * Tests demand-driven field tracking:
 * - Untracked fields return { kind: 'field-untracked' } (no throw)
 * - Tracked fields with no data after runtime starts → throw (scheduling bug)
 * - Tracked fields with data → return { kind: 'field', ... } with stats
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { debugService } from './DebugService';
import type { ValueSlot } from '../types';
import { signalType } from '../core/canonical-types';

describe('DebugService', () => {
    beforeEach(() => {
        // Clear all data before each test
        debugService.clear();
    });

    describe('edge-to-slot mapping', () => {
        it('should store and retrieve edge-to-slot mapping', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
                ['edge2', { slotId: 20 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Update slot values
            debugService.updateSlotValue(10 as ValueSlot, 0.5);
            debugService.updateSlotValue(20 as ValueSlot, 0.75);

            // Query edge values
            const result1 = debugService.getEdgeValue('edge1');
            const result2 = debugService.getEdgeValue('edge2');

            expect(result1).toEqual({
                kind: 'signal',
                value: 0.5,
                slotId: 10 as ValueSlot,
                type: signalType('float'),
            });

            expect(result2).toEqual({
                kind: 'signal',
                value: 0.75,
                slotId: 20 as ValueSlot,
                type: signalType('float'),
            });
        });

        // DO NOT REMOVE!!! CRITICAL!!! YOU MUST FIX THE ACTUAL BUG!!!
        // If this test fails, it means the compiler is not registering edges
        // in the debug index. The fix is in the compiler, NOT here.
        it('should throw for unmapped edge (compiler bug)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.5);

            // DO NOT REMOVE!!! CRITICAL!!! YOU MUST FIX THE ACTUAL BUG!!!
            // This throw is intentional - missing edges indicate the compiler
            // failed to register the edge's source output in debugIndex.
            expect(() => debugService.getEdgeValue('unknownEdge')).toThrow(
                "[DebugService.getEdgeValue] Edge 'unknownEdge' not found in edge-to-slot mapping"
            );
        });

        it('should return undefined for signal edge whose slot has no value before runtime starts', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            // Do NOT update slot value - runtime hasn't started

            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });

        it('should throw for signal edge whose slot has no value after runtime starts (scheduling bug)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
                ['edge2', { slotId: 20 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Start runtime by writing to one slot
            debugService.updateSlotValue(10 as ValueSlot, 0.5);

            // Query edge2 whose slot was never written - should throw (scheduling bug)
            expect(() => debugService.getEdgeValue('edge2')).toThrow(
                "Slot 20 has no value"
            );
        });
    });

    describe('slot value updates', () => {
        it('should update slot values from runtime tap', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Simulate runtime tap updates
            debugService.updateSlotValue(10 as ValueSlot, 0.0);
            const r1 = debugService.getEdgeValue('edge1');
            expect(r1?.kind).toBe('signal');
            if (r1?.kind === 'signal') expect(r1.value).toBe(0.0);

            debugService.updateSlotValue(10 as ValueSlot, 0.5);
            const r2 = debugService.getEdgeValue('edge1');
            expect(r2?.kind).toBe('signal');
            if (r2?.kind === 'signal') expect(r2.value).toBe(0.5);

            debugService.updateSlotValue(10 as ValueSlot, 1.0);
            const r3 = debugService.getEdgeValue('edge1');
            expect(r3?.kind).toBe('signal');
            if (r3?.kind === 'signal') expect(r3.value).toBe(1.0);
        });

        it('should handle multiple edges pointing to same slot', () => {
            // This can happen if the same output is connected to multiple inputs
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
                ['edge2', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.42);

            const r1 = debugService.getEdgeValue('edge1');
            const r2 = debugService.getEdgeValue('edge2');
            expect(r1?.kind).toBe('signal');
            expect(r2?.kind).toBe('signal');
            if (r1?.kind === 'signal') expect(r1.value).toBe(0.42);
            if (r2?.kind === 'signal') expect(r2.value).toBe(0.42);
        });
    });

    describe('clear', () => {
        it('should clear all data and reset runtime state on recompile', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.5);

            // Verify data exists
            const r = debugService.getEdgeValue('edge1');
            expect(r?.kind).toBe('signal');
            if (r?.kind === 'signal') expect(r.value).toBe(0.5);

            // Clear
            debugService.clear();

            // DO NOT REMOVE!!! CRITICAL!!! YOU MUST FIX THE ACTUAL BUG!!!
            // After clear, edge is not in mapping - this MUST throw.
            // If you're tempted to make this return undefined, you are
            // hiding a compiler bug. Fix the compiler instead.
            expect(() => debugService.getEdgeValue('edge1')).toThrow(
                "[DebugService.getEdgeValue] Edge 'edge1' not found in edge-to-slot mapping"
            );
        });

        it('should reset runtimeStarted flag on clear', () => {
            const edgeMap1 = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap1);
            debugService.updateSlotValue(10 as ValueSlot, 0.5); // Runtime started

            debugService.clear();

            // Re-set the mapping with a new map
            const edgeMap2 = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap2);

            // Runtime hasn't started again, so should return undefined (not throw)
            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });

        it('should clear tracked field slots on clear', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot);

            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

            debugService.clear();

            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
        });
    });

    describe('port-based queries', () => {
        it('should return undefined for unmapped port (expected for inputs)', () => {
            debugService.setPortToSlotMap(new Map());

            // Input ports won't be in the port map - this is expected
            const result = debugService.getPortValue('someBlock', 'someInputPort');
            expect(result).toBeUndefined();
        });

        it('should return value for mapped signal port', () => {
            const portMap = new Map([
                ['blockA:out', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setPortToSlotMap(portMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.75);

            const result = debugService.getPortValue('blockA', 'out');
            expect(result).toEqual({
                kind: 'signal',
                value: 0.75,
                slotId: 10 as ValueSlot,
                type: signalType('float'),
            });
        });

        it('should throw for mapped signal port with no value after runtime starts (scheduling bug)', () => {
            const portMap = new Map([
                ['blockA:out', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setPortToSlotMap(portMap);

            // Start runtime by writing to a different slot
            debugService.updateSlotValue(99 as ValueSlot, 1.0);

            // Port's slot was never written - should throw (scheduling bug)
            expect(() => debugService.getPortValue('blockA', 'out')).toThrow(
                "Slot 10 has no value"
            );
        });

        it('should return field-untracked for untracked field port', () => {
            const portMap = new Map([
                ['blockA:fieldOut', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setPortToSlotMap(portMap);

            const result = debugService.getPortValue('blockA', 'fieldOut');
            expect(result).toEqual({
                kind: 'field-untracked',
                slotId: 30 as ValueSlot,
                type: signalType('float'),
            });
        });
    });

    describe('field tracking (demand-driven)', () => {
        it('should return field-untracked for untracked field edge', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Do NOT track the field
            const result = debugService.getEdgeValue('field-edge');
            expect(result).toEqual({
                kind: 'field-untracked',
                slotId: 30 as ValueSlot,
                type: signalType('float'),
            });
        });

        it('should return undefined for tracked field before runtime starts', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot);

            // Runtime hasn't started - should return undefined
            const result = debugService.getEdgeValue('field-edge');
            expect(result).toBeUndefined();
        });

        it('should throw for tracked field with no data after runtime starts (scheduling bug)', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot);

            // Start runtime by writing to a signal slot
            debugService.updateSlotValue(99 as ValueSlot, 1.0);

            // Tracked field with no buffer data - scheduling bug
            expect(() => debugService.getEdgeValue('field-edge')).toThrow(
                "Slot 30 is a tracked field but has no value"
            );
        });

        it('should return field stats for tracked field with data', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot);

            // Simulate field materialization
            const buffer = new Float32Array([0.25, 0.5, 0.75, 1.0]);
            debugService.updateFieldValue(30 as ValueSlot, buffer);

            const result = debugService.getEdgeValue('field-edge');
            expect(result?.kind).toBe('field');
            if (result?.kind === 'field') {
                expect(result.count).toBe(4);
                expect(result.min).toBe(0.25);
                expect(result.max).toBe(1.0);
                expect(result.mean).toBeCloseTo(0.625);
                expect(result.first).toBe(0.25);
                expect(result.slotId).toBe(30 as ValueSlot);
            }
        });

        it('should return zero stats for tracked field with empty buffer', () => {
            const edgeMap = new Map([
                ['empty-field', { slotId: 31 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(31 as ValueSlot);

            const buffer = new Float32Array(0);
            debugService.updateFieldValue(31 as ValueSlot, buffer);

            const result = debugService.getEdgeValue('empty-field');
            expect(result?.kind).toBe('field');
            if (result?.kind === 'field') {
                expect(result.count).toBe(0);
                expect(result.min).toBe(0);
                expect(result.max).toBe(0);
                expect(result.mean).toBe(0);
            }
        });

        it('should track and untrack field slots', () => {
            debugService.trackField(30 as ValueSlot);
            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

            debugService.untrackField(30 as ValueSlot);
            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
        });

        it('should report tracked slots via getTrackedFieldSlots', () => {
            debugService.trackField(30 as ValueSlot);
            debugService.trackField(31 as ValueSlot);

            const tracked = debugService.getTrackedFieldSlots();
            expect(tracked.has(30 as ValueSlot)).toBe(true);
            expect(tracked.has(31 as ValueSlot)).toBe(true);
            expect(tracked.size).toBe(2);
        });

        it('should clear field buffer on untrack', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot);

            const buffer = new Float32Array([1.0, 2.0, 3.0]);
            debugService.updateFieldValue(30 as ValueSlot, buffer);

            // Verify data exists
            const r1 = debugService.getEdgeValue('field-edge');
            expect(r1?.kind).toBe('field');

            // Untrack
            debugService.untrackField(30 as ValueSlot);

            // Now should return field-untracked
            const r2 = debugService.getEdgeValue('field-edge');
            expect(r2?.kind).toBe('field-untracked');
        });
    });

    describe('edge metadata', () => {
        it('should return metadata for mapped edge', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            const meta = debugService.getEdgeMetadata('edge1');
            expect(meta).toEqual({
                slotId: 10 as ValueSlot,
                type: signalType('float'),
                cardinality: 'signal',
            });
        });

        it('should return undefined for unmapped edge metadata', () => {
            debugService.setEdgeToSlotMap(new Map());

            const meta = debugService.getEdgeMetadata('unknown');
            expect(meta).toBeUndefined();
        });
    });

    describe('status reporting', () => {
        it('should report healthy status when no unmapped edges', () => {
            const status = debugService.getStatus();
            expect(status.isHealthy).toBe(true);
            expect(status.unmappedEdges).toEqual([]);
            expect(status.totalEdgesMapped).toBe(0);
        });

        it('should report edge and port counts', () => {
            const edgeMap = new Map([
                ['e1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
                ['e2', { slotId: 20 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            const portMap = new Map([
                ['b:out', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.setPortToSlotMap(portMap);

            const status = debugService.getStatus();
            expect(status.totalEdgesMapped).toBe(2);
            expect(status.totalPortsMapped).toBe(1);
        });
    });

    describe('integration: full debug data flow simulation', () => {
        it('should simulate runtime→debugService→UI flow for signal edges', () => {
            // 1. Compiler produces edge-to-slot map
            const edgeMap = new Map([
                ['osc1-out->sin1-phase', { slotId: 5 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
                ['sin1-out->render', { slotId: 8 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // 2. Runtime executes and taps slot writes
            // Frame 1
            debugService.updateSlotValue(5 as ValueSlot, 0.0);
            debugService.updateSlotValue(8 as ValueSlot, 0.0);

            const r1 = debugService.getEdgeValue('osc1-out->sin1-phase');
            const r2 = debugService.getEdgeValue('sin1-out->render');
            expect(r1?.kind).toBe('signal');
            expect(r2?.kind).toBe('signal');
            if (r1?.kind === 'signal') expect(r1.value).toBe(0.0);
            if (r2?.kind === 'signal') expect(r2.value).toBe(0.0);

            // Frame 2
            debugService.updateSlotValue(5 as ValueSlot, 0.25);
            debugService.updateSlotValue(8 as ValueSlot, 0.707);

            const r3 = debugService.getEdgeValue('osc1-out->sin1-phase');
            const r4 = debugService.getEdgeValue('sin1-out->render');
            if (r3?.kind === 'signal') expect(r3.value).toBe(0.25);
            if (r4?.kind === 'signal') expect(r4.value).toBe(0.707);

            // 3. UI queries values (DebugStore or useDebugProbe)
            const phaseEdgeResult = debugService.getEdgeValue('osc1-out->sin1-phase');
            expect(phaseEdgeResult).toBeDefined();
            expect(phaseEdgeResult?.kind).toBe('signal');
            if (phaseEdgeResult?.kind === 'signal') {
                expect(phaseEdgeResult.type).toEqual(signalType('float'));
                expect(phaseEdgeResult.value).toBe(0.25);
            }
        });

        it('should simulate demand-driven field tracking flow', () => {
            // 1. Compiler produces edge map with field edge
            const edgeMap = new Map([
                ['add-out->render', { slotId: 30 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // 2. Initially untracked - UI gets field-untracked
            const r1 = debugService.getEdgeValue('add-out->render');
            expect(r1?.kind).toBe('field-untracked');

            // 3. User hovers edge - UI calls trackField
            debugService.trackField(30 as ValueSlot);

            // 4. Runtime materializes and writes buffer
            const buffer = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
            debugService.updateFieldValue(30 as ValueSlot, buffer);

            // 5. UI queries - gets stats
            const r2 = debugService.getEdgeValue('add-out->render');
            expect(r2?.kind).toBe('field');
            if (r2?.kind === 'field') {
                expect(r2.count).toBe(5);
                expect(r2.min).toBeCloseTo(0.1);
                expect(r2.max).toBeCloseTo(0.5);
                expect(r2.mean).toBeCloseTo(0.3);
            }

            // 6. User stops hovering - UI calls untrackField
            debugService.untrackField(30 as ValueSlot);

            // 7. Back to untracked
            const r3 = debugService.getEdgeValue('add-out->render');
            expect(r3?.kind).toBe('field-untracked');
        });
    });

    // =========================================================================
    // HistoryService Integration
    // =========================================================================

    describe('HistoryService integration', () => {
        it('updateSlotValue pushes to historyService', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // Track via historyService
            debugService.historyService.track({ kind: 'edge', edgeId: 'edge1' });

            // Push values via updateSlotValue
            debugService.updateSlotValue(10 as ValueSlot, 0.5);
            debugService.updateSlotValue(10 as ValueSlot, 0.75);

            // Verify history received the values
            const history = debugService.historyService.getHistory({ kind: 'edge', edgeId: 'edge1' });
            expect(history).toBeDefined();
            expect(history!.writeIndex).toBe(2);
            expect(history!.buffer[0]).toBe(0.5);
            expect(history!.buffer[1]).toBe(0.75);
        });

        it('setEdgeToSlotMap triggers onMappingChanged', () => {
            // Setup initial mapping
            const edgeMap1 = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap1);
            debugService.historyService.track({ kind: 'edge', edgeId: 'edge1' });
            debugService.updateSlotValue(10 as ValueSlot, 1.0);

            // Change mapping — edge1 now points to slot 20
            const edgeMap2 = new Map([
                ['edge1', { slotId: 20 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap2);

            // Old slot should not push to history
            debugService.updateSlotValue(10 as ValueSlot, 2.0);
            const history = debugService.historyService.getHistory({ kind: 'edge', edgeId: 'edge1' });
            expect(history!.writeIndex).toBe(1); // only the first write

            // New slot should push
            debugService.updateSlotValue(20 as ValueSlot, 3.0);
            expect(history!.writeIndex).toBe(2);
            expect(history!.buffer[1]).toBe(3.0);
        });

        it('setPortToSlotMap triggers onMappingChanged', () => {
            const portMap = new Map([
                ['block-1:out', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setPortToSlotMap(portMap);
            debugService.historyService.track({ kind: 'port', blockId: 'block-1', portName: 'out' });

            debugService.updateSlotValue(10 as ValueSlot, 42);
            const history = debugService.historyService.getHistory({ kind: 'port', blockId: 'block-1', portName: 'out' });
            expect(history!.writeIndex).toBe(1);
            expect(history!.buffer[0]).toBe(42);
        });

        it('clear() also clears historyService', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);
            debugService.historyService.track({ kind: 'edge', edgeId: 'edge1' });
            debugService.updateSlotValue(10 as ValueSlot, 1.0);

            debugService.clear();

            expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'edge1' })).toBe(false);
        });

        it('resolver correctly rejects field-cardinality edges', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 40 as ValueSlot, type: signalType('float'), cardinality: 'field' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            debugService.historyService.track({ kind: 'edge', edgeId: 'field-edge' });
            expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'field-edge' })).toBe(false);
        });

        it('ring buffer wraps correctly through DebugService integration', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float'), cardinality: 'signal' as const }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);
            debugService.historyService.track({ kind: 'edge', edgeId: 'edge1' });

            // Write 130 values (wraps around 128-capacity buffer)
            for (let i = 0; i < 130; i++) {
                debugService.updateSlotValue(10 as ValueSlot, i);
            }

            const history = debugService.historyService.getHistory({ kind: 'edge', edgeId: 'edge1' });
            expect(history!.writeIndex).toBe(130);
            expect(history!.filled).toBe(true);
            // Position 0 and 1 should have been overwritten with values 128, 129
            expect(history!.buffer[0]).toBe(128);
            expect(history!.buffer[1]).toBe(129);
        });
    });
});
