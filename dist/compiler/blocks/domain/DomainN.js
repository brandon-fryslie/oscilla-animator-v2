import { registerBlock, portId, fieldType, domainType, } from '../registry';
const lowerDomainN = ({ b, config }) => {
    const n = typeof config.n === 'number' ? config.n : 10;
    const seed = typeof config.seed === 'number' ? config.seed : 0;
    const domainId = b.domainN(n, seed);
    const indexField = b.fieldSource(domainId, 'index', fieldType('float'));
    const normIndexField = b.fieldSource(domainId, 'normalizedIndex', fieldType('float'));
    const randField = b.fieldSource(domainId, 'idRand', fieldType('float'));
    return {
        domain: { kind: 'domain', id: domainId },
        index: { kind: 'field', id: indexField, type: fieldType('float') },
        normIndex: { kind: 'field', id: normIndexField, type: fieldType('float') },
        rand: { kind: 'field', id: randField, type: fieldType('float') },
    };
};
registerBlock({
    type: 'DomainN',
    inputs: [],
    outputs: [
        { portId: portId('domain'), type: domainType() },
        { portId: portId('index'), type: fieldType('float') },
        { portId: portId('normIndex'), type: fieldType('float') },
        { portId: portId('rand'), type: fieldType('float') },
    ],
    lower: lowerDomainN,
});
