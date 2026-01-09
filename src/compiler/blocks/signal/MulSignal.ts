import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  type BlockLower,
} from '../registry';

const lowerMulSignal: BlockLower = ({ b, inputsById }) => {
  const a = inputsById.a;
  const b_ = inputsById.b;

  if (!a || !b_ || a.kind !== 'sig' || b_.kind !== 'sig') {
    throw new Error('MulSignal requires two signal inputs');
  }

  const id = b.sigBinOp(a.id, b_.id, OpCode.Mul, sigType('float'));
  return {
    out: { kind: 'sig', id, type: sigType('float') },
  };
};

registerBlock({
  kind: 'MulSignal',
  inputs: [
    { portId: portId('a'), type: sigType('float') },
    { portId: portId('b'), type: sigType('float') },
  ],
  outputs: [{ portId: portId('out'), type: sigType('float') }],
  lower: lowerMulSignal,
});
