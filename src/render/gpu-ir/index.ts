/**
 * GPU-IR DSL: Public API
 */

// Compilation orchestrator
export { gpu, compute, render, composite, draw, drawPrep, exact, wg, domain, texDispatch, domainSource, fsQuadSource, clearTarget, loadTarget, clearTexture, OPAQUE, ALPHA_BLEND, DEPTH_TEST, MATH_CONSTANTS, PI, TAU, HALF_PI, E, SQRT2, PHI } from './compile';
export type { Transform2DSpec, RenderPassOpts } from './compile';

// Shape helpers
export { quad, fullscreenQuad, tri } from './shapes';

// IR builders (for direct programmatic construction — future compiler path)
export * as IR from './ir-builders';

// Reverse translator (IR → DSL source text)
export { stmtsToSource, exprToSource } from './reverse';

// Full payload reverse translator (PipelineInstallPayload → gpu({...}) source)
export { payloadToSource } from './reverse-payload';

// Shader standard library (WGSL function definitions)
export { STDLIB, HASH_U32, NOISE_SIMPLEX_2D, NOISE_SIMPLEX_3D } from './stdlib';

// Types (re-exported for convenience)
export type { Domains, DomainProxy, DomainFieldProxy } from './types';
export type { f32, u32, i32, vec2f, vec3f, vec4f, vec2i, vec3i, vec2u, vec3u } from './types';
