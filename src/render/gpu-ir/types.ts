/**
 * GPU-IR DSL: Branded types and ambient function declarations.
 *
 * For TypeScript checking only — never used at runtime.
 * These types let a future "traced DSL" capture GPU shader expressions
 * as ExprIR/StatementIR while providing type-safe autocomplete.
 */

// ---------------------------------------------------------------------------
// Branded Scalar Types
// ---------------------------------------------------------------------------

export type f32 = number & { readonly __brand: 'f32' };
export type u32 = number & { readonly __brand: 'u32' };
export type i32 = number & { readonly __brand: 'i32' };

// ---------------------------------------------------------------------------
// Branded Vector Types
// ---------------------------------------------------------------------------

export interface vec2f { readonly x: f32; readonly y: f32; readonly __brand: 'vec2f'; }
export interface vec3f { readonly x: f32; readonly y: f32; readonly z: f32; readonly __brand: 'vec3f'; }
export interface vec4f { readonly x: f32; readonly y: f32; readonly z: f32; readonly w: f32; readonly __brand: 'vec4f'; }
export interface vec2i { readonly x: i32; readonly y: i32; readonly __brand: 'vec2i'; }
export interface vec3i { readonly x: i32; readonly y: i32; readonly z: i32; readonly __brand: 'vec3i'; }
export interface vec2u { readonly x: u32; readonly y: u32; readonly __brand: 'vec2u'; }
export interface vec3u { readonly x: u32; readonly y: u32; readonly z: u32; readonly __brand: 'vec3u'; }

// ---------------------------------------------------------------------------
// Domain Proxy Types
// ---------------------------------------------------------------------------

export interface DomainFieldProxy { [index: number]: f32; }
export interface DomainProxy { readonly [field: string]: DomainFieldProxy; }
export type Domains = Record<string, DomainProxy>;

// ---------------------------------------------------------------------------
// Ambient Function Declarations — Math Builtins
// ---------------------------------------------------------------------------

// Trig
declare function sin(x: f32): f32;
declare function cos(x: f32): f32;
declare function tan(x: f32): f32;
declare function asin(x: f32): f32;
declare function acos(x: f32): f32;
declare function atan(x: f32): f32;
declare function atan2(y: f32, x: f32): f32;

// Exponential / power
declare function exp(x: f32): f32;
declare function log(x: f32): f32;
declare function pow(base: f32, exponent: f32): f32;
declare function sqrt(x: f32): f32;

// Arithmetic
declare function abs(x: f32): f32;
declare function min(a: f32, b: f32): f32;
declare function max(a: f32, b: f32): f32;
declare function clamp(x: f32, lo: f32, hi: f32): f32;
declare function mix(a: f32, b: f32, t: f32): f32;
declare function step(edge: f32, x: f32): f32;
declare function smoothstep(lo: f32, hi: f32, x: f32): f32;
declare function sign(x: f32): f32;
declare function fract(x: f32): f32;
declare function ceil(x: f32): f32;
declare function floor(x: f32): f32;
declare function round(x: f32): f32;

// Geometric
declare function length(v: vec2f | vec3f | vec4f): f32;
declare function distance(a: vec2f | vec3f, b: vec2f | vec3f): f32;
declare function dot(a: vec2f | vec3f | vec4f, b: vec2f | vec3f | vec4f): f32;
declare function cross(a: vec3f, b: vec3f): vec3f;
declare function normalize(v: vec2f | vec3f | vec4f): vec2f | vec3f | vec4f;
declare function reflect(incident: vec3f, normal: vec3f): vec3f;
declare function refract(incident: vec3f, normal: vec3f, eta: f32): vec3f;

// Derivative
declare function fwidth(x: f32): f32;
declare function dpdx(x: f32): f32;
declare function dpdy(x: f32): f32;

// Custom / extension
declare function hash_u32(x: u32): u32;
declare function noise_simplex_2d(uv: vec2f): f32;
declare function noise_simplex_3d(pos: vec3f): f32;

// ---------------------------------------------------------------------------
// Ambient Function Declarations — Cast / Constructor
// ---------------------------------------------------------------------------

// Cast functions (scalar conversion)
declare function f32(x: number | u32 | i32): f32;
declare function u32(x: number | f32 | i32): u32;
declare function i32(x: number | f32 | u32): i32;

// Vector constructors
declare function vec2(x: f32, y: f32): vec2f;
declare function vec3(x: f32, y: f32, z: f32): vec3f;
declare function vec4(x: f32, y: f32, z: f32, w: f32): vec4f;
declare function vec2i(x: i32, y: i32): vec2i;
declare function vec2u(x: u32, y: u32): vec2u;
declare function vec3i(x: i32, y: i32, z: i32): vec3i;
declare function vec3u(x: u32, y: u32, z: u32): vec3u;
declare function vec4i(x: i32, y: i32, z: i32, w: i32): i32 & { readonly __brand: 'vec4i' };
declare function vec4u(x: u32, y: u32, z: u32, w: u32): u32 & { readonly __brand: 'vec4u' };

// ---------------------------------------------------------------------------
// Ambient Function Declarations — Shader Terminals
// ---------------------------------------------------------------------------

declare function vertex(
  position: vec4f,
  varyings: Record<string, f32 | i32 | u32 | vec2f | vec2i | vec2u | vec3f | vec3i | vec3u | vec4f>,
): never;
declare function fragment(outputs: Record<string, vec4f>): never;

// ---------------------------------------------------------------------------
// Ambient Function Declarations — Texture Operations
// ---------------------------------------------------------------------------

declare function textureStore(textureId: string, coords: vec2i | vec2u, value: vec4f): void;
declare function textureLoad(textureId: string, coords: vec2i | vec2u, mipLevel?: i32): vec4f;
declare function textureSample(textureId: string, samplerId: string, uv: vec2f): vec4f;

// ---------------------------------------------------------------------------
// Ambient Function Declarations — Atomic Operations
// ---------------------------------------------------------------------------

declare function atomicExchange(target: u32 | i32, value: u32 | i32): u32 | i32;
declare function atomicAdd(target: u32 | i32, value: u32 | i32): u32 | i32;
declare function atomicSub(target: u32 | i32, value: u32 | i32): u32 | i32;
declare function atomicMax(target: u32 | i32, value: u32 | i32): u32 | i32;
declare function atomicMin(target: u32 | i32, value: u32 | i32): u32 | i32;
declare function atomicAnd(target: u32 | i32, value: u32 | i32): u32 | i32;
declare function atomicOr(target: u32 | i32, value: u32 | i32): u32 | i32;
declare function atomicXor(target: u32 | i32, value: u32 | i32): u32 | i32;

// ---------------------------------------------------------------------------
// Ambient — System Access (globals / scalars)
// ---------------------------------------------------------------------------

declare const sys: {
  time: f32;
  active: u32;
  readonly [key: string]: f32 | u32 | i32;
};
