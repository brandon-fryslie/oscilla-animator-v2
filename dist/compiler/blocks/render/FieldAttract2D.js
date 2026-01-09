import { registerBlock, portId, sigType, fieldType, } from '../registry';
registerBlock({
    type: 'FieldAttract2D',
    inputs: [
        { portId: portId('pos'), type: fieldType('vec2') },
        { portId: portId('targetX'), type: sigType('float') },
        { portId: portId('targetY'), type: sigType('float') },
        { portId: portId('phase'), type: sigType('phase') },
        { portId: portId('strength'), type: sigType('float') },
    ],
    outputs: [{ portId: portId('pos'), type: fieldType('vec2') }],
    lower: ({ b, inputsById }) => {
        const pos = inputsById.pos;
        const targetX = inputsById.targetX;
        const targetY = inputsById.targetY;
        const phase = inputsById.phase;
        const strength = inputsById.strength;
        // Broadcast signals to fields
        const targetXField = b.fieldBroadcast(targetX.id, fieldType('float'));
        const targetYField = b.fieldBroadcast(targetY.id, fieldType('float'));
        const phaseField = b.fieldBroadcast(phase.id, fieldType('float'));
        const strengthField = b.fieldBroadcast(strength.id, fieldType('float'));
        // kernel: drift towards target over time (phase-accumulated)
        const attractedPos = b.fieldZip([pos.id, targetXField, targetYField, phaseField, strengthField], { kind: 'kernel', name: 'attract2d' }, fieldType('vec2'));
        return {
            pos: { kind: 'field', id: attractedPos, type: fieldType('vec2') },
        };
    },
});
