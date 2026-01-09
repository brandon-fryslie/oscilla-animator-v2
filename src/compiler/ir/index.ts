// Core IR types
export * from './types';
export * from './Indices';

// Patch transformation types (compiler passes)
export * from './patches';

// Schedule types - re-export selectively to avoid conflicts with types.ts
export type {
  TimeModelIR,
  TimeModelFinite,
  TimeModelInfinite,
} from './schedule';
export {
  ValueRefPacked,
  IRPortDecl,
  LowerResult,
  LowerCtx,
  LowerArgs,
  BlockTypeDecl,
  registerBlockType,
  getBlockType,
  hasBlockType,
  getAllBlockTypes,
  // Legacy types
  LoweredOutput,
  LoweredSignal,
  LoweredField,
  LoweredScalar,
  LoweredDomain,
  LoweredInput,
  LoweredSignalInput,
  LoweredFieldInput,
  LoweredScalarInput,
  LoweredDomainInput,
  LoweredUnconnectedInput,
  LoweredBlock,
  BlockLowerFn,
  LoweredIR,
} from './lowerTypes';
export type { LowerContext } from './lowerTypes';

// IR builder
// The concrete class from builder.ts is used directly by compile.ts
export { IRBuilder } from './builder';

// Also export the interface and impl for flexibility
export type { IRBuilder as IRBuilderInterface } from './IRBuilder';
export { IRBuilderImpl, createIRBuilder } from './IRBuilderImpl';

// Signal expression types
export * from './signalExpr';
