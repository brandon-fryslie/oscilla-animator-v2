/**
 * Primitive Blocks
 *
 * Primitive blocks create Signal<T> values (Stage 1 of three-stage architecture).
 * These are NOT instances - they have cardinality ONE.
 */

import {registerBlock} from './registry';
import {signalType} from '../core/canonical-types';
import {defaultSourceConst} from '../types';

// =============================================================================
// Circle
// =============================================================================

/**
 * Circle - Creates a circle primitive (Signal<float> representing radius)
 *
 * Stage 1: Primitive block that outputs a single circle signal.
 * NOT a field - this has cardinality ONE.
 *
 * To create many circles:
 * 1. Circle → Signal<float> (radius)
 * 2. Array → Field<float> (many radii)
 * 3. GridLayout → Field<vec2> (positions)
 *
 * Note: In the current implementation, a circle is represented by its radius.
 * Future versions may use a composite type.
 */
registerBlock({
    type: 'Circle',
    label: 'Circle',
    category: 'shape',
    description: 'Creates a circle primitive (ONE element)',
    form: 'primitive',
    capability: 'pure',
    inputs: [
        {
            id: 'radius',
            label: 'Radius',
            type: signalType('float'),
            defaultValue: 0.02,
            defaultSource: defaultSourceConst(0.02)
        },
    ],
    outputs: [
        {id: 'circle', label: 'Circle', type: signalType('float')},
    ],
    params: {
        radius: 0.02,
    },
    lower: ({ctx, inputsById, config}) => {
        const radiusInput = inputsById.radius;

        // Get radius signal - either from input or from config
        let radiusSig;
        if (radiusInput && radiusInput.k === 'sig') {
            radiusSig = radiusInput.id;
        } else {
            radiusSig = ctx.b.sigConst((config?.radius as number) ?? 0.02, signalType('float'));
        }

        const slot = ctx.b.allocSlot();

        // Output the radius signal as the "circle" signal
        return {
            outputsById: {
                circle: {k: 'sig', id: radiusSig, slot},
            },
        };
    },
});

// =============================================================================
// Square
// =============================================================================

/**
 * Square - Creates a square primitive (Signal<float> representing size)
 *
 * Stage 1: Primitive block that outputs a single square signal.
 * NOT a field - this has cardinality ONE.
 *
 * To create many squares:
 * 1. Square → Signal<float> (size)
 * 2. Array → Field<float> (many sizes)
 * 3. GridLayout → Field<vec2> (positions)
 *
 * Note: In the current implementation, a square is represented by its size.
 * Future versions may use a composite type.
 */
registerBlock({
    type: 'Square',
    label: 'Square',
    category: 'shape',
    description: 'Creates a square primitive (ONE element)',
    form: 'primitive',
    capability: 'pure',
    inputs: [
        {
            id: 'size',
            label: 'Size',
            type: signalType('float'),
            defaultValue: 0.02,
            defaultSource: defaultSourceConst(0.02),
            uiHint: {kind: 'slider', min: 0.01, max: 0.5, step: 0.01},
        },
    ],
    outputs: [
        {id: 'square', label: 'Square', type: signalType('float')},
    ],
    params: {
        size: 0.02,
    },
    lower: ({ctx, inputsById, config}) => {
        const sizeInput = inputsById.size;

        // Get size signal - either from input or from config
        let sizeSig;
        if (sizeInput && sizeInput.k === 'sig') {
            sizeSig = sizeInput.id;
        } else {
            sizeSig = ctx.b.sigConst((config?.size as number) ?? 0.02, signalType('float'));
        }

        const slot = ctx.b.allocSlot();

        // Output the size signal as the "square" signal
        return {
            outputsById: {
                square: {k: 'sig', id: sizeSig, slot},
            },
        };
    },
});
