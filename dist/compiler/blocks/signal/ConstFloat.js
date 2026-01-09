import { registerBlock, portId, sigType, } from '../registry';
const lowerConstFloat = ({ b, config }) => {
    const value = typeof config.value === 'number' ? config.value : 0;
    const id = b.sigConst(value, sigType('float'));
    return {
        out: { kind: 'sig', id, type: sigType('float') },
    };
};
registerBlock({
    type: 'ConstFloat',
    inputs: [],
    outputs: [{ portId: portId('out'), type: sigType('float') }],
    lower: lowerConstFloat,
});
