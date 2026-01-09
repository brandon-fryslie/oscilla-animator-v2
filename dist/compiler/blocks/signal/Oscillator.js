import { OpCode } from '../../ir';
import { registerBlock, portId, sigType, } from '../registry';
const lowerOscillator = ({ b, inputsById, config }) => {
    const phase = inputsById.phase;
    if (!phase || phase.kind !== 'sig') {
        throw new Error('Oscillator requires phase input');
    }
    const waveform = typeof config.waveform === 'string' ? config.waveform : 'sin';
    // Scale phase to 0..2PI
    const twoPi = b.sigConst(Math.PI * 2, sigType('float'));
    const scaledPhase = b.sigBinOp(phase.id, twoPi, OpCode.Mul, sigType('float'));
    let outputId;
    switch (waveform) {
        case 'sin':
            outputId = b.sigUnaryOp(scaledPhase, OpCode.Sin, sigType('float'));
            break;
        case 'cos':
            outputId = b.sigUnaryOp(scaledPhase, OpCode.Cos, sigType('float'));
            break;
        case 'saw':
            // Phase is already 0..1, just scale to -1..1
            const two = b.sigConst(2, sigType('float'));
            const one = b.sigConst(1, sigType('float'));
            const scaled = b.sigBinOp(phase.id, two, OpCode.Mul, sigType('float'));
            outputId = b.sigBinOp(scaled, one, OpCode.Sub, sigType('float'));
            break;
        default:
            outputId = b.sigUnaryOp(scaledPhase, OpCode.Sin, sigType('float'));
    }
    return {
        out: { kind: 'sig', id: outputId, type: sigType('float') },
    };
};
registerBlock({
    type: 'Oscillator',
    inputs: [{ portId: portId('phase'), type: sigType('phase') }],
    outputs: [{ portId: portId('out'), type: sigType('float') }],
    lower: lowerOscillator,
});
