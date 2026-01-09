import {
  registerBlock,
  portId,
  sigType,
} from '../registry';

registerBlock({
  type: 'MousePosition',
  inputs: [],
  outputs: [
    { portId: portId('x'), type: sigType('float') },
    { portId: portId('y'), type: sigType('float') },
  ],
  lower: ({ b }) => ({
    x: { kind: 'sig', id: b.sigExternal('mouseX', sigType('float')), type: sigType('float') },
    y: { kind: 'sig', id: b.sigExternal('mouseY', sigType('float')), type: sigType('float') },
  }),
});
