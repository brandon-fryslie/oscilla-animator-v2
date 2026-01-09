import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  fieldType,
  type BlockLower,
} from '../registry';

const lowerFieldZipSig: BlockLower = ({ b, inputsById, config }) => {
  const field = inputsById.field;
  const signal = inputsById.signal;

  if (!field || field.kind !== 'field') {
    throw new Error('FieldZipSig requires field input');
  }
  if (!signal || signal.kind !== 'sig') {
    throw new Error('FieldZipSig requires signal input');
  }

  const op = typeof config.op === 'string' ? config.op : 'mul';

  let opcode: OpCode;
  switch (op) {
    case 'add':
      opcode = OpCode.Add;
      break;
    case 'sub':
      opcode = OpCode.Sub;
      break;
    case 'mul':
      opcode = OpCode.Mul;
      break;
    case 'div':
      opcode = OpCode.Div;
      break;
    default:
      opcode = OpCode.Mul;
  }

  const outputId = b.fieldZipSig(
    field.id,
    [signal.id],
    { kind: 'opcode', opcode },
    fieldType('float')
  );

  return {
    out: { kind: 'field', id: outputId, type: fieldType('float') },
  };
};

registerBlock({
  kind: 'FieldZipSig',
  inputs: [
    { portId: portId('field'), type: fieldType('float') },
    { portId: portId('signal'), type: sigType('float') },
  ],
  outputs: [{ portId: portId('out'), type: fieldType('float') }],
  lower: lowerFieldZipSig,
});
