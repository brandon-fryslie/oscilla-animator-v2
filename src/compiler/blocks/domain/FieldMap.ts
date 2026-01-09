import {
  registerBlock,
  portId,
  fieldType,
  type BlockLower,
} from '../registry';

const lowerFieldMap: BlockLower = ({ b, inputsById, config }) => {
  const field = inputsById.field;
  if (!field || field.kind !== 'field') {
    throw new Error('FieldMap requires field input');
  }

  const expr = typeof config.expr === 'string' ? config.expr : 'x';

  const outputId = b.fieldMap(
    field.id,
    { kind: 'expr', expr },
    fieldType(field.type.payload)
  );

  return {
    out: { kind: 'field', id: outputId, type: fieldType(field.type.payload) },
  };
};

registerBlock({
  kind: 'FieldMap',
  inputs: [{ portId: portId('field'), type: fieldType('float') }],
  outputs: [{ portId: portId('out'), type: fieldType('float') }],
  lower: lowerFieldMap,
});
