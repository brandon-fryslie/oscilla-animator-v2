/**
 * ColorValueRenderer - Color swatch with channel statistics.
 *
 * Primary path is aggregate mode (field-cardinality colors):
 * - Large average color swatch
 * - Per-channel R/G/B/A range bars
 * - Hex representation of mean color
 * - Count badge
 *
 * Scalar mode: falls through to generic numeric (color signals not emitted in v1).
 */

import React from 'react';
import type { ValueRenderer } from '../ValueRenderer';
import type { RendererSample, AggregateStats } from '../types';
import { formatFloat } from './formatFloat';
import { genericNumericRenderer } from './GenericNumericRenderer';

const styles = {
  container: { fontFamily: 'monospace', fontSize: '12px', color: '#e0e0e0' } as const,
  swatchLarge: {
    width: '32px',
    height: '32px',
    borderRadius: '3px',
    border: '1px solid rgba(255,255,255,0.2)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  } as const,
  swatchSmall: {
    width: '14px',
    height: '14px',
    borderRadius: '2px',
    border: '1px solid rgba(255,255,255,0.2)',
    display: 'inline-block' as const,
    verticalAlign: 'middle' as const,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  } as const,
  checkerboard: {
    position: 'absolute' as const,
    inset: 0,
    background: `repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 50% / 8px 8px`,
  } as const,
  colorOverlay: {
    position: 'absolute' as const,
    inset: 0,
  } as const,
  row: { display: 'flex', gap: '8px', alignItems: 'center' } as const,
  channelBars: { display: 'flex', flexDirection: 'column' as const, gap: '2px', flex: 1 } as const,
  channelRow: { display: 'flex', alignItems: 'center', gap: '4px', height: '12px' } as const,
  channelLabel: { fontSize: '9px', width: '10px' } as const,
  barTrack: {
    flex: 1,
    height: '6px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '3px',
    position: 'relative' as const,
    overflow: 'hidden' as const,
  } as const,
  hexLabel: { color: '#aaa', fontSize: '11px', marginTop: '4px' } as const,
  countBadge: { color: '#666', fontSize: '10px' } as const,
};

const CHANNEL_COLORS = ['#ff4444', '#44cc44', '#4488ff', '#aaaaaa'] as const;
const CHANNEL_LABELS = ['R', 'G', 'B', 'A'] as const;

/**
 * Convert float [0,1] components to CSS rgba string.
 */
function toRgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

/**
 * Convert float [0,1] RGB to hex string.
 */
function toHex(r: number, g: number, b: number): string {
  const hex = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * ColorSwatch component - div with rgba background over checkerboard.
 */
function ColorSwatch(props: { r: number; g: number; b: number; a: number; large: boolean }): React.ReactElement {
  const swatchStyle = props.large ? styles.swatchLarge : styles.swatchSmall;
  return React.createElement('div', { style: swatchStyle },
    React.createElement('div', { style: styles.checkerboard }),
    React.createElement('div', {
      style: { ...styles.colorOverlay, background: toRgba(props.r, props.g, props.b, props.a) },
    })
  );
}

/**
 * Per-channel range bar.
 */
function ChannelBar(props: { channel: number; min: number; max: number; mean: number }): React.ReactElement {
  const minPct = Math.max(0, Math.min(100, props.min * 100));
  const maxPct = Math.max(0, Math.min(100, props.max * 100));
  const meanPct = Math.max(0, Math.min(100, props.mean * 100));

  return React.createElement('div', { style: styles.channelRow },
    React.createElement('span', {
      style: { ...styles.channelLabel, color: CHANNEL_COLORS[props.channel] },
    }, CHANNEL_LABELS[props.channel]),
    React.createElement('div', { style: styles.barTrack },
      // Range fill
      React.createElement('div', {
        style: {
          position: 'absolute' as const,
          left: `${minPct}%`,
          width: `${Math.max(1, maxPct - minPct)}%`,
          height: '100%',
          background: CHANNEL_COLORS[props.channel],
          opacity: 0.4,
          borderRadius: '3px',
        },
      }),
      // Mean tick
      React.createElement('div', {
        style: {
          position: 'absolute' as const,
          left: `${meanPct}%`,
          width: '1px',
          height: '100%',
          background: CHANNEL_COLORS[props.channel],
        },
      })
    )
  );
}

function renderAggregateFull(stats: AggregateStats): React.ReactElement {
  const meanR = stats.mean[0], meanG = stats.mean[1], meanB = stats.mean[2], meanA = stats.mean[3];

  return React.createElement('div', { style: styles.container },
    React.createElement('div', { style: styles.row },
      React.createElement(ColorSwatch, { r: meanR, g: meanG, b: meanB, a: meanA, large: true }),
      React.createElement('div', { style: styles.channelBars },
        ...Array.from({ length: 4 }, (_, i) =>
          React.createElement(ChannelBar, {
            key: i,
            channel: i,
            min: stats.min[i],
            max: stats.max[i],
            mean: stats.mean[i],
          })
        )
      )
    ),
    React.createElement('div', { style: styles.hexLabel },
      `${toHex(meanR, meanG, meanB)} (α=${formatFloat(meanA)})`),
    React.createElement('div', { style: styles.countBadge }, `n=${stats.count}`)
  );
}

function renderAggregateInline(stats: AggregateStats): React.ReactElement {
  return React.createElement('span', { style: { ...styles.container, display: 'inline-flex', alignItems: 'center', gap: '4px' } },
    React.createElement(ColorSwatch, {
      r: stats.mean[0], g: stats.mean[1], b: stats.mean[2], a: stats.mean[3], large: false,
    }),
    React.createElement('span', null, toHex(stats.mean[0], stats.mean[1], stats.mean[2]))
  );
}

export const colorValueRenderer: ValueRenderer = {
  renderFull(sample: RendererSample): React.ReactElement {
    if (sample.type === 'aggregate') {
      return renderAggregateFull(sample.stats);
    }
    // Scalar color signals not emitted in v1 — fall through to generic
    return genericNumericRenderer.renderFull(sample);
  },

  renderInline(sample: RendererSample): React.ReactElement {
    if (sample.type === 'aggregate') {
      return renderAggregateInline(sample.stats);
    }
    return genericNumericRenderer.renderInline(sample);
  },
};
