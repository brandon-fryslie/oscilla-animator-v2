/**
 * Type Checker Pass - SINGLE ENFORCER for type compatibility
 *
 * Validates all connections are type-compatible before lowering.
 * Catches type mismatches at compile time instead of runtime.
 *
 * Adheres to architectural law: SINGLE ENFORCER
 */
import { getBlock } from '../blocks/registry';
import { getConversion } from '../../types';
/**
 * Check all edge connections for type compatibility
 *
 * @param patch - Normalized patch with blocks and edges
 * @returns Array of type check errors (empty if valid)
 */
export function checkTypes(patch) {
    const errors = [];
    for (const edge of patch.edges) {
        const sourceBlock = patch.blocks[edge.fromBlock];
        const targetBlock = patch.blocks[edge.toBlock];
        const sourceDef = getBlock(sourceBlock.type);
        const targetDef = getBlock(targetBlock.type);
        if (!sourceDef || !targetDef) {
            // Will be caught by "unknown block" error in lowering
            continue;
        }
        // Find port definitions
        const sourcePort = sourceDef.outputs.find(p => p.portId === edge.fromPort);
        const targetPort = targetDef.inputs.find(p => p.portId === edge.toPort);
        if (!sourcePort) {
            errors.push({
                kind: 'UnknownPort',
                message: `Source block '${sourceBlock.type}' does not have output port '${edge.fromPort}'`,
                blockId: sourceBlock.id,
                portId: edge.fromPort,
            });
            continue;
        }
        if (!targetPort) {
            errors.push({
                kind: 'UnknownPort',
                message: `Target block '${targetBlock.type}' does not have input port '${edge.toPort}'`,
                blockId: targetBlock.id,
                portId: edge.toPort,
            });
            continue;
        }
        // Check type compatibility
        const conversion = getConversion(sourcePort.type, targetPort.type);
        if (conversion === null) {
            errors.push({
                kind: 'TypeMismatch',
                message: `Cannot connect ${sourcePort.type.world}:${sourcePort.type.domain} to ${targetPort.type.world}:${targetPort.type.domain} (${sourceBlock.type}.${edge.fromPort} → ${targetBlock.type}.${edge.toPort})`,
                blockId: sourceBlock.id,
                portId: edge.fromPort,
            });
        }
    }
    // Check for missing required inputs
    for (const block of patch.blocks) {
        const blockDef = getBlock(block.type);
        if (!blockDef)
            continue;
        for (const inputPort of blockDef.inputs) {
            // Skip optional ports
            if (inputPort.optional)
                continue;
            // Check if this input is connected
            const isConnected = patch.edges.some(edge => edge.toBlock === patch.blocks.indexOf(block) && edge.toPort === inputPort.portId);
            if (!isConnected && !inputPort.defaultValue) {
                errors.push({
                    kind: 'MissingRequiredInput',
                    message: `Block '${block.type}' is missing required input '${inputPort.portId}'`,
                    blockId: block.id,
                    portId: inputPort.portId,
                });
            }
        }
    }
    return errors;
}
