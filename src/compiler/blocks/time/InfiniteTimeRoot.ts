import { OpCode } from '../../ir';
import {
  registerBlock,
  portId,
  sigType,
  eventType,
  type BlockLower,
} from '../registry';

const lowerInfiniteTimeRoot: BlockLower = ({ b, config }) => {
  // Extract dual-phase configuration with defaults
  const periodAMs = typeof config.periodAMs === 'number' ? config.periodAMs : 4000;
  const periodBMs = typeof config.periodBMs === 'number' ? config.periodBMs : 8000;

  // Set time model with dual periods
  b.setTimeModel({ kind: 'infinite', windowMs: 60000, periodAMs, periodBMs });

  // System time (unbounded, monotonic) - spec says 'int' but runtime uses float
  const tMs = b.sigTime('tMs', sigType('int'));

  // Delta time
  const dt = b.sigTime('dt', sigType('float'));

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

  // Palette - HSV rainbow cycling with phaseA
  // HSV: hue = phaseA, saturation = 1.0, value = 0.5
  const saturation = b.sigConst(1.0, sigType('float'));
  const value = b.sigConst(0.5, sigType('float'));
  const palette = b.sigZip(
    [phaseA, saturation, value],
    { kind: 'kernel', name: 'hsvToRgb' },
    sigType('color')
  );

  // Energy - simple sine wave for MVP (can be audio-reactive later)
  // energy = 0.5 + 0.5 * sin(phaseA * 2π)
  const twoPi = b.sigConst(Math.PI * 2, sigType('float'));
  const phaseRadians = b.sigBinOp(phaseA, twoPi, OpCode.Mul, sigType('float'));
  const sinWave = b.sigUnaryOp(phaseRadians, OpCode.Sin, sigType('float'));
  const half = b.sigConst(0.5, sigType('float'));
  const scaled = b.sigBinOp(sinWave, half, OpCode.Mul, sigType('float'));
  const energy = b.sigBinOp(half, scaled, OpCode.Add, sigType('float'));

  return {
    tMs: { kind: 'sig', id: tMs, type: sigType('int') },
    dt: { kind: 'sig', id: dt, type: sigType('float') },
    phaseA: { kind: 'sig', id: phaseA, type: sigType('phase') },
    phaseB: { kind: 'sig', id: phaseB, type: sigType('phase') },
    pulse: { kind: 'event', id: pulse },
    palette: { kind: 'sig', id: palette, type: sigType('color') },
    energy: { kind: 'sig', id: energy, type: sigType('float') },
  };
};

registerBlock({
  type: 'InfiniteTimeRoot',
  inputs: [],
  outputs: [
    { portId: portId('tMs'), type: sigType('int') },
    { portId: portId('dt'), type: sigType('float') },
    { portId: portId('phaseA'), type: sigType('phase') },
    { portId: portId('phaseB'), type: sigType('phase') },
    { portId: portId('pulse'), type: eventType('unit') },
    { portId: portId('palette'), type: sigType('color') },
    { portId: portId('energy'), type: sigType('float') },
  ],
  lower: lowerInfiniteTimeRoot,
});
