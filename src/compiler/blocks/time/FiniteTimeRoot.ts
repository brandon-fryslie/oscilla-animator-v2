import type { EventExprId, SigExprId } from '../../../types';
import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  eventType,
  type BlockLower,
} from '../registry';

const lowerFiniteTimeRoot: BlockLower = ({ b, config }) => {
  const durationMs =
    typeof config.durationMs === 'number' ? config.durationMs : 10000;

  b.setTimeModel({ kind: 'finite', durationMs });

  // System time
  const t = b.sigTime('t', sigType('float'));
  const dt = b.sigTime('dt', sigType('float'));

  // Progress (0 to 1 over duration)
  const durationSig = b.sigConst(durationMs, sigType('float'));
  const progress = b.sigBinOp(t, durationSig, OpCode.Div, sigType('float'));

  // Optionally add phase from periodMs
  const periodMs = typeof config.periodMs === 'number' ? config.periodMs : 0;
  let phase: SigExprId;
  let pulse: EventExprId;

  if (periodMs > 0) {
    const periodSig = b.sigConst(periodMs, sigType('float'));
    const rawPhase = b.sigBinOp(t, periodSig, OpCode.Div, sigType('float'));
    phase = b.sigUnaryOp(rawPhase, OpCode.Wrap01, sigType('phase'));
    pulse = b.eventWrap(phase);
  } else {
    phase = progress;
    pulse = b.eventPulse();
  }

  const energy = b.sigConst(1, sigType('float'));

  return {
    t: { kind: 'sig', id: t, type: sigType('float') },
    dt: { kind: 'sig', id: dt, type: sigType('float') },
    progress: { kind: 'sig', id: progress, type: sigType('float') },
    phase: { kind: 'sig', id: phase, type: sigType('phase') },
    pulse: { kind: 'event', id: pulse },
    energy: { kind: 'sig', id: energy, type: sigType('float') },
  };
};

registerBlock({
  type: 'FiniteTimeRoot',
  inputs: [],
  outputs: [
    { portId: portId('t'), type: sigType('float') },
    { portId: portId('dt'), type: sigType('float') },
    { portId: portId('progress'), type: sigType('float') },
    { portId: portId('phase'), type: sigType('phase') },
    { portId: portId('pulse'), type: eventType('float') },
    { portId: portId('energy'), type: sigType('float') },
  ],
  lower: lowerFiniteTimeRoot,
});
