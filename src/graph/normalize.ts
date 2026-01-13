/**
 * Graph Normalization
 *
 * This module re-exports the normalization pipeline from ./passes/
 * for backward compatibility.
 *
 * @see ./passes/ for implementation
 */

// Re-export the main function
export { runNormalizationPasses as normalize } from './passes';

// Re-export types
export type {
  NormalizedPatch,
  NormalizedEdge,
  BlockIndex,
  NormalizeResult,
  NormalizeError,
  NormError,
} from './passes';

// Re-export query helpers
export { getInputEdges, getOutputEdges } from './passes';
