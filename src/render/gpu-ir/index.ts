/**
 * GPU-IR DSL: Public API
 */

// Compilation orchestrator
export { gpu, compute, render, draw, drawPrep, exact, wg } from './compile';

// Shape helpers
export { quad, fullscreenQuad, tri } from './shapes';

// IR builders (for direct programmatic construction — future compiler path)
export * as IR from './ir-builders';

// Reverse translator (IR → DSL source text)
export { stmtsToSource, exprToSource } from './reverse';

// Types (re-exported for convenience)
export type { Domains, DomainProxy, DomainFieldProxy } from './types';
export type { f32, u32, i32, vec2f, vec3f, vec4f, vec2i, vec3i, vec2u, vec3u } from './types';
