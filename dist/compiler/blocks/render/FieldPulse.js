import { OpCode } from '../../ir';
import { registerBlock, portId, sigType, fieldType, } from '../registry';
const lowerFieldPulse = ({ b, inputsById }) => {
    const phase = inputsById.phase;
    const id01 = inputsById.id01;
    const base = inputsById.base;
    const amplitude = inputsById.amplitude;
    const spread = inputsById.spread;
    if (!phase || phase.kind !== 'sig') {
        throw new Error('FieldPulse requires phase (signal) input');
    }
    if (!id01 || id01.kind !== 'field') {
        throw new Error('FieldPulse requires id01 (field) input');
    }
    if (!base || base.kind !== 'sig') {
        throw new Error('FieldPulse requires base (signal) input');
    }
    if (!amplitude || amplitude.kind !== 'sig') {
        throw new Error('FieldPulse requires amplitude (signal) input');
    }
    if (!spread || spread.kind !== 'sig') {
        throw new Error('FieldPulse requires spread (signal) input');
    }
    // Algorithm: value = base + amplitude * sin((phase + id01 * spread) * 2PI)
    // Each particle pulses with a phase offset based on its ID
    // Phase offset per element: id01 * spread
    const spreadField = b.fieldBroadcast(spread.id, fieldType('float'));
    const phaseOffset = b.fieldZip([id01.id, spreadField], { kind: 'opcode', opcode: OpCode.Mul }, fieldType('float'));
    // Total phase: phase + phaseOffset
    const phaseField = b.fieldBroadcast(phase.id, fieldType('float'));
    const totalPhase = b.fieldZip([phaseField, phaseOffset], { kind: 'opcode', opcode: OpCode.Add }, fieldType('float'));
    // Scale to radians: totalPhase * 2PI
    const twoPi = b.sigConst(Math.PI * 2, sigType('float'));
    const twoPiField = b.fieldBroadcast(twoPi, fieldType('float'));
    const radians = b.fieldZip([totalPhase, twoPiField], { kind: 'opcode', opcode: OpCode.Mul }, fieldType('float'));
    // sin(radians)
    const sinValue = b.fieldMap(radians, { kind: 'opcode', opcode: OpCode.Sin }, fieldType('float'));
    // sinValue * amplitude
    const amplitudeField = b.fieldBroadcast(amplitude.id, fieldType('float'));
    const scaled = b.fieldZip([sinValue, amplitudeField], { kind: 'opcode', opcode: OpCode.Mul }, fieldType('float'));
    // base + scaled
    const baseField = b.fieldBroadcast(base.id, fieldType('float'));
    const value = b.fieldZip([baseField, scaled], { kind: 'opcode', opcode: OpCode.Add }, fieldType('float'));
    return {
        value: { kind: 'field', id: value, type: fieldType('float') },
    };
};
registerBlock({
    type: 'FieldPulse',
    inputs: [
        { portId: portId('phase'), type: sigType('phase') },
        { portId: portId('id01'), type: fieldType('float') },
        { portId: portId('base'), type: sigType('float') },
        { portId: portId('amplitude'), type: sigType('float') },
        { portId: portId('spread'), type: sigType('float') },
    ],
    outputs: [{ portId: portId('value'), type: fieldType('float') }],
    lower: lowerFieldPulse,
});
