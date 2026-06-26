/**
 * src/pillars/types/index.ts
 *
 * The pillar type module. There is exactly one `@/pillars/types` so a file and
 * a same-named directory can never shadow each other. [LAW:one-source-of-truth]
 *
 *   - `graph`   — the user-authored PillarPatch graph (frontend input).
 *   - `schemas` — the Zod type-system layer every compiler type is expressed in.
 *   - `solve`   — the pure sub-solvers + substitution that resolve type variables.
 */

export * from './graph';
export * from './schemas';
export * from './solve';
export * from './query';
