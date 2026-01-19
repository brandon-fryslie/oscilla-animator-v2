/**
 * Connection Validation Tests
 *
 * Tests BEHAVIOR: What connections are allowed vs blocked by the React Flow editor.
 * Does NOT test implementation details (validateConnection internals, etc).
 *
 * These tests verify the user-visible behavior: Can I connect block A to block B?
 */

import { describe, it, expect } from 'vitest';
import { buildPatch } from '../../../graph/Patch';
import { validateConnection } from '../typeValidation';
import type { Patch } from '../../../graph/Patch';

// Import block definitions to register them
// These modules self-register when loaded
import '../../../blocks/signal-blocks';
import '../../../blocks/math-blocks';
import '../../../blocks/color-blocks';
import '../../../blocks/field-operations-blocks';
import '../../../blocks/array-blocks';

describe('Connection Validation - Behavioral Tests', () => {
  describe('Compatible connections should be ALLOWED', () => {
    it('allows Signal<float> → Signal<float>', () => {
      const { patch, ids } = createTestPatch();

      // Test behavior: Can we connect oscillator output to add input?
      const result = validateConnection(ids.osc, 'out', ids.add, 'a', patch);

      expect(result.valid).toBe(true);
    });

    it('allows connecting to same type with different blocks', () => {
      const { patch, ids } = createTestPatch();

      // Two math blocks with matching types
      const result = validateConnection(ids.add, 'out', ids.multiply, 'a', patch);

      expect(result.valid).toBe(true);
    });

    it('allows polymorphic ??? type to connect to concrete types', () => {
      const { patch, ids } = createTestPatch();

      // Const outputs polymorphic type, should connect to float input
      const result = validateConnection(ids.const, 'out', ids.add, 'a', patch);

      expect(result.valid).toBe(true);
    });
  });

  describe('Type mismatches should be BLOCKED', () => {
    it('blocks float → color (payload mismatch)', () => {
      const { patch, ids } = createTestPatch();

      // Oscillator outputs float, HSVToColor expects color
      const result = validateConnection(ids.osc, 'out', ids.hsv, 'h', patch);

      expect(result.valid).toBe(false);
      // Note: We just verify it's blocked, not the exact error message
      expect(result.reason).toBeDefined();
    });

    it('blocks Signal → Field (cardinality mismatch)', () => {
      const { patch, ids } = createTestPatch();

      // Const outputs Signal, FieldAdd expects Field
      const result = validateConnection(ids.const, 'out', ids.fieldAdd, 'a', patch);

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/Type mismatch|cardinality/i);
    });

    it('blocks Field → Signal (cardinality mismatch)', () => {
      const { patch, ids } = createTestPatch();

      // FieldAdd outputs Field, Add expects Signal
      const result = validateConnection(ids.fieldAdd, 'out', ids.add, 'a', patch);

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/Type mismatch|cardinality/i);
    });
  });

  describe('Self-connections behavior', () => {
    it('currently allows connecting a block output to its own input', () => {
      const { patch, ids } = createTestPatch();

      // Try to connect add's output back to its own input
      const result = validateConnection(ids.add, 'out', ids.add, 'a', patch);

      // NOTE: Self-connections are currently ALLOWED by type validation.
      // This is actually correct behavior - the type system only checks type compatibility.
      // Self-connection prevention (if needed) should be a separate concern.
      // A block like UnitDelay might legitimately need self-connection.
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid blocks/ports should be BLOCKED', () => {
    it('blocks connection to non-existent block', () => {
      const { patch, ids } = createTestPatch();

      const result = validateConnection(ids.osc, 'out', 'nonexistent', 'in', patch);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('blocks connection from non-existent port', () => {
      const { patch, ids } = createTestPatch();

      const result = validateConnection(ids.osc, 'nonexistent', ids.add, 'a', patch);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });

    it('blocks connection to non-existent port', () => {
      const { patch, ids } = createTestPatch();

      const result = validateConnection(ids.osc, 'out', ids.add, 'nonexistent', patch);

      expect(result.valid).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('Field instance matching', () => {
    it('validates Field<float> → Field<float> connections based on instance', () => {
      const { patch, ids } = createPatchWithFieldInstances();

      // Both field blocks use the same Array instance
      // FieldAdd has inputs 'a' and 'b', not 'in'
      const result = validateConnection(ids.fieldA, 'out', ids.fieldB, 'a', patch);

      // Note: Instance matching happens at compile time, not at connection validation time.
      // At the UI level, we only validate basic type compatibility (Field vs Signal, payload type).
      // Instance IDs are resolved during compilation, not during UI connection validation.
      // So this connection should be allowed at the UI level.
      expect(result.valid).toBe(true);
    });

    it('allows Field<float> → Field<float> even with different instances at UI level', () => {
      const { patch, ids } = createPatchWithDifferentInstances();

      // Field blocks use different Array instances
      const result = validateConnection(ids.fieldA, 'out', ids.fieldB, 'a', patch);

      // Instance mismatch is caught by the COMPILER, not by UI validation.
      // The UI only validates that both are Field<float>, which they are.
      // This is correct behavior - instance validation is a compilation concern.
      expect(result.valid).toBe(true);
    });
  });
});

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Create a test patch with various blocks for connection testing.
 *
 * Returns both the patch and the block IDs for testing.
 */
interface TestPatchWithIds {
  patch: Patch;
  ids: {
    osc: string;
    const: string;
    add: string;
    multiply: string;
    hsv: string;
    fieldAdd: string;
  };
}

function createTestPatch(): TestPatchWithIds {
  let ids: any = {};

  const patch = buildPatch((b) => {
    // Signal blocks
    ids.osc = b.addBlock('Oscillator', {});
    ids.const = b.addBlock('Const', { value: 1.0 });
    ids.add = b.addBlock('Add', {});
    ids.multiply = b.addBlock('Multiply', {});

    // Color block
    ids.hsv = b.addBlock('HSVToColor', {});

    // Field block
    ids.fieldAdd = b.addBlock('FieldAdd', {});
  });

  return { patch, ids };
}

/**
 * Create a patch with field blocks using the same instance.
 */
interface FieldPatchWithIds {
  patch: Patch;
  ids: {
    array?: string;
    array1?: string;
    array2?: string;
    fieldA: string;
    fieldB: string;
  };
}

function createPatchWithFieldInstances(): FieldPatchWithIds {
  let ids: any = {};

  const patch = buildPatch((b) => {
    // Create an Array block (defines a domain instance)
    ids.array = b.addBlock('Array', { size: 10 });

    // Create field blocks that should use this instance
    // Note: In reality, the instance comes from compilation context,
    // but for testing we rely on the type system to handle this.
    ids.fieldA = b.addBlock('FieldAdd', {}, { domainId: ids.array });
    ids.fieldB = b.addBlock('FieldAdd', {}, { domainId: ids.array });
  });

  return { patch, ids };
}

/**
 * Create a patch with field blocks using different instances.
 */
function createPatchWithDifferentInstances(): FieldPatchWithIds {
  let ids: any = {};

  const patch = buildPatch((b) => {
    // Create two separate Array blocks (different instances)
    ids.array1 = b.addBlock('Array', { size: 10 });
    ids.array2 = b.addBlock('Array', { size: 20 });

    // Create field blocks using different instances
    ids.fieldA = b.addBlock('FieldAdd', {}, { domainId: ids.array1 });
    ids.fieldB = b.addBlock('FieldAdd', {}, { domainId: ids.array2 });
  });

  return { patch, ids };
}
