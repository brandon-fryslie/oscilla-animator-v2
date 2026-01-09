import { registerBlock, portId, fieldType, domainType, } from '../registry';
const lowerFieldFromDomainId = ({ b, inputsById }) => {
    const domain = inputsById.domain;
    if (!domain || domain.kind !== 'domain') {
        throw new Error('FieldFromDomainId requires domain input');
    }
    const id01 = b.fieldSource(domain.id, 'normalizedIndex', fieldType('float'));
    return {
        id01: { kind: 'field', id: id01, type: fieldType('float') },
    };
};
registerBlock({
    type: 'FieldFromDomainId',
    inputs: [
        { portId: portId('domain'), type: domainType() },
    ],
    outputs: [{ portId: portId('id01'), type: fieldType('float') }],
    lower: lowerFieldFromDomainId,
});
