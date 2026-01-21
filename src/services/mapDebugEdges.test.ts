
import { describe, it, expect } from 'vitest';
import { mapDebugEdges } from './mapDebugEdges';
import type { Patch, Edge } from '../graph/Patch';
import type { CompiledProgramIR, DebugIndexIR } from '../compiler/ir/program';
import type { ValueSlot, BlockId, PortId } from '../compiler/ir/program';

describe('mapDebugEdges', () => {
    it('should map edges to source slots correctly', () => {
        // Setup Mock Patch
        const mockEdge: Edge = {
            id: 'edge1',
            from: { kind: 'port', blockId: 'blockA', slotId: 'out' },
            to: { kind: 'port', blockId: 'blockB', slotId: 'in' },
        };

        const mockPatch = {
            edges: [mockEdge],
        } as unknown as Patch;

        // Setup Mock Program with DebugIndex
        // We simulate that 'blockA' is at BlockIndex 0
        // And its 'out' port is mapped to Slot 10

        // 1. blockMap: 0 -> 'blockA'
        const blockMap = new Map<BlockId, string>();
        blockMap.set(0 as BlockId, 'blockA');

        // 2. slotToPort: Slot 10 -> Port 0
        const slotToPort = new Map<ValueSlot, PortId>();
        slotToPort.set(10 as ValueSlot, 0 as PortId);

        // 3. ports: Port 0 is 'out' on Block 0
        const ports = [{
            port: 0 as PortId,
            block: 0 as BlockId,
            portName: 'out',
            direction: 'out' as const,
            domain: 'signal' as const,
            role: 'userWire' as const
        }];

        const mockProgram = {
            debugIndex: {
                blockMap,
                slotToPort,
                ports,
                stepToBlock: new Map(),
                slotToBlock: new Map(),
            } as DebugIndexIR,
            slotMeta: [
                // Meta for slot 10
                { slot: 10 as ValueSlot, type: { kind: 'float' }, storage: 'f64', offset: 0 }
            ]
        } as unknown as CompiledProgramIR;

        // Execute
        const result = mapDebugEdges(mockPatch, mockProgram);

        // Verify
        expect(result.size).toBe(1);
        const meta = result.get('edge1');
        expect(meta).toBeDefined();
        expect(meta?.slotId).toBe(10);
        expect(meta?.type).toEqual({ kind: 'float' });
    });

    it('should return empty map if debugIndex is missing', () => {
        const mockPatch = { edges: [] } as unknown as Patch;
        const mockProgram = { debugIndex: {} } as unknown as CompiledProgramIR;

        const result = mapDebugEdges(mockPatch, mockProgram);
        expect(result.size).toBe(0);
    });
});
