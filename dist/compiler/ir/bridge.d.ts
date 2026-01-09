/**
 * Bridge Functions - Convert Canonical Types to IR Types
 *
 * These functions convert from the canonical SignalType (payload + extent)
 * to the CompiledProgramIR TypeDesc (axes + shape) format.
 *
 * This is the ONLY place where this conversion happens.
 * Runtime never performs this conversion.
 */
import type { SignalType, PayloadType, Extent } from '../../core/canonical-types';
import type { AxesDescIR, ShapeDescIR, TypeDesc } from './program';
/**
 * Convert Extent to AxesDescIR.
 *
 * This resolves all AxisTag.default values using v0 canonical defaults.
 * After this conversion, all axes are fully instantiated.
 */
export declare function extentToAxesDescIR(extent: Extent): AxesDescIR;
/**
 * Convert PayloadType to ShapeDescIR.
 *
 * This maps semantic types (float, vec2, color, etc.) to shape descriptors.
 */
export declare function payloadTypeToShapeDescIR(payload: PayloadType): ShapeDescIR;
/**
 * Convert SignalType to TypeDesc.
 *
 * This is the top-level bridge function that combines axes and shape.
 */
export declare function signalTypeToTypeDesc(signalType: SignalType): TypeDesc;
/**
 * Create axes for a value domain (compile-time constant).
 */
export declare function axesForValue(): AxesDescIR;
/**
 * Create axes for a signal domain (single time-indexed lane).
 */
export declare function axesForSignal(): AxesDescIR;
/**
 * Create axes for a field domain (spatially-indexed lanes).
 */
export declare function axesForField(): AxesDescIR;
/**
 * Create axes for an event domain (discrete occurrences).
 */
export declare function axesForEvent(): AxesDescIR;
