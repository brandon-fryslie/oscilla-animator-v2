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
import {
  canonicalType,
  unitTurns,
  unitRadians,
  unitScalar,
  unitDegrees,
  contractClamp01, contractWrap01,
  unitMs,
  unitSeconds,
} from '../../../core/canonical-types';
import { FLOAT, INT, VEC2, COLOR } from '../../../core/canonical-types';
import { inferType, payloadVar, unitVar } from '../../../core/inference-types';
import { registerBlock } from '../../../blocks/registry';

// Import block definitions to register them
import '../../../blocks/all';


// =============================================================================
// Test Blocks for payload constraint testing
// =============================================================================

// A source with payloadVar and constrained allowedPayloads (only float, int)
registerBlock({
  type: 'TestConstrainedVarSource',
  label: 'Constrained Var Source',
  category: 'test',
  description: 'Test: payloadVar output constrained to float and int only',
  form: 'primitive',
  capability: 'pure',
  payload: {
    allowedPayloads: {
      out: [FLOAT, INT],
    },
    semantics: 'typeSpecific',
  },
  inputs: {},
  outputs: {
    out: { label: 'Out', type: inferType(payloadVar('test_constrained'), unitVar('test_unit')) },
  },
  lower: () => ({ outputsById: {} }),
});

// A sink that only accepts color
registerBlock({
  type: 'TestColorSink',
  label: 'Color Sink',
  category: 'test',
  description: 'Test: expects color input',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    in: { label: 'In', type: canonicalType(COLOR) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

// A sink with payloadVar and constrained allowedPayloads (only vec2, color)
registerBlock({
  type: 'TestVec2ColorSink',
  label: 'Vec2/Color Sink',
  category: 'test',
  description: 'Test: payloadVar input constrained to vec2 and color only',
  form: 'primitive',
  capability: 'pure',
  payload: {
    allowedPayloads: {
      in: [VEC2, COLOR],
    },
    semantics: 'typeSpecific',
  },
  inputs: {
    in: { label: 'In', type: inferType(payloadVar('test_v2c'), unitVar('test_v2c_unit')) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

// A concrete float source (no payload metadata, no payloadVar)
registerBlock({
  type: 'TestFloatSource',
  label: 'Float Source',
  category: 'test',
  description: 'Test: outputs concrete float',
  form: 'primitive',
  capability: 'pure',
  inputs: {},
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT) },
  },
  lower: () => ({ outputsById: {} }),
});

// A concrete int sink (no payload metadata)
registerBlock({
  type: 'TestIntSink',
  label: 'Int Sink',
  category: 'test',
  description: 'Test: expects int input',
  form: 'primitive',
  capability: 'pure',
  inputs: {
    in: { label: 'In', type: canonicalType(INT) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

// Register test blocks for adapter tests
registerBlock({
  type: 'TestUIPhaseSource',
  label: 'Phase Source',
  category: 'test',
  description: 'Test: outputs float:phase01',
  form: 'primitive',
  capability: 'pure',
  inputs: {},
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
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
    in: { label: 'In', type: canonicalType(FLOAT, unitRadians()) },
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
    out: { label: 'Out', type: canonicalType(FLOAT, unitScalar()) },
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
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar, contractClamp01) },
  },
  outputs: {},
  lower: () => ({ outputsById: {} }),
});

// =============================================================================
// Payload constraint tests (crio.1 + crio.2)
// =============================================================================

describe('Payload constraint validation', () => {
  describe('payloadVar sources respect allowedPayloads (crio.1)', () => {
    it('constrained payloadVar source → compatible concrete sink is ALLOWED', () => {
      // Use Const (allows ALL) → Add.a (FLOAT)
      const patch = buildPatch((b) => {
        const constId = b.addBlock('Const');
        b.setConfig(constId, 'value', 1.0);
        b.addBlock('Add');
      });

      // Const.out (payloadVar, ALL_CONCRETE_PAYLOADS) → Add.a (FLOAT) should be valid
      const result = validateConnection('b0', 'out', 'b1', 'a', patch);
      expect(result.valid).toBe(true);
    });

    it('constrained payloadVar source → incompatible concrete sink is BLOCKED', () => {
      // TestConstrainedVarSource allows only [FLOAT, INT] → TestColorSink expects COLOR
      const patch = buildPatch((b) => {
        b.addBlock('TestConstrainedVarSource');
        b.addBlock('TestColorSink');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Type mismatch');
    });

    it('constrained payloadVar sink → incompatible concrete source is BLOCKED', () => {
      // TestFloatSource outputs FLOAT → TestVec2ColorSink allows only [VEC2, COLOR]
      const patch = buildPatch((b) => {
        b.addBlock('TestFloatSource');
        b.addBlock('TestVec2ColorSink');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(false);
    });

    it('unconstrained payloadVar source → any concrete sink is ALLOWED', () => {
      // Const.out has payloadVar with allowedPayloads including ALL_CONCRETE_PAYLOADS
      const patch = buildPatch((b) => {
        const constId = b.addBlock('Const');
        b.setConfig(constId, 'value', { r: 1, g: 0, b: 0, a: 1 });
        b.addBlock('TestColorSink');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(true);
    });
  });

  describe('concrete placeholder types respect allowedPayloads (crio.2)', () => {
    it('Add.out (FLOAT placeholder, allows STANDARD_NUMERIC) → Add.a (FLOAT) is ALLOWED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('Add');
        b.addBlock('Add');
      });

      const result = validateConnection('b0', 'out', 'b1', 'a', patch);
      expect(result.valid).toBe(true);
      expect(result.adapter).toBeUndefined();
    });

    it('concrete float source → int sink without adapter is BLOCKED', () => {
      // FLOAT ≠ INT, no allowedPayloads on either side to override
      const patch = buildPatch((b) => {
        b.addBlock('TestFloatSource');
        b.addBlock('TestIntSink');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(false);
    });

    it('concrete float source → Add.a (has allowedPayloads including FLOAT) is ALLOWED', () => {
      // Add has allowedPayloads for 'a' = STANDARD_NUMERIC_PAYLOADS which includes FLOAT
      const patch = buildPatch((b) => {
        b.addBlock('TestFloatSource');
        b.addBlock('Add');
      });

      const result = validateConnection('b0', 'out', 'b1', 'a', patch);
      expect(result.valid).toBe(true);
    });
  });
});

// =============================================================================
// Regression tests for validateConnection correctness (crio.5)
// Uses real block definitions to catch regressions with actual block types.
// =============================================================================

describe('Regression: validateConnection with real blocks (crio.5)', () => {
  describe('InfiniteTimeRoot connections', () => {
    it('InfiniteTimeRoot.tMs (float) → Add.a (float) is ALLOWED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        b.addBlock('Add');
      });

      const result = validateConnection('b0', 'tMs', 'b1', 'a', patch);
      expect(result.valid).toBe(true);
    });

    it('InfiniteTimeRoot.phaseA (float:phase01) → Add.a (float:scalar) requires adapter', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        b.addBlock('Add');
      });

      // phase01 ≠ scalar, but an adapter should exist
      const result = validateConnection('b0', 'phaseA', 'b1', 'a', patch);
      expect(result.valid).toBe(true);
      expect(result.adapter).toBeDefined();
    });

    it('InfiniteTimeRoot.palette (color) → Add.a (float) is BLOCKED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        b.addBlock('Add');
      });

      // COLOR ≠ FLOAT, and Add only allows STANDARD_NUMERIC_PAYLOADS (no color)
      const result = validateConnection('b0', 'palette', 'b1', 'a', patch);
      expect(result.valid).toBe(false);
    });
  });

  describe('Ellipse → Array connections', () => {
    it('Ellipse.shape (float) → Array.element (float, allows ALL) is ALLOWED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('Ellipse');
        b.addBlock('Array');
      });

      const result = validateConnection('b0', 'shape', 'b1', 'element', patch);
      expect(result.valid).toBe(true);
    });
  });

  describe('Const (polymorphic) connections', () => {
    it('Const.out (payloadVar) → Add.a (float, allows STANDARD_NUMERIC) is ALLOWED', () => {
      const patch = buildPatch((b) => {
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 42);
        b.addBlock('Add');
      });

      const result = validateConnection('b0', 'out', 'b1', 'a', patch);
      expect(result.valid).toBe(true);
    });

    it('Const.out (payloadVar) → Array.element (allows ALL) is ALLOWED', () => {
      const patch = buildPatch((b) => {
        const c = b.addBlock('Const');
        b.setConfig(c, 'value', 1.0);
        b.addBlock('Array');
      });

      const result = validateConnection('b0', 'out', 'b1', 'element', patch);
      expect(result.valid).toBe(true);
    });
  });

  describe('Cross-type mismatches with real blocks', () => {
    it('InfiniteTimeRoot.tMs (float) → TestColorSink (color) is BLOCKED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        b.addBlock('TestColorSink');
      });

      const result = validateConnection('b0', 'tMs', 'b1', 'in', patch);
      expect(result.valid).toBe(false);
    });

    it('InfiniteTimeRoot.palette (color) → TestIntSink (int) is BLOCKED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('InfiniteTimeRoot');
        b.addBlock('TestIntSink');
      });

      const result = validateConnection('b0', 'palette', 'b1', 'in', patch);
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// Basic connection validation
// =============================================================================

describe('Connection Validation - Behavioral Tests', () => {
  describe('Compatible connections should be ALLOWED', () => {
    it('Signal<float> → Signal<float> (same type, direct match)', () => {
      const patch = buildPatch((b) => {
        b.addBlock('Add');
        b.addBlock('Add');
      });

      const result = validateConnection('b0', 'out', 'b1', 'a', patch);
      expect(result.valid).toBe(true);
      expect(result.adapter).toBeUndefined();
    });
  });

  describe('Type mismatches should be BLOCKED', () => {
    it('Signal<float> → Signal<color> without adapter is BLOCKED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('TestFloatSource');
        b.addBlock('TestColorSink');
      });

      const result = validateConnection('b0', 'out', 'b1', 'in', patch);
      expect(result.valid).toBe(false);
    });
  });

  describe('Self-connections behavior', () => {
    it('blocks connecting a port to itself', () => {
      const patch = buildPatch((b) => {
        b.addBlock('Add');
      });

      const result = validateConnection('b0', 'out', 'b0', 'out', patch);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cannot connect port to itself');
    });
  });

  describe('Invalid blocks/ports should be BLOCKED', () => {
    it('nonexistent source block is BLOCKED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('Add');
      });

      const result = validateConnection('nonexistent', 'out', 'b0', 'a', patch);
      expect(result.valid).toBe(false);
    });

    it('nonexistent port is BLOCKED', () => {
      const patch = buildPatch((b) => {
        b.addBlock('Add');
        b.addBlock('Add');
      });

      const result = validateConnection('b0', 'nonexistent', 'b1', 'a', patch);
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// Adapter-aware Connection Validation Tests
// =============================================================================

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
        b.addBlock('Add');
        b.addBlock('Add');
      });

      const res = validateConnection('b0', 'out', 'b1', 'a', patch);
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
          out: { label: 'Out', type: canonicalType(FLOAT, unitTurns(), undefined, contractWrap01()) },
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
          in: { label: 'In', type: canonicalType(FLOAT, unitScalar, contractClamp01) },
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

// =============================================================================
// Unit Display Functions
// =============================================================================

describe('Unit Display Functions', () => {
  describe('formatUnitForDisplay', () => {
    it('returns empty string for scalar', () => {
      expect(formatUnitForDisplay(unitScalar())).toBe('');
    });

    it('returns "phase" for phase01', () => {
      expect(formatUnitForDisplay(unitTurns())).toBe('phase');
    });

    it('returns "rad" for radians', () => {
      expect(formatUnitForDisplay(unitRadians())).toBe('rad');
    });

    it('returns "deg" for degrees', () => {
      expect(formatUnitForDisplay(unitDegrees())).toBe('deg');
    });

    it('returns "0..1" for norm01', () => {
      expect(formatUnitForDisplay(unitScalar())).toBe('0..1');
    });

    it('returns "ms" for ms', () => {
      expect(formatUnitForDisplay(unitMs())).toBe('ms');
    });

    it('returns "s" for seconds', () => {
      expect(formatUnitForDisplay(unitSeconds())).toBe('s');
    });
  });

  describe('formatTypeForDisplay with units', () => {
    it('includes unit for phase01: Signal<float:phase>', () => {
      const type = canonicalType(FLOAT, unitTurns(), undefined, contractWrap01());
      expect(formatTypeForDisplay(type)).toBe('Signal<float:phase>');
    });

    it('includes unit for radians: Signal<float:rad>', () => {
      const type = canonicalType(FLOAT, unitRadians());
      expect(formatTypeForDisplay(type)).toBe('Signal<float:rad>');
    });

    it('omits unit for scalar: Signal<float>', () => {
      const type = canonicalType(FLOAT, unitScalar());
      expect(formatTypeForDisplay(type)).toBe('Signal<float>');
    });

    it('includes unit for degrees: Signal<float:deg>', () => {
      const type = canonicalType(FLOAT, unitDegrees());
      expect(formatTypeForDisplay(type)).toBe('Signal<float:deg>');
    });

    it('includes unit for norm01: Signal<float:0..1>', () => {
      const type = canonicalType(FLOAT, unitScalar, undefined, contractClamp01);
      expect(formatTypeForDisplay(type)).toBe('Signal<float:0..1>');
    });
  });
});
