/**
 * Adapter Block Definitions
 *
 * Implements the 10 required unit-conversion adapters from spec §B4.1.
 * Each adapter is a primitive block with one input, one output, and pure conversion semantics.
 * Adapters are cardinality-preserving (work for both Signal and Field).
 *
 * These blocks are materialized by graph normalization when unit mismatches are detected.
 * The compiler sees them as normal blocks — no special-casing.
 *
 * Spec Reference: design-docs/_new/0-Units-and-Adapters.md Part B
 */

import { registerBlock } from './registry';
import {
  signalType,
  unitPhase01,
  unitScalar,
  unitRadians,
  unitDegrees,
  unitDeg,
  unitNorm01,
  unitMs,
  unitSeconds,
} from '../core/canonical-types';
import { OpCode } from '../compiler/ir/types';
import type { SigExprId } from '../compiler/ir/Indices';

// =============================================================================
// Phase / Scalar Adapters
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
    in: { label: 'In', type: signalType('float', unitPhase01()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitScalar()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    // Identity — no conversion needed, just re-type
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: input.id as SigExprId, slot } } };
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
    in: { label: 'In', type: signalType('float', unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitPhase01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = ctx.b.sigMap(input.id as SigExprId, wrapFn, signalType('float', unitPhase01()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: wrapped, slot } } };
  },
});

// =============================================================================
// Phase / Radians Adapters
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
    in: { label: 'In', type: signalType('float', unitPhase01()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitRadians()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    const twoPi = ctx.b.sigConst(6.283185307179586, signalType('float', unitScalar()));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const radians = ctx.b.sigZip([input.id as SigExprId, twoPi], mulFn, signalType('float', unitRadians()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: radians, slot } } };
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
    in: { label: 'In', type: signalType('float', unitRadians()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitPhase01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    const twoPi = ctx.b.sigConst(6.283185307179586, signalType('float', unitScalar()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const divided = ctx.b.sigZip([input.id as SigExprId, twoPi], divFn, signalType('float', unitScalar()));
    const wrapFn = ctx.b.opcode(OpCode.Wrap01);
    const wrapped = ctx.b.sigMap(divided, wrapFn, signalType('float', unitPhase01()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: wrapped, slot } } };
  },
});

// =============================================================================
// Degrees / Radians Adapters
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
    in: { label: 'In', type: signalType('float', unitDegrees()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitRadians()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    const factor = ctx.b.sigConst(0.017453292519943295, signalType('float', unitScalar())); // π/180
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const radians = ctx.b.sigZip([input.id as SigExprId, factor], mulFn, signalType('float', unitRadians()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: radians, slot } } };
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
    in: { label: 'In', type: signalType('float', unitRadians()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitDegrees()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    const factor = ctx.b.sigConst(57.29577951308232, signalType('float', unitScalar())); // 180/π
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const degrees = ctx.b.sigZip([input.id as SigExprId, factor], mulFn, signalType('float', unitDegrees()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: degrees, slot } } };
  },
});

// =============================================================================
// Time Adapters
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
    in: { label: 'In', type: signalType('int', unitMs()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitSeconds()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    // int:ms → float division → float:seconds
    const divisor = ctx.b.sigConst(1000, signalType('float', unitScalar()));
    const divFn = ctx.b.opcode(OpCode.Div);
    const seconds = ctx.b.sigZip([input.id as SigExprId, divisor], divFn, signalType('float', unitSeconds()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: seconds, slot } } };
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
    in: { label: 'In', type: signalType('float', unitSeconds()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('int', unitMs()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    const multiplier = ctx.b.sigConst(1000, signalType('float', unitScalar()));
    const mulFn = ctx.b.opcode(OpCode.Mul);
    const floatMs = ctx.b.sigZip([input.id as SigExprId, multiplier], mulFn, signalType('float', unitMs()));
    const floorFn = ctx.b.opcode(OpCode.Floor);
    const intMs = ctx.b.sigMap(floatMs, floorFn, signalType('int', unitMs()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: intMs, slot } } };
  },
});

// =============================================================================
// Normalization Adapters
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
    in: { label: 'In', type: signalType('float', unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitNorm01()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    const zero = ctx.b.sigConst(0, signalType('float', unitScalar()));
    const one = ctx.b.sigConst(1, signalType('float', unitScalar()));
    const clampFn = ctx.b.opcode(OpCode.Clamp);
    const clamped = ctx.b.sigZip([input.id as SigExprId, zero, one], clampFn, signalType('float', unitNorm01()));
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: clamped, slot } } };
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
    in: { label: 'In', type: signalType('float', unitNorm01()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitScalar()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    // Identity — no conversion needed, just re-type
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: input.id as SigExprId, slot } } };
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
    in: { label: 'In', type: signalType('float', unitScalar()) },
  },
  outputs: {
    out: { label: 'Out', type: signalType('float', unitDeg()) },
  },
  lower: ({ inputsById, ctx }) => {
    const input = inputsById.in;
    if (!input || input.k !== 'sig') throw new Error('Adapter input must be a signal');
    // Identity — no conversion needed, just re-type
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { k: 'sig', id: input.id as SigExprId, slot } } };
  },
});
