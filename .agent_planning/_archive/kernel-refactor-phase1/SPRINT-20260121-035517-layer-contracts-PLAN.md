# Sprint: layer-contracts - Add Layer Contract Comments

**Generated:** 2026-01-21T03:55:17Z
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Add explicit layer contract comments to all three kernel/evaluator files. These comments lock the semantics and naming conventions so future development stays on the rails.

## Scope

**Deliverables:**
1. Full header contract in OpcodeInterpreter.ts
2. Full header contract in SignalEvaluator.ts
3. Full header contract in Materializer.ts
4. Summary contract in a new KERNEL-CONTRACTS.md doc

## Work Items

### P0: OpcodeInterpreter.ts Header Contract

**File:** `src/runtime/OpcodeInterpreter.ts`

**Acceptance Criteria:**
- [ ] Replace lines 1-12 with comprehensive contract
- [ ] List all opcodes by arity
- [ ] State "SINGLE ENFORCER" rule
- [ ] Clarify radian-based trig vs phase-based oscillators

**Technical Notes:**

```typescript
// Replace lines 1-12 with:

/**
 * ══════════════════════════════════════════════════════════════════════
 * OPCODE INTERPRETER - SINGLE ENFORCER
 * ══════════════════════════════════════════════════════════════════════
 *
 * This is the ONLY place that defines scalar numeric operations.
 * All runtime modules (SignalEvaluator, Materializer) delegate here.
 *
 * ARCHITECTURAL LAW: SINGLE ENFORCER
 * - No other module may implement scalar math
 * - No duplication of these operations anywhere
 *
 * ──────────────────────────────────────────────────────────────────────
 * OPCODE REFERENCE
 * ──────────────────────────────────────────────────────────────────────
 *
 * UNARY (exactly 1 argument):
 *   neg      - Negation: -x
 *   abs      - Absolute value: |x|
 *   sin      - Sine (RADIANS): Math.sin(x)
 *   cos      - Cosine (RADIANS): Math.cos(x)
 *   tan      - Tangent (RADIANS): Math.tan(x)
 *   wrap01   - Wrap to [0,1): ((x % 1) + 1) % 1
 *   floor    - Floor: Math.floor(x)
 *   ceil     - Ceiling: Math.ceil(x)
 *   round    - Round: Math.round(x)
 *   fract    - Fractional part: x - floor(x)
 *   sqrt     - Square root: Math.sqrt(x)
 *   exp      - Exponential: Math.exp(x)
 *   log      - Natural log: Math.log(x)
 *   sign     - Sign: -1, 0, or 1
 *
 * BINARY (exactly 2 arguments):
 *   sub      - Subtraction: a - b
 *   div      - Division: a / b
 *   mod      - Modulo: a % b
 *   pow      - Power: a^b
 *   hash     - Deterministic hash: (value, seed) → [0,1)
 *
 * TERNARY (exactly 3 arguments):
 *   clamp    - Clamp: clamp(x, min, max)
 *   lerp     - Linear interp: lerp(a, b, t)
 *
 * VARIADIC (1+ arguments):
 *   add      - Sum: a + b + c + ...
 *   mul      - Product: a * b * c * ...
 *   min      - Minimum: min(a, b, c, ...)
 *   max      - Maximum: max(a, b, c, ...)
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: RADIANS vs PHASE
 * ──────────────────────────────────────────────────────────────────────
 *
 * Opcode sin/cos/tan operate on RADIANS (raw Math functions).
 * Use these for field-level math where angles are already in radians.
 *
 * For PHASE-based oscillators (input [0,1) → output [-1,1]):
 * Use SignalEvaluator kernels: oscSin, oscCos, oscTan, triangle, etc.
 * These convert phase to radians internally (phase * 2π).
 *
 * ══════════════════════════════════════════════════════════════════════
 */
```

### P1: SignalEvaluator.ts Header Contract

**File:** `src/runtime/SignalEvaluator.ts`

**Acceptance Criteria:**
- [ ] Replace lines 1-14 with comprehensive contract
- [ ] List all signal kernel categories
- [ ] State domain/range contracts for each category
- [ ] Clarify phase-based vs opcode trig

**Technical Notes:**

```typescript
// Replace lines 1-14 with:

/**
 * ══════════════════════════════════════════════════════════════════════
 * SIGNAL EVALUATOR - SINGLE SOURCE OF TRUTH
 * ══════════════════════════════════════════════════════════════════════
 *
 * Unified signal evaluation for ScheduleExecutor and Materializer.
 * Adheres to architectural law: ONE SOURCE OF TRUTH
 *
 * ──────────────────────────────────────────────────────────────────────
 * LAYER CONTRACT: SIGNAL KERNELS
 * ──────────────────────────────────────────────────────────────────────
 *
 * Signal kernels are DOMAIN-SPECIFIC scalar→scalar functions.
 * They have specific input domains and output ranges.
 *
 * WHAT BELONGS HERE:
 * - Oscillators (phase [0,1) → value [-1,1])
 * - Easing functions (t [0,1] → u [0,1])
 * - Shaping functions (smoothstep, step)
 * - Noise (deterministic, seeded)
 *
 * WHAT DOES NOT BELONG HERE:
 * - Generic math (abs, floor, sqrt, pow) → use OpcodeInterpreter
 * - Vec2/geometry operations → use Materializer field kernels
 * - Field-level operations → use Materializer
 *
 * ──────────────────────────────────────────────────────────────────────
 * SIGNAL KERNEL REFERENCE
 * ──────────────────────────────────────────────────────────────────────
 *
 * OSCILLATORS (phase [0,1) → [-1,1], auto-wrapped):
 *   oscSin     - Sine oscillator: sin(phase * 2π)
 *   oscCos     - Cosine oscillator: cos(phase * 2π)
 *   oscTan     - Tangent oscillator: tan(phase * 2π)
 *   triangle   - Triangle wave: 4|phase - 0.5| - 1
 *   square     - Square wave: phase < 0.5 ? 1 : -1
 *   sawtooth   - Sawtooth wave: 2 * phase - 1
 *
 * EASING (t [0,1] → u [0,1], clamped):
 *   easeInQuad, easeOutQuad, easeInOutQuad
 *   easeInCubic, easeOutCubic, easeInOutCubic
 *   easeInElastic, easeOutElastic, easeOutBounce
 *
 * SHAPING:
 *   smoothstep(edge0, edge1, x) - Hermite interpolation
 *   step(edge, x) - Step function: x < edge ? 0 : 1
 *
 * NOISE:
 *   noise(x) - Deterministic 1D noise, output [0,1)
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: PHASE vs RADIANS
 * ──────────────────────────────────────────────────────────────────────
 *
 * Signal kernels oscSin/oscCos/oscTan expect PHASE [0,1).
 * They convert to radians internally: sin(phase * 2π).
 *
 * Opcode sin/cos/tan expect RADIANS directly.
 * Use opcodes for field-level math; use kernels for oscillator blocks.
 *
 * ══════════════════════════════════════════════════════════════════════
 */
```

### P2: Materializer.ts Header Contract

**File:** `src/runtime/Materializer.ts`

**Acceptance Criteria:**
- [ ] Replace lines 1-6 with comprehensive contract
- [ ] List all field kernel categories
- [ ] State coord-space agnostic principle
- [ ] Clarify orchestration vs kernel responsibilities

**Technical Notes:**

```typescript
// Replace lines 1-6 with:

/**
 * ══════════════════════════════════════════════════════════════════════
 * FIELD MATERIALIZER
 * ══════════════════════════════════════════════════════════════════════
 *
 * Converts FieldExpr IR nodes into typed array buffers.
 * Pure IR path - no legacy fallbacks.
 *
 * ──────────────────────────────────────────────────────────────────────
 * LAYER CONTRACT
 * ──────────────────────────────────────────────────────────────────────
 *
 * MATERIALIZER RESPONSIBILITIES:
 * 1. IR → buffer orchestration (materialize, fillBuffer)
 * 2. Buffer cache management (frame-stamped caching)
 * 3. Intrinsic field production (index, normalizedIndex, randomId)
 * 4. Layout field production (position, radius from layout spec)
 * 5. Dispatch to field kernel registry
 *
 * MATERIALIZER DOES NOT:
 * - Define scalar math (→ OpcodeInterpreter)
 * - Define signal kernels (→ SignalEvaluator)
 * - Define coord-space semantics (→ block-level contracts)
 *
 * ──────────────────────────────────────────────────────────────────────
 * FIELD KERNEL REGISTRY (applyKernel / applyKernelZipSig)
 * ──────────────────────────────────────────────────────────────────────
 *
 * Field kernels operate on typed array buffers (vec2/color/float).
 * They are COORD-SPACE AGNOSTIC - blocks define world/local semantics.
 *
 * VEC2 CONSTRUCTION:
 *   makeVec2(x, y) → vec2
 *
 * POLAR/CARTESIAN:
 *   fieldPolarToCartesian(cx, cy, r, angle) → vec2
 *
 * LAYOUT:
 *   circleLayout(normalizedIndex, radius, phase) → vec2
 *   circleAngle(normalizedIndex, phase) → float (radians)
 *   polygonVertex(index, sides, radiusX, radiusY) → vec2
 *
 * EFFECTS:
 *   jitter2d / fieldJitter2D(pos, rand, amtX, amtY) → vec2
 *   attract2d(pos, targetX, targetY, phase, strength) → vec2
 *   fieldPulse(id01, phase, base, amp, spread) → float
 *
 * FIELD MATH:
 *   fieldAdd(a, b) → float
 *   fieldAngularOffset(id01, phase, spin) → float
 *   fieldRadiusSqrt(id01, radius) → float
 *   fieldGoldenAngle(id01) → float
 *
 * COLOR:
 *   hsvToRgb(h, s, v) → color
 *   hsvToRgb(hueField, sat, val) → color (zipSig variant)
 *   fieldHueFromPhase(id01, phase) → float
 *   applyOpacity(color, opacity) → color
 *
 * ──────────────────────────────────────────────────────────────────────
 * IMPORTANT: COORD-SPACE AGNOSTIC
 * ──────────────────────────────────────────────────────────────────────
 *
 * Field kernels do not know or care about coordinate spaces.
 * - fieldPolarToCartesian: just computes cx + r*cos(a), cy + r*sin(a)
 * - The meaning (local vs world) comes from the BLOCK that uses it
 *
 * This keeps kernels simple and reusable across different contexts.
 *
 * ══════════════════════════════════════════════════════════════════════
 */
```

### P3: Create summary KERNEL-CONTRACTS.md

**File:** `.agent_planning/kernel-refactor-phase1/KERNEL-CONTRACTS.md`

**Acceptance Criteria:**
- [ ] Create reference document summarizing all layer contracts
- [ ] Include quick reference table
- [ ] Link to roadmap documents

## Dependencies

- Sprints 1-4 should complete first (contracts should reflect final state)

## Risks

| Risk | Mitigation |
|------|------------|
| Comments drift from implementation | Run as final sprint after code changes |
