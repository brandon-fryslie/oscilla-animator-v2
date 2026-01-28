import type { Patch } from '../graph';
import type { CompiledProgramIR, PortBindingIR } from '../compiler/ir/program';
import type { ValueSlot, PortId } from '../types';
import type { CanonicalType } from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION, canonicalType } from '../core/canonical-types';

/**
 * Edge metadata stored alongside slot mapping.
 * Includes type information for proper value formatting.
 */
export interface EdgeMetadata {
    /** Target slot ID that stores this edge's value */
    slotId: ValueSlot;

    /** Signal type for formatting (e.g., "Float", "Phase", "Color") */
    type: CanonicalType;

    /** Cardinality: signal (scalar) or field (buffer of N values) */
    cardinality: 'signal' | 'field';
}

/**
 * Details about an edge that couldn't be mapped to a slot.
 */
export interface UnmappedEdgeInfo {
    /** Edge ID */
    edgeId: string;
    /** Source block ID */
    fromBlockId: string;
    /** Source port name */
    fromPort: string;
    /** Target block ID */
    toBlockId: string;
    /** Target port name */
    toPort: string;
}

/**
 * Result from mapDebugEdges containing both edge and port mappings.
 */
export interface DebugMappings {
    /** Map from edge ID to slot metadata */
    edgeMap: Map<string, EdgeMetadata>;
    /** Map from "blockId:portName" to slot metadata (for unconnected outputs) */
    portMap: Map<string, EdgeMetadata>;
    /** Edges that couldn't be mapped (for error reporting) */
    unmappedEdges: UnmappedEdgeInfo[];
}

/**
 * Map patch edges to runtime slots using the compiled program's debug index.
 *
 * This function effectively "joins" the static patch structure with the
 * compiled runtime structure using the DebugIndex as the bridge.
 *
 * @param patch - The source patch containing edges to be mapped
 * @param program - The compiled program containing the debug index
 * @returns Map from Edge ID to EdgeMetadata
 */
export function mapDebugEdges(patch: Patch, program: CompiledProgramIR): Map<string, EdgeMetadata> {
    return mapDebugMappings(patch, program).edgeMap;
}

/**
 * Map patch edges and ports to runtime slots using the compiled program's debug index.
 *
 * Returns both edge-based mappings (for connected ports) and port-based mappings
 * (for querying unconnected output ports by blockId:portName).
 *
 * @param patch - The source patch containing edges to be mapped
 * @param program - The compiled program containing the debug index
 * @returns Both edge and port mappings
 */
export function mapDebugMappings(patch: Patch, program: CompiledProgramIR): DebugMappings {
    const edgeMetaMap = new Map<string, EdgeMetadata>();
    const debugIndex = program.debugIndex;

    // Guard: If debug index is missing required data, throw - silent failures hide bugs
    if (!debugIndex) {
        throw new Error('[mapDebugEdges] debugIndex is null/undefined - compiler did not produce debug information');
    }
    if (!debugIndex.ports) {
        throw new Error('[mapDebugEdges] debugIndex.ports is missing - compiler debug index is incomplete');
    }
    if (!debugIndex.blockMap) {
        throw new Error('[mapDebugEdges] debugIndex.blockMap is missing - compiler debug index is incomplete');
    }
    if (!debugIndex.slotToPort) {
        throw new Error('[mapDebugEdges] debugIndex.slotToPort is missing - compiler debug index is incomplete');
    }

    // 1. Build a fast lookup: "blockStringID:portName" -> Slot
    //    Navigate: (BlockStringID, PortName) -> (BlockIndex, PortName) -> PortIndex -> Slot
    //    But easier: iterate ports, resolve their BlockIndex to StringID, map StringID:PortName -> Slot

    // First build PortId -> Slot lookup (reverse of slotToPort)
    const portToSlot = new Map<PortId, ValueSlot>();
    for (const [slot, portId] of debugIndex.slotToPort) {
        // Note: slotToPort keys are ValueSlots, values are PortIds
        portToSlot.set(portId, slot);
    }

    // Now build the main lookup map
    const targetToSlot = new Map<string, ValueSlot>();
    // Track cardinality per port key for EdgeMetadata
    const portCardinality = new Map<string, 'signal' | 'field'>();

    for (const portBinding of debugIndex.ports) {
        // Resolve BlockIndex to StringID
        const blockId = debugIndex.blockMap.get(portBinding.block);
        if (!blockId) {
            continue;
        }

        // We only care about matching edge targets (which connect to INPUT ports),
        // but the IR mostly tracks OUTPUT ports of blocks.
        // However, for edges, we want to know what SLOT carries the value flowing INTO a destination.
        // 
        // In our IR model, values are carried by SLOTS. 
        // An edge connects Source:Port -> Dest:Port.
        // The value on the edge is the value of the Source:Port (or a wire slot).
        // 
        // Wait - `buildEdgeToSlotMap` logic was:
        // "For each edge... Look up the target port... Find the slot assigned to that port"
        //
        // If the target port is an input, does it have a slot?
        // In passes-v2, input resolution might map to a wire slot or a combine slot.
        //
        // Let's re-read the original logic being replaced:
        // const targetPortKey = `${edge.to.blockId}:${edge.to.slotId}`;
        // const slotId = portToSlot.get(targetPortKey);
        //
        // The original logic assumed `debugIndex.slotToPort` contained keys like "blockId:portId".
        // But `debugIndex.slotToPort` in `compile.ts` (BEFORE my change) was mapping Slot -> PortKeyString.
        //
        // IN MY NEW `compile.ts`:
        // `slotToPort` maps `ValueSlot` -> `PortIndex` (number).
        // `ports` array contains `PortBindingIR` which has `block` (BlockIndex) and `portName` (string).

        // So we can reconstruct the lookup:
        // key = `${blockStringId}:${portName}` -> PortIndex
        // Then PortIndex -> Slot (using portToSlot derived from slotToPort... wait, slotToPort is 1:1?)
        // 
        // Actually, `unlinkedIR.blockOutputs` maps outputs.
        // Does it map inputs? No.
        // 
        // CRITICAL REALIZATION:
        // The generic `buildEdgeToSlotMap` logic was flawed if it expected to find INPUT ports in `blockOutputs`.
        // `blockOutputs` only lists OUTPUTS.
        // 
        // However, an edge's value is determined by its SOURCE, or strictly speaking, the slot it drives.
        // If we want to debug "what is on this edge", we usually want the value of the source output.
        // 
        // Let's look at how `Pass 6` worked.
        // It lowered blocks and produced `blockOutputs`.
        //
        // If we look at the original `buildEdgeToSlotMap`:
        // It iterated `edge.to.blockId` and looked that up.
        // That implies it expected the IR to register slots for INPUT ports.
        // 
        // Does `IRBuilder` register input slots?
        // `resolveInputsWithMultiInput` -> creates combine nodes or passes through wires.
        // 
        // If `resolveInputsWithMultiInput` creates a combine node, that node has an output slot.
        // But that output slot is not "registered" in `blockOutputs`.
        // 
        // If it's a direct wire, there is no specific slot for the input—it's just the source slot.
        // 
        // **HYPOTHESIS**: The previous implementation was likely identifying the *source* slot of the connection 
        // (if it was a direct wire) or the *combine* slot (if it was a combine).
        // 
        // Wait, let's check `compile.ts` PREVIOUS state again (from memory/context):
        // `debugIndex.slotToPort` was being populated... where?
        // It wasn't visible in `compile.ts` pass 6 logic I read earlier.
        // 
        // Actually, looking at `Pass 6` code:
        // `unlinkedIR` didn't seem to produce `debugIndex`.
        // `convertLinkedIRToProgram` was creating an EMPTY `debugIndex`.
        // 
        // That was the bug! `debugIndex` didn't exist!
        // 
        // So my NEW logic in `compile.ts` populates `debugIndex` from `result.outputsById`.
        // `outputsById` usually contains block OUTPUTS.
        // 
        // So if I want to debug an edge `A.out -> B.in`, I should look up `A.out`.
        // 
        // The previous (broken) logic tried to look up `edge.to` (`B.in`).
        // `const targetPortKey = `${edge.to.blockId}:${edge.to.slotId}`;`
        // 
        // If I map `A.out`, I get the value flowing out of A.
        // That is the value on the edge `A.out -> B.in`.
        // 
        // So I should map `edge.from.blockId` + `edge.from.slotId`.
        // 
        // Let's verify this assumption.
        // If I look up `B.in`, I might find nothing if B just consumes the slot from A.
        // 
        // So, the mapping should be based on the SOURCE of the edge.
        // 
        // Correct Logic:
        // 1. Identifying the "Value" of an edge means identifying the stored value at its source.
        // 2. Map Key: `${edge.from.blockId}:${edge.from.slotId}`.
        // 3. Lookup: Find the slot associated with this Source Port.

        // Update the lookup key construction:
        // TODO: needs to use canonical portKey fn
        const key = `${blockId}:${portBinding.portName}`;

        // Find the slot for this port
        // portToSlot map we built above maps PortIndex -> Slot
        const slot = portToSlot.get(portBinding.port);

        if (slot !== undefined) {
            targetToSlot.set(key, slot);
            // Track cardinality from port binding domain
            const cardinality: 'signal' | 'field' = portBinding.domain === 'field' ? 'field' : 'signal';
            portCardinality.set(key, cardinality);
        }
    }

    // 2. Iterate edges and resolve, tracking unmapped edges
    const unmappedEdges: UnmappedEdgeInfo[] = [];

    for (const edge of patch.edges) {
        // We want the value flowing FROM the source
        const sourceKey = `${edge.from.blockId}:${edge.from.slotId}`;
        const slotId = targetToSlot.get(sourceKey);

        if (slotId !== undefined) {
            const meta = program.slotMeta.find(m => m.slot === slotId);
            const type = meta?.type || canonicalType(FLOAT);
            const cardinality = portCardinality.get(sourceKey) || 'signal';

            edgeMetaMap.set(edge.id, {
                slotId,
                type,
                cardinality,
            });
        } else {
            // Track unmapped edge for error reporting
            unmappedEdges.push({
                edgeId: edge.id,
                fromBlockId: edge.from.blockId,
                fromPort: edge.from.slotId,
                toBlockId: edge.to.blockId,
                toPort: edge.to.slotId,
            });
        }
    }

    // 3. Build port map for direct port queries (useful for unconnected outputs)
    const portMetaMap = new Map<string, EdgeMetadata>();
    for (const [portKey, slotId] of targetToSlot.entries()) {
        const meta = program.slotMeta.find(m => m.slot === slotId);
        const type = meta?.type || canonicalType(FLOAT);
        const cardinality = portCardinality.get(portKey) ?? 'signal';
        portMetaMap.set(portKey, { slotId, type, cardinality });
    }

    return { edgeMap: edgeMetaMap, portMap: portMetaMap, unmappedEdges };
}
