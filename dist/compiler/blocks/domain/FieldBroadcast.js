import { registerBlock, portId, sigType, fieldType, } from '../registry';
const lowerFieldBroadcast = ({ b, inputsById }) => {
    const signal = inputsById.signal;
    if (!signal || signal.kind !== 'sig') {
        throw new Error('FieldBroadcast requires signal input');
    }
    const fieldId = b.fieldBroadcast(signal.id, fieldType(signal.type.domain));
    return {
        out: { kind: 'field', id: fieldId, type: fieldType(signal.type.domain) },
    };
};
registerBlock({
    type: 'FieldBroadcast',
    inputs: [{ portId: portId('signal'), type: sigType('float') }],
    outputs: [{ portId: portId('out'), type: fieldType('float') }],
    lower: lowerFieldBroadcast,
});
