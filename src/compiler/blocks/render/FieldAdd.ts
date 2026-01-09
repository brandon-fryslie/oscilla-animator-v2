import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  fieldType,
  type BlockLower,
} from '../registry';

const lowerFieldAdd: BlockLower = ({ b, inputsById }) => {
  const a = inputsById.a;
  const b_ = inputsById.b;

  if (!a || a.kind !== 'field') {
    throw new Error('FieldAdd requires a (field) input');
  }
  if (!b_ || b_.kind !== 'field') {
    throw new Error('FieldAdd requires b (field) input');
  }

  const sum = b.fieldZip(
    [a.id, b_.id],
    { kind: 'opcode', opcode: OpCode.Add },
    fieldType('float')
  );

  return {
    out: { kind: 'field', id: sum, type: fieldType('float') },
  };
};

registerBlock({
  type: 'FieldAdd',
  inputs: [
    { portId: portId('a'), type: fieldType('float') },
    { portId: portId('b'), type: fieldType('float') },
  ],
  outputs: [{ portId: portId('out'), type: fieldType('float') }],
  lower: lowerFieldAdd,
});
