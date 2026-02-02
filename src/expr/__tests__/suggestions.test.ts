/**
 * Tests for Expression Autocomplete Suggestions
 */

import { describe, it, expect } from 'vitest';
import {
  SuggestionProvider,
  getFunctionSignatures,
  type FunctionSuggestion,
  type BlockSuggestion,
  type PortSuggestion,
} from '../suggestions';
import type { Patch } from '../../graph/Patch';
import { AddressRegistry } from '../../graph/address-registry';
import { FLOAT } from '../../core/canonical-types';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a minimal test patch with blocks.
 */
function createTestPatch(blocks: any[]): Patch {
  const blockMap = new Map(blocks.map(b => [b.id, b]));
  return {
    blocks: blockMap,
    edges: [],
  } as any as Patch;
}

/**
 * Create a test block with outputs.
 * @param id - Block ID (also used as displayName for test readability)
 * @param type - Block type
 * @param displayName - Optional display name (defaults to ID for test readability)
 */
function createTestBlock(id: string, type: string, displayName?: string | null): any {
  return {
    id,
    type,
    params: {},
    // Default to ID for test readability (simulates auto-generated display name)
    displayName: displayName !== undefined ? displayName : id,
    domainId: null,
    role: 'normal' as const,
    inputPorts: new Map(),
    outputPorts: new Map([
      ['out', { id: 'out' }],
    ]),
  };
}

// =============================================================================
// Function Signature Tests
// =============================================================================

describe('getFunctionSignatures', () => {
  it('returns all 16 function signatures', () => {
    const signatures = getFunctionSignatures();
    expect(signatures).toHaveLength(16);
  });

  it('includes trigonometric functions', () => {
    const signatures = getFunctionSignatures();
    const names = signatures.map(s => s.name);
    expect(names).toContain('sin');
    expect(names).toContain('cos');
    expect(names).toContain('tan');
  });

  it('includes unary functions', () => {
    const signatures = getFunctionSignatures();
    const names = signatures.map(s => s.name);
    expect(names).toContain('abs');
    expect(names).toContain('sqrt');
    expect(names).toContain('floor');
    expect(names).toContain('ceil');
    expect(names).toContain('round');
  });

  it('includes binary functions', () => {
    const signatures = getFunctionSignatures();
    const names = signatures.map(s => s.name);
    expect(names).toContain('min');
    expect(names).toContain('max');
  });

  it('includes interpolation functions', () => {
    const signatures = getFunctionSignatures();
    const names = signatures.map(s => s.name);
    expect(names).toContain('lerp');
    expect(names).toContain('mix');
    expect(names).toContain('smoothstep');
    expect(names).toContain('clamp');
  });

  it('includes phase functions', () => {
    const signatures = getFunctionSignatures();
    const names = signatures.map(s => s.name);
    expect(names).toContain('wrap');
    expect(names).toContain('fract');
  });

  it('each signature has required fields', () => {
    const signatures = getFunctionSignatures();
    for (const sig of signatures) {
      expect(sig).toHaveProperty('name');
      expect(sig).toHaveProperty('arity');
      expect(sig).toHaveProperty('returnType');
      expect(sig).toHaveProperty('description');
      expect(typeof sig.name).toBe('string');
      expect(typeof sig.arity).toBe('number');
      expect(typeof sig.returnType).toBe('object');  // PayloadType is { kind, stride }
      expect(typeof sig.returnType.kind).toBe('string');
      expect(typeof sig.description).toBe('string');
    }
  });

  it('correct arity for known functions', () => {
    const signatures = getFunctionSignatures();
    const byName = new Map(signatures.map(s => [s.name, s]));

    expect(byName.get('sin')?.arity).toBe(1);
    expect(byName.get('min')?.arity).toBe(2);
    expect(byName.get('lerp')?.arity).toBe(3);
    expect(byName.get('clamp')?.arity).toBe(3);
  });
});

// =============================================================================
// SuggestionProvider - Function Suggestions
// =============================================================================

describe('SuggestionProvider.suggestFunctions', () => {
  it('returns function suggestions with opening paren', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestFunctions();
    expect(suggestions.length).toBeGreaterThan(0);

    for (const suggestion of suggestions) {
      expect(suggestion.label).toMatch(/\($/); // Ends with opening paren
      expect(suggestion.type).toBe('function');
      expect(suggestion).toHaveProperty('arity');
      expect(suggestion).toHaveProperty('returnType');
    }
  });

  it('sin function has correct metadata', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestFunctions();
    const sinSuggestion = suggestions.find(s => s.label === 'sin(') as FunctionSuggestion;

    expect(sinSuggestion).toBeDefined();
    expect(sinSuggestion.arity).toBe(1);
    expect(sinSuggestion.returnType).toBe(FLOAT);
    expect(sinSuggestion.description).toContain('Sine');
  });

  it('all suggestions have sortOrder >= 100', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestFunctions();
    for (const suggestion of suggestions) {
      expect(suggestion.sortOrder).toBeGreaterThanOrEqual(100);
      expect(suggestion.sortOrder).toBeLessThan(200);
    }
  });
});

// =============================================================================
// SuggestionProvider - Block Suggestions
// =============================================================================

describe('SuggestionProvider.suggestBlocks', () => {
  it('returns empty array for empty patch', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestBlocks();
    expect(suggestions).toHaveLength(0);
  });

  it('returns block suggestions for patch with blocks', () => {
    const blocks = [
      createTestBlock('Circle1', 'Circle'),
      createTestBlock('Wave1', 'Wave'),
    ];
    const patch = createTestPatch(blocks);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestBlocks();
    expect(suggestions).toHaveLength(2);

    const labels = suggestions.map(s => s.label);
    expect(labels).toContain('Circle1');
    expect(labels).toContain('Wave1');
  });

  it('block suggestions have correct metadata', () => {
    const blocks = [createTestBlock('MyBlock', 'TestBlock')];
    const patch = createTestPatch(blocks);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestBlocks();
    const suggestion = suggestions[0] as BlockSuggestion;

    expect(suggestion.type).toBe('block');
    expect(suggestion.label).toBe('MyBlock');
    expect(suggestion.displayName).toBe('TestBlock');
    expect(suggestion.sortOrder).toBe(300);
  });

  it('sorts blocks by label alphabetically', () => {
    // Block IDs become the displayName by default in test fixture
    const blocks = [
      createTestBlock('Zebra', 'TestType'),
      createTestBlock('Apple', 'TestType'),
      createTestBlock('Mango', 'TestType'),
    ];
    const patch = createTestPatch(blocks);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestBlocks();
    const labels = suggestions.map(s => s.label);
    // Sorted alphabetically by label (displayName)
    expect(labels).toEqual(['Apple', 'Mango', 'Zebra']);
  });
});

// =============================================================================
// SuggestionProvider - Port Suggestions
// =============================================================================

describe('SuggestionProvider.suggestBlockPorts', () => {
  it('returns empty array for non-existent block', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestBlockPorts('NonExistent');
    expect(suggestions).toHaveLength(0);
  });

  it('returns empty array for block without definition in registry', () => {
    // Block exists in patch but not in BLOCK_DEFS_BY_TYPE
    const block = createTestBlock('MyBlock', 'UnknownBlockType');
    const patch = createTestPatch([block]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestBlockPorts('MyBlock');
    // Should return empty because block type is not in BLOCK_DEFS_BY_TYPE
    expect(suggestions).toHaveLength(0);
  });

  it('returns empty array for block without outputs in definition', () => {
    const block = {
      id: 'NoOutputs',
      type: 'TestBlock',
      params: {},
      displayName: null,
      domainId: null,
      role: 'normal' as const,
      inputPorts: new Map(),
      outputPorts: new Map(),
    };
    const patch = createTestPatch([block]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.suggestBlockPorts('NoOutputs');
    expect(suggestions).toHaveLength(0);
  });
});

// =============================================================================
// SuggestionProvider - Filter Suggestions
// =============================================================================

describe('SuggestionProvider.filterSuggestions', () => {
  it('empty prefix returns all suggestions sorted by sortOrder', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('');
    expect(suggestions.length).toBeGreaterThan(0);

    // Check sorted by sortOrder
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].sortOrder).toBeGreaterThanOrEqual(suggestions[i - 1].sortOrder);
    }
  });

  it('filters functions by exact prefix', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('sin');
    const labels = suggestions.map(s => s.label);

    expect(labels).toContain('sin(');
    expect(labels.length).toBeGreaterThan(0);
  });

  it('case-insensitive matching', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const lower = provider.filterSuggestions('sin');
    const upper = provider.filterSuggestions('SIN');
    const mixed = provider.filterSuggestions('SiN');

    expect(lower.map(s => s.label)).toEqual(upper.map(s => s.label));
    expect(lower.map(s => s.label)).toEqual(mixed.map(s => s.label));
  });

  it('substring matching works', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('oo');
    const labels = suggestions.map(s => s.label);

    // "floor(" and "smoothstep(" contain "oo"
    expect(labels).toContain('floor(');
    expect(labels).toContain('smoothstep(');
  });

  it('exact prefix ranks higher than substring', () => {
    const blocks = [
      createTestBlock('sin_block', 'SinBlock'),
      createTestBlock('asin_block', 'AsinBlock'),
    ];
    const patch = createTestPatch(blocks);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('sin');
    const labels = suggestions.map(s => s.label);

    // sin( should come before asin_block (exact prefix before substring)
    const sinIndex = labels.indexOf('sin(');
    const asinBlockIndex = labels.indexOf('asin_block');

    if (sinIndex !== -1 && asinBlockIndex !== -1) {
      expect(sinIndex).toBeLessThan(asinBlockIndex);
    }
  });

  it('type filter: function', () => {
    const blocks = [createTestBlock('sin_block', 'SinBlock')];
    const patch = createTestPatch(blocks);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('sin', 'function');
    const types = new Set(suggestions.map(s => s.type));

    expect(types.size).toBe(1);
    expect(types.has('function')).toBe(true);
  });

  it('type filter: block', () => {
    const blocks = [createTestBlock('Circle1', 'Circle')];
    const patch = createTestPatch(blocks);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('circ', 'block');
    const types = new Set(suggestions.map(s => s.type));

    expect(types.size).toBe(1);
    expect(types.has('block')).toBe(true);
  });

  it('type filter: port returns empty (needs block context)', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('out', 'port');
    expect(suggestions).toHaveLength(0);
  });

  it('no matches returns empty array', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    const suggestions = provider.filterSuggestions('xyzabc123');
    expect(suggestions).toHaveLength(0);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('SuggestionProvider - Edge Cases', () => {
  it('handles empty patch gracefully', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    expect(() => provider.suggestFunctions()).not.toThrow();
    expect(() => provider.suggestBlocks()).not.toThrow();
    expect(() => provider.filterSuggestions('')).not.toThrow();
  });

  it('handles special characters in filter prefix', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    expect(() => provider.filterSuggestions('(')).not.toThrow();
    expect(() => provider.filterSuggestions('*')).not.toThrow();
    expect(() => provider.filterSuggestions('$')).not.toThrow();
  });

  it('handles numeric prefixes', () => {
    const patch = createTestPatch([]);
    const registry = AddressRegistry.buildFromPatch(patch);
    const provider = new SuggestionProvider(patch, registry);

    // Numeric prefixes should not throw, even if no matches
    const suggestions = provider.filterSuggestions('0');
    expect(Array.isArray(suggestions)).toBe(true);
  });
});
