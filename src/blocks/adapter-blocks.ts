/**
 * Lens Block Definitions (Unit Conversion)
 *
 * Implements the 10 required unit-conversion lens blocks from spec §B4.1.
 * Each lens block is a primitive block with one input, one output, and pure conversion semantics.
 * Lens blocks are cardinality-preserving (work for both Signal and Field).
 *
 * These blocks are materialized by graph normalization when unit mismatches are detected.
 * The compiler sees them as normal blocks — no special-casing.
 *
 * Note: These blocks are called "Adapter_*" internally for backward compatibility,
 * but they implement lens block semantics as described in the spec.
 *
 * Spec Reference: design-docs/_new/0-Units-and-Adapters.md Part B
 */

import { registerBlock } from './registry';
import {
  canonicalType,
  unitPhase01,
  unitScalar,
  unitRadians,
  unitDegrees,
  unitDeg,
  unitNorm01,
  unitMs,
  unitSeconds,
  strideOf,
  floatConst,
} from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR,  CAMERA_PROJECTION } from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// Phase / Scalar Lens Blocks
// =============================================================================

/**
 * PhaseToScalar01: float:phase01 → float:scalar
 * Semantics: y = x (identity — semantic boundary only)
 */
registerBlock({
  type: 'Adapter_PhaseToScalar01',
  label: 'Phase → Scalar',
  category: 'adapter',
  description: 'Semantic boundary: phase [0,1) to dimensionless scalar (identity)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitPhase01()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitScalar()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    // Identity — no conversion needed, just re-type
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: input.id as SigExprId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

/**
 * ScalarToPhase01: float:scalar → float:phase01
 * Semantics: y = wrap01(x)
 */
registerBlock({
  type: 'Adapter_ScalarToPhase01',
  label: 'Scalar → Phase',
  category: 'adapter',
  description: 'Wrap scalar to phase [0,1) with cyclic semantics',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitPhase01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = ctx.b.sigMap(input.id as SigExprId, wrapFn, canonicalType(FLOAT, unitPhase01()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: wrapped, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Phase / Radians Lens Blocks
// =============================================================================

/**
 * PhaseToRadians: float:phase01 → float:radians
 * Semantics: y = x * 2π
 */
registerBlock({
  type: 'Adapter_PhaseToRadians',
  label: 'Phase → Radians',
  category: 'adapter',
  description: 'Convert phase [0,1) to radians [0,2π)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitPhase01()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitRadians()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    const twoPi = ctx.b.sigConst(floatConst(6.283185307179586), canonicalType(FLOAT, unitScalar()));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const radians = ctx.b.sigZip([input.id as SigExprId, twoPi], mulFn, canonicalType(FLOAT, unitRadians()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: radians, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

/**
 * RadiansToPhase01: float:radians → float:phase01
 * Semantics: y = wrap01(x / 2π)
 */
registerBlock({
  type: 'Adapter_RadiansToPhase01',
  label: 'Radians → Phase',
  category: 'adapter',
  description: 'Convert radians to phase [0,1) with wrapping',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitRadians()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitPhase01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    const twoPi = ctx.b.sigConst(floatConst(6.283185307179586), canonicalType(FLOAT, unitScalar()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = ctx.b.sigZip([input.id as SigExprId, twoPi], divFn, canonicalType(FLOAT, unitScalar()));
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = ctx.b.sigMap(divided, wrapFn, canonicalType(FLOAT, unitPhase01()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: wrapped, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Degrees / Radians Lens Blocks
// =============================================================================

/**
 * DegreesToRadians: float:degrees → float:radians
 * Semantics: y = x * (π/180)
 */
registerBlock({
  type: 'Adapter_DegreesToRadians',
  label: 'Degrees → Radians',
  category: 'adapter',
  description: 'Convert degrees to radians',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitDegrees()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitRadians()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    const factor = ctx.b.sigConst(floatConst(0.017453292519943295), canonicalType(FLOAT, unitScalar())); // π/180
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const radians = ctx.b.sigZip([input.id as SigExprId, factor], mulFn, canonicalType(FLOAT, unitRadians()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: radians, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

/**
 * RadiansToDegrees: float:radians → float:degrees
 * Semantics: y = x * (180/π)
 */
registerBlock({
  type: 'Adapter_RadiansToDegrees',
  label: 'Radians → Degrees',
  category: 'adapter',
  description: 'Convert radians to degrees',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitRadians()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitDegrees()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    const factor = ctx.b.sigConst(floatConst(57.29577951308232), canonicalType(FLOAT, unitScalar())); // 180/π
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const degrees = ctx.b.sigZip([input.id as SigExprId, factor], mulFn, canonicalType(FLOAT, unitDegrees()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: degrees, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Time Lens Blocks
// =============================================================================

/**
 * MsToSeconds: int:ms → float:seconds
 * Semantics: y = x / 1000
 */
registerBlock({
  type: 'Adapter_MsToSeconds',
  label: 'Ms → Seconds',
  category: 'adapter',
  description: 'Convert milliseconds to seconds',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(INT, unitMs()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitSeconds()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    // int:ms → float division → float:seconds
    const divisor = ctx.b.sigConst(floatConst(1000), canonicalType(FLOAT, unitScalar()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const seconds = ctx.b.sigZip([input.id as SigExprId, divisor], divFn, canonicalType(FLOAT, unitSeconds()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: seconds, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

/**
 * SecondsToMs: float:seconds → int:ms
 * Semantics: y = floor(x * 1000)
 */
registerBlock({
  type: 'Adapter_SecondsToMs',
  label: 'Seconds → Ms',
  category: 'adapter',
  description: 'Convert seconds to milliseconds (rounded down)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitSeconds()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(INT, unitMs()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    const multiplier = ctx.b.sigConst(floatConst(1000), canonicalType(FLOAT, unitScalar()));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const floatMs = ctx.b.sigZip([input.id as SigExprId, multiplier], mulFn, canonicalType(FLOAT, unitMs()));
    const floorFn = ctx.b.opcode(OpCode.Floor);
    const intMs = ctx.b.sigMap(floatMs, floorFn, canonicalType(INT, unitMs()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: intMs, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

// =============================================================================
// Normalization Lens Blocks
// =============================================================================

/**
 * ScalarToNorm01Clamp: float:scalar → float:norm01
 * Semantics: y = clamp(x, 0, 1)
 */
registerBlock({
  type: 'Adapter_ScalarToNorm01Clamp',
  label: 'Scalar → Norm01',
  category: 'adapter',
  description: 'Clamp scalar to normalized [0,1]',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitNorm01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    const zero = ctx.b.sigConst(floatConst(0), canonicalType(FLOAT, unitScalar()));
    const one = ctx.b.sigConst(floatConst(1), canonicalType(FLOAT, unitScalar()));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const clamped = ctx.b.sigZip([input.id as SigExprId, zero, one], clampFn, canonicalType(FLOAT, unitNorm01()));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: clamped, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

/**
 * Norm01ToScalar: float:norm01 → float:scalar
 * Semantics: y = x (identity)
 */
registerBlock({
  type: 'Adapter_Norm01ToScalar',
  label: 'Norm01 → Scalar',
  category: 'adapter',
  description: 'Promote normalized [0,1] to scalar (identity)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitNorm01()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitScalar()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    // Identity — no conversion needed, just re-type
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: input.id as SigExprId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});

/**
 * ScalarToDeg: float:scalar → float:deg
 * Semantics: y = x (identity — semantic boundary only)
 * Use when a scalar value is semantically in degrees.
 */
registerBlock({
  type: 'Adapter_ScalarToDeg',
  label: 'Scalar → Deg',
  category: 'adapter',
  description: 'Reinterpret scalar as degrees (identity)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    in: { label: 'In', type: canonicalType(FLOAT, unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: canonicalType(FLOAT, unitDeg()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Lens block input must be a signal');
    // Identity — no conversion needed, just re-type
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return {
      outputsById: {
        out: { k: 'sig', id: input.id as SigExprId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
