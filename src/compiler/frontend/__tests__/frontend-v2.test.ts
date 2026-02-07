/**
 * Tests for the V2 fixpoint frontend pipeline.
 *
 * Tests:
 * 1. Parity: V2 produces identical portTypes to V1 for signal-only patches
 * 2. Fallback: V2 falls back to V1 when fixpoint can't fully resolve
 * 3. Edge cases: empty graph, result shape
 */
import { describe, it, expect } from 'vitest';
import { compileFrontend, type FrontendCompileResult } from '../index';
import { buildPatch } from '../../../graph/Patch';
import type { CanonicalType } from '../../../core/canonical-types';

// =============================================================================
// Helpers
// =============================================================================

function compileV1(patch: import('../../../graph/Patch').Patch): FrontendCompileResult {
  return compileFrontend(patch, { useFixpointFrontend: false });
}

function compileV2(patch: import('../../../graph/Patch').Patch): FrontendCompileResult {
  return compileFrontend(patch, { useFixpointFrontend: true });
}

/**
 * Compare portTypes from two FrontendCompileResults.
 * Returns true if both have the same PortKey→CanonicalType entries (deep equal).
 */
function portTypesMatch(
  r1: FrontendCompileResult,
  r2: FrontendCompileResult,
): { match: boolean; details?: string } {
  if (r1.kind !== 'ok' || r2.kind !== 'ok') {
    return {
      match: r1.kind === r2.kind,
      details: `Result kinds differ: ${r1.kind} vs ${r2.kind}`,
    };
  }

  const types1 = r1.result.typedPatch.portTypes;
  const types2 = r2.result.typedPatch.portTypes;

  if (types1.size !== types2.size) {
    return {
      match: false,
      details: `portTypes size mismatch: ${types1.size} vs ${types2.size}`,
    };
  }

  for (const [key, type1] of types1) {
    const type2 = types2.get(key);
    if (!type2) {
      return { match: false, details: `Missing key in V2: ${key}` };
    }
    if (!canonicalTypesEqual(type1, type2)) {
      return {
        match: false,
        details: `Type mismatch at ${key}: ${JSON.stringify(type1)} vs ${JSON.stringify(type2)}`,
      };
    }
  }

  return { match: true };
}

function canonicalTypesEqual(a: CanonicalType, b: CanonicalType): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// =============================================================================
// Test: V2 default behavior (flag off → V1)
// =============================================================================

describe('compileFrontend gate', () => {
  it('default (no flag) uses V1 path', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const r1 = compileFrontend(patch);
    const r2 = compileFrontend(patch, { useFixpointFrontend: false });

    // Both should be identical (same V1 path)
    expect(r1.kind).toBe(r2.kind);
    if (r1.kind === 'ok' && r2.kind === 'ok') {
      expect(portTypesMatch(r1, r2).match).toBe(true);
    }
  });
});

// =============================================================================
// Test: V2 parity with V1 for signal-only patches
// =============================================================================

describe('V2 parity with V1', () => {
  it('Const → Add (fully connected): portTypes match', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const v1 = compileV1(patch);
    const v2 = compileV2(patch);

    // Both should succeed
    expect(v1.kind).toBe('ok');
    expect(v2.kind).toBe('ok');

    if (v1.kind === 'ok' && v2.kind === 'ok') {
      const { match, details } = portTypesMatch(v1, v2);
      expect(match, details).toBe(true);
    }
  });

  it('Const → Multiply chain: portTypes match', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const mul = b.addBlock('Multiply');
      b.wire(c1, 'out', mul, 'a');
      b.wire(c2, 'out', mul, 'b');
    });

    const v1 = compileV1(patch);
    const v2 = compileV2(patch);

    // Both should succeed
    expect(v1.kind).toBe('ok');
    expect(v2.kind).toBe('ok');

    if (v1.kind === 'ok' && v2.kind === 'ok') {
      const { match, details } = portTypesMatch(v1, v2);
      expect(match, details).toBe(true);
    }
  });
});

// =============================================================================
// Test: V2 fallback to V1
// =============================================================================

describe('V2 fallback to V1', () => {
  it('V2 does not crash on graphs with type mismatches', () => {
    // Ellipse with default int→float mismatches should not throw in V2.
    // V2 may return 'error' where V1 returns 'ok' (stricter type checking),
    // but neither should crash.
    const patch = buildPatch((b) => {
      const ellipse = b.addBlock('Ellipse');
      b.setPortDefault(ellipse, 'rx', 0.04);
      b.setPortDefault(ellipse, 'ry', 0.04);

      const array = b.addBlock('Array');
      b.setPortDefault(array, 'count', 4);
      b.wire(ellipse, 'shape', array, 'element');
    });

    // Neither should throw — both should return a result (ok or error)
    const v1 = compileV1(patch);
    const v2 = compileV2(patch);

    expect(['ok', 'error']).toContain(v1.kind);
    expect(['ok', 'error']).toContain(v2.kind);
  });

  it('standalone polymorphic block falls back to V1', () => {
    // A standalone Const has unresolved polymorphic types → V2 falls back to V1.
    const patch = buildPatch((b) => {
      b.addBlock('Const');
    });

    const v1 = compileV1(patch);
    const v2 = compileV2(patch);

    // Both should have the same result kind (both may fail for unresolved types)
    expect(v2.kind).toBe(v1.kind);
  });
});

// =============================================================================
// Test: V2 edge cases
// =============================================================================

describe('V2 edge cases', () => {
  it('empty patch compiles successfully with V2', () => {
    const patch = buildPatch(() => {});

    const result = compileV2(patch);
    expect(result.kind).toBe('ok');

    if (result.kind === 'ok') {
      expect(result.result.typedPatch.portTypes.size).toBe(0);
      expect(result.result.errors).toHaveLength(0);
      expect(result.result.backendReady).toBe(true);
    }
  });

  it('V2 result shape matches FrontendResult interface', () => {
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const result = compileV2(patch);

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

  it('V2 flag does not affect V1 behavior', () => {
    // Compile same patch with and without V2 flag — flag=false should be identical to no flag
    const patch = buildPatch((b) => {
      const c1 = b.addBlock('Const');
      const c2 = b.addBlock('Const');
      const add = b.addBlock('Add');
      b.wire(c1, 'out', add, 'a');
      b.wire(c2, 'out', add, 'b');
    });

    const noFlag = compileFrontend(patch);
    const flagFalse = compileFrontend(patch, { useFixpointFrontend: false });

    expect(noFlag.kind).toBe(flagFalse.kind);
    if (noFlag.kind === 'ok' && flagFalse.kind === 'ok') {
      expect(portTypesMatch(noFlag, flagFalse).match).toBe(true);
    }
  });
});
