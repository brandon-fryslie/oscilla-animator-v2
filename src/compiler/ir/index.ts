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
} from './schedule';

// Lowering types - value references and types for compiler passes
export type {
  ValueRefPacked,
} from './lowerTypes';

// Block definition types are now in blocks/registry
// Import and re-export them here for convenience
export type { LowerResult, LowerCtx, LowerArgs } from '../../blocks/registry';

// IR builder interfaces
// BlockIRBuilder: pure surface for blocks
// OrchestratorIRBuilder: full surface for orchestrator
// [LAW:one-source-of-truth] Public surface exports only canonical builder interfaces.
export type { BlockIRBuilder } from './BlockIRBuilder';
export type { OrchestratorIRBuilder } from './OrchestratorIRBuilder';
export { IRBuilderImpl, createIRBuilder } from './IRBuilderImpl';
