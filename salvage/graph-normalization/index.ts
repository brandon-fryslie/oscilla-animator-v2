/**
 * Graph Normalization Module
 *
 * Exports types and functions for RawGraph/NormalizedGraph separation.
 *
 * Sprint: Graph Normalization Layer (2026-01-03)
 */

export type {
  RawGraph,
  NormalizedGraph,
  CompilerGraph,
  CompilerBlock,
  CompilerEdge,
  Anchor,
} from './types';

export {
  serializeAnchor,
  toCompilerGraph,
} from './types';

export { normalize } from './GraphNormalizer';
