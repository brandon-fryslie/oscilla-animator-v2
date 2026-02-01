// Core IR types
export * from './types';
export * from './Indices';

// Value expression types (unified)
export * from './value-expr';

// Patch transformation types (compiler passes)
export * from './patches';

// Schedule types - re-export selectively to avoid conflicts with types.ts
export type {
  TimeModelIR,
  TimeModelFinite,
  TimeModelInfinite,
} from './schedule';

// Lowering types - value references and types for compiler passes
export type {
  ValueRefPacked,
  LowerContext,
  LoweredOutput,
  LoweredSignal,
  LoweredField,
  LoweredScalar,
  LoweredInstance,
  LoweredBlock,
  BlockLowerFn,
  LoweredIR,
} from './lowerTypes';

// Block definition types are now in blocks/registry
// Import and re-export them here for convenience
export type { LowerResult, LowerCtx, LowerArgs } from '../../blocks/registry';

// IR builder
// Export interface and implementation
export type { IRBuilder } from './IRBuilder';
export { IRBuilderImpl, createIRBuilder } from './IRBuilderImpl';

// Signal expression types
export * from './signalExpr';
