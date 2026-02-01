/**
 * Math Utility Blocks Test
 *
 * Tests for Noise, Length, and Normalize blocks (U-8).
 */

import { describe, it, expect } from 'vitest';
import { getBlockDefinition } from '../registry';

describe('Noise Block', () => {
  it('is registered and discoverable', () => {
    const def = getBlockDefinition('Noise');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.type).toBe('Noise');
    expect(def.category).toBe('math');
    expect(def.capability).toBe('pure');
  });
});

describe('Length Block', () => {
  it('is registered and discoverable', () => {
    const def = getBlockDefinition('Length');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.type).toBe('Length');
    expect(def.category).toBe('math');
    expect(def.capability).toBe('pure');
  });
});

describe('Normalize Block', () => {
  it('is registered and discoverable', () => {
    const def = getBlockDefinition('Normalize');
    expect(def).toBeDefined();
    if (!def) return;
    expect(def.type).toBe('Normalize');
    expect(def.category).toBe('math');
    expect(def.capability).toBe('pure');
  });
});
