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
import { canonicalType, canonicalManyDef } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../core/canonical-types';
import type { ArenaSlotDescriptor } from '../runtime/ArenaValueStore';

describe('DebugService', () => {
    beforeEach(() => {
        // Clear all data before each test
        debugService.clear();
    });

    describe('edge-to-slot mapping', () => {
        it('should store and retrieve edge-to-slot mapping', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
                ['edge2', { slotId: 20 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Update slot values
            debugService.updateSlotValue(10 as ValueSlot, 0.5);
            debugService.updateSlotValue(20 as ValueSlot, 0.75);

            // Query edge values
            const result1 = debugService.getEdgeValue('edge1');
            const result2 = debugService.getEdgeValue('edge2');

            expect(result1).toEqual({
                kind: 'scalar',
                value: 0.5,
                slotId: 10 as ValueSlot,
                type: canonicalType(FLOAT),
            });

            expect(result2).toEqual({
                kind: 'scalar',
                value: 0.75,
                slotId: 20 as ValueSlot,
                type: canonicalType(FLOAT),
            });
        });

        // DO NOT REMOVE!!! CRITICAL!!! YOU MUST FIX THE ACTUAL BUG!!!
        // If this test fails, it means the compiler is not registering edges
        // in the debug index. The fix is in the compiler, NOT here.
        it('should throw for unmapped edge (compiler bug)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
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

        it('should return undefined for single-instance edge whose slot has no value before runtime starts', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            // Do NOT update slot value - runtime hasn't started

            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });

        it('should throw for single-instance edge whose slot has no value after runtime starts (scheduling bug)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
                ['edge2', { slotId: 20 as ValueSlot, type: canonicalType(FLOAT) }],
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
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Simulate runtime tap updates
            debugService.updateSlotValue(10 as ValueSlot, 0.0);
            const r1 = debugService.getEdgeValue('edge1');
            expect(r1?.kind).toBe('scalar');
            if (r1?.kind === 'scalar') expect(r1.value).toBe(0.0);

            debugService.updateSlotValue(10 as ValueSlot, 0.5);
            const r2 = debugService.getEdgeValue('edge1');
            expect(r2?.kind).toBe('scalar');
            if (r2?.kind === 'scalar') expect(r2.value).toBe(0.5);

            debugService.updateSlotValue(10 as ValueSlot, 1.0);
            const r3 = debugService.getEdgeValue('edge1');
            expect(r3?.kind).toBe('scalar');
            if (r3?.kind === 'scalar') expect(r3.value).toBe(1.0);
        });

        it('should handle multiple edges pointing to same slot', () => {
            // This can happen if the same output is connected to multiple inputs
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
                ['edge2', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.42);

            const r1 = debugService.getEdgeValue('edge1');
            const r2 = debugService.getEdgeValue('edge2');
            expect(r1?.kind).toBe('scalar');
            expect(r2?.kind).toBe('scalar');
            if (r1?.kind === 'scalar') expect(r1.value).toBe(0.42);
            if (r2?.kind === 'scalar') expect(r2.value).toBe(0.42);
        });
    });

    describe('clear', () => {
        it('should clear all data and reset runtime state on recompile', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.5);

            // Verify data exists
            const r = debugService.getEdgeValue('edge1');
            expect(r?.kind).toBe('scalar');
            if (r?.kind === 'scalar') expect(r.value).toBe(0.5);

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
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap1);
            debugService.updateSlotValue(10 as ValueSlot, 0.5); // Runtime started

            debugService.clear();

            // Re-set the mapping with a new map
            const edgeMap2 = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap2);

            // Runtime hasn't started again, so should return undefined (not throw)
            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });

        it('should clear tracked field slots on clear', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, canonicalManyDef(FLOAT));

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

        it('should return value for mapped single-instance port', () => {
            const portMap = new Map([
                ['blockA:out', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setPortToSlotMap(portMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.75);

            const result = debugService.getPortValue('blockA', 'out');
            expect(result).toEqual({
                kind: 'scalar',
                value: 0.75,
                slotId: 10 as ValueSlot,
                type: canonicalType(FLOAT),
            });
        });

        it('should throw for mapped single-instance port with no value after runtime starts (scheduling bug)', () => {
            const portMap = new Map([
                ['blockA:out', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
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
                ['blockA:fieldOut', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
            ]);

            debugService.setPortToSlotMap(portMap);

            const result = debugService.getPortValue('blockA', 'fieldOut');
            expect(result).toEqual({
                kind: 'field-untracked',
                slotId: 30 as ValueSlot,
                type: canonicalManyDef(FLOAT),
            });
        });
    });

    describe('field tracking (demand-driven)', () => {
        it('should return field-untracked for untracked field edge', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Do NOT track the field
            const result = debugService.getEdgeValue('field-edge');
            expect(result).toEqual({
                kind: 'field-untracked',
                slotId: 30 as ValueSlot,
                type: canonicalManyDef(FLOAT),
            });
        });

        it('should return undefined for tracked field before runtime starts', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, canonicalManyDef(FLOAT));

            // Runtime hasn't started - should return undefined
            const result = debugService.getEdgeValue('field-edge');
            expect(result).toBeUndefined();
        });

        it('should throw for tracked field with no data after runtime starts (scheduling bug)', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, canonicalManyDef(FLOAT));

            // Start runtime by writing to a single-instance slot
            debugService.updateSlotValue(99 as ValueSlot, 1.0);

            // Tracked field with no buffer data - scheduling bug
            expect(() => debugService.getEdgeValue('field-edge')).toThrow(
                "Slot 30 is a tracked field but has no value"
            );
        });

        it('should return field stats for tracked field with data', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, floatType);

            // Simulate field materialization (4 scalar floats)
            const buffer = new Float32Array([0.25, 0.5, 0.75, 1.0]);
            debugService.updateFieldValue(30 as ValueSlot, buffer);

            const result = debugService.getEdgeValue('field-edge');
            expect(result?.kind).toBe('field');
            if (result?.kind === 'field') {
                expect(result.stats.count).toBe(4);
                expect(result.stats.min[0]).toBe(0.25);
                expect(result.stats.max[0]).toBe(1.0);
                expect(result.stats.mean[0]).toBeCloseTo(0.625);
                expect(result.slotId).toBe(30 as ValueSlot);
                expect(result.buffer).toBeInstanceOf(Float32Array);
                expect(result.buffer.length).toBe(4);
            }
        });

        it('should return zero stats for tracked field with empty buffer', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['empty-field', { slotId: 31 as ValueSlot, type: floatType }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(31 as ValueSlot, floatType);

            const buffer = new Float32Array(0);
            debugService.updateFieldValue(31 as ValueSlot, buffer);

            const result = debugService.getEdgeValue('empty-field');
            expect(result?.kind).toBe('field');
            if (result?.kind === 'field') {
                expect(result.stats.count).toBe(0);
            }
        });

        it('should track and untrack field slots', () => {
            debugService.trackField(30 as ValueSlot, canonicalManyDef(FLOAT));
            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

            debugService.untrackField(30 as ValueSlot);
            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
        });

        it('uses ref-count semantics for repeated field tracking', () => {
            const type = canonicalManyDef(FLOAT);
            debugService.trackField(30 as ValueSlot, type);
            debugService.trackField(30 as ValueSlot, type);
            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

            debugService.untrackField(30 as ValueSlot);
            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(true);

            debugService.untrackField(30 as ValueSlot);
            expect(debugService.isFieldTracked(30 as ValueSlot)).toBe(false);
        });

        it('should report tracked slots via getTrackedFieldSlots', () => {
            debugService.trackField(30 as ValueSlot, canonicalManyDef(FLOAT));
            debugService.trackField(31 as ValueSlot, canonicalManyDef(FLOAT));

            const tracked = debugService.getTrackedFieldSlots();
            expect(tracked.has(30 as ValueSlot)).toBe(true);
            expect(tracked.has(31 as ValueSlot)).toBe(true);
            expect(tracked.size).toBe(2);
        });

        it('should clear field buffer on untrack', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: canonicalManyDef(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, canonicalManyDef(FLOAT));

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
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            const meta = debugService.getEdgeMetadata('edge1');
            expect(meta).toEqual({
                slotId: 10 as ValueSlot,
                type: canonicalType(FLOAT),
            });
        });

        it('should return undefined for unmapped edge metadata', () => {
            debugService.setEdgeToSlotMap(new Map());

            const meta = debugService.getEdgeMetadata('unknown');
            expect(meta).toBeUndefined();
        });

        it('should return metadata for mapped port', () => {
            const portMap = new Map([
                ['block-1:out', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setPortToSlotMap(portMap);

            const meta = debugService.getPortMetadata('block-1', 'out');
            expect(meta).toEqual({
                slotId: 10 as ValueSlot,
                type: canonicalType(FLOAT),
            });
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
                ['e1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
                ['e2', { slotId: 20 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            const portMap = new Map([
                ['b:out', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.setPortToSlotMap(portMap);

            const status = debugService.getStatus();
            expect(status.totalEdgesMapped).toBe(2);
            expect(status.totalPortsMapped).toBe(1);
        });
    });

    describe('integration: full debug data flow simulation', () => {
        it('should simulate runtime→debugService→UI flow for single-instance edges', () => {
            // 1. Compiler produces edge-to-slot map
            const edgeMap = new Map([
                ['osc1-out->sin1-phase', { slotId: 5 as ValueSlot, type: canonicalType(FLOAT) }],
                ['sin1-out->render', { slotId: 8 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // 2. Runtime executes and taps slot writes
            // Frame 1
            debugService.updateSlotValue(5 as ValueSlot, 0.0);
            debugService.updateSlotValue(8 as ValueSlot, 0.0);

            const r1 = debugService.getEdgeValue('osc1-out->sin1-phase');
            const r2 = debugService.getEdgeValue('sin1-out->render');
            expect(r1?.kind).toBe('scalar');
            expect(r2?.kind).toBe('scalar');
            if (r1?.kind === 'scalar') expect(r1.value).toBe(0.0);
            if (r2?.kind === 'scalar') expect(r2.value).toBe(0.0);

            // Frame 2
            debugService.updateSlotValue(5 as ValueSlot, 0.25);
            debugService.updateSlotValue(8 as ValueSlot, 0.707);

            const r3 = debugService.getEdgeValue('osc1-out->sin1-phase');
            const r4 = debugService.getEdgeValue('sin1-out->render');
            if (r3?.kind === 'scalar') expect(r3.value).toBe(0.25);
            if (r4?.kind === 'scalar') expect(r4.value).toBe(0.707);

            // 3. UI queries values (DebugStore or useDebugProbe)
            const phaseEdgeResult = debugService.getEdgeValue('osc1-out->sin1-phase');
            expect(phaseEdgeResult).toBeDefined();
            expect(phaseEdgeResult?.kind).toBe('scalar');
            if (phaseEdgeResult?.kind === 'scalar') {
                expect(phaseEdgeResult.type).toEqual(canonicalType(FLOAT));
                expect(phaseEdgeResult.value).toBe(0.25);
            }
        });

        it('should simulate demand-driven field tracking flow', () => {
            const floatType = canonicalManyDef(FLOAT);
            // 1. Compiler produces edge map with field edge
            const edgeMap = new Map([
                ['add-out->render', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // 2. Initially untracked - UI gets field-untracked
            const r1 = debugService.getEdgeValue('add-out->render');
            expect(r1?.kind).toBe('field-untracked');

            // 3. User hovers edge - UI calls trackField with type
            debugService.trackField(30 as ValueSlot, floatType);

            // 4. Runtime materializes and writes buffer
            const buffer = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
            debugService.updateFieldValue(30 as ValueSlot, buffer);

            // 5. UI queries - gets accumulated stats + raw buffer
            const r2 = debugService.getEdgeValue('add-out->render');
            expect(r2?.kind).toBe('field');
            if (r2?.kind === 'field') {
                expect(r2.stats.count).toBe(5);
                expect(r2.stats.min[0]).toBeCloseTo(0.1);
                expect(r2.stats.max[0]).toBeCloseTo(0.5);
                expect(r2.stats.mean[0]).toBeCloseTo(0.3);
                expect(r2.buffer).toBeInstanceOf(Float32Array);
                expect(r2.buffer.length).toBe(5);
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
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
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
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap1);
            debugService.historyService.track({ kind: 'edge', edgeId: 'edge1' });
            debugService.updateSlotValue(10 as ValueSlot, 1.0);

            // Change mapping — edge1 now points to slot 20
            const edgeMap2 = new Map([
                ['edge1', { slotId: 20 as ValueSlot, type: canonicalType(FLOAT) }],
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
                ['block-1:out', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
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
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);
            debugService.historyService.track({ kind: 'edge', edgeId: 'edge1' });
            debugService.updateSlotValue(10 as ValueSlot, 1.0);

            debugService.clear();

            expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'edge1' })).toBe(false);
        });

        it('resolver correctly rejects field-cardinality edges', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 40 as ValueSlot, type: canonicalManyDef(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            debugService.historyService.track({ kind: 'edge', edgeId: 'field-edge' });
            expect(debugService.historyService.isTracked({ kind: 'edge', edgeId: 'field-edge' })).toBe(false);
        });

        it('ring buffer wraps correctly through DebugService integration', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
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

        it('uses ref-count semantics for key-based history tracking', () => {
            const key = { kind: 'edge', edgeId: 'edge1' } as const;
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            debugService.trackHistoryKey(key);
            debugService.trackHistoryKey(key);
            expect(debugService.historyService.isTracked(key)).toBe(true);

            debugService.untrackHistoryKey(key);
            expect(debugService.historyService.isTracked(key)).toBe(true);

            debugService.untrackHistoryKey(key);
            expect(debugService.historyService.isTracked(key)).toBe(false);
        });
    });

    // =========================================================================
    // Field Accumulator Integration
    // =========================================================================

    describe('field accumulator integration', () => {
        it('all-time min/max only expand over multiple frames', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, floatType);

            // Frame 1: range [0.3, 0.7]
            debugService.updateFieldValue(30 as ValueSlot, new Float32Array([0.3, 0.5, 0.7]));
            let r = debugService.getEdgeValue('field-edge');
            expect(r?.kind).toBe('field');
            if (r?.kind === 'field') {
                expect(r.stats.min[0]).toBeCloseTo(0.3);
                expect(r.stats.max[0]).toBeCloseTo(0.7);
            }

            // Frame 2: narrower range [0.4, 0.6] — all-time min/max should NOT shrink
            debugService.updateFieldValue(30 as ValueSlot, new Float32Array([0.4, 0.5, 0.6]));
            r = debugService.getEdgeValue('field-edge');
            if (r?.kind === 'field') {
                expect(r.stats.min[0]).toBeCloseTo(0.3);  // Still 0.3 from frame 1
                expect(r.stats.max[0]).toBeCloseTo(0.7);  // Still 0.7 from frame 1
            }

            // Frame 3: wider range [0.1, 0.9] — all-time min/max should expand
            debugService.updateFieldValue(30 as ValueSlot, new Float32Array([0.1, 0.5, 0.9]));
            r = debugService.getEdgeValue('field-edge');
            if (r?.kind === 'field') {
                expect(r.stats.min[0]).toBeCloseTo(0.1);  // Expanded to 0.1
                expect(r.stats.max[0]).toBeCloseTo(0.9);  // Expanded to 0.9
            }
        });

        it('EMA mean smooths over time', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, floatType);

            // Push 100 frames of value 1.0
            for (let i = 0; i < 100; i++) {
                debugService.updateFieldValue(30 as ValueSlot, new Float32Array([1.0]));
            }
            let r = debugService.getEdgeValue('field-edge');
            if (r?.kind === 'field') {
                expect(r.stats.mean[0]).toBeCloseTo(1.0, 2);
            }

            // Push 1 frame of value 100.0 — mean should barely move
            debugService.updateFieldValue(30 as ValueSlot, new Float32Array([100.0]));
            r = debugService.getEdgeValue('field-edge');
            if (r?.kind === 'field') {
                // EMA with alpha ~0.000385 means mean moves <0.04 per frame
                expect(r.stats.mean[0]).toBeLessThan(1.1);
            }
        });

        it('accumulators reset on setEdgeToSlotMap', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap1 = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap1);
            debugService.trackField(30 as ValueSlot, floatType);
            debugService.updateFieldValue(30 as ValueSlot, new Float32Array([0.1, 0.9]));

            // Re-set mapping (simulates recompile)
            debugService.setEdgeToSlotMap(edgeMap1);

            // Accumulator should be gone
            expect(debugService.getFieldHistory(30 as ValueSlot)).toBeUndefined();
        });

        it('getFieldHistory returns temporal history', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(30 as ValueSlot, floatType);

            // Push 5 frames
            for (let i = 0; i < 5; i++) {
                debugService.updateFieldValue(30 as ValueSlot, new Float32Array([i * 0.1, i * 0.2]));
            }

            const history = debugService.getFieldHistory(30 as ValueSlot);
            expect(history).toBeDefined();
            expect(history!.writeIndex).toBe(5);
            expect(history!.stride).toBe(1);
            expect(history!.filled).toBe(false);
        });

        it('multi-stride color field accumulation', () => {
            const colorType = canonicalManyDef(COLOR);
            const edgeMap = new Map([
                ['color-edge', { slotId: 40 as ValueSlot, type: colorType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);
            debugService.trackField(40 as ValueSlot, colorType);

            // 2 lanes of RGBA: [r1,g1,b1,a1, r2,g2,b2,a2]
            const buffer = new Float32Array([
                0.2, 0.4, 0.6, 1.0,
                0.8, 0.6, 0.4, 0.5,
            ]);
            debugService.updateFieldValue(40 as ValueSlot, buffer);

            const r = debugService.getEdgeValue('color-edge');
            expect(r?.kind).toBe('field');
            if (r?.kind === 'field') {
                expect(r.stats.stride).toBe(4);
                expect(r.stats.count).toBe(2);
                // R channel: min=0.2, max=0.8
                expect(r.stats.min[0]).toBeCloseTo(0.2);
                expect(r.stats.max[0]).toBeCloseTo(0.8);
                // G channel: min=0.4, max=0.6
                expect(r.stats.min[1]).toBeCloseTo(0.4);
                expect(r.stats.max[1]).toBeCloseTo(0.6);
                // Raw buffer is available
                expect(r.buffer.length).toBe(8);
            }
        });
    });

    // =========================================================================
    // Arena Reads (zdru.4)
    // =========================================================================

    describe('arena reads (zdru.4)', () => {
        /**
         * Build a minimal arena layout: one entry at slot `slotId` with the
         * given descriptor, all others left as sentinel (offset:-1).
         */
        function makeArenaLayout(slotId: number, desc: ArenaSlotDescriptor): ArenaSlotDescriptor[] {
            const sentinel: ArenaSlotDescriptor = { offset: -1, stride: 0, laneCount: 0, length: 0 };
            const layout: ArenaSlotDescriptor[] = Array.from({ length: slotId + 1 }, () => sentinel);
            layout[slotId] = desc;
            return layout;
        }

        it('reads one-cardinality value from arena when arenaRef is set', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // Build arena: slot 10 → offset 0, stride 1, laneCount 1
            const arena = new Float32Array(1);
            const layout = makeArenaLayout(10, { offset: 0, stride: 1, laneCount: 1, length: 1 });
            debugService.setArenaRef(arena, layout);

            // Write a distinct value directly to the arena (not via updateSlotValue)
            arena[0] = 0.42;

            // Trigger runtimeStarted without touching slot 10 in the Map
            debugService.updateSlotValue(99 as ValueSlot, 0);

            const result = debugService.getEdgeValue('edge1');
            expect(result?.kind).toBe('scalar');
            if (result?.kind === 'scalar') {
                // Must come from arena (0.42), not from slotValues map (undefined/0 for slot 10)
                expect(result.value).toBeCloseTo(0.42);
            }
        });

        it('backfills scalar history from arena query when slot has no tap writes', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            const arena = new Float32Array(1);
            const layout = makeArenaLayout(10, { offset: 0, stride: 1, laneCount: 1, length: 1 });
            debugService.setArenaRef(arena, layout);
            arena[0] = 0.33;

            // Start runtime without writing slot 10 via tap path.
            debugService.updateSlotValue(99 as ValueSlot, 0);
            debugService.trackHistoryKey({ kind: 'edge', edgeId: 'edge1' });

            const result = debugService.getEdgeValue('edge1');
            expect(result?.kind).toBe('scalar');

            const history = debugService.historyService.getHistory({ kind: 'edge', edgeId: 'edge1' });
            expect(history).toBeDefined();
            expect(history!.writeIndex).toBeGreaterThan(0);
            expect(history!.buffer[0]).toBeCloseTo(0.33);
        });

        it('returns undefined for arena value before runtime starts', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            const arena = new Float32Array(1);
            const layout = makeArenaLayout(10, { offset: 0, stride: 1, laneCount: 1, length: 1 });
            debugService.setArenaRef(arena, layout);

            // Do NOT call updateSlotValue — runtime has not started
            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });

        it('reads field buffer from arena as a zero-copy view', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // Arena: slot 30 → offset 0, stride 1, laneCount 4 (4 float lanes)
            const arena = new Float32Array(4);
            const layout = makeArenaLayout(30, { offset: 0, stride: 1, laneCount: 4, length: 4 });
            debugService.setArenaRef(arena, layout);

            debugService.trackField(30 as ValueSlot, floatType);

            // Write values directly to arena
            arena[0] = 0.1; arena[1] = 0.2; arena[2] = 0.3; arena[3] = 0.4;

            // Trigger runtimeStarted + feed accumulator for stats
            debugService.updateFieldValue(30 as ValueSlot, new Float32Array([0.1, 0.2, 0.3, 0.4]));

            const result = debugService.getEdgeValue('field-edge');
            expect(result?.kind).toBe('field');
            if (result?.kind === 'field') {
                // Buffer comes from arena (zero-copy view)
                expect(result.buffer[0]).toBeCloseTo(0.1);
                expect(result.buffer[1]).toBeCloseTo(0.2);
                expect(result.buffer.length).toBe(4);

                // Verify zero-copy: mutating arena is reflected in the view
                arena[0] = 0.99;
                const result2 = debugService.getEdgeValue('field-edge');
                if (result2?.kind === 'field') {
                    expect(result2.buffer[0]).toBeCloseTo(0.99);
                }
            }
        });

        it('backfills field histories from arena query when slot has no tap writes', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            const arena = new Float32Array([0.1, 0.2, 0.3, 0.4]);
            const layout = makeArenaLayout(30, { offset: 0, stride: 1, laneCount: 4, length: 4 });
            debugService.setArenaRef(arena, layout);

            debugService.trackField(30 as ValueSlot, floatType);
            debugService.updateSlotValue(99 as ValueSlot, 0); // mark runtime started

            const result = debugService.getEdgeValue('field-edge');
            expect(result?.kind).toBe('field');

            const fieldHistory = debugService.getFieldHistory(30 as ValueSlot);
            const instanceHistory = debugService.getFieldInstanceHistory(30 as ValueSlot);
            const bufferHistory = debugService.getFieldBufferHistory(30 as ValueSlot);
            expect(fieldHistory).toBeDefined();
            expect(fieldHistory!.writeIndex).toBeGreaterThan(0);
            expect(instanceHistory).toBeDefined();
            expect(instanceHistory!.writeIndex).toBeGreaterThan(0);
            expect(bufferHistory).toBeDefined();
            expect(bufferHistory!.writeIndex).toBeGreaterThan(0);
        });

        it('returns field-untracked from arena path for untracked field', () => {
            const floatType = canonicalManyDef(FLOAT);
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: floatType }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            const arena = new Float32Array(4);
            const layout = makeArenaLayout(30, { offset: 0, stride: 1, laneCount: 4, length: 4 });
            debugService.setArenaRef(arena, layout);

            // Do NOT track the field
            const result = debugService.getEdgeValue('field-edge');
            expect(result?.kind).toBe('field-untracked');
        });

        it('falls back to Map for slots with sentinel descriptor (offset < 0)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // Arena with sentinel for slot 10 (offset -1 = excluded from arena)
            const arena = new Float32Array(0);
            const sentinel: ArenaSlotDescriptor = { offset: -1, stride: 0, laneCount: 0, length: 0 };
            const layout: ArenaSlotDescriptor[] = new Array(11).fill(sentinel);
            debugService.setArenaRef(arena, layout);

            // Write via Map path
            debugService.updateSlotValue(10 as ValueSlot, 0.77);

            const result = debugService.getEdgeValue('edge1');
            expect(result?.kind).toBe('scalar');
            if (result?.kind === 'scalar') {
                expect(result.value).toBeCloseTo(0.77);
            }
        });

        it('clears arenaRef on setEdgeToSlotMap (recompile)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            const arena = new Float32Array(1);
            const layout = makeArenaLayout(10, { offset: 0, stride: 1, laneCount: 1, length: 1 });
            debugService.setArenaRef(arena, layout);
            arena[0] = 0.5;
            debugService.updateSlotValue(10 as ValueSlot, 0.5); // sets runtimeStarted

            // Re-set mapping (simulates recompile — invalidates old arena)
            debugService.setEdgeToSlotMap(edgeMap);

            // Arena is now null; runtime not started yet after recompile
            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });

        it('clears arenaRef on clear()', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: canonicalType(FLOAT) }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            const arena = new Float32Array(1);
            const layout = makeArenaLayout(10, { offset: 0, stride: 1, laneCount: 1, length: 1 });
            debugService.setArenaRef(arena, layout);

            debugService.clear();

            // After clear, edge map is gone — must throw
            expect(() => debugService.getEdgeValue('edge1')).toThrow(
                "[DebugService.getEdgeValue] Edge 'edge1' not found in edge-to-slot mapping"
            );
        });
    });
});
