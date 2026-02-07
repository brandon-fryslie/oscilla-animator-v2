import { describe, it, expect, beforeEach, vi } from 'vitest';
import { compilationInspector } from './CompilationInspectorService';
import type { CompilationSnapshot, PassSnapshot } from './CompilationInspectorService';
import { buildPatch } from '../graph';
import { compile } from '../compiler/compile';
import { valueExprId } from '../compiler/ir/value-expr';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock IR structure with various data types.
 */
function createMockIR(options?: {
  includeCircular?: boolean;
  includeFunction?: boolean;
  includeMap?: boolean;
  includeSet?: boolean;
}): Record<string, unknown> {
  const ir: Record<string, unknown> = {
    blocks: [
      { id: 'b1', type: 'Oscillator', params: { frequency: 440 } },
      { id: 'b2', type: 'Gain', params: { gain: 0.5 } },
    ],
    edges: [{ from: 'b1', to: 'b2', port: 'input' }],
  };

  if (options?.includeCircular) {
    const circular: any = { ref: null };
    circular.ref = circular;
    ir.circular = circular;
  }

  if (options?.includeFunction) {
    ir.fn = () => console.log('test');
  }

  if (options?.includeMap) {
    const map = new Map();
    map.set('key1', 'value1');
    map.set('key2', { nested: 'value2' });
    ir.map = map;
  }

  if (options?.includeSet) {
    const set = new Set();
    set.add('item1');
    set.add('item2');
    ir.set = set;
  }

  return ir;
}

// =============================================================================
// Tests
// =============================================================================

describe('CompilationInspectorService', () => {
  beforeEach(() => {
    compilationInspector.clear();
  });

  describe('Basic lifecycle', () => {
    it('starts with no snapshots', () => {
      expect(compilationInspector.snapshots.length).toBe(0);
      expect(compilationInspector.getLatestSnapshot()).toBeUndefined();
    });

    it('creates snapshot on beginCompile()', () => {
      compilationInspector.beginCompile('compile-1');
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot?.compileId).toBe('compile-1');
      expect(snapshot?.status).toBe('success');
    });

    it('tracks compilation status (success)', () => {
      compilationInspector.beginCompile('compile-1');
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      expect(snapshot?.status).toBe('success');
    });

    it('tracks compilation status (failure)', () => {
      compilationInspector.beginCompile('compile-1');
      compilationInspector.endCompile('failure');

      const snapshot = compilationInspector.getLatestSnapshot();
      expect(snapshot?.status).toBe('failure');
    });

    it('calculates total duration', () => {
      const startTime = Date.now();
      compilationInspector.beginCompile('compile-1');

      // Simulate some work
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 100);

      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      expect(snapshot?.totalDurationMs).toBeGreaterThanOrEqual(0);

      vi.restoreAllMocks();
    });

    it('silently no-ops when capturePass called without beginCompile', () => {
      // Internally resilient — no crash, no warn
      expect(() => compilationInspector.capturePass('test-pass', {}, {})).not.toThrow();
    });

    it('silently no-ops when endCompile called without beginCompile', () => {
      // Idempotent — safe to call without beginCompile
      expect(() => compilationInspector.endCompile('success')).not.toThrow();
    });
  });

  describe('Pass capture', () => {
    it('captures all passes correctly', () => {
      const passes = [
        'normalization',
        'type-graph',
        'time',
        'depgraph',
        'scc',
        'block-lowering',
        'schedule',
      ];

      compilationInspector.beginCompile('compile-1');

      passes.forEach((passName, idx) => {
        const input = createMockIR();
        const output = { ...createMockIR(), passNumber: idx + 1 };
        compilationInspector.capturePass(passName, input, output);
      });

      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      expect(snapshot?.passes.length).toBe(7);

      snapshot?.passes.forEach((pass, idx) => {
        expect(pass.passNumber).toBe(idx + 1);
        expect(pass.passName).toBe(passes[idx]);
        expect(pass.input).toBeDefined();
        expect(pass.output).toBeDefined();
        expect(pass.timestamp).toBeGreaterThan(0);
        expect(pass.durationMs).toBeGreaterThanOrEqual(0);
        expect(pass.errors).toEqual([]);
        expect(pass.inputSize).toBeGreaterThan(0);
        expect(pass.outputSize).toBeGreaterThan(0);
      });
    });

    it('assigns sequential pass numbers', () => {
      compilationInspector.beginCompile('compile-1');

      for (let i = 0; i < 5; i++) {
        compilationInspector.capturePass(`pass-${i}`, {}, {});
      }

      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      snapshot?.passes.forEach((pass, idx) => {
        expect(pass.passNumber).toBe(idx + 1);
      });
    });

    it('calculates pass duration', () => {
      compilationInspector.beginCompile('compile-1');

      // Capture two passes
      compilationInspector.capturePass('pass-1', {}, {});
      compilationInspector.capturePass('pass-2', {}, {});

      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      expect(snapshot?.passes.length).toBe(2);

      // Both passes should have non-negative duration
      expect(snapshot?.passes[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(snapshot?.passes[1].durationMs).toBeGreaterThanOrEqual(0);
    });

    it('estimates input and output sizes', () => {
      compilationInspector.beginCompile('compile-1');

      const input = { small: 'data' };
      const output = { large: 'data'.repeat(100), nested: { deep: { value: 123 } } };

      compilationInspector.capturePass('test-pass', input, output);
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const pass = snapshot?.passes[0];
      expect(pass).toBeDefined();

      expect(pass!.inputSize).toBeGreaterThan(0);
      expect(pass!.outputSize).toBeGreaterThan(0);
      expect(pass!.outputSize).toBeGreaterThan(pass!.inputSize);
    });
  });

  describe('Circular reference handling', () => {
    it('handles circular references without crashing', () => {
      const circular: any = { a: 1, b: { c: 2 } };
      circular.self = circular;
      circular.b.parent = circular;

      compilationInspector.beginCompile('compile-1');

      expect(() => {
        compilationInspector.capturePass('test', {}, circular);
      }).not.toThrow();

      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.a).toBe(1);
      expect(output.b.c).toBe(2);
      expect(output.self).toBe('[Circular]');
      expect(output.b.parent).toBe('[Circular]');
    });

    it('handles deeply nested circular references', () => {
      const obj: any = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };
      obj.level1.level2.level3.root = obj;

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, obj);
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.level1.level2.level3.value).toBe('deep');
      expect(output.level1.level2.level3.root).toBe('[Circular]');
    });

    it('handles multiple circular references in same structure', () => {
      const a: any = { name: 'a' };
      const b: any = { name: 'b' };
      const c: any = { name: 'c' };

      a.next = b;
      b.next = c;
      c.next = a; // Cycle
      a.prev = c; // Another reference to same cycle

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, { root: a });
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.root.name).toBe('a');
      expect(output.root.next.name).toBe('b');
      expect(output.root.next.next.name).toBe('c');
      expect(output.root.next.next.next).toBe('[Circular]');
    });
  });

  describe('Function serialization', () => {
    it('serializes functions as [Function]', () => {
      const input = {
        regularFn: function namedFn() {
          return 42;
        },
        arrowFn: () => 'test',
        method() {
          return 'method';
        },
      };

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, input);
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.regularFn).toBe('[Function]');
      expect(output.arrowFn).toBe('[Function]');
      expect(output.method).toBe('[Function]');
    });

    it('handles functions in nested objects', () => {
      const input = {
        nested: {
          deep: {
            fn: () => 'test',
            value: 123,
          },
        },
      };

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, input);
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.nested.deep.fn).toBe('[Function]');
      expect(output.nested.deep.value).toBe(123);
    });
  });

  describe('Map serialization', () => {
    it('serializes Map to object with __type', () => {
      const map = new Map();
      map.set('key1', 'value1');
      map.set('key2', { nested: 'value2' });

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, { map });
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.map.__type).toBe('Map');
      expect(output.map.entries.key1).toBe('value1');
      expect(output.map.entries.key2.nested).toBe('value2');
    });

    it('handles nested Maps', () => {
      const innerMap = new Map();
      innerMap.set('inner', 'value');

      const outerMap = new Map();
      outerMap.set('nested', innerMap);
      outerMap.set('simple', 'data');

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, { map: outerMap });
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.map.__type).toBe('Map');
      expect(output.map.entries.simple).toBe('data');
      expect(output.map.entries.nested.__type).toBe('Map');
      expect(output.map.entries.nested.entries.inner).toBe('value');
    });
  });

  describe('Set serialization', () => {
    it('serializes Set to object with __type', () => {
      const set = new Set();
      set.add('item1');
      set.add('item2');
      set.add({ key: 'value' });

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, { set });
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.set.__type).toBe('Set');
      expect(output.set.values).toContain('item1');
      expect(output.set.values).toContain('item2');
      expect(output.set.values.find((v: any) => v.key === 'value')).toBeDefined();
    });

    it('handles nested Sets', () => {
      const innerSet = new Set(['a', 'b']);
      const outerSet = new Set(['x', innerSet, 'y']);

      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, { set: outerSet });
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const output = snapshot?.passes[0].output as any;

      expect(output.set.__type).toBe('Set');
      expect(output.set.values).toContain('x');
      expect(output.set.values).toContain('y');

      const nestedSet = output.set.values.find((v: any) => v.__type === 'Set');
      expect(nestedSet).toBeDefined();
      expect(nestedSet.values).toContain('a');
      expect(nestedSet.values).toContain('b');
    });
  });

  describe('Snapshot limit (2 snapshots max)', () => {
    it('limits to 2 snapshots', () => {
      // First compilation
      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('pass-1', {}, { id: 1 });
      compilationInspector.endCompile('success');

      expect(compilationInspector.snapshots.length).toBe(1);
      expect(compilationInspector.snapshots[0].compileId).toBe('compile-1');

      // Second compilation
      compilationInspector.beginCompile('compile-2');
      compilationInspector.capturePass('pass-1', {}, { id: 2 });
      compilationInspector.endCompile('success');

      expect(compilationInspector.snapshots.length).toBe(2);
      expect(compilationInspector.snapshots[0].compileId).toBe('compile-1');
      expect(compilationInspector.snapshots[1].compileId).toBe('compile-2');

      // Third compilation - should drop oldest
      compilationInspector.beginCompile('compile-3');
      compilationInspector.capturePass('pass-1', {}, { id: 3 });
      compilationInspector.endCompile('success');

      expect(compilationInspector.snapshots.length).toBe(2);
      expect(compilationInspector.snapshots[0].compileId).toBe('compile-2');
      expect(compilationInspector.snapshots[1].compileId).toBe('compile-3');

      // Fourth compilation - should drop compile-2
      compilationInspector.beginCompile('compile-4');
      compilationInspector.capturePass('pass-1', {}, { id: 4 });
      compilationInspector.endCompile('success');

      expect(compilationInspector.snapshots.length).toBe(2);
      expect(compilationInspector.snapshots[0].compileId).toBe('compile-3');
      expect(compilationInspector.snapshots[1].compileId).toBe('compile-4');
    });

    it('getLatestSnapshot returns most recent', () => {
      compilationInspector.beginCompile('compile-1');
      compilationInspector.endCompile('success');

      expect(compilationInspector.getLatestSnapshot()?.compileId).toBe('compile-1');

      compilationInspector.beginCompile('compile-2');
      compilationInspector.endCompile('success');

      expect(compilationInspector.getLatestSnapshot()?.compileId).toBe('compile-2');

      compilationInspector.beginCompile('compile-3');
      compilationInspector.endCompile('success');

      expect(compilationInspector.getLatestSnapshot()?.compileId).toBe('compile-3');
    });
  });

  describe('Search functionality', () => {
    beforeEach(() => {
      // Create a compilation with searchable data
      compilationInspector.beginCompile('search-test');

      compilationInspector.capturePass('normalization', {}, {
        blocks: [
          { id: 'oscillator-1', type: 'Oscillator', frequency: 440 },
          { id: 'gain-1', type: 'Gain', value: 0.5 },
        ],
        edges: [],
      });

      compilationInspector.capturePass('type-graph', {}, {
        blocks: [
          { id: 'oscillator-1', type: 'Oscillator', outputType: 'signal' },
          { id: 'gain-1', type: 'Gain', outputType: 'signal' },
        ],
        types: { oscillator: 'signal', gain: 'signal' },
      });

      compilationInspector.endCompile('success');
    });

    it('returns empty array when no snapshot exists', () => {
      compilationInspector.clear();
      const results = compilationInspector.search('test');
      expect(results).toEqual([]);
    });

    it('finds matches in string values (case-insensitive)', () => {
      const results = compilationInspector.search('oscillator');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.value === 'Oscillator')).toBe(true);
    });

    it('finds matches in object keys (case-insensitive)', () => {
      const results = compilationInspector.search('frequency');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.key === 'frequency')).toBe(true);
    });

    it('searches across all passes', () => {
      const results = compilationInspector.search('signal');

      const passNames = new Set(results.map((r) => r.passName));
      expect(passNames.has('type-graph')).toBe(true);
    });

    it('includes JSON path in results', () => {
      const results = compilationInspector.search('oscillator-1');

      expect(results.length).toBeGreaterThan(0);
      const result = results.find((r) => r.value === 'oscillator-1');
      expect(result?.path).toBeDefined();
      expect(result?.path.length).toBeGreaterThan(0);
    });

    it('handles searches with no matches', () => {
      const results = compilationInspector.search('nonexistent-query-xyz');
      expect(results).toEqual([]);
    });

    it('handles partial matches', () => {
      const results = compilationInspector.search('oscil');
      expect(results.length).toBeGreaterThan(0);
    });

    it('searches in nested structures', () => {
      compilationInspector.clear();
      compilationInspector.beginCompile('nested-test');

      compilationInspector.capturePass('test', {}, {
        deep: {
          nested: {
            value: 'target-value',
            other: 'data',
          },
        },
      });

      compilationInspector.endCompile('success');

      const results = compilationInspector.search('target-value');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toContain('deep');
      expect(results[0].path).toContain('nested');
    });

    it('searches in arrays', () => {
      compilationInspector.clear();
      compilationInspector.beginCompile('array-test');

      compilationInspector.capturePass('test', {}, {
        items: ['first', 'second', 'target-item', 'fourth'],
      });

      compilationInspector.endCompile('success');

      const results = compilationInspector.search('target-item');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].value).toBe('target-item');
    });
  });

  describe('getPassSnapshot', () => {
    beforeEach(() => {
      compilationInspector.beginCompile('test-compile');
      compilationInspector.capturePass('normalization', { input: 1 }, { output: 1 });
      compilationInspector.capturePass('type-graph', { input: 2 }, { output: 2 });
      compilationInspector.endCompile('success');
    });

    it('retrieves specific pass by compile ID and pass name', () => {
      const pass = compilationInspector.getPassSnapshot('test-compile', 'normalization');

      expect(pass).toBeDefined();
      expect(pass?.passName).toBe('normalization');
      expect(pass?.passNumber).toBe(1);
    });

    it('returns undefined for non-existent compile ID', () => {
      const pass = compilationInspector.getPassSnapshot('wrong-id', 'normalization');
      expect(pass).toBeUndefined();
    });

    it('returns undefined for non-existent pass name', () => {
      const pass = compilationInspector.getPassSnapshot('test-compile', 'nonexistent');
      expect(pass).toBeUndefined();
    });

    it('retrieves different passes from same compilation', () => {
      const norm = compilationInspector.getPassSnapshot('test-compile', 'normalization');
      const typeGraph = compilationInspector.getPassSnapshot('test-compile', 'type-graph');

      expect(norm?.passName).toBe('normalization');
      expect(typeGraph?.passName).toBe('type-graph');
      expect(norm?.passNumber).toBe(1);
      expect(typeGraph?.passNumber).toBe(2);
    });
  });

  describe('clear()', () => {
    it('removes all snapshots', () => {
      compilationInspector.beginCompile('compile-1');
      compilationInspector.capturePass('test', {}, {});
      compilationInspector.endCompile('success');

      expect(compilationInspector.snapshots.length).toBe(1);

      compilationInspector.clear();

      expect(compilationInspector.snapshots.length).toBe(0);
      expect(compilationInspector.getLatestSnapshot()).toBeUndefined();
    });

    it('resets current snapshot state', () => {
      compilationInspector.beginCompile('compile-1');
      compilationInspector.clear();

      // endCompile after clear is idempotent — no crash, no snapshot added
      expect(() => compilationInspector.endCompile('success')).not.toThrow();
      expect(compilationInspector.snapshots.length).toBe(0);
    });

    it('allows starting new compilation after clear', () => {
      compilationInspector.beginCompile('compile-1');
      compilationInspector.endCompile('success');
      compilationInspector.clear();

      compilationInspector.beginCompile('compile-2');
      compilationInspector.capturePass('test', {}, {});
      compilationInspector.endCompile('success');

      expect(compilationInspector.snapshots.length).toBe(1);
      expect(compilationInspector.snapshots[0].compileId).toBe('compile-2');
    });
  });

  describe('Error handling', () => {
    it('handles serialization errors gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create an object that will throw during serialization
      const problematic = {};
      Object.defineProperty(problematic, 'getter', {
        get() {
          throw new Error('Serialization error');
        },
        enumerable: true,
      });

      compilationInspector.beginCompile('error-test');

      expect(() => {
        compilationInspector.capturePass('test', {}, problematic);
      }).not.toThrow();

      compilationInspector.endCompile('success');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CompilationInspector] Failed to capture pass:'),
        'test',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('continues capturing subsequent passes after error', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const problematic = {};
      Object.defineProperty(problematic, 'bad', {
        get() {
          throw new Error('Error');
        },
        enumerable: true,
      });

      compilationInspector.beginCompile('error-test');

      // First pass fails
      compilationInspector.capturePass('pass-1', {}, problematic);

      // Second pass succeeds
      compilationInspector.capturePass('pass-2', {}, { good: 'data' });

      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();

      // Only the successful pass should be captured
      expect(snapshot?.passes.length).toBe(1);
      expect(snapshot?.passes[0].passName).toBe('pass-2');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Empty compilation handling', () => {
    it('handles compilation with no passes', () => {
      compilationInspector.beginCompile('empty-compile');
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot?.passes.length).toBe(0);
      expect(snapshot?.status).toBe('success');
    });

    it('handles empty input/output', () => {
      compilationInspector.beginCompile('empty-io');
      compilationInspector.capturePass('test', {}, {});
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const pass = snapshot?.passes[0];

      expect(pass).toBeDefined();
      expect(pass?.input).toEqual({});
      expect(pass?.output).toEqual({});
    });

    it('handles null and undefined values', () => {
      compilationInspector.beginCompile('null-test');
      compilationInspector.capturePass('test', null, undefined);
      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();
      const pass = snapshot?.passes[0];

      expect(pass?.input).toBeNull();
      expect(pass?.output).toBeUndefined();
    });
  });

  describe('Realistic compiler integration', () => {
    it('simulates full 7-pass compilation', () => {
      const passNames = [
        'normalization',
        'type-graph',
        'time',
        'depgraph',
        'scc',
        'block-lowering',
        'schedule',
      ];

      compilationInspector.beginCompile('full-compile');

      let ir: any = { blocks: [], edges: [] };
      passNames.forEach((passName, idx) => {
        const input = { ...ir };
        ir = { ...ir, [passName]: `pass-${idx + 1}-output` };
        compilationInspector.capturePass(passName, input, ir);
      });

      compilationInspector.endCompile('success');

      const snapshot = compilationInspector.getLatestSnapshot();

      expect(snapshot?.passes.length).toBe(7);
      expect(snapshot?.status).toBe('success');

      // Verify each pass
      passNames.forEach((name, idx) => {
        const pass = snapshot?.passes[idx];
        expect(pass?.passName).toBe(name);
        expect(pass?.passNumber).toBe(idx + 1);
      });
    });

    it('simulates compilation failure', () => {
      compilationInspector.beginCompile('failed-compile');
      compilationInspector.capturePass('normalization', {}, { blocks: [] });
      compilationInspector.endCompile('failure');

      const snapshot = compilationInspector.getLatestSnapshot();

      expect(snapshot?.status).toBe('failure');
      expect(snapshot?.passes.length).toBe(1);
    });
  });

  describe('MobX observability', () => {
    it('service is made observable via makeAutoObservable', () => {
      // This test verifies the service is initialized correctly
      // MobX observability is set up in constructor
      expect(compilationInspector.snapshots).toBeDefined();
      expect(Array.isArray(compilationInspector.snapshots)).toBe(true);
    });

    it('snapshots array is observable (modifications trigger updates)', () => {
      const initialLength = compilationInspector.snapshots.length;

      compilationInspector.beginCompile('observable-test');
      compilationInspector.endCompile('success');

      expect(compilationInspector.snapshots.length).toBe(initialLength + 1);
    });
  });

  // =============================================================================
  // ValueExpr Query API Tests (ValueExpr dispatch migration)
  // =============================================================================

  describe('ValueExpr Query API', () => {
    beforeEach(() => {
      compilationInspector.clear();
    });

    describe('with real compilation', () => {
      it('extracts ValueExprTable from successful compilation', () => {
        const patch = buildPatch((b) => {
          b.addBlock('InfiniteTimeRoot');
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');

        const table = compilationInspector.getValueExprTable();
        expect(table).toBeDefined();
        expect(table?.nodes).toBeDefined();
        expect(Array.isArray(table?.nodes)).toBe(true);
      });

      it('returns undefined when no compilation exists', () => {
        const table = compilationInspector.getValueExprTable();
        expect(table).toBeUndefined();
      });

      it('dispatches on ValueExpr.kind', () => {
        const patch = buildPatch((b) => {
          const time = b.addBlock('InfiniteTimeRoot');
          const osc = b.addBlock('Oscillator');
          b.setPortDefault(osc, 'mode', 0);
          b.wire(time, 'phaseA', osc, 'phase');
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');

        // Get time kind expressions
        const timeExprs = compilationInspector.getValueExprsByKind('time');
        expect(timeExprs.length).toBeGreaterThan(0);
        expect(timeExprs.every((expr) => expr.kind === 'time')).toBe(true);
      });

      it('gets ValueExpr by ID', () => {
        const patch = buildPatch((b) => {
          b.addBlock('InfiniteTimeRoot');
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');

        const table = compilationInspector.getValueExprTable();
        if (!table || table.nodes.length === 0) {
          throw new Error('Expected non-empty ValueExprTable');
        }

        const id = valueExprId(0);
        const expr = compilationInspector.getValueExpr(id);
        expect(expr).toBeDefined();
        expect(expr).toBe(table.nodes[0]);
      });

      it('returns undefined for out-of-bounds ID', () => {
        const patch = buildPatch((b) => {
          b.addBlock('InfiniteTimeRoot');
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');

        const invalidId = valueExprId(9999);
        const expr = compilationInspector.getValueExpr(invalidId);
        expect(expr).toBeUndefined();
      });

      it('computes statistics with dispatch on ValueExpr.kind and CanonicalType', () => {
        const patch = buildPatch((b) => {
          const time = b.addBlock('InfiniteTimeRoot');
          const osc = b.addBlock('Oscillator');
          b.setPortDefault(osc, 'mode', 0);
          b.wire(time, 'phaseA', osc, 'phase');
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');

        const stats = compilationInspector.getValueExprStats();
        expect(stats.total).toBeGreaterThan(0);
        expect(stats.byKind).toBeDefined();
        expect(stats.byDerivedKind).toBeDefined();
        expect(stats.byPayload).toBeDefined();

        // Verify every ValueExpr has a type (invariant test)
        const table = compilationInspector.getValueExprTable();
        expect(table).toBeDefined();
        if (table) {
          for (const expr of table.nodes) {
            expect(expr.type).toBeDefined();
            expect(expr.type.payload).toBeDefined();
            expect(expr.type.unit).toBeDefined();
            expect(expr.type.extent).toBeDefined();
          }
        }
      });

      it('derives signal/field/event/const from CanonicalType axes', () => {
        const patch = buildPatch((b) => {
          b.addBlock('InfiniteTimeRoot');
          const array = b.addBlock('Array');
          b.setPortDefault(array, 'count', 10);
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');

        const stats = compilationInspector.getValueExprStats();

        // Should have signal (cardinality one, continuous)
        expect(stats.byDerivedKind.signal).toBeGreaterThan(0);

        // May have field expressions (cardinality many, continuous)
        // May have const expressions (cardinality zero)
      });

      it('invariant: every ValueExpr has CanonicalType', () => {
        const patch = buildPatch((b) => {
          const time = b.addBlock('InfiniteTimeRoot');
          const osc = b.addBlock('Oscillator');
          b.setPortDefault(osc, 'mode', 0);
          b.wire(time, 'phaseA', osc, 'phase');
        });

        const result = compile(patch);
        expect(result.kind).toBe('ok');

        const table = compilationInspector.getValueExprTable();
        expect(table).toBeDefined();

        if (table) {
          for (const expr of table.nodes) {
            // Every ValueExpr MUST have a type field
            expect(expr).toHaveProperty('type');
            const type = expr.type;

            // CanonicalType has payload, unit, extent
            expect(type).toHaveProperty('payload');
            expect(type).toHaveProperty('unit');
            expect(type).toHaveProperty('extent');

            // Extent has all 5 axes
            expect(type.extent).toHaveProperty('cardinality');
            expect(type.extent).toHaveProperty('temporality');
            expect(type.extent).toHaveProperty('perspective');
            expect(type.extent).toHaveProperty('branch');
            expect(type.extent).toHaveProperty('binding');
          }
        }
      });
    });

    describe('without compilation', () => {
      it('returns empty stats when no compilation', () => {
        const stats = compilationInspector.getValueExprStats();
        expect(stats.total).toBe(0);
        expect(stats.byKind).toEqual({});
        expect(stats.byDerivedKind).toEqual({});
        expect(stats.byPayload).toEqual({});
      });

      it('returns empty array when querying by kind', () => {
        const exprs = compilationInspector.getValueExprsByKind('time');
        expect(exprs).toEqual([]);
      });

      it('returns undefined when getting by ID', () => {
        const expr = compilationInspector.getValueExpr(valueExprId(0));
        expect(expr).toBeUndefined();
      });
    });
  });
});
