/**
 * Transform Registry
 *
 * Provides transform definitions (adapters and lenses) for the compiler.
 * This is a stub that will be extended with actual transform definitions.
 */

import type { SignalType } from '../core/canonical-types';

// =============================================================================
// Transform Function Types
// =============================================================================

/**
 * Transform function signature.
 */
export type TransformFn = (value: unknown, params: Record<string, unknown>) => unknown;

/**
 * Adapter definition - type conversion.
 */
export interface AdapterDef {
  readonly id: string;
  readonly from: SignalType;
  readonly to: SignalType;
  readonly fn: TransformFn;
  readonly cost: number;
}

/**
 * Lens definition - value transformation.
 */
export interface LensDef {
  readonly id: string;
  readonly inputType: SignalType;
  readonly outputType: SignalType;
  readonly params: readonly LensParamDef[];
  readonly fn: TransformFn;
}

/**
 * Lens parameter definition.
 */
export interface LensParamDef {
  readonly id: string;
  readonly label: string;
  readonly type: SignalType;
  readonly defaultValue: unknown;
}

// =============================================================================
// Registry
// =============================================================================

const adapters = new Map<string, AdapterDef>();
const lenses = new Map<string, LensDef>();

/**
 * Get adapter definition by ID.
 */
export function getAdapter(adapterId: string): AdapterDef | undefined {
  return adapters.get(adapterId);
}

/**
 * Register an adapter.
 */
export function registerAdapter(def: AdapterDef): void {
  adapters.set(def.id, def);
}

/**
 * Get lens definition by ID.
 */
export function getLens(lensId: string): LensDef | undefined {
  return lenses.get(lensId);
}

/**
 * Register a lens.
 */
export function registerLens(def: LensDef): void {
  lenses.set(def.id, def);
}

/**
 * Find adapters that convert from source to target type.
 *
 * Note: This is a simple comparison. In the future, we may need more sophisticated
 * matching logic that considers axis unification and payload compatibility.
 */
export function findAdapters(from: SignalType, to: SignalType): AdapterDef[] {
  return Array.from(adapters.values()).filter(
    a => a.from.payload === from.payload && a.to.payload === to.payload
  );
}

/**
 * Get all registered adapter IDs.
 */
export function getAllAdapterIds(): string[] {
  return Array.from(adapters.keys());
}

/**
 * Get all registered lens IDs.
 */
export function getAllLensIds(): string[] {
  return Array.from(lenses.keys());
}

// =============================================================================
// Transform IR Context (for IR lowering)
// =============================================================================

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

const transforms = new Map<string, TransformDef>();

/**
 * Transform registry - unified access to adapters and lenses.
 */
export const TRANSFORM_REGISTRY = {
  getTransform(id: string): TransformDef | undefined {
    return transforms.get(id);
  },

  registerTransform(def: TransformDef): void {
    transforms.set(def.id, def);
  },

  getAllTransformIds(): string[] {
    return Array.from(transforms.keys());
  },
};
