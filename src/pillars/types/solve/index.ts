/**
 * src/pillars/types/solve/index.ts
 *
 * The pure variable-resolution layer: the two sub-solvers, the substitution they
 * contribute to, and the vocabulary they share. Everything here is a pure
 * function of its input — the fixpoint driver (wzm3.5) composes these, owning
 * all graph mutation itself. [LAW:effects-at-boundaries]
 */

export * from './shared';
export * from './substitution';
export * from './payload-unit';
export * from './cardinality';
export * from './adapters';
