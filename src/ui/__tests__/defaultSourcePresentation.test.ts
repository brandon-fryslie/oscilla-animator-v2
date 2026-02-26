import { describe, expect, it } from 'vitest';
import type { DefaultSource } from '../../types';
import {
  formatDefaultSourceLabel,
  formatDefaultSourceReference,
  isConstLiteralDefaultSource,
  isTimeDefaultSource,
} from '../defaultSourcePresentation';

describe('defaultSourcePresentation', () => {
  it('treats InfiniteTimeRoot as time default', () => {
    const infinite: DefaultSource = { blockType: 'InfiniteTimeRoot', output: 'phaseA' };

    expect(isTimeDefaultSource(infinite)).toBe(true);
    expect(isTimeDefaultSource({ blockType: 'Const', output: 'out', params: { value: 1 } })).toBe(false);
  });

  it('identifies const literal default sources', () => {
    const constDefault: DefaultSource = { blockType: 'Const', output: 'out', params: { value: 2.5 } };
    const nonLiteralConst: DefaultSource = { blockType: 'Const', output: 'out' };

    expect(isConstLiteralDefaultSource(constDefault)).toBe(true);
    expect(isConstLiteralDefaultSource(nonLiteralConst)).toBe(false);
    expect(isConstLiteralDefaultSource(undefined)).toBe(false);
  });

  it('formats labels and references deterministically', () => {
    const timeDefault: DefaultSource = { blockType: 'InfiniteTimeRoot', output: 'tMs' };
    const constDefault: DefaultSource = { blockType: 'Const', output: 'out', params: { value: [1, 2, 3] } };

    expect(formatDefaultSourceReference(timeDefault)).toBe('InfiniteTimeRoot.tMs');
    expect(formatDefaultSourceReference(constDefault)).toBe('[1, 2, 3]');
    expect(formatDefaultSourceLabel(constDefault, 'Default: ')).toBe('Default: [1, 2, 3]');
  });
});
