import { OpCode } from '../../ir';
import { registerBlock, portId, sigType, eventType, } from '../registry';
const lowerInfiniteTimeRoot = ({ b, config }) => {
    // Use default window of 60000ms (1 minute) for infinite time model
    b.setTimeModel({ kind: 'infinite', windowMs: 60000 });
    // System time (unbounded, monotonic)
    const t = b.sigTime('t', sigType('float'));
    // Delta time
    const dt = b.sigTime('dt', sigType('float'));
    // Phase from cycle (if configured)
    const periodMs = typeof config.periodMs === 'number' ? config.periodMs : 4000;
    const periodSig = b.sigConst(periodMs, sigType('float'));
    const rawPhase = b.sigBinOp(t, periodSig, OpCode.Div, sigType('float'));
    const phase = b.sigUnaryOp(rawPhase, OpCode.Wrap01, sigType('phase'));
    // Pulse event (on phase wrap)
    const pulse = b.eventWrap(phase);
    // Energy (simple sawtooth from phase for now)
    const energy = b.sigConst(1, sigType('float'));
    return {
        t: { kind: 'sig', id: t, type: sigType('float') },
        dt: { kind: 'sig', id: dt, type: sigType('float') },
        phase: { kind: 'sig', id: phase, type: sigType('phase') },
        pulse: { kind: 'event', id: pulse },
        energy: { kind: 'sig', id: energy, type: sigType('float') },
    };
};
registerBlock({
    type: 'InfiniteTimeRoot',
    inputs: [],
    outputs: [
        { portId: portId('t'), type: sigType('float') },
        { portId: portId('dt'), type: sigType('float') },
        { portId: portId('phase'), type: sigType('phase') },
        { portId: portId('pulse'), type: eventType('float') },
        { portId: portId('energy'), type: sigType('float') },
    ],
    lower: lowerInfiniteTimeRoot,
});
