/**
 * Pass 2: Type Graph Construction
 *
 * Transforms a NormalizedPatch into a TypedPatch by:
 * 1. Converting SlotType strings to IR TypeDesc
 * 2. Validating bus type eligibility (only scalars can be buses)
 * 3. Enforcing reserved bus type constraints (phaseA, pulse, energy, palette)
 * 4. Building block output types map
 *
 * This pass establishes the type system foundation for all subsequent passes.
 *
 * NOTE: After Bus-Block Unification (2026-01-02), all connections use unified edges.
 *
 * References:
 * - HANDOFF.md Topic 3: Pass 2 - Type Graph
 * - design-docs/12-Compiler-Final/15-Canonical-Lowering-Pipeline.md § Pass 2
 */
import { createTypeDesc } from "../../core/types";
import { getBlockDefinition } from "../../blocks/registry";
/**
 * Convert editor SlotType (TypeDesc) to IR TypeDesc.
 *
 * Note: After TypeDesc unification, SlotType is already a TypeDesc object,
 * so this function primarily validates and normalizes the type.
 *
 * @param slotType - The slot type (now a TypeDesc object)
 * @returns A TypeDesc for the IR
 * @throws Error if the slot type cannot be parsed
 */
function slotTypeToTypeDesc(slotType) {
    // SlotType is now TypeDesc, so just return it
    // We may need to normalize or validate in the future
    return slotType;
}
/**
 * Check if a TypeDesc is eligible for bus usage.
 *
 * Rules:
 * - signal world: always bus-eligible
 * - field world: only if domain is scalar (float, int, boolean, color)
 * - scalar world: not bus-eligible (compile-time only)
 * - event world: bus-eligible (for event buses)
 * - config world: not bus-eligible
 */
export function isBusEligible(type) {
    if (type.world === "signal") {
        return true;
    }
    if (type.world === "event") {
        return true;
    }
    if (type.world === "field") {
        // Field is bus-eligible only for scalar domains
        const scalarDomains = ["float", "int", "boolean", "color"];
        return scalarDomains.includes(type.domain);
    }
    // scalar and config are not bus-eligible
    return false;
}
/**
 * Reserved bus constraints - canonical type definitions.
 * These buses have strict type requirements enforced by the compiler.
 *
 * Canonical types:
 * - phaseA: signal<float> - Phase has special invariants (wrap semantics, cycle-derived provenance)
 * - pulse: event<trigger> - Discrete events, not continuous signals (cleaner scheduling)
 * - energy: signal<number> - Continuous energy/amplitude
 * - energy: signal<float> - Continuous energy/amplitude
 * - palette: signal<color> - Color palette
 */
const RESERVED_BUS_CONSTRAINTS = {
    phaseA: {
        world: "signal",
        domain: "float",
        description: "Primary phase signal (0..1) with wrap semantics",
    },
    pulse: {
        world: "event",
        domain: "trigger",
        description: "Primary pulse/event trigger (discrete, not continuous)",
    },
    energy: {
        world: "signal",
        domain: "float",
        description: "Energy/amplitude signal (0..∞)",
    },
    palette: {
        world: "signal",
        domain: "color",
        description: "Color palette signal",
    },
};
/**
 * Validate reserved bus type constraints.
 */
function validateReservedBus(busId, busName, busType) {
    const constraint = RESERVED_BUS_CONSTRAINTS[busName];
    if (constraint === undefined) {
        return null; // Not a reserved bus
    }
    // Check world and domain match
    if (busType.world !== constraint.world ||
        busType.domain !== constraint.domain) {
        return {
            kind: "ReservedBusTypeViolation",
            busId,
            busName,
            expectedType: `${constraint.world}<${constraint.domain}>`,
            actualType: busType,
            message: `Reserved bus '${busName}' must have type ${constraint.world}<${constraint.domain}> (${constraint.description}), got ${busType.world}<${busType.domain}>`,
        };
    }
    return null;
}
/**
 * Type compatibility check for wired connections.
 * Determines if a value of type 'from' can be connected to a port expecting type 'to'.
 *
 * Compatibility rules:
 * 1. Exact match (same world + domain)
 * 2. Scalar can promote to Signal (same domain)
 * 3. Signal can broadcast to Field (same domain)
 * 4. Scalar can broadcast to Field via implicit signal promotion (same domain)
 * 5. Special domain compatibility (render types, sceneTargets→vec2)
 *
 * Note: In the IR type system, 'point' is normalized to 'vec2' by domainFromString(),
 * so we don't need special handling for point↔vec2 compatibility.
 *
 * @param from - Source type descriptor
 * @param to - Target type descriptor
 * @returns true if connection is compatible
 */
function isTypeCompatible(from, to) {
    // Exact match (world + domain)
    if (from.world === to.world && from.domain === to.domain) {
        return true;
    }
    // Scalar can promote to Signal (same domain)
    if (from.world === "scalar" && to.world === "signal" && from.domain === to.domain) {
        return true;
    }
    // Signal can broadcast to Field (same domain)
    if (from.world === "signal" && to.world === "field" && from.domain === to.domain) {
        return true;
    }
    // Scalar can broadcast to Field via signal promotion (same domain)
    if (from.world === "scalar" && to.world === "field" && from.domain === to.domain) {
        return true;
    }
    // Special case: renderTree and renderNode are compatible
    const renderDomains = ["renderTree", "renderNode"];
    if (renderDomains.includes(from.domain) && renderDomains.includes(to.domain)) {
        if (from.world === to.world)
            return true;
    }
    // Special case: sceneTargets can flow to vec2 (scene target points are positions)
    // Note: sceneTargets→point is also handled because point is normalized to vec2
    if (from.domain === "sceneTargets" && to.domain === "vec2") {
        if (from.world === to.world)
            return true;
    }
    return false;
}
/**
 * Get the type of an endpoint (port).
 * Bus-Block Unification: Endpoints are now only ports - buses are BusBlocks.
 */
function getEndpointType(endpoint, blocks, _busTypes) {
    // Bus-Block Unification: All endpoints are port kind now
    // Find the block and slot
    const blockData = blocks.get(endpoint.blockId);
    if (blockData === null || blockData === undefined)
        return null;
    const block = blockData;
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef)
        return null;
    const slot = [...blockDef.inputs, ...blockDef.outputs].find(s => s.id === endpoint.slotId);
    if (slot === null || slot === undefined)
        return null;
    // slot.type is now TypeDesc, not string
    return slotTypeToTypeDesc(slot.type);
}
/**
 * Pass 2: Type Graph Construction
 *
 * Establishes types for every slot and bus, validates bus eligibility,
 * and builds block output types map.
 *
 * Accumulates all errors before throwing, so users see all problems at once.
 *
 * @param normalized - The normalized patch from Pass 1
 * @returns A typed patch with type information
 * @throws Error with all accumulated errors if validation fails
 */
export function pass2TypeGraph(normalized) {
    const errors = [];
    // Step 1: Build bus type map from BusBlocks and validate bus eligibility
    // After Bus-Block Unification, bus info is in BusBlock params
    const busOutputTypes = new Map();
    // Use Array.from() to avoid downlevelIteration issues
    for (const blockData of Array.from(normalized.blocks.values())) {
        const block = blockData;
        if (block.type !== 'BusBlock')
            continue;
        const busId = block.id;
        const busName = block.params?.busName ?? block.label ?? 'Unnamed';
        const busTypeDesc = block.params?.busType;
        if (busTypeDesc == null) {
            // BusBlock without type info - skip (shouldn't happen)
            continue;
        }
        // Create TypeDesc using editor TypeDesc (from ir/types/TypeDesc)
        const busType = createTypeDesc({
            domain: busTypeDesc.domain,
            world: busTypeDesc.world,
        });
        // Validate bus eligibility
        if (!isBusEligible(busType)) {
            errors.push({
                kind: "BusIneligibleType",
                busId,
                busName,
                typeDesc: busType,
                message: `Bus '${busName}' (${busId}) has ineligible type ${busType.world}<${busType.domain}>. Only signal, event, and scalar-domain field types can be buses.`,
            });
        }
        // Validate reserved bus constraints
        const reservedError = validateReservedBus(busId, busName, busType);
        if (reservedError !== null) {
            errors.push(reservedError);
        }
        busOutputTypes.set(busId, busType);
    }
    // Step 2: Build block output types map and validate all slot types can be parsed
    const blockOutputTypes = new Map();
    // Use Array.from() to avoid downlevelIteration issues
    for (const blockData of Array.from(normalized.blocks.values())) {
        const block = blockData;
        const blockDef = getBlockDefinition(block.type);
        if (!blockDef)
            continue;
        const outputTypes = new Map();
        // Parse input types (for validation)
        for (const slot of blockDef.inputs) {
            try {
                slotTypeToTypeDesc(slot.type);
            }
            catch (error) {
                errors.push({
                    kind: "PortTypeUnknown",
                    blockId: block.id,
                    slotId: slot.id,
                    slotType: slot.type,
                    message: `Cannot parse slot type on block ${block.id}.${slot.id}: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
        // Parse and store output types
        for (const slot of blockDef.outputs) {
            try {
                const typeDesc = slotTypeToTypeDesc(slot.type);
                outputTypes.set(slot.id, typeDesc);
            }
            catch (error) {
                errors.push({
                    kind: "PortTypeUnknown",
                    blockId: block.id,
                    slotId: slot.id,
                    slotType: slot.type,
                    message: `Cannot parse slot type on block ${block.id}.${slot.id}: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
        blockOutputTypes.set(block.id, outputTypes);
    }
    // Step 3: Validate type compatibility for edges
    const edges = normalized.edges ?? [];
    for (const edge of edges) {
        if (!edge.enabled)
            continue;
        // Get source and target types
        const fromType = getEndpointType(edge.from, normalized.blocks, busOutputTypes);
        const toType = getEndpointType(edge.to, normalized.blocks, busOutputTypes);
        if (fromType === null || toType === null) {
            // Dangling reference - will be caught by Pass 4
            continue;
        }
        // Check type compatibility
        if (!isTypeCompatible(fromType, toType)) {
            errors.push({
                kind: "NoConversionPath",
                connectionId: edge.id,
                fromType,
                toType,
                message: `Type mismatch: cannot connect ${fromType.world}<${fromType.domain}> to ${toType.world}<${toType.domain}> for edge ${edge.id}`,
            });
        }
    }
    // Throw if there are any errors
    if (errors.length > 0) {
        const errorSummary = errors
            .map((e) => `  - ${e.kind}: ${e.message}`)
            .join("\n");
        throw new Error(`Pass 2 (Type Graph) failed with ${errors.length} error(s):\n${errorSummary}`);
    }
    // Return typed patch
    return {
        ...normalized,
        blockOutputTypes: blockOutputTypes,
        busOutputTypes: busOutputTypes.size > 0 ? busOutputTypes : undefined,
    };
}
