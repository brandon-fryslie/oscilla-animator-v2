import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  fieldType,
  type BlockLower,
} from '../registry';

const lowerFieldRadiusSqrt: BlockLower = ({ b, inputsById }) => {
  const radius = inputsById.radius;
  const id01 = inputsById.id01;

  if (!radius || (radius.kind !== 'sig' && radius.kind !== 'field')) {
    throw new Error('FieldRadiusSqrt requires radius (signal or field) input');
  }
  if (!id01 || id01.kind !== 'field') {
    throw new Error('FieldRadiusSqrt requires id01 (field) input');
  }

  // Effective radius: radius * sqrt(id01) for even area distribution
  const sqrtId01 = b.fieldMap(
    id01.id,
    { kind: 'kernel', name: 'sqrt' },
    fieldType('float')
  );

  // Handle radius as signal (broadcast) or field (use directly)
  const radiusField = radius.kind === 'sig'
    ? b.fieldBroadcast(radius.id, fieldType('float'))
    : radius.id;

  const effectiveRadius = b.fieldZip(
    [radiusField, sqrtId01],
    { kind: 'opcode', opcode: OpCode.Mul },
    fieldType('float')
  );

  return {
    radius: { kind: 'field', id: effectiveRadius, type: fieldType('float') },
  };
};

registerBlock({
  type: 'FieldRadiusSqrt',
  inputs: [
    { portId: portId('radius'), type: fieldType('float') },
    { portId: portId('id01'), type: fieldType('float') },
  ],
  outputs: [{ portId: portId('radius'), type: fieldType('float') }],
  lower: lowerFieldRadiusSqrt,
});
