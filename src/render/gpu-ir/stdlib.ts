/**
 * GPU-IR Shader Standard Library — WGSL function definitions.
 *
 * Each entry is a WgslFunction that gets registered with the PipelineInstallPayload.
 * The Rust renderer parses and transplants these into shader modules that reference them.
 *
 * [LAW:one-source-of-truth] Function implementations live here as WGSL source strings.
 * The Rust side only parses and transplants — it does not define any functions.
 */

import type { WgslFunction } from '../rust/boundary-contract';

// ---------------------------------------------------------------------------
// hash_u32 — PCG hash (single u32 → u32)
// ---------------------------------------------------------------------------

export const HASH_U32: WgslFunction = {
  name: 'hash_u32',
  entrypoint: 'hash_u32',
  wgsl: `
fn hash_u32(v: u32) -> u32 {
  var state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
`,
};

// ---------------------------------------------------------------------------
// noise_simplex_2d — Ashima Arts simplex noise (vec2f → f32, range ~[-1, 1])
// Port of https://github.com/ashima/webgl-noise to WGSL
// ---------------------------------------------------------------------------

export const NOISE_SIMPLEX_2D: WgslFunction = {
  name: 'noise_simplex_2d',
  entrypoint: 'noise_simplex_2d',
  wgsl: `
fn _snoise2_mod289_v3(x: vec3<f32>) -> vec3<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn _snoise2_mod289_v2(x: vec2<f32>) -> vec2<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn _snoise2_permute(x: vec3<f32>) -> vec3<f32> {
  return _snoise2_mod289_v3(((x * 34.0) + 1.0) * x);
}

fn noise_simplex_2d(v: vec2<f32>) -> f32 {
  let C = vec4<f32>(
    0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
    0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
    -0.577350269189626,  // -1.0 + 2.0 * C.x
    0.024390243902439    // 1.0 / 41.0
  );

  // First corner
  var i = floor(v + dot(v, vec2<f32>(C.y, C.y)));
  let x0 = v - i + dot(i, vec2<f32>(C.x, C.x));

  // Other corners
  var i1: vec2<f32>;
  if (x0.x > x0.y) {
    i1 = vec2<f32>(1.0, 0.0);
  } else {
    i1 = vec2<f32>(0.0, 1.0);
  }

  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4<f32>(x12.xy - i1, x12.zw);

  // Permutations
  i = _snoise2_mod289_v2(i);
  let p = _snoise2_permute(
    _snoise2_permute(i.y + vec3<f32>(0.0, i1.y, 1.0)) + i.x + vec3<f32>(0.0, i1.x, 1.0)
  );

  var m = max(vec3<f32>(0.5, 0.5, 0.5) - vec3<f32>(
    dot(x0, x0),
    dot(x12.xy, x12.xy),
    dot(x12.zw, x12.zw)
  ), vec3<f32>(0.0, 0.0, 0.0));
  m = m * m;
  m = m * m;

  // Gradients
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;

  // Normalize gradients implicitly by scaling m
  m = m * (1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h));

  // Compute final noise value at P
  let g = vec3<f32>(
    a0.x * x0.x + h.x * x0.y,
    a0.y * x12.x + h.y * x12.y,
    a0.z * x12.z + h.z * x12.w
  );

  return 130.0 * dot(m, g);
}
`,
};

// ---------------------------------------------------------------------------
// noise_simplex_3d — Ashima Arts 3D simplex noise (vec3f → f32, range ~[-1, 1])
// Port of https://github.com/ashima/webgl-noise to WGSL
// ---------------------------------------------------------------------------

export const NOISE_SIMPLEX_3D: WgslFunction = {
  name: 'noise_simplex_3d',
  entrypoint: 'noise_simplex_3d',
  wgsl: `
fn _snoise3_mod289_v3(x: vec3<f32>) -> vec3<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn _snoise3_mod289_v4(x: vec4<f32>) -> vec4<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn _snoise3_permute(x: vec4<f32>) -> vec4<f32> {
  return _snoise3_mod289_v4(((x * 34.0) + 1.0) * x);
}

fn _snoise3_taylorInvSqrt(r: vec4<f32>) -> vec4<f32> {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn noise_simplex_3d(v: vec3<f32>) -> f32 {
  let C = vec2<f32>(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);

  // First corner
  var i = floor(v + dot(v, vec3<f32>(C.y, C.y, C.y)));
  let x0 = v - i + dot(i, vec3<f32>(C.x, C.x, C.x));

  // Other corners
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);

  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;

  // Permutations
  i = _snoise3_mod289_v3(i);
  let p = _snoise3_permute(
    _snoise3_permute(
      _snoise3_permute(i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0));

  // Gradients: 7x7 points over a square, mapped onto an octahedron
  let n_ = 0.142857142857; // 1.0 / 7.0
  let ns = n_ * D.wyz - D.xzx;

  let j = p - 49.0 * floor(p * ns.z * ns.z);

  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);

  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);

  let b0 = vec4<f32>(x.xy, y.xy);
  let b1 = vec4<f32>(x.zw, y.zw);

  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4<f32>(0.0, 0.0, 0.0, 0.0));

  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;

  var p0 = vec3<f32>(a0.xy, h.x);
  var p1 = vec3<f32>(a0.zw, h.y);
  var p2 = vec3<f32>(a1.xy, h.z);
  var p3 = vec3<f32>(a1.zw, h.w);

  // Normalize gradients
  let norm = _snoise3_taylorInvSqrt(vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 = p0 * norm.x;
  p1 = p1 * norm.y;
  p2 = p2 * norm.z;
  p3 = p3 * norm.w;

  // Mix final noise value
  var m = max(vec4<f32>(0.6, 0.6, 0.6, 0.6) - vec4<f32>(
    dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)
  ), vec4<f32>(0.0, 0.0, 0.0, 0.0));
  m = m * m;

  return 42.0 * dot(m * m, vec4<f32>(
    dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)
  ));
}
`,
};

// ---------------------------------------------------------------------------
// All stdlib functions
// ---------------------------------------------------------------------------

export const STDLIB: WgslFunction[] = [HASH_U32, NOISE_SIMPLEX_2D, NOISE_SIMPLEX_3D];
