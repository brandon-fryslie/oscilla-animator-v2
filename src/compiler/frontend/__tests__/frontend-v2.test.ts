/**
 * Tests for the fixpoint frontend pipeline.
 *
 * Tests:
 * 1. Basic compilation: signal-only patches compile successfully
 * 2. Edge cases: empty graph, result shape
 */
import { describe, it, expect } from 'vitest';
import { compileFrontend, type FrontendCompileResult } from '../index';
import { buildPatch } from '../../../graph/Patch';

// =============================================================================
// Test: Basic compilation
// =============================================================================

describe('compileFrontend', () => {
  it('Const → Add compiles successfully', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');

    if (result.kind === 'ok') {
      expect(result.result.typedPatch.portTypes.size).toBeGreaterThan(0);
      expect(result.result.backendReady).toBe(true);
    }
  });

  it('Const → Multiply chain compiles successfully', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const mul = b.addBlock('Multiply');
      b.wire(c1, 'out', mul, 'a');
      b.wire(c2, 'out', mul, 'b');
    });

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');

    if (result.kind === 'ok') {
      expect(result.result.typedPatch.portTypes.size).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Test: Edge cases
// =============================================================================

describe('Frontend edge cases', () => {
  it('empty patch compiles successfully', () => {
    const patch = buildPatch(() => {});

    const result = compileFrontend(patch);
    expect(result.kind).toBe('ok');

    if (result.kind === 'ok') {
      expect(result.result.typedPatch.portTypes.size).toBe(0);
      expect(result.result.errors).toHaveLength(0);
      expect(result.result.backendReady).toBe(true);
    }
  });

  it('result shape matches FrontendResult interface', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const result = compileFrontend(patch);

    if (result.kind === 'ok') {
      // Verify all required fields exist
      expect(result.result.typedPatch).toBeDefined();
      expect(result.result.cycleSummary).toBeDefined();
      expect(result.result.errors).toBeDefined();
      expect(typeof result.result.backendReady).toBe('boolean');
      expect(result.result.normalizedPatch).toBeDefined();
      expect(result.result.normalizedPatch.blocks).toBeDefined();
      expect(result.result.normalizedPatch.edges).toBeDefined();
      expect(result.result.normalizedPatch.blockIndex).toBeDefined();
      expect(result.result.normalizedPatch.patch).toBeDefined();
    }
  });

  it('does not crash on graphs with type mismatches', () => {
    const patch = buildPatch((b) => {
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.04);
      b.setPortDefault(ellipse, 'ry', 0.04);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');
    });

    // Should not throw — returns a result (ok or error)
    const result = compileFrontend(patch);
    expect(['ok', 'error']).toContain(result.kind);
  });

  it('FrontendOptions no longer has useFixpointFrontend', () => {
    const patch = buildPatch(() => {});

    // compileFrontend should accept options without useFixpointFrontend
    const result = compileFrontend(patch, { traceCardinalitySolver: false });
    expect(result.kind).toBe('ok');
  });
});
