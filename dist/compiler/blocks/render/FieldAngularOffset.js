import { OpCode } from '../../ir';
import { registerBlock, portId, sigType, fieldType, } from '../registry';
const lowerFieldAngularOffset = ({ b, inputsById }) => {
    const phase = inputsById.phase;
    const spin = inputsById.spin;
    const id01 = inputsById.id01;
    if (!phase || phase.kind !== 'sig') {
        throw new Error('FieldAngularOffset requires phase (signal) input');
    }
    if (!spin || spin.kind !== 'sig') {
        throw new Error('FieldAngularOffset requires spin (signal) input');
    }
    if (!id01 || id01.kind !== 'field') {
        throw new Error('FieldAngularOffset requires id01 (field) input');
    }
    // Inner particles spin faster: spinMultiplier = 1 + (1 - id01) = 2 - id01
    const two = b.sigConst(2, sigType('float'));
    const twoField = b.fieldBroadcast(two, fieldType('float'));
    const spinMultiplier = b.fieldZip([twoField, id01.id], { kind: 'opcode', opcode: OpCode.Sub }, fieldType('float'));
    // Phase offset: phase * 2PI * spin * spinMultiplier
    const twoPi = b.sigConst(Math.PI * 2, sigType('float'));
    const phaseRadians = b.sigBinOp(phase.id, twoPi, OpCode.Mul, sigType('float'));
    const phaseSpinRadians = b.sigBinOp(phaseRadians, spin.id, OpCode.Mul, sigType('float'));
    const phaseSpinField = b.fieldBroadcast(phaseSpinRadians, fieldType('float'));
    const offset = b.fieldZip([phaseSpinField, spinMultiplier], { kind: 'opcode', opcode: OpCode.Mul }, fieldType('float'));
    return {
        offset: { kind: 'field', id: offset, type: fieldType('float') },
    };
};
registerBlock({
    type: 'FieldAngularOffset',
    inputs: [
        { portId: portId('phase'), type: sigType('phase') },
        { portId: portId('spin'), type: sigType('float') },
        { portId: portId('id01'), type: fieldType('float') },
    ],
    outputs: [{ portId: portId('offset'), type: fieldType('float') }],
    lower: lowerFieldAngularOffset,
});
