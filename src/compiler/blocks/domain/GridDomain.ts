import {
  registerBlock,
  portId,
  fieldType,
  domainType,
  type BlockLower,
} from '../registry';

const lowerGridDomain: BlockLower = ({ b, config }) => {
  const rows = typeof config.rows === 'number' ? config.rows : 4;
  const cols = typeof config.cols === 'number' ? config.cols : 4;

  const domainId = b.domainGrid(rows, cols);

  // Position field (normalized 0..1 grid positions)
  const posField = b.fieldSource(domainId, 'pos0', fieldType('vec2'));

  // Index field
  const indexField = b.fieldSource(domainId, 'index', fieldType('float'));

  // Normalized index field (0..1)
  const normIndexField = b.fieldSource(
    domainId,
    'normalizedIndex',
    fieldType('float')
  );

  // Random per-element value (seeded by element ID)
  const randField = b.fieldSource(domainId, 'idRand', fieldType('float'));

  return {
    domain: { kind: 'domain', id: domainId },
    pos: { kind: 'field', id: posField, type: fieldType('vec2') },
    index: { kind: 'field', id: indexField, type: fieldType('float') },
    normIndex: { kind: 'field', id: normIndexField, type: fieldType('float') },
    rand: { kind: 'field', id: randField, type: fieldType('float') },
  };
};

registerBlock({
  kind: 'GridDomain',
  inputs: [],
  outputs: [
    { portId: portId('domain'), type: domainType() },
    { portId: portId('pos'), type: fieldType('vec2') },
    { portId: portId('index'), type: fieldType('float') },
    { portId: portId('normIndex'), type: fieldType('float') },
    { portId: portId('rand'), type: fieldType('float') },
  ],
  lower: lowerGridDomain,
});
