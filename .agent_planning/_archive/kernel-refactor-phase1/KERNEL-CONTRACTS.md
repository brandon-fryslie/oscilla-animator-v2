# Kernel Layer Contracts - Reference Document

**Generated:** 2026-01-21  
**Phase:** Kernel Refactor Phase 1  
**Status:** CANONICAL REFERENCE

## Overview

This document defines the layer contracts for the three core runtime modules that implement all kernel operations in the Oscilla Animator system.

**Architectural Law: SINGLE SOURCE OF TRUTH**
- Each operation has exactly ONE implementation
- No duplication across modules
- Clear boundaries between layers

## Quick Reference Table

| Operation Type | Module | Input Domain | Output Range |
|----------------|--------|--------------|--------------|
| **Scalar Math** | OpcodeInterpreter | any real | any real |
| **Oscillators** | SignalEvaluator | phase [0,1) | [-1,1] |
| **Easing** | SignalEvaluator | t [0,1] | [0,1] |
| **Noise** | SignalEvaluator | any real | [0,1) |
| **Field Ops** | Materializer | typed buffers | typed buffers |

## Layer 1: OpcodeInterpreter - Scalar Math

**File:** `src/runtime/OpcodeInterpreter.ts`

**Responsibility:** SINGLE ENFORCER for all scalar numeric operations

### Architectural Law

> This is the ONLY place that defines scalar math operations.
> No other module may implement or duplicate these operations.

### Opcode Categories

#### UNARY (exactly 1 argument)
```
neg      - Negation: -x
abs      - Absolute value: |x|
sin      - Sine (RADIANS): Math.sin(x)
cos      - Cosine (RADIANS): Math.cos(x)
tan      - Tangent (RADIANS): Math.tan(x)
wrap01   - Wrap to [0,1): ((x % 1) + 1) % 1
floor    - Floor: Math.floor(x)
ceil     - Ceiling: Math.ceil(x)
round    - Round: Math.round(x)
fract    - Fractional part: x - floor(x)
sqrt     - Square root: Math.sqrt(x)
exp      - Exponential: Math.exp(x)
log      - Natural log: Math.log(x)
sign     - Sign: -1, 0, or 1
```

#### BINARY (exactly 2 arguments)
```
sub      - Subtraction: a - b
div      - Division: a / b
mod      - Modulo: a % b
pow      - Power: a^b
hash     - Deterministic hash: (value, seed) → [0,1)
```

#### TERNARY (exactly 3 arguments)
```
clamp    - Clamp: clamp(x, min, max)
lerp     - Linear interp: lerp(a, b, t)
```

#### VARIADIC (1+ arguments)
```
add      - Sum: a + b + c + ...
mul      - Product: a * b * c * ...
min      - Minimum: min(a, b, c, ...)
max      - Maximum: max(a, b, c, ...)
```

### Critical Distinction: RADIANS vs PHASE

**Opcode trig functions (sin/cos/tan):**
- Operate on **RADIANS** (direct Math.sin/cos/tan)
- Use for field-level math where angles are already in radians

**For phase-based oscillators:**
- Use SignalEvaluator kernels (oscSin/oscCos/oscTan)
- These convert phase [0,1) to radians internally

## Layer 2: SignalEvaluator - Domain-Specific Signals

**File:** `src/runtime/SignalEvaluator.ts`

**Responsibility:** SINGLE SOURCE OF TRUTH for domain-specific scalar→scalar functions

### What Belongs Here

✅ **DO implement:**
- Oscillators with phase semantics
- Easing functions with normalized time
- Shaping functions (smoothstep, step)
- Deterministic noise

❌ **DO NOT implement:**
- Generic math (abs, floor, sqrt) → use OpcodeInterpreter
- Vec2/geometry operations → use Materializer
- Field-level operations → use Materializer

### Signal Kernel Categories

#### OSCILLATORS (phase [0,1) → [-1,1])

Auto-wraps input to [0,1) range.

```
oscSin     - Sine oscillator: sin(phase * 2π)
oscCos     - Cosine oscillator: cos(phase * 2π)
oscTan     - Tangent oscillator: tan(phase * 2π)
triangle   - Triangle wave: 4|phase - 0.5| - 1
square     - Square wave: phase < 0.5 ? 1 : -1
sawtooth   - Sawtooth wave: 2 * phase - 1
```

**Contract:**
- Input: phase in [0,1), automatically wrapped
- Output: value in [-1,1]
- Used by oscillator blocks and phase-driven animations

#### EASING (t [0,1] → u [0,1])

Clamped to input/output ranges.

```
easeInQuad, easeOutQuad, easeInOutQuad
easeInCubic, easeOutCubic, easeInOutCubic
easeInElastic, easeOutElastic, easeOutBounce
```

**Contract:**
- Input: normalized time t in [0,1]
- Output: eased value u in [0,1]
- Used by timeline animations and interpolations

#### SHAPING

```
smoothstep(edge0, edge1, x) - Hermite interpolation
step(edge, x)              - Step function: x < edge ? 0 : 1
```

#### NOISE

```
noise(x) - Deterministic 1D noise
```

**Contract:**
- Input: any real number (used as seed/coordinate)
- Output: pseudo-random value in [0,1)
- Deterministic: same input always produces same output

### Phase vs Radians

**Signal Kernels (oscSin/oscCos/oscTan):**
- Expect **PHASE [0,1)**
- Convert to radians internally: `phase * 2π`
- Use for oscillator blocks

**Opcode Trig (sin/cos/tan):**
- Expect **RADIANS** directly
- No conversion
- Use for field-level math

## Layer 3: Materializer - Field Operations

**File:** `src/runtime/Materializer.ts`

**Responsibility:** Orchestrate IR → buffer conversion and field kernel operations

### Materializer Responsibilities

1. **IR → Buffer Orchestration**
   - `materialize()`: Convert FieldExpr to typed buffers
   - `fillBuffer()`: Dispatch to appropriate kernel

2. **Buffer Cache Management**
   - Frame-stamped caching
   - Dependency tracking
   - Invalidation on frame change

3. **Intrinsic Field Production**
   - `index`: particle index [0, N-1]
   - `normalizedIndex`: index / (N-1) in [0,1]
   - `randomId`: deterministic random per particle

4. **Layout Field Production**
   - `position`: vec2 from layout spec
   - `radius`: radial distance from layout

5. **Dispatch to Field Kernel Registry**
   - Route IR nodes to kernel functions
   - Handle typed buffer operations

### What Materializer Does NOT Do

❌ **NO scalar math** → delegate to OpcodeInterpreter  
❌ **NO signal kernels** → delegate to SignalEvaluator  
❌ **NO coord-space semantics** → defined by blocks

### Field Kernel Registry

Field kernels operate on typed array buffers. They are **COORD-SPACE AGNOSTIC** - blocks define the meaning of coordinates.

#### VEC2 CONSTRUCTION
```
makeVec2(x, y) → vec2
```

#### POLAR/CARTESIAN
```
fieldPolarToCartesian(cx, cy, r, angle) → vec2
  - Converts polar coordinates to cartesian
  - Just math: (cx + r*cos(angle), cy + r*sin(angle))
  - Blocks define whether this is world-space or local-space
```

#### LAYOUT
```
circleLayout(normalizedIndex, radius, phase) → vec2
  - Position on circle: (radius*cos(θ), radius*sin(θ))
  - θ = normalizedIndex * 2π + phase * 2π

circleAngle(normalizedIndex, phase) → float
  - Angle in radians: normalizedIndex * 2π + phase * 2π

polygonVertex(index, sides, radiusX, radiusY) → vec2
  - Position on regular polygon
```

#### EFFECTS
```
jitter2d / fieldJitter2D(pos, rand, amtX, amtY) → vec2
  - Add random offset to position
  - rand is deterministic noise value [0,1)

attract2d(pos, targetX, targetY, phase, strength) → vec2
  - Pull position toward target
  - phase modulates strength
  - Returns modified position

fieldPulse(id01, phase, base, amp, spread) → float
  - Traveling wave effect
  - id01: particle's normalized index
  - phase: animation phase
  - Returns: base + amp * pulse(id01, phase, spread)
```

#### FIELD MATH
```
fieldAdd(a, b) → float
  - Element-wise addition of float buffers

fieldAngularOffset(id01, phase, spin) → float
  - Per-particle angle offset
  - Returns: id01 * spin * 2π + phase * 2π

fieldRadiusSqrt(id01, radius) → float
  - Radial layout with sqrt distribution
  - Returns: sqrt(id01) * radius

fieldGoldenAngle(id01) → float
  - Golden angle distribution
  - Returns: id01 * 137.508° in radians
```

#### COLOR
```
hsvToRgb(h, s, v) → color
  - HSV to RGB conversion
  - h: hue [0,1) wraps
  - s, v: saturation/value [0,1] clamped

hsvToRgb(hueField, sat, val) → color
  - zipSig variant: hue from field buffer

fieldHueFromPhase(id01, phase) → float
  - Hue cycle based on phase
  - Returns: (id01 + phase) % 1.0

applyOpacity(color, opacity) → color
  - Multiply alpha channel
```

### Coord-Space Agnostic Principle

> Field kernels do not know or care about coordinate spaces.
> Blocks define whether operations are in world-space or local-space.

**Example:**
```typescript
// fieldPolarToCartesian just does the math:
// (cx + r*cos(angle), cy + r*sin(angle))

// The BLOCK decides:
// - "rotate" block: local-space (relative to particle)
// - "polarField" block: world-space (absolute coordinates)
```

This keeps kernels simple, reusable, and composable.

## Cross-Layer Patterns

### When to Use Which Layer

| Need to... | Use |
|-----------|-----|
| Add two numbers | OpcodeInterpreter `add` |
| Sine of an angle (radians) | OpcodeInterpreter `sin` |
| Sine wave from phase | SignalEvaluator `oscSin` |
| Ease a timeline value | SignalEvaluator `easeInOutCubic` |
| Convert polar to cartesian | Materializer `fieldPolarToCartesian` |
| Add random jitter | Materializer `jitter2d` |
| Convert HSV to RGB | Materializer `hsvToRgb` |

### Delegation Pattern

All three layers delegate to each other:

```
SignalEvaluator
  ↓ delegates scalar math
OpcodeInterpreter

Materializer
  ↓ delegates scalar math    ↓ delegates signals
OpcodeInterpreter          SignalEvaluator
```

**Key Rule:** Never duplicate. Always delegate.

## Implementation Status

| Sprint | Status | Verification |
|--------|--------|--------------|
| Sprint 1: Rename Oscillators | ✅ COMPLETE | Tests passing |
| Sprint 2: Remove Duplicate Math | ✅ COMPLETE | Tests passing |
| Sprint 3: Clean Materializer Map | ✅ COMPLETE | Tests passing |
| Sprint 4: Add Opcodes | ✅ COMPLETE | Tests passing |
| Sprint 5: Layer Contracts | ✅ COMPLETE | This document |

## Related Documents

- **Master Plan:** `.agent_planning/kernel-refactor-phase1/PLAN.md`
- **Definition of Done:** `.agent_planning/kernel-refactor-phase1/DOD.md`
- **Sprint Plans:** `.agent_planning/kernel-refactor-phase1/SPRINT-*.md`

## Maintenance

**When adding new operations:**

1. **Determine the correct layer:**
   - Scalar math? → OpcodeInterpreter
   - Domain-specific signal? → SignalEvaluator
   - Field/buffer operation? → Materializer

2. **Update this document:**
   - Add to appropriate reference section
   - Update quick reference table
   - Document domain/range contracts

3. **Verify no duplication:**
   - Search codebase for similar operations
   - Consolidate if found
   - Update tests

**This contract is the source of truth. Keep it accurate.**

---

**Document Version:** 1.0  
**Last Updated:** 2026-01-21  
**Maintained By:** Kernel Refactor Phase 1 Team
