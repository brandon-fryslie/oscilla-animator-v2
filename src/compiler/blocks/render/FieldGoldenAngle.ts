import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  fieldType,
  sigType,
  type BlockLower,
} from '../registry';

const lowerFieldGoldenAngle: BlockLower = ({ b, inputsById, config }) => {
  const id01 = inputsById.id01;

  if (!id01 || id01.kind !== 'field') {
    throw new Error('FieldGoldenAngle requires id01 (field) input');
  }

  // Golden angle ≈ 137.5 degrees in radians, multiplied by number of turns
  const goldenAngle = 2.399963229728653;
  const numTurns = typeof config.turns === 'number' ? config.turns : 50;
  const goldenAngleTimesNumTurns = b.sigConst(
    goldenAngle * numTurns,
    sigType('float')
  );
  const goldenField = b.fieldBroadcast(goldenAngleTimesNumTurns, fieldType('float'));

  const angle = b.fieldZip(
    [id01.id, goldenField],
    { kind: 'opcode', opcode: OpCode.Mul },
    fieldType('float')
  );

  return {
    angle: { kind: 'field', id: angle, type: fieldType('float') },
  };
};

registerBlock({
  type: 'FieldGoldenAngle',
  inputs: [{ portId: portId('id01'), type: fieldType('float') }],
  outputs: [{ portId: portId('angle'), type: fieldType('float') }],
  lower: lowerFieldGoldenAngle,
});
