
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
            enabled: true,
            sortKey: 0,
            role: { kind: 'user', meta: {} as Record<string, never> },
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

    it('should map multiple edges from same source block', () => {
        // blockA.out1 -> blockB.in1
        // blockA.out2 -> blockC.in1
        const mockPatch = {
            edges: [
                { id: 'edge1', from: { kind: 'port', blockId: 'blockA', slotId: 'out1' }, to: { kind: 'port', blockId: 'blockB', slotId: 'in1' } },
                { id: 'edge2', from: { kind: 'port', blockId: 'blockA', slotId: 'out2' }, to: { kind: 'port', blockId: 'blockC', slotId: 'in1' } },
            ],
        } as unknown as Patch;

        const blockMap = new Map<BlockId, string>();
        blockMap.set(0 as BlockId, 'blockA');

        const slotToPort = new Map<ValueSlot, PortId>();
        slotToPort.set(10 as ValueSlot, 0 as PortId); // out1 -> slot 10
        slotToPort.set(11 as ValueSlot, 1 as PortId); // out2 -> slot 11

        const ports = [
            { port: 0 as PortId, block: 0 as BlockId, portName: 'out1', direction: 'out' as const, domain: 'signal' as const, role: 'userWire' as const },
            { port: 1 as PortId, block: 0 as BlockId, portName: 'out2', direction: 'out' as const, domain: 'signal' as const, role: 'userWire' as const },
        ];

        const mockProgram = {
            debugIndex: { blockMap, slotToPort, ports, stepToBlock: new Map(), slotToBlock: new Map() } as DebugIndexIR,
            slotMeta: [
                { slot: 10 as ValueSlot, type: { kind: 'float' }, storage: 'f64', offset: 0 },
                { slot: 11 as ValueSlot, type: { kind: 'float' }, storage: 'f64', offset: 1 },
            ]
        } as unknown as CompiledProgramIR;

        const result = mapDebugEdges(mockPatch, mockProgram);

        expect(result.size).toBe(2);
        expect(result.get('edge1')?.slotId).toBe(10);
        expect(result.get('edge2')?.slotId).toBe(11);
    });

    it('should return empty map for patch with no edges', () => {
        const mockPatch = { edges: [] } as unknown as Patch;
        const mockProgram = {
            debugIndex: {
                blockMap: new Map(),
                slotToPort: new Map(),
                ports: [],
                stepToBlock: new Map(),
                slotToBlock: new Map()
            } as DebugIndexIR,
            slotMeta: []
        } as unknown as CompiledProgramIR;

        const result = mapDebugEdges(mockPatch, mockProgram);
        expect(result.size).toBe(0);
    });

    it('should skip edges whose source port is not in debugIndex', () => {
        // Edge references a port that doesn't exist in debugIndex
        const mockPatch = {
            edges: [
                { id: 'edge1', from: { kind: 'port', blockId: 'unknownBlock', slotId: 'out' }, to: { kind: 'port', blockId: 'blockB', slotId: 'in' } },
            ],
        } as unknown as Patch;

        const mockProgram = {
            debugIndex: {
                blockMap: new Map([[0 as BlockId, 'blockA']]),
                slotToPort: new Map(),
                ports: [],
                stepToBlock: new Map(),
                slotToBlock: new Map()
            } as DebugIndexIR,
            slotMeta: []
        } as unknown as CompiledProgramIR;

        const result = mapDebugEdges(mockPatch, mockProgram);
        expect(result.size).toBe(0);
    });

    // Tests for error conditions - must throw instead of silent failure
    describe('error conditions - must throw (no silent failures)', () => {
        it('should throw if debugIndex is undefined', () => {
            const mockPatch = { edges: [] } as unknown as Patch;
            const mockProgram = { debugIndex: undefined } as unknown as CompiledProgramIR;

            expect(() => mapDebugEdges(mockPatch, mockProgram)).toThrow('[mapDebugEdges] debugIndex is null/undefined');
        });

        it('should throw if debugIndex is null', () => {
            const mockPatch = { edges: [] } as unknown as Patch;
            const mockProgram = { debugIndex: null } as unknown as CompiledProgramIR;

            expect(() => mapDebugEdges(mockPatch, mockProgram)).toThrow('[mapDebugEdges] debugIndex is null/undefined');
        });

        it('should throw if debugIndex.ports is missing', () => {
            const mockPatch = { edges: [] } as unknown as Patch;
            const mockProgram = {
                debugIndex: {
                    blockMap: new Map(),
                    slotToPort: new Map()
                    // ports missing
                }
            } as unknown as CompiledProgramIR;

            expect(() => mapDebugEdges(mockPatch, mockProgram)).toThrow('[mapDebugEdges] debugIndex.ports is missing');
        });

        it('should throw if debugIndex.blockMap is missing', () => {
            const mockPatch = { edges: [] } as unknown as Patch;
            const mockProgram = {
                debugIndex: {
                    ports: [],
                    slotToPort: new Map()
                    // blockMap missing
                }
            } as unknown as CompiledProgramIR;

            expect(() => mapDebugEdges(mockPatch, mockProgram)).toThrow('[mapDebugEdges] debugIndex.blockMap is missing');
        });

        it('should throw if debugIndex.slotToPort is missing', () => {
            const mockPatch = { edges: [] } as unknown as Patch;
            const mockProgram = {
                debugIndex: {
                    ports: [],
                    blockMap: new Map()
                    // slotToPort missing
                }
            } as unknown as CompiledProgramIR;

            expect(() => mapDebugEdges(mockPatch, mockProgram)).toThrow('[mapDebugEdges] debugIndex.slotToPort is missing');
        });
    });
});
