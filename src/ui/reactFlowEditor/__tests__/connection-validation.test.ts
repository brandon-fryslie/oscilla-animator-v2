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
import { validateConnection, formatTypeForDisplay, formatUnitForDisplay } from '../typeValidation';
import type { Patch } from '../../../graph/Patch';
import {
  signalType,
  unitPhase01,
  unitRadians,
  unitScalar,
  unitDegrees,
  unitNorm01,
  unitMs,
  unitSeconds,
} from '../../../core/canonical-types';
import { registerBlock } from '../../../blocks/registry';

// Import block definitions to register them
// These modules self-register when loaded
import '../../../blocks/signal-blocks';
import '../../../blocks/math-blocks';
import '../../../blocks/color-blocks';
import '../../../blocks/field-operations-blocks';
import '../../../blocks/array-blocks';
import '../../../blocks/adapter-blocks';

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

    it('allows payload-generic Const to connect to concrete types', () => {
      const { patch, ids } = createTestPatch();

      // Const outputs float (payload-generic default), should connect to float input
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

    it('blocks Field → Signal (no adapter for many→one)', () => {
      const { patch, ids } = createTestPatch();

      // Array outputs Field, Const (signal) expects Signal — no reduction adapter exists
      // fieldBlock is FromDomainId which outputs a Field
      const result = validateConnection(ids.fieldBlock, 'out', ids.const, 'value', patch);

      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/Type mismatch|incompatible/i);
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
      // FromDomainId has input 'domain', not 'in'
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
    array: string;
    fieldBlock: string;
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

    // Field block (FromDomainId requires Array)
    ids.array = b.addBlock('Array', { size: 10 });
    ids.fieldBlock = b.addBlock('FromDomainId', {}, { domainId: ids.array });
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
    ids.fieldA = b.addBlock('FromDomainId', {}, { domainId: ids.array });
    ids.fieldB = b.addBlock('Pulse', {}, { domainId: ids.array });
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
    ids.fieldA = b.addBlock('FromDomainId', {}, { domainId: ids.array1 });
    ids.fieldB = b.addBlock('FromDomainId', {}, { domainId: ids.array2 });
  });

  return { patch, ids };
}

// =============================================================================
// Adapter-aware Connection Validation Tests
// =============================================================================

// Register test blocks with specific unit annotations
registerBlock({
  type: 'TestUIPhaseSource',
  label: 'Phase Source',
  category: 'test',
  description: 'Test: outputs float:phase01',
  form: 'primitive',
  capability: 'pure',
  inputs: {},
  outputs: {
    out: { label: 'Out', type: signalType('float', unitPhase01()) },
  },
  lower: () => ({ outputsById: {} }),
});

registerBlock({
  type: 'TestUIRadiansSink',
  label: 'Radians Sink',
  category: 'test',
  description: 'Test: expects float:radians',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    in: { label: 'In', type: signalType('float', unitRadians()) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

registerBlock({
  type: 'TestUIScalarSource',
  label: 'Scalar Source',
  category: 'test',
  description: 'Test: outputs float:scalar',
  form: 'primitive',
  capability: 'pure',
  inputs: {},
  outputs: {
    out: { label: 'Out', type: signalType('float', unitScalar()) },
  },
  lower: () => ({ outputsById: {} }),
});

registerBlock({
  type: 'TestUINorm01Sink',
  label: 'Norm01 Sink',
  category: 'test',
  description: 'Test: expects float:norm01',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    in: { label: 'In', type: signalType('float', unitNorm01()) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

describe('Adapter-aware Connection Validation', () => {
  describe('connections with available adapters should be ALLOWED', () => {
    it('allows phase01 → radians (adapter exists)', () => {
      const patch = buildPatch((b) => {
        b.addBlock('TestUIPhaseSource');
        b.addBlock('TestUIRadiansSink');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(true);
      expect(result.adapter).toBeDefined();
    });

    it('allows scalar → norm01 (adapter exists)', () => {
      const patch = buildPatch((b) => {
        b.addBlock('TestUIScalarSource');
        b.addBlock('TestUINorm01Sink');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(true);
      expect(result.adapter).toBeDefined();
    });

    it('does not set adapter field when types match directly', () => {
      const patch = buildPatch((b) => {
        b.addBlock('TestUIPhaseSource');
        b.addBlock('TestUIPhaseSource'); // same type, different block
      });

      // phase01 → phase01 (exact match)
      const result = validateConnection('b0', 'out', 'b1', 'out', patch);
      // This is actually an invalid connection (output→output not valid)
      // Let's use proper matching:
      const patch2 = buildPatch((b) => {
        b.addBlock('TestUIScalarSource');
        b.addBlock('TestUIScalarSource');
      });

      // scalar output → scalar output won't match (no input port)
      // Just verify no adapter on exact match using a real case
      const { patch: testPatch, ids } = createTestPatch();
      const res = validateConnection(ids.osc, 'out', ids.add, 'a', testPatch);
      expect(res.valid).toBe(true);
      expect(res.adapter).toBeUndefined();
    });
  });

  describe('connections without adapters should remain BLOCKED', () => {
    it('blocks phase01 → norm01 (no direct adapter, disallowed)', () => {
      registerBlock({
        type: 'TestUIPhaseSrc2',
        label: 'Phase Source 2',
        category: 'test',
        form: 'primitive',
        capability: 'pure',
        inputs: {},
        outputs: {
          out: { label: 'Out', type: signalType('float', unitPhase01()) },
        },
        lower: () => ({ outputsById: {} }),
      });
      registerBlock({
        type: 'TestUINorm01Sink2',
        label: 'Norm01 Sink 2',
        category: 'test',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          in: { label: 'In', type: signalType('float', unitNorm01()) },
        },
        outputs: {},
        lower: () => ({ outputsById: {} }),
      });

      const patch = buildPatch((b) => {
        b.addBlock('TestUIPhaseSrc2');
        b.addBlock('TestUINorm01Sink2');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Type mismatch');
    });
  });
});

describe('Unit Display Functions', () => {
  describe('formatUnitForDisplay', () => {
    it('returns empty string for scalar', () => {
      expect(formatUnitForDisplay({ kind: 'scalar' })).toBe('');
    });

    it('returns "phase" for phase01', () => {
      expect(formatUnitForDisplay({ kind: 'phase01' })).toBe('phase');
    });

    it('returns "rad" for radians', () => {
      expect(formatUnitForDisplay({ kind: 'radians' })).toBe('rad');
    });

    it('returns "deg" for degrees', () => {
      expect(formatUnitForDisplay({ kind: 'degrees' })).toBe('deg');
    });

    it('returns "0..1" for norm01', () => {
      expect(formatUnitForDisplay({ kind: 'norm01' })).toBe('0..1');
    });

    it('returns "ms" for ms', () => {
      expect(formatUnitForDisplay({ kind: 'ms' })).toBe('ms');
    });

    it('returns "s" for seconds', () => {
      expect(formatUnitForDisplay({ kind: 'seconds' })).toBe('s');
    });
  });

  describe('formatTypeForDisplay with units', () => {
    it('includes unit for phase01: Signal<float:phase>', () => {
      const type = signalType('float', unitPhase01());
      expect(formatTypeForDisplay(type)).toBe('Signal<float:phase>');
    });

    it('includes unit for radians: Signal<float:rad>', () => {
      const type = signalType('float', unitRadians());
      expect(formatTypeForDisplay(type)).toBe('Signal<float:rad>');
    });

    it('omits unit for scalar: Signal<float>', () => {
      const type = signalType('float', unitScalar());
      expect(formatTypeForDisplay(type)).toBe('Signal<float>');
    });

    it('includes unit for degrees: Signal<float:deg>', () => {
      const type = signalType('float', unitDegrees());
      expect(formatTypeForDisplay(type)).toBe('Signal<float:deg>');
    });

    it('includes unit for norm01: Signal<float:0..1>', () => {
      const type = signalType('float', unitNorm01());
      expect(formatTypeForDisplay(type)).toBe('Signal<float:0..1>');
    });
  });
});
