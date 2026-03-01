import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  getSpyReadbackAgeMs,
  getSpyReadbackFreshness,
  withSpyReadbackMeta,
} from './ValueRenderer';

describe('ValueRenderer spy readback metadata', () => {
  it('computes non-negative age from capture timestamps', () => {
    expect(getSpyReadbackAgeMs({ capturedAtMs: 100, nowMs: 140 })).toBe(40);
    expect(getSpyReadbackAgeMs({ capturedAtMs: 200, nowMs: 120 })).toBe(0);
  });

  it('classifies freshness with default stale threshold', () => {
    expect(getSpyReadbackFreshness({ capturedAtMs: 100, nowMs: 300 })).toBe('fresh');
    expect(getSpyReadbackFreshness({ capturedAtMs: 100, nowMs: 351 })).toBe('stale');
  });

  it('returns invalid freshness for non-finite timestamps', () => {
    expect(getSpyReadbackFreshness({ capturedAtMs: Number.NaN, nowMs: 10 })).toBe('invalid');
    expect(getSpyReadbackFreshness({ capturedAtMs: 0, nowMs: Number.POSITIVE_INFINITY })).toBe('invalid');
  });

  it('wraps rendered elements with deterministic spy metadata attributes', () => {
    const element = React.createElement('span', null, 'v');
    const wrapped = withSpyReadbackMeta(element, {
      capturedAtMs: 100,
      nowMs: 380,
      staleAfterMs: 200,
    });
    expect(wrapped.type).toBe('span');
    expect((wrapped.props as Record<string, unknown>)['data-spy-freshness']).toBe('stale');
    expect((wrapped.props as Record<string, unknown>)['data-spy-age-ms']).toBe(280);
    expect((wrapped.props as Record<string, unknown>).children).toBe(element);
  });
});
