# Rust/WASM Compatibility Specification

**Status:** Preparatory (Phase B)
**Rust Implementation:** Future work
**Purpose:** Ensure encoding decisions support deterministic hot-swap between TS and Rust runtimes

## Overview

The Oscilla IR system is designed for "programs as data" portability: the same CompiledProgramIR should execute identically in TypeScript (Chrome/Node), Rust (native), and WebAssembly (browser/embedded) runtimes.

This document specifies the **exact encoding and numeric rules** required to guarantee deterministic execution across all three implementations.

## Critical Requirement: Bit-for-Bit Determinism

**Definition:** For the same IR program, same inputs, and same time `t`, all runtimes MUST produce:
- Identical output buffers (byte-for-byte equality)
- Identical cache keys (string equality)
- Identical performance counter values (where applicable)

**Why it matters:**
- Hot-swap: switch from TS → Rust mid-session without frame glitches
- Cache continuity: cache entries written by TS can be read by Rust
- Debugging: compare TS vs Rust output to detect bugs

**How we achieve it:**
- Lock numeric types (u8, u16, f32 only, no f64)
- Lock byte order (LE everywhere)
- Lock rounding rules (Math.round, no floor/ceil)
- Lock algorithms (ColorQuantize, PathFlatten are canonical)

## Numeric Type Contracts

### Integer Types

| Type | Bits | Range | Signed | Use Cases |
|------|------|-------|--------|-----------|
| `u8` | 8 | 0-255 | No | Color channels, small indices |
| `u16` | 16 | 0-65535 | No | Path opcodes, medium indices |
| `u32` | 32 | 0-4B | No | Instance indices, large counts |
| `i32` | 32 | -2B to 2B | Yes | Signed offsets (rare) |

**Rules:**
- TS: Use `Uint8Array`, `Uint16Array`, `Uint32Array`, `Int32Array`
- Rust: Use `u8`, `u16`, `u32`, `i32`
- WASM: Map to `i32` for 32-bit, `i64` for 64-bit (no native u8/u16 ops)
- **Overflow:** Clamp to range (saturating arithmetic), never wrap
- **Underflow:** Clamp to 0 (for unsigned), never wrap

### Float Types

| Type | Bits | Precision | Use Cases |
|------|------|-----------|-----------|
| `f32` | 32 | ~7 decimal digits | Positions, colors, transforms |
| `f64` | 64 | ~15 decimal digits | **AVOIDED** (non-deterministic) |

**Rules:**
- **Use f32 everywhere** for runtime math (positions, colors, time values)
- **Avoid f64** unless absolutely necessary (time accumulation only)
- TS: Use `Float32Array`, never plain `number` in buffers
- Rust: Use `f32` (matches WASM and TS typed arrays)
- WASM: Use `f32` (native support)

**Why f32 only:**
- f64 precision differences across platforms cause drift
- f32 is "good enough" for visual output (sub-pixel precision)
- f32 matches GPU shader precision
- Smaller buffers (half the size of f64)

### Endianness

**All multi-byte values are little-endian (LE):**
- u16 path opcodes: LE byte order
- u32 instance indices: LE byte order
- f32 floats: LE byte order (IEEE 754 standard)

**Rationale:**
- LE matches x86/ARM native byte order (no swap overhead)
- LE is WASM standard byte order
- LE matches JS TypedArray default behavior

**Cross-platform guarantee:**
- TS: TypedArray constructors default to platform endianness (LE on all modern platforms)
- Rust: Use `to_le_bytes()` and `from_le_bytes()` for explicit LE conversion
- WASM: Memory is always LE (spec guarantee)

## ColorQuantize Algorithm Specification

This is the **canonical algorithm** for converting float RGBA to u8x4 premultiplied linear RGBA.

### Pseudocode

```
function quantizeColorRGBA(r: f32, g: f32, b: f32, a: f32) -> [u8; 4]:
  // Step 1: Clamp inputs to [0, 1]
  rc = clamp(r, 0.0, 1.0)
  gc = clamp(g, 0.0, 1.0)
  bc = clamp(b, 0.0, 1.0)
  ac = clamp(a, 0.0, 1.0)

  // Step 2: Premultiply RGB by alpha (CRITICAL: before quantization)
  rPremul = rc * ac
  gPremul = gc * ac
  bPremul = bc * ac

  // Step 3: Scale to [0, 255] range
  rScaled = rPremul * 255.0
  gScaled = gPremul * 255.0
  bScaled = bPremul * 255.0
  aScaled = ac * 255.0

  // Step 4: Round to nearest integer (CRITICAL: use round, not floor/ceil)
  r255 = round_half_up(rScaled)  // 0.5 → 1, -0.5 → 0
  g255 = round_half_up(gScaled)
  b255 = round_half_up(bScaled)
  a255 = round_half_up(aScaled)

  // Step 5: Clamp to [0, 255] (redundant if step 1 is correct, but safe)
  r255 = clamp(r255, 0, 255)
  g255 = clamp(g255, 0, 255)
  b255 = clamp(b255, 0, 255)
  a255 = clamp(a255, 0, 255)

  // Step 6: Pack to u8 array
  return [r255, g255, b255, a255]
```

### Rounding Rule: round_half_up

**Definition:** Round to nearest integer, with 0.5 rounding UP.

**Implementation:**
- TS: `Math.round(x)` (JS spec guarantees this behavior)
- Rust: `(x + 0.5).floor() as u8` (emulate round_half_up)
- WASM: Use same Rust logic (no native round instruction)

**Critical examples:**
- `round_half_up(127.5)` → `128` (not 127)
- `round_half_up(127.4)` → `127`
- `round_half_up(0.5)` → `1` (not 0)
- `round_half_up(-0.5)` → `0` (negative values clamped before rounding)

**Why this matters:**
- floor/ceil produce different results for 0.5 values
- TS Math.round() uses round_half_up (JS spec)
- Rust must match TS behavior exactly (not use round_half_even)

### Test Vectors

All implementations MUST pass these test vectors:

| Input (r, g, b, a) | Output [r, g, b, a] | Notes |
|--------------------|---------------------|-------|
| (1, 1, 1, 1) | [255, 255, 255, 255] | Opaque white |
| (1, 0, 0, 0.5) | [128, 0, 0, 128] | Half-transparent red (premul: 0.5*255=127.5→128) |
| (0, 1, 0, 0.25) | [0, 64, 0, 64] | Quarter-transparent green (0.25*255=63.75→64) |
| (1, 1, 1, 0) | [0, 0, 0, 0] | Fully transparent (color irrelevant) |
| (0.5, 0.5, 0.5, 1) | [128, 128, 128, 255] | Mid-gray (0.5*255=127.5→128) |
| (2.5, 0, 0, 1) | [255, 0, 0, 255] | HDR red clamped to [0, 1] |
| (-0.5, 0.5, 0.5, 1) | [0, 128, 128, 255] | Negative clamped to 0 |

## PathCommandStream Encoding

Path commands are encoded as u16 opcodes with separate point buffers.

### Opcode Table (Canonical)

| Opcode | Name | Point Count | Description |
|--------|------|-------------|-------------|
| `0x00` | MoveTo | 1 | Move pen to (x, y) |
| `0x01` | LineTo | 1 | Line from current to (x, y) |
| `0x02` | QuadTo | 2 | Quadratic Bézier (control, end) |
| `0x03` | CubicTo | 3 | Cubic Bézier (control1, control2, end) |
| `0x04` | Close | 0 | Close current subpath |
| `0x10-0xFF` | Reserved | - | Future 2D extensions |
| `0x100-0x1FF` | Reserved | - | 3D geometry (Phase G-H) |
| `0x200-0xFFFF` | Reserved | - | User extensions |

### Encoding Format

**Commands buffer:** Uint16Array, little-endian
- Each command is a single u16 value (opcode only)
- Commands reference points by implicit indexing (not inline)

**Points buffer:** Float32Array, little-endian
- Flat array of f32 values: [x0, y0, x1, y1, x2, y2, ...]
- Commands consume points sequentially based on point count

**Example:**
```
Commands: [MoveTo, LineTo, LineTo, Close]
         → [0x00, 0x01, 0x01, 0x04]
         → Uint16Array [0, 1, 1, 4]

Points: [(100, 100), (200, 200), (300, 100)]
       → Float32Array [100, 100, 200, 200, 300, 100]
```

**Point consumption:**
- MoveTo(0) → points[0:1] = (100, 100)
- LineTo(1) → points[1:2] = (200, 200)
- LineTo(2) → points[2:3] = (300, 100)
- Close(4) → no points consumed

### Determinism Requirements

- Opcode values are fixed (no platform-specific mappings)
- Point order matches command order (sequential consumption)
- Float precision: f32 only (no f64)
- Byte order: LE for both u16 and f32

## PathFlatten Algorithm (Phase D)

When flattening is enabled, curves are converted to polylines using a canonical tolerance.

### Flattening Tolerance

**Canonical value:** `CANONICAL_FLATTEN_TOL_PX = 0.75` (screen pixels)

**Conversion to world-space tolerance:**
```
toleranceWorld = CANONICAL_FLATTEN_TOL_PX / (zoom * dpr)
```

Where:
- `zoom`: Viewport zoom factor (1.0 = no zoom)
- `dpr`: Device pixel ratio (window.devicePixelRatio)

### Flattening Algorithm (Cubic Bézier)

Use **recursive subdivision with midpoint distance test**:

```
function flattenCubic(p0, p1, p2, p3, tol, output):
  // Compute midpoint of curve at t=0.5
  mid = evaluateCubic(p0, p1, p2, p3, 0.5)

  // Compute midpoint of line segment p0→p3
  lineMid = (p0 + p3) / 2

  // Distance between curve midpoint and line midpoint
  dist = distance(mid, lineMid)

  if dist <= tol:
    // Curve is flat enough, emit line
    output.push(LineTo(p3))
  else:
    // Subdivide curve at t=0.5
    left0, left1, left2, left3 = subdivideCubicLeft(p0, p1, p2, p3, 0.5)
    right0, right1, right2, right3 = subdivideCubicRight(p0, p1, p2, p3, 0.5)

    // Recursively flatten both halves
    flattenCubic(left0, left1, left2, left3, tol, output)
    flattenCubic(right0, right1, right2, right3, tol, output)
```

**Determinism:**
- Use f32 for all intermediate calculations
- Subdivision at exactly t=0.5 (no adaptive tolerance)
- Distance metric: Euclidean (sqrt(dx*dx + dy*dy))
- Same tolerance → same polyline (no platform differences)

**Test vector:** Flatten a cubic Bézier with canonical tolerance must produce identical polyline in TS and Rust.

## Float Precision and Rounding

### General Rules

1. **Use f32 for all runtime math** (positions, colors, transforms)
2. **Round only when quantizing to integer** (color quantization, command encoding)
3. **Never round intermediate float results** (accumulates error)
4. **Clamp to valid ranges before quantization** (prevents overflow)

### Saturation vs Wraparound

**Rule:** Always use **saturation** (clamp to range), never wraparound.

**Examples:**
- `clamp(300, 0, 255)` → `255` (not `300 % 256 = 44`)
- `clamp(-10, 0, 255)` → `0` (not `246`)

**Rationale:**
- Visual output: clamping is perceptually correct (overexposed → white)
- Debugging: wraparound hides bugs (negative color → bright color)
- Determinism: wraparound behavior differs across platforms (signed vs unsigned)

### Comparison Tolerances

**Never use epsilon comparisons** for equality checks in kernels:
- `if (a == b)` is correct (bit-exact equality)
- `if (abs(a - b) < epsilon)` is forbidden (non-deterministic)

**Rationale:**
- f32 arithmetic is deterministic if operations are identical
- Epsilon comparisons introduce platform differences (different epsilon values)
- Cache keys require bit-exact equality

## Memory Layout and Alignment

### Buffer Alignment

All buffers should be aligned to natural boundaries:
- u8 buffers: no alignment required
- u16 buffers: 2-byte alignment
- u32 buffers: 4-byte alignment
- f32 buffers: 4-byte alignment

**Implementation:**
- TS: TypedArray constructors handle alignment automatically
- Rust: Use `#[repr(C, align(4))]` or allocate with proper alignment
- WASM: Linear memory supports unaligned access, but aligned is faster

### Struct-of-Arrays (SoA) Layout

Prefer SoA over Array-of-Structs (AoS) for instance data:

**Bad (AoS):**
```
[x0, y0, r0, g0, b0, a0, x1, y1, r1, g1, b1, a1, ...]
```

**Good (SoA):**
```
positions: [x0, y0, x1, y1, ...]
colors: [r0, g0, b0, a0, r1, g1, b1, a1, ...]
```

**Rationale:**
- Better cache locality (CPU prefetch, SIMD vectorization)
- Easier to update individual attributes (dirty range updates)
- Matches GPU buffer layout (vertex buffers are SoA)

## Cross-Platform Testing Strategy

### Unit Test Parity

All algorithms MUST have identical unit tests in TS and Rust:
- Same test vectors (copy-paste from this doc)
- Same expected outputs (byte-for-byte)
- Same edge cases (NaN, Infinity, out-of-range)

### Differential Fuzzing

Generate random IR programs and compare outputs:
1. Compile same program in TS and Rust
2. Execute with same inputs (time, seeds)
3. Compare output buffers (byte-for-byte equality)
4. If mismatch: bisect to find first divergence

### Determinism Validation

Run same program 1000 times in each runtime:
- All outputs MUST be bit-identical
- No variation across runs (no PRNG, no platform RNG)
- Cache keys MUST match across all runs

---

**Rust Implementation Checklist:**
- [ ] Use f32 for all runtime math (no f64)
- [ ] Use LE byte order for all multi-byte values
- [ ] Implement `round_half_up` for color quantization
- [ ] Use saturation (clamp) for integer conversion
- [ ] Pass all ColorQuantize test vectors
- [ ] Pass all PathFlatten test vectors (Phase D)
- [ ] Differential fuzzing vs TS runtime (1000+ programs)

**This spec is authoritative:** If TS and Rust diverge, TS implementation is the reference (but file a bug).
