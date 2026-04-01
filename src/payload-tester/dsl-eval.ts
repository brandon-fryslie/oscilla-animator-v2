/**
 * DSL Evaluator — evaluates GPU-IR DSL text strings into PipelineInstallPayload.
 *
 * Uses `new Function()` to evaluate the DSL source with all GPU-IR functions
 * in scope. Arrow function bodies reference well-known objects ($global, $domains,
 * sin, vec4, etc.) that are provided as stubs — they appear in fn.toString()
 * source but are never called. The walker parses them from source text.
 *
 * Supports both single expressions (`gpu({...})`) and statement blocks
 * (`const cam = defaultCamera(); gpu({...})`). Uses acorn to parse the
 * source and auto-return the last expression statement.
 */

import * as acorn from 'acorn';
import type { PipelineInstallPayload } from '../render/rust/boundary-contract';
import {
  gpu, compute, render, draw, drawPrep, cameraPass, defaultCamera, exact, wg,
  domain, texDispatch, domainSource, fsQuadSource, clearTarget,
  OPAQUE, ALPHA_BLEND, DEPTH_TEST,
} from '../render/gpu-ir/compile';
import { quad, fullscreenQuad, tri } from '../render/gpu-ir/shapes';

// ---------------------------------------------------------------------------
// Stub objects for well-known DSL symbols
// ---------------------------------------------------------------------------

// These exist so that `fn.toString()` captures their names in the arrow body.
// They are NEVER called — the walker reads them from source text via TS parser.
const STUB = new Proxy({}, { get: () => STUB }) as any;

// Builtin math function names (stubs)
const BUILTIN_STUBS: Record<string, any> = {};
for (const name of [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'exp', 'log', 'pow', 'sqrt',
  'abs', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'sign', 'fract', 'ceil', 'floor', 'round',
  'length', 'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract',
  'fwidth', 'dpdx', 'dpdy',
  'hash_u32', 'noise_simplex_2d', 'noise_simplex_3d',
]) {
  BUILTIN_STUBS[name] = STUB;
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

/** All names that must be in scope when evaluating DSL source */
const CONTEXT_NAMES = [
  // Structural DSL functions (real implementations)
  'gpu', 'compute', 'render', 'draw', 'drawPrep', 'cameraPass', 'defaultCamera', 'exact', 'wg',
  // Dispatch/source/target helpers (real)
  'domain', 'texDispatch', 'domainSource', 'fsQuadSource', 'clearTarget',
  // Pipeline state presets (real)
  'OPAQUE', 'ALPHA_BLEND', 'DEPTH_TEST',
  // Shape helpers (real)
  'quad', 'fullscreenQuad', 'tri',
  // Well-known $-prefixed roots (stubs — parsed, not called)
  '$global', '$scalar', '$domains', '$thread', '$instance', '$vertex',
  // Cast / constructor functions (stubs)
  'f32', 'u32', 'i32',
  'vec2', 'vec3', 'vec4',
  'vec2i', 'vec3i', 'vec4i',
  'vec2u', 'vec3u', 'vec4u',
  'mat4x4',
  // Shader terminals (stubs)
  'vertex', 'fragment',
  // Texture/atomic ops (stubs)
  'textureStore', 'textureLoad', 'textureSample',
  'atomicExchange', 'atomicAdd', 'atomicSub', 'atomicMax', 'atomicMin',
  'atomicAnd', 'atomicOr', 'atomicXor',
  // Builtins (spread)
  ...Object.keys(BUILTIN_STUBS),
] as const;

const CONTEXT_VALUES = [
  // Real implementations
  gpu, compute, render, draw, drawPrep, cameraPass, defaultCamera, exact, wg,
  domain, texDispatch, domainSource, fsQuadSource, clearTarget,
  OPAQUE, ALPHA_BLEND, DEPTH_TEST,
  quad, fullscreenQuad, tri,
  // $-prefixed stubs
  STUB, STUB, STUB, STUB, STUB, STUB,
  // Cast/constructor stubs
  STUB, STUB, STUB,
  STUB, STUB, STUB,
  STUB, STUB, STUB,
  STUB, STUB, STUB,
  STUB, // mat4x4
  // Terminal stubs
  STUB, STUB,
  // Texture/atomic stubs
  STUB, STUB, STUB,
  STUB, STUB, STUB, STUB, STUB,
  STUB, STUB, STUB,
  // Builtin stubs
  ...Object.values(BUILTIN_STUBS),
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DslEvalResult {
  readonly ok: true;
  readonly payload: PipelineInstallPayload;
  readonly json: string;
}

export interface DslEvalError {
  readonly ok: false;
  readonly error: string;
}

export type DslResult = DslEvalResult | DslEvalError;

/**
 * Transform DSL source into a function body that returns the last expression.
 * Uses acorn to parse the source and find the last ExpressionStatement,
 * then splices `return` before it. Handles comments, variable declarations,
 * and arbitrary JS statements before the final gpu() call.
 */
function wrapSource(source: string): string {
  let program: acorn.Node;
  try {
    program = acorn.parse(source, { ecmaVersion: 2022, sourceType: 'script' });
  } catch {
    // If acorn can't parse it as a script, try as a single expression
    return `"use strict"; return (${source});`;
  }

  const body = (program as any).body as acorn.Node[];
  if (body.length === 0) {
    return `"use strict"; return (${source});`;
  }

  // Find the last ExpressionStatement — that's the return value
  const lastStmt = body[body.length - 1];
  if (lastStmt.type === 'ExpressionStatement') {
    // Insert `return` before the last expression statement's start position
    const before = source.slice(0, lastStmt.start);
    const expr = source.slice(lastStmt.start);
    return `"use strict"; ${before}return ${expr}`;
  }

  // No trailing expression — wrap entire source and hope for a useful error
  return `"use strict"; return (${source});`;
}

/**
 * Evaluate a GPU-IR DSL source string and return the PipelineInstallPayload.
 *
 * Supports single expressions (`gpu({...})`) and statement blocks
 * (`const cam = defaultCamera(); gpu({...})`). The last expression
 * statement becomes the return value. Comments are preserved.
 */
export function evalDsl(source: string): DslResult {
  try {
    const body = wrapSource(source);
    const fn = new Function(...CONTEXT_NAMES, body);
    const payload = fn(...CONTEXT_VALUES) as PipelineInstallPayload;

    // Basic validation
    if (!payload || typeof payload !== 'object') {
      return { ok: false, error: 'DSL must return an object (did you call gpu({...})?)' };
    }
    if (!payload.manifest || !payload.roster) {
      return { ok: false, error: 'Result missing manifest or roster — did you call gpu({...})?' };
    }

    const json = JSON.stringify(payload, null, 2);
    return { ok: true, payload, json };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
