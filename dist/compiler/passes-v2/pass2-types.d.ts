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
import type { TypeDesc } from "../../core/types";
import type { NormalizedPatch, TypedPatch } from "../ir/patches";
/**
 * Error types emitted by Pass 2.
 */
export interface PortTypeUnknownError {
    kind: "PortTypeUnknown";
    blockId: string;
    slotId: string;
    slotType: TypeDesc;
    message: string;
}
export interface BusIneligibleTypeError {
    kind: "BusIneligibleType";
    busId: string;
    busName: string;
    typeDesc: TypeDesc;
    message: string;
}
export interface ReservedBusTypeViolationError {
    kind: "ReservedBusTypeViolation";
    busId: string;
    busName: string;
    expectedType: string;
    actualType: TypeDesc;
    message: string;
}
export interface NoConversionPathError {
    kind: "NoConversionPath";
    connectionId: string;
    fromType: TypeDesc;
    toType: TypeDesc;
    message: string;
}
export type Pass2Error = PortTypeUnknownError | BusIneligibleTypeError | ReservedBusTypeViolationError | NoConversionPathError;
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
export declare function isBusEligible(type: Pick<TypeDesc, 'world' | 'domain'>): boolean;
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
export declare function pass2TypeGraph(normalized: NormalizedPatch): TypedPatch;
