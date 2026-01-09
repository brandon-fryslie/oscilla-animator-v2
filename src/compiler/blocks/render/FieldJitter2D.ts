import {
  registerBlock,
  portId,
  sigType,
  fieldType,
  type BlockLower,
} from '../registry';

const lowerFieldJitter2D: BlockLower = ({ b, inputsById }) => {
  const pos = inputsById.pos;
  const rand = inputsById.rand;
  const amountX = inputsById.amountX;
  const amountY = inputsById.amountY;

  if (!pos || pos.kind !== 'field') {
    throw new Error('FieldJitter2D requires pos (field<vec2>) input');
  }
  if (!rand || rand.kind !== 'field') {
    throw new Error('FieldJitter2D requires rand (field<float>) input');
  }
  if (!amountX || amountX.kind !== 'sig') {
    throw new Error('FieldJitter2D requires amountX (signal) input');
  }
  if (!amountY || amountY.kind !== 'sig') {
    throw new Error('FieldJitter2D requires amountY (signal) input');
  }

  // Algorithm:
  // - Use rand to derive two independent random values (for X and Y)
  // - Scale by amountX and amountY
  // - Add to position
  //
  // offsetX = (hash1(rand) * 2 - 1) * amountX  (-amountX to +amountX)
  // offsetY = (hash2(rand) * 2 - 1) * amountY  (-amountY to +amountY)
  // result = pos + (offsetX, offsetY)

  // Broadcast signals to fields
  const amountXField = b.fieldBroadcast(amountX.id, fieldType('float'));
  const amountYField = b.fieldBroadcast(amountY.id, fieldType('float'));

  // Use fieldZip with kernel that combines all inputs: [pos(vec2), rand(float), amountX(float), amountY(float)]
  const jitteredPos = b.fieldZip(
    [pos.id, rand.id, amountXField, amountYField],
    { kind: 'kernel', name: 'jitter2d' },
    fieldType('vec2')
  );

  return {
    pos: { kind: 'field', id: jitteredPos, type: fieldType('vec2') },
  };
};

registerBlock({
  kind: 'FieldJitter2D',
  inputs: [
    { portId: portId('pos'), type: fieldType('vec2') },
    { portId: portId('rand'), type: fieldType('float') },
    { portId: portId('amountX'), type: sigType('float') },
    { portId: portId('amountY'), type: sigType('float') },
  ],
  outputs: [{ portId: portId('pos'), type: fieldType('vec2') }],
  lower: lowerFieldJitter2D,
});
