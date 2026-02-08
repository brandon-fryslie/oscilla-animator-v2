/**
 * Graph Normalization
 *
 * This module re-exports types from ./passes/ for backward compatibility.
 *
 * // [LAW:single-enforcer] The normalization pipeline lives in
 * // src/compiler/frontend/ (compileFrontend). This file is types-only.
 *
 * @see src/compiler/frontend/ for implementation
 */

// Re-export types
export type {
  NormalizedPatch,
  NormalizedEdge,
  BlockIndex,
  NormError,
} from './passes';

// Re-export query helpers
export { getInputEdges, getOutputEdges } from './passes';
