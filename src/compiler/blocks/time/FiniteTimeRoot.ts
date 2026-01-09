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

  // Extract dual-phase configuration with defaults
  const periodAMs = typeof config.periodAMs === 'number' ? config.periodAMs : 4000;
  const periodBMs = typeof config.periodBMs === 'number' ? config.periodBMs : 8000;

  b.setTimeModel({ kind: 'finite', durationMs, periodAMs, periodBMs });

  // System time
  const tMs = b.sigTime('tMs', sigType('int'));
  const dt = b.sigTime('dt', sigType('float'));

  // Progress (0 to 1 over duration)
  const durationSig = b.sigConst(durationMs, sigType('float'));
  const progress = b.sigBinOp(tMs, durationSig, OpCode.Div, sigType('float'));

  // Phase A (primary phase from periodAMs)
  const periodASig = b.sigConst(periodAMs, sigType('float'));
  const rawPhaseA = b.sigBinOp(tMs, periodASig, OpCode.Div, sigType('float'));
  const phaseA = b.sigUnaryOp(rawPhaseA, OpCode.Wrap01, sigType('phase'));

  // Phase B (secondary phase from periodBMs)
  const periodBSig = b.sigConst(periodBMs, sigType('float'));
  const rawPhaseB = b.sigBinOp(tMs, periodBSig, OpCode.Div, sigType('float'));
  const phaseB = b.sigUnaryOp(rawPhaseB, OpCode.Wrap01, sigType('phase'));

  // Pulse event (fires when either phase wraps)
  const pulse = b.eventWrap(phaseA);

  return {
    tMs: { kind: 'sig', id: tMs, type: sigType('int') },
    dt: { kind: 'sig', id: dt, type: sigType('float') },
    progress: { kind: 'sig', id: progress, type: sigType('float') },
    phaseA: { kind: 'sig', id: phaseA, type: sigType('phase') },
    phaseB: { kind: 'sig', id: phaseB, type: sigType('phase') },
    pulse: { kind: 'event', id: pulse },
  };
};

registerBlock({
  type: 'FiniteTimeRoot',
  inputs: [],
  outputs: [
    { portId: portId('tMs'), type: sigType('int') },
    { portId: portId('dt'), type: sigType('float') },
    { portId: portId('progress'), type: sigType('float') },
    { portId: portId('phaseA'), type: sigType('phase') },
    { portId: portId('phaseB'), type: sigType('phase') },
    { portId: portId('pulse'), type: eventType('unit') },
  ],
  lower: lowerFiniteTimeRoot,
});
