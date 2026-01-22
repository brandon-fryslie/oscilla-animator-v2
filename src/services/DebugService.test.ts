/**
 * Tests for DebugService - Runtime Value Observation
 *
 * Tests the full debug data flow:
 * Runtime tap → DebugService.updateSlotValue → DebugService.getEdgeValue → UI
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
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
                ['edge2', { slotId: 20 as ValueSlot, type: signalType('phase') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Update slot values
            debugService.updateSlotValue(10 as ValueSlot, 0.5);
            debugService.updateSlotValue(20 as ValueSlot, 0.75);

            // Query edge values
            const result1 = debugService.getEdgeValue('edge1');
            const result2 = debugService.getEdgeValue('edge2');

            expect(result1).toEqual({
                value: 0.5,
                slotId: 10 as ValueSlot,
                type: signalType('float'),
            });

            expect(result2).toEqual({
                value: 0.75,
                slotId: 20 as ValueSlot,
                type: signalType('phase'),
            });
        });

        it('should throw for unmapped edge (compiler bug)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.5);

            // Query unknown edge - should throw
            expect(() => debugService.getEdgeValue('unknownEdge')).toThrow(
                "[DebugService.getEdgeValue] Edge 'unknownEdge' not found in edge-to-slot mapping"
            );
        });

        it('should return undefined for edge whose slot has no value before runtime starts', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            // Do NOT update slot value - runtime hasn't started

            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });

        it('should throw for edge whose slot has no value after runtime starts (scheduling bug)', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
                ['edge2', { slotId: 20 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Start runtime by writing to one slot
            debugService.updateSlotValue(10 as ValueSlot, 0.5);

            // Query edge2 whose slot was never written - should throw (scheduling bug)
            expect(() => debugService.getEdgeValue('edge2')).toThrow(
                "[DebugService.getEdgeValue] Slot 20 for edge 'edge2' has no value"
            );
        });
    });

    describe('slot value updates', () => {
        it('should update slot values from runtime tap', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Simulate runtime tap updates
            debugService.updateSlotValue(10 as ValueSlot, 0.0);
            expect(debugService.getEdgeValue('edge1')?.value).toBe(0.0);

            debugService.updateSlotValue(10 as ValueSlot, 0.5);
            expect(debugService.getEdgeValue('edge1')?.value).toBe(0.5);

            debugService.updateSlotValue(10 as ValueSlot, 1.0);
            expect(debugService.getEdgeValue('edge1')?.value).toBe(1.0);
        });

        it('should handle multiple edges pointing to same slot', () => {
            // This can happen if the same output is connected to multiple inputs
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
                ['edge2', { slotId: 10 as ValueSlot, type: signalType('float') }], // Same slot
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.42);

            expect(debugService.getEdgeValue('edge1')?.value).toBe(0.42);
            expect(debugService.getEdgeValue('edge2')?.value).toBe(0.42);
        });
    });

    describe('clear', () => {
        it('should clear all data and reset runtime state on recompile', () => {
            const edgeMap = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.5);

            // Verify data exists
            expect(debugService.getEdgeValue('edge1')?.value).toBe(0.5);

            // Clear
            debugService.clear();

            // After clear, edge is not in mapping anymore - should throw
            expect(() => debugService.getEdgeValue('edge1')).toThrow(
                "[DebugService.getEdgeValue] Edge 'edge1' not found in edge-to-slot mapping"
            );
        });

        it('should reset runtimeStarted flag on clear', () => {
            // Create fresh maps since clear() clears by reference
            const edgeMap1 = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap1);
            debugService.updateSlotValue(10 as ValueSlot, 0.5); // Runtime started

            debugService.clear();

            // Re-set the mapping with a new map
            const edgeMap2 = new Map([
                ['edge1', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap2);

            // Runtime hasn't started again, so should return undefined (not throw)
            const result = debugService.getEdgeValue('edge1');
            expect(result).toBeUndefined();
        });
    });

    describe('port-based queries', () => {
        it('should return undefined for unmapped port (expected for inputs)', () => {
            debugService.setPortToSlotMap(new Map());

            // Input ports won't be in the port map - this is expected
            const result = debugService.getPortValue('someBlock', 'someInputPort');
            expect(result).toBeUndefined();
        });

        it('should return value for mapped port', () => {
            const portMap = new Map([
                ['blockA:out', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setPortToSlotMap(portMap);
            debugService.updateSlotValue(10 as ValueSlot, 0.75);

            const result = debugService.getPortValue('blockA', 'out');
            expect(result).toEqual({
                value: 0.75,
                slotId: 10 as ValueSlot,
                type: signalType('float'),
            });
        });

        it('should throw for mapped port with no value after runtime starts (scheduling bug)', () => {
            const portMap = new Map([
                ['blockA:out', { slotId: 10 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setPortToSlotMap(portMap);

            // Start runtime by writing to a different slot
            debugService.updateSlotValue(99 as ValueSlot, 1.0);

            // Port's slot was never written - should throw (scheduling bug)
            expect(() => debugService.getPortValue('blockA', 'out')).toThrow(
                "[DebugService.getPortValue] Slot 10 for port 'blockA:out' has no value"
            );
        });
    });

    describe('field values', () => {
        it('should store first element of field buffer as representative value', () => {
            const edgeMap = new Map([
                ['field-edge', { slotId: 30 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            // Simulate field materialization with buffer
            const buffer = new Float32Array([0.25, 0.5, 0.75, 1.0]);
            debugService.updateFieldValue(30 as ValueSlot, buffer);

            // First element should be stored as representative value
            const result = debugService.getEdgeValue('field-edge');
            expect(result?.value).toBe(0.25);
        });

        it('should handle empty buffer (store 0)', () => {
            const edgeMap = new Map([
                ['empty-field', { slotId: 31 as ValueSlot, type: signalType('float') }],
            ]);

            debugService.setEdgeToSlotMap(edgeMap);

            const buffer = new Float32Array(0);
            debugService.updateFieldValue(31 as ValueSlot, buffer);

            const result = debugService.getEdgeValue('empty-field');
            expect(result?.value).toBe(0);
        });
    });

    describe('integration: full debug data flow simulation', () => {
        it('should simulate runtime→debugService→UI flow', () => {
            // 1. Compiler produces edge-to-slot map
            const edgeMap = new Map([
                ['osc1-out->sin1-phase', { slotId: 5 as ValueSlot, type: signalType('phase') }],
                ['sin1-out->render', { slotId: 8 as ValueSlot, type: signalType('float') }],
            ]);
            debugService.setEdgeToSlotMap(edgeMap);

            // 2. Runtime executes and taps slot writes
            // Frame 1
            debugService.updateSlotValue(5 as ValueSlot, 0.0);
            debugService.updateSlotValue(8 as ValueSlot, 0.0);

            expect(debugService.getEdgeValue('osc1-out->sin1-phase')?.value).toBe(0.0);
            expect(debugService.getEdgeValue('sin1-out->render')?.value).toBe(0.0);

            // Frame 2
            debugService.updateSlotValue(5 as ValueSlot, 0.25);
            debugService.updateSlotValue(8 as ValueSlot, 0.707);

            expect(debugService.getEdgeValue('osc1-out->sin1-phase')?.value).toBe(0.25);
            expect(debugService.getEdgeValue('sin1-out->render')?.value).toBe(0.707);

            // 3. UI queries values (DebugStore or useDebugProbe)
            const phaseEdgeResult = debugService.getEdgeValue('osc1-out->sin1-phase');
            expect(phaseEdgeResult).toBeDefined();
            expect(phaseEdgeResult?.type).toEqual(signalType('phase'));
            expect(phaseEdgeResult?.value).toBe(0.25);
        });
    });
});
