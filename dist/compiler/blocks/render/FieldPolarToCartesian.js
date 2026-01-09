import { OpCode } from '../../ir';
import { registerBlock, portId, sigType, fieldType, } from '../registry';
const lowerFieldPolarToCartesian = ({ b, inputsById }) => {
    const centerX = inputsById.centerX;
    const centerY = inputsById.centerY;
    const radius = inputsById.radius;
    const angle = inputsById.angle;
    if (!centerX || centerX.kind !== 'sig') {
        throw new Error('FieldPolarToCartesian requires centerX (signal) input');
    }
    if (!centerY || centerY.kind !== 'sig') {
        throw new Error('FieldPolarToCartesian requires centerY (signal) input');
    }
    if (!radius || radius.kind !== 'field') {
        throw new Error('FieldPolarToCartesian requires radius (field) input');
    }
    if (!angle || angle.kind !== 'field') {
        throw new Error('FieldPolarToCartesian requires angle (field) input');
    }
    // cos(angle), sin(angle)
    const cosAngle = b.fieldMap(angle.id, { kind: 'opcode', opcode: OpCode.Cos }, fieldType('float'));
    const sinAngle = b.fieldMap(angle.id, { kind: 'opcode', opcode: OpCode.Sin }, fieldType('float'));
    // x = centerX + radius * cos(angle)
    const xOffset = b.fieldZip([radius.id, cosAngle], { kind: 'opcode', opcode: OpCode.Mul }, fieldType('float'));
    const centerXField = b.fieldBroadcast(centerX.id, fieldType('float'));
    const x = b.fieldZip([centerXField, xOffset], { kind: 'opcode', opcode: OpCode.Add }, fieldType('float'));
    // y = centerY + radius * sin(angle)
    const yOffset = b.fieldZip([radius.id, sinAngle], { kind: 'opcode', opcode: OpCode.Mul }, fieldType('float'));
    const centerYField = b.fieldBroadcast(centerY.id, fieldType('float'));
    const y = b.fieldZip([centerYField, yOffset], { kind: 'opcode', opcode: OpCode.Add }, fieldType('float'));
    // Combine x and y into vec2
    const pos = b.fieldZip([x, y], { kind: 'kernel', name: 'makeVec2' }, fieldType('vec2'));
    return {
        pos: { kind: 'field', id: pos, type: fieldType('vec2') },
    };
};
registerBlock({
    type: 'FieldPolarToCartesian',
    inputs: [
        { portId: portId('centerX'), type: sigType('float') },
        { portId: portId('centerY'), type: sigType('float') },
        { portId: portId('radius'), type: fieldType('float') },
        { portId: portId('angle'), type: fieldType('float') },
    ],
    outputs: [{ portId: portId('pos'), type: fieldType('vec2') }],
    lower: lowerFieldPolarToCartesian,
});
