# Sprint: remove-duplicate-math - Remove Duplicate Math from Signal Kernels

**Generated:** 2026-01-21T03:55:17Z
**Confidence:** HIGH
**Status:** READY FOR IMPLEMENTATION

## Sprint Goal

Remove generic math functions from SignalEvaluator.ts that duplicate opcodes. Signal kernels should only contain domain-specific functions (oscillators, easing, noise).

## Scope

**Deliverables:**
1. Remove duplicate math kernels from SignalEvaluator.ts
2. Keep only domain-specific signal kernels (oscillators, easing, noise, shaping)
3. Ensure IR/blocks route math through opcodes, not kernels

## Work Items

### P0: Identify and remove duplicate math kernels

**File:** `src/runtime/SignalEvaluator.ts`

**Lines to REMOVE (these duplicate opcodes or will after Sprint 1):**

| Lines | Kernel | Reason |
|-------|--------|--------|
| 260-265 | `abs` | Duplicate: exists as opcode |
| 267-272 | `floor` | Duplicate: adding as opcode |
| 274-279 | `ceil` | Duplicate: adding as opcode |
| 281-286 | `round` | Duplicate: adding as opcode |
| 288-295 | `fract` | Duplicate: adding as opcode |
| 297-302 | `sqrt` | Duplicate: adding as opcode |
| 304-309 | `exp` | Duplicate: adding as opcode |
| 311-316 | `log` | Duplicate: adding as opcode |
| 318-323 | `pow` | Duplicate: adding as opcode |
| 325-330 | `min` | Duplicate: exists as opcode (variadic) |
| 332-337 | `max` | Duplicate: exists as opcode (variadic) |
| 339-344 | `clamp` | Duplicate: exists as opcode |
| 346-352 | `mix` | Duplicate: `lerp` opcode exists |
| 375-378 | `sign` | Duplicate: adding as opcode |

**Acceptance Criteria:**
- [ ] Delete lines 260-352 (the "=== MATH FUNCTIONS ===" section)
- [ ] Delete lines 375-378 (`sign` case)
- [ ] Keep lines 354-373 (`smoothstep`, `step`) as shaping functions (domain-specific)

**Technical Notes - Line-by-Line Instructions:**

```typescript
// File: src/runtime/SignalEvaluator.ts

// DELETE the following entire section (lines 256-378):
// From:
    // === MATH FUNCTIONS ===

    case 'abs': {
// Through:
    case 'sign': {
      if (values.length !== 1) {
        throw new Error(`Signal kernel 'sign' expects 1 input, got ${values.length}`);
      }
      return Math.sign(values[0]);
    }

// KEEP the following (lines 379-462):
    // === EASING FUNCTIONS (input 0..1, output 0..1) ===
// Through:
    case 'noise': { ... }

// ALSO KEEP smoothstep and step as they are shaping/domain-specific:
    case 'smoothstep': { ... }  // Keep - shaping function
    case 'step': { ... }        // Keep - shaping function
```

### P1: Update header comment to reflect signal kernel contract

**File:** `src/runtime/SignalEvaluator.ts`

**Acceptance Criteria:**
- [ ] Update lines 1-14 to clearly state signal kernels are domain-specific only
- [ ] List categories: oscillators, easing, noise, shaping (smoothstep/step)

**Technical Notes:**

```typescript
// Replace lines 1-14 with:

/**
 * Signal Evaluator - SINGLE SOURCE OF TRUTH
 *
 * Unified signal evaluation for both ScheduleExecutor and Materializer.
 * Adheres to architectural law: ONE SOURCE OF TRUTH
 *
 * LAYER CONTRACT:
 * ─────────────────────────────────────────────────────────────
 * Signal kernels are DOMAIN-SPECIFIC scalar→scalar functions:
 *
 * OSCILLATORS (phase [0,1) → [-1,1]):
 *   oscSin, oscCos, oscTan, triangle, square, sawtooth
 *
 * EASING (t [0,1] → u [0,1]):
 *   easeInQuad, easeOutQuad, easeInOutQuad,
 *   easeInCubic, easeOutCubic, easeInOutCubic,
 *   easeInElastic, easeOutElastic, easeOutBounce
 *
 * SHAPING:
 *   smoothstep, step
 *
 * NOISE (any real → [0,1)):
 *   noise
 * ─────────────────────────────────────────────────────────────
 *
 * IMPORTANT: Generic math (abs, floor, sqrt, etc.) belongs in
 * OpcodeInterpreter, NOT here. Signal kernels have domain semantics.
 *
 * Signal kernels sin/cos/tan (oscSin/oscCos/oscTan) expect PHASE [0,1).
 * Opcode sin/cos/tan expect RADIANS.
 */
```

### P2: Verify no IR references to removed kernels

**Acceptance Criteria:**
- [ ] Search for IR builder code emitting removed kernel names
- [ ] Update to use opcode instead

**Technical Notes:**

```bash
# Search for any kernel references that should now be opcodes
grep -rn "kind: 'kernel'" --include="*.ts" src/compiler/ | grep -E "'abs'|'floor'|'ceil'|'round'|'sqrt'|'exp'|'log'|'pow'|'min'|'max'|'clamp'|'mix'|'fract'|'sign'"
```

If found, change from:
```typescript
{ kind: 'kernel', name: 'abs' }
```
To:
```typescript
{ kind: 'opcode', opcode: 'abs' }
```

## Dependencies

- Sprint 1 (add-opcodes) MUST complete first - new opcodes must exist before removing kernel versions

## Risks

| Risk | Mitigation |
|------|------------|
| Existing IR uses kernel names for math | Search and update IR builder before removing |
| Runtime breaks if opcode missing | Sprint 1 adds opcodes first |
