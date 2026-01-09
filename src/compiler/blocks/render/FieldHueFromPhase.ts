import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  fieldType,
  type BlockLower,
} from '../registry';

const lowerFieldHueFromPhase: BlockLower = ({ b, inputsById }) => {
  const phase = inputsById.phase;
  const id01 = inputsById.id01;

  if (!phase || phase.kind !== 'sig') {
    throw new Error('FieldHueFromPhase requires phase (signal) input');
  }
  if (!id01 || id01.kind !== 'field') {
    throw new Error('FieldHueFromPhase requires id01 (field) input');
  }

  // Algorithm: hue = phase + id01 (both 0..1)
  // Phase provides animation, id01 provides color spread across particles

  const phaseField = b.fieldBroadcast(phase.id, fieldType('float'));
  const hue01 = b.fieldZip(
    [phaseField, id01.id],
    { kind: 'opcode', opcode: OpCode.Add },
    fieldType('float')
  );

  // Wrap hue to 0..1 to handle overflow
  const hue = b.fieldMap(
    hue01,
    { kind: 'opcode', opcode: OpCode.Wrap01 },
    fieldType('float')
  );

  return {
    hue: { kind: 'field', id: hue, type: fieldType('float') },
  };
};

registerBlock({
  kind: 'FieldHueFromPhase',
  inputs: [
    { portId: portId('phase'), type: sigType('phase') },
    { portId: portId('id01'), type: fieldType('float') },
  ],
  outputs: [{ portId: portId('hue'), type: fieldType('float') }],
  lower: lowerFieldHueFromPhase,
});
