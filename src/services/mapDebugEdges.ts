import type { Patch } from '../graph';
import type { CompiledProgramIR } from '../compiler/ir/program';
import type { ValueSlot, PortId } from '../types';
import type { CanonicalType } from '../core/canonical-types';
import { FLOAT, canonicalType } from '../core/canonical-types';

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
    /** Detailed failure reason */
    reason: 'block-eliminated' | 'port-not-found' | 'slot-not-allocated' | 'debug-index-missing';
    /** Additional context about the failure */
    details?: string;
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
 * Generate debug port key for UI/debug layer.
 *
 * Format: "blockId:portName"
 *
 * Note: This is different from the compiler's internal portKey (which includes
 * blockIndex and direction) and is used only in the debug/UI layer for consistent
 * port identification across debug services.
 */
export function debugPortKey(blockId: string, portName: string): string {
    return `${blockId}:${portName}`;
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

    // Build lookup map: "blockId:portName" -> Slot
    // The debugIndex provides:
    // - ports: Array<PortBindingIR> (block index + port name)
    // - slotToPort: Map<ValueSlot, PortId>
    // - blockMap: Map<BlockIndex, BlockId>
    //
    // We reverse slotToPort to get portToSlot, then construct the string key.

    // First build PortId -> Slot lookup (reverse of slotToPort)
    const portToSlot = new Map<PortId, ValueSlot>();
    for (const [slot, portId] of debugIndex.slotToPort) {
        portToSlot.set(portId, slot);
    }

    // Build main lookup map and track cardinality per port
    const targetToSlot = new Map<string, ValueSlot>();
    const portCardinality = new Map<string, 'signal' | 'field'>();

    for (const portBinding of debugIndex.ports) {
        // Resolve BlockIndex to StringID
        const blockId = debugIndex.blockMap.get(portBinding.block);
        if (!blockId) {
            continue;
        }

        /**
         * Edge value mapping strategy:
         *
         * An edge's value is determined by its SOURCE output port. The debugIndex
         * tracks block outputs (not inputs), so we map source ports to their slots.
         *
         * For an edge A.out -> B.in:
         * - We look up A.out to find the slot carrying the value
         * - B.in consumes that slot directly (if it's a direct wire) or via a combine node
         * - The edge displays the value from A.out's slot
         */
        const key = debugPortKey(blockId, portBinding.portName);

        // Find the slot for this port
        const slot = portToSlot.get(portBinding.port);

        if (slot !== undefined) {
            targetToSlot.set(key, slot);
            // Track cardinality from port binding domain
            const cardinality: 'signal' | 'field' = portBinding.domain === 'field' ? 'field' : 'signal';
            portCardinality.set(key, cardinality);
        }
    }

    // Iterate edges and resolve, tracking unmapped edges
    const unmappedEdges: UnmappedEdgeInfo[] = [];

    for (const edge of patch.edges) {
        // We want the value flowing FROM the source
        const sourceKey = debugPortKey(edge.from.blockId, edge.from.slotId);
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
            // Track unmapped edge with detailed reason
            // Try to determine why the edge couldn't be mapped
            let reason: UnmappedEdgeInfo['reason'] = 'debug-index-missing';
            let details: string | undefined;

            // Check if source block exists in debug index
            const sourceBlockExists = Array.from(debugIndex.blockMap.values()).includes(edge.from.blockId);
            if (!sourceBlockExists) {
                reason = 'block-eliminated';
                details = `Source block '${edge.from.blockId}' was eliminated during compilation (likely constant-folding or dead code elimination)`;
            } else {
                // Block exists but port not found
                const sourcePortBinding = debugIndex.ports.find(p => {
                    const blockId = debugIndex.blockMap.get(p.block);
                    return blockId === edge.from.blockId && p.portName === edge.from.slotId;
                });
                
                if (!sourcePortBinding) {
                    reason = 'port-not-found';
                    details = `Output port '${edge.from.slotId}' not found in debug index for block '${edge.from.blockId}'`;
                } else {
                    // Port exists but no slot allocated
                    reason = 'slot-not-allocated';
                    details = `Port '${edge.from.slotId}' exists but no runtime slot was allocated (may be optimized away or unused)`;
                }
            }

            unmappedEdges.push({
                edgeId: edge.id,
                fromBlockId: edge.from.blockId,
                fromPort: edge.from.slotId,
                toBlockId: edge.to.blockId,
                toPort: edge.to.slotId,
                reason,
                details,
            });
        }
    }

    // Build port map for direct port queries (useful for unconnected outputs)
    const portMetaMap = new Map<string, EdgeMetadata>();
    for (const [portKey, slotId] of targetToSlot.entries()) {
        const meta = program.slotMeta.find(m => m.slot === slotId);
        const type = meta?.type || canonicalType(FLOAT);
        const cardinality = portCardinality.get(portKey);
        if (!cardinality) throw new Error(`Port ${portKey} missing cardinality after type solve`);
        portMetaMap.set(portKey, { slotId, type, cardinality });
    }

    return { edgeMap: edgeMetaMap, portMap: portMetaMap, unmappedEdges };
}
