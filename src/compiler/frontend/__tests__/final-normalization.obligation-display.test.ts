import { describe, expect, it } from 'vitest';
import { formatObligationIdForDisplay } from '../final-normalization';
import type { ObligationId } from '../obligations';

describe('formatObligationIdForDisplay', () => {
  it('does not arrow-split non-edge obligation kinds even when payload contains ->', () => {
    const display = formatObligationIdForDisplay(
      {
        id: 'missingInput:block->with-arrow:freq' as ObligationId,
        kind: 'missingInputSource',
      },
      new Map([['block->with-arrow', 'Oscillator']]),
    );

    expect(display).toBe('missingInput:Oscillator.freq');
  });

  it('arrow-splits edge-pair obligations and formats both endpoints', () => {
    const display = formatObligationIdForDisplay(
      {
        id: 'needsAdapter:src:out->dst:in' as ObligationId,
        kind: 'needsAdapter',
      },
      new Map([
        ['src', 'LFO'],
        ['dst', 'Filter'],
      ]),
    );

    expect(display).toBe('needsAdapter:LFO.out->Filter.in');
  });
});
