/**
 * Zero-Cardinality Validation Tests
 *
 * Verify that axis validation enforces zero-cardinality invariants.
 * TYPE-SYSTEM-INVARIANTS #P2
 */

import { describe, it, expect } from 'vitest';
import { validateType } from '../axis-validate';
import { canonicalConst, canonicalEvent, FLOAT, BOOL, unitNone } from '../../../core/canonical-types';

describe('Axis validation for zero-cardinality', () => {
  it('should accept zero-cardinality + continuous (const)', () => {
    const constType = canonicalConst(FLOAT);
    expect(() => validateType(constType)).not.toThrow();
  });

  it('should reject zero-cardinality + discrete (no const events)', () => {
    // Manually construct an invalid type (zero + discrete)
    const invalidType = {
      payload: BOOL,
      unit: unitNone(),
      extent: {
        cardinality: { kind: 'inst' as const, value: { kind: 'zero' as const } },
        temporality: { kind: 'inst' as const, value: { kind: 'discrete' as const } },
        binding: { kind: 'inst' as const, value: { kind: 'unbound' as const } },
        perspective: { kind: 'inst' as const, value: { kind: 'default' as const } },
        branch: { kind: 'inst' as const, value: { kind: 'default' as const } },
      },
    };

    // Validation dispatches on temporality first, so discrete triggers event validation
    // Event validation then rejects zero-cardinality
    expect(() => validateType(invalidType)).toThrow(/const events are forbidden/);
  });

  it('should accept events with cardinality=one', () => {
    const eventType = canonicalEvent();
    expect(() => validateType(eventType)).not.toThrow();
  });
});
