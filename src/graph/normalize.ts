/**
 * Graph Normalization
 *
 * This module re-exports the normalization pipeline from ./passes/
 * for backward compatibility.
 *
 * @see ./passes/ for implementation
 */

/**
 * ============================================================================
 * CONTRACT / NON-NEGOTIABLE BEHAVIOR
 * ============================================================================
 *
 * This file is a *compatibility shim*. It must remain a thin re-export layer.
 *
 * What this file MUST do:
 *   - Re-export the canonical normalization entrypoint and types from `./passes`.
 *   - Contain no business logic.
 *
 * What this file MUST NOT do:
 *   - NO normalization logic.
 *   - NO additional exports that change behavior.
 *   - NO side effects.
 *
 * Allowed future changes:
 *   - Update export lists when `./passes` moves/renames symbols.
 *   - Add deprecation notices/comments.
 *
 * Disallowed future changes:
 *   - Introducing alternate normalization paths here.
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
