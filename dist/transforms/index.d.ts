/**
 * Transform Registry
 *
 * Provides transform definitions (adapters and lenses) for the compiler.
 * This is a stub that will be extended with actual transform definitions.
 */
import type { TypeDesc } from '../types';
/**
 * Transform function signature.
 */
export type TransformFn = (value: unknown, params: Record<string, unknown>) => unknown;
/**
 * Adapter definition - type conversion.
 */
export interface AdapterDef {
    readonly id: string;
    readonly from: TypeDesc;
    readonly to: TypeDesc;
    readonly fn: TransformFn;
    readonly cost: number;
}
/**
 * Lens definition - value transformation.
 */
export interface LensDef {
    readonly id: string;
    readonly inputType: TypeDesc;
    readonly outputType: TypeDesc;
    readonly params: readonly LensParamDef[];
    readonly fn: TransformFn;
}
/**
 * Lens parameter definition.
 */
export interface LensParamDef {
    readonly id: string;
    readonly label: string;
    readonly type: TypeDesc;
    readonly defaultValue: unknown;
}
/**
 * Get adapter definition by ID.
 */
export declare function getAdapter(adapterId: string): AdapterDef | undefined;
/**
 * Register an adapter.
 */
export declare function registerAdapter(def: AdapterDef): void;
/**
 * Get lens definition by ID.
 */
export declare function getLens(lensId: string): LensDef | undefined;
/**
 * Register a lens.
 */
export declare function registerLens(def: LensDef): void;
/**
 * Find adapters that convert from source to target type.
 */
export declare function findAdapters(from: TypeDesc, to: TypeDesc): AdapterDef[];
/**
 * Get all registered adapter IDs.
 */
export declare function getAllAdapterIds(): string[];
/**
 * Get all registered lens IDs.
 */
export declare function getAllLensIds(): string[];
import type { IRBuilder } from '../compiler/ir/IRBuilder';
import type { ValueRefPacked } from '../compiler/ir/lowerTypes';
/**
 * Context for transform IR lowering.
 */
export interface TransformIRCtx {
    readonly builder: IRBuilder;
    readonly inputRef: ValueRefPacked;
    readonly params: Record<string, ValueRefPacked>;
}
/**
 * Transform definition for IR lowering.
 */
export interface TransformDef {
    readonly id: string;
    readonly type: 'adapter' | 'lens';
    readonly adapter?: AdapterDef;
    readonly lens?: LensDef;
    readonly lowerIR?: (ctx: TransformIRCtx) => ValueRefPacked;
}
/**
 * Transform registry - unified access to adapters and lenses.
 */
export declare const TRANSFORM_REGISTRY: {
    getTransform(id: string): TransformDef | undefined;
    registerTransform(def: TransformDef): void;
    getAllTransformIds(): string[];
};
