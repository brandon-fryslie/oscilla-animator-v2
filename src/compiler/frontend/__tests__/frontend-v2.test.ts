/**
 * Tests for the fixpoint frontend pipeline.
 *
 * Tests:
 * 1. Basic compilation: signal-only patches compile successfully
 * 2. Edge cases: empty graph, result shape
 */
import { describe, it, expect } from 'vitest';
import { compileFrontend, type FrontendResult } from '../index';
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
    expect(result.backendReady).toBe(true);
    expect(result.typedPatch.portTypes.size).toBeGreaterThan(0);
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
    expect(result.backendReady).toBe(true);
    expect(result.typedPatch.portTypes.size).toBeGreaterThan(0);
  });
});

// =============================================================================
// Test: Edge cases
// =============================================================================

describe('Frontend edge cases', () => {
  it('empty patch compiles successfully', () => {
    const patch = buildPatch(() => {});

    const result = compileFrontend(patch);
    expect(result.backendReady).toBe(true);
    expect(result.typedPatch.portTypes.size).toBe(0);
    expect(result.errors).toHaveLength(0);
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

    // Verify all required fields exist
    expect(result.typedPatch).toBeDefined();
    expect(result.cycleSummary).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(typeof result.backendReady).toBe('boolean');
    expect(result.normalizedPatch).toBeDefined();
    expect(result.normalizedPatch.blocks).toBeDefined();
    expect(result.normalizedPatch.edges).toBeDefined();
    expect(result.normalizedPatch.blockIndex).toBeDefined();
    expect(result.normalizedPatch.patch).toBeDefined();
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

    // Should not throw — always returns FrontendResult
    const result = compileFrontend(patch);
    expect(result.typedPatch).toBeDefined();
    expect(result.cycleSummary).toBeDefined();
  });

  it('FrontendOptions no longer has useFixpointFrontend', () => {
    const patch = buildPatch(() => {});

    // compileFrontend should accept options without useFixpointFrontend
    const result = compileFrontend(patch, { traceCardinalitySolver: false });
    expect(result.backendReady).toBe(true);
  });
});
