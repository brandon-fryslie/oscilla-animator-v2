import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  fieldType,
  type BlockLower,
} from '../registry';

const lowerHsvToRgb: BlockLower = ({ b, inputsById }) => {
  const hue = inputsById.hue;
  const sat = inputsById.sat;
  const val = inputsById.val;

  if (!hue || hue.kind !== 'field') {
    throw new Error('HsvToRgb requires hue (field) input');
  }
  if (!sat || sat.kind !== 'sig') {
    throw new Error('HsvToRgb requires sat (signal) input');
  }
  if (!val || val.kind !== 'sig') {
    throw new Error('HsvToRgb requires val (signal) input');
  }

  // Algorithm: Convert HSV to RGB using kernel
  // HSV values are in 0..1 range

  // Broadcast sat and val to fields
  const satField = b.fieldBroadcast(sat.id, fieldType('float'));
  const valField = b.fieldBroadcast(val.id, fieldType('float'));

  // Convert HSV to RGB using kernel
  const color = b.fieldZip(
    [hue.id, satField, valField],
    { kind: 'kernel', name: 'hsvToRgb' },
    fieldType('color')
  );

  return {
    color: { kind: 'field', id: color, type: fieldType('color') },
  };
};

registerBlock({
  kind: 'HsvToRgb',
  inputs: [
    { portId: portId('hue'), type: fieldType('float') },
    { portId: portId('sat'), type: sigType('float') },
    { portId: portId('val'), type: sigType('float') },
  ],
  outputs: [{ portId: portId('color'), type: fieldType('color') }],
  lower: lowerHsvToRgb,
});
