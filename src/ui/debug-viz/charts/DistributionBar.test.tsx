import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { DistributionBar } from './DistributionBar';
import type { AggregateStats, Stride } from '../types';

function makeStats(min: number, mean: number, max: number, count: number): AggregateStats {
  return {
    count,
    stride: 1 as Stride,
    min: new Float32Array([min, 0, 0, 0]),
    max: new Float32Array([max, 0, 0, 0]),
    mean: new Float32Array([mean, 0, 0, 0]),
  };
}

describe('DistributionBar', () => {
  it('renders min and max labels', () => {
    const stats = makeStats(0.1, 0.5, 0.9, 10);
    const { container } = render(
      React.createElement(DistributionBar, { stats, width: 100 })
    );
    expect(container.textContent).toContain('0.1000');
    expect(container.textContent).toContain('0.9000');
  });

  it('positions mean tick proportionally', () => {
    const stats = makeStats(0, 0.25, 1, 10);
    const { container } = render(
      React.createElement(DistributionBar, { stats, width: 100 })
    );
    // Mean at 0.25 in range [0,1] = 25%
    const meanTick = container.querySelector('div[style*="width: 1px"]');
    expect(meanTick).toBeTruthy();
    // The left should be 25%
    const style = meanTick?.getAttribute('style') || '';
    expect(style).toContain('25%');
  });

  it('handles degenerate min=max without crash', () => {
    const stats = makeStats(0.5, 0.5, 0.5, 10);
    const { container } = render(
      React.createElement(DistributionBar, { stats, width: 100 })
    );
    // Should render centered tick (50%)
    const meanTick = container.querySelector('div[style*="width: 1px"]');
    expect(meanTick).toBeTruthy();
    expect(container.textContent).toContain('0.5000');
  });

  it('shows "no data" for count=0', () => {
    const stats = makeStats(0, 0, 0, 0);
    const { container } = render(
      React.createElement(DistributionBar, { stats, width: 100 })
    );
    expect(container.textContent).toBe('no data');
  });

  it('renders with custom height', () => {
    const stats = makeStats(0, 0.5, 1, 5);
    const { container } = render(
      React.createElement(DistributionBar, { stats, width: 100, height: 20 })
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.height).toBe('20px');
  });

  it('renders fill across full width', () => {
    const stats = makeStats(10, 50, 90, 100);
    const { container } = render(
      React.createElement(DistributionBar, { stats, width: 200 })
    );
    // Fill div should span 100% width
    const fill = container.querySelector('div[style*="width: 100%"]');
    expect(fill).toBeTruthy();
  });
});
