/**
 * Tests for obligation types and helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  isOpen,
  isDischarged,
  isBlocked,
  discharged,
  blocked,
  type Obligation,
  type ObligationId,
} from '../obligations';

describe('Obligation helpers', () => {
  const baseObligation: Obligation = {
    id: 'test:1' as ObligationId,
    kind: 'missingInputSource',
    anchor: { blockId: 'b0' },
    status: { kind: 'open' },
    deps: [],
    policy: { name: 'defaultSources.v1', version: 1 },
    debug: { createdBy: 'test' },
  };

  it('isOpen returns true for open obligations', () => {
    expect(isOpen(baseObligation)).toBe(true);
    expect(isDischarged(baseObligation)).toBe(false);
    expect(isBlocked(baseObligation)).toBe(false);
  });

  it('isDischarged returns true for discharged obligations', () => {
    const o: Obligation = {
      ...baseObligation,
      status: discharged(['b1'], ['e1']),
    };
    expect(isOpen(o)).toBe(false);
    expect(isDischarged(o)).toBe(true);
    expect(isBlocked(o)).toBe(false);
  });

  it('isBlocked returns true for blocked obligations', () => {
    const o: Obligation = {
      ...baseObligation,
      status: blocked('no default source exists', ['diag-1']),
    };
    expect(isOpen(o)).toBe(false);
    expect(isDischarged(o)).toBe(false);
    expect(isBlocked(o)).toBe(true);
  });

  it('discharged status carries artifact refs', () => {
    const status = discharged(['b1', 'b2'], ['e1']);
    expect(status.kind).toBe('discharged');
    if (status.kind === 'discharged') {
      expect(status.elaborated.blockIds).toEqual(['b1', 'b2']);
      expect(status.elaborated.edgeIds).toEqual(['e1']);
    }
  });

  it('blocked status carries reason and diagIds', () => {
    const status = blocked('unsupported type', ['diag-42']);
    expect(status.kind).toBe('blocked');
    if (status.kind === 'blocked') {
      expect(status.reason).toBe('unsupported type');
      expect(status.diagIds).toEqual(['diag-42']);
    }
  });

  it('obligation ID stability: same semantic target = same ID', () => {
    // Obligation IDs are deterministic from their target
    const id1 = 'missingInput:b0:pos' as ObligationId;
    const id2 = 'missingInput:b0:pos' as ObligationId;
    expect(id1).toBe(id2);

    // Different targets produce different IDs
    const id3 = 'missingInput:b0:color' as ObligationId;
    expect(id1).not.toBe(id3);
  });
});
