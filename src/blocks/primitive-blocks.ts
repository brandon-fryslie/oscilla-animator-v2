/**
 * Primitive Blocks - Shape Primitives
 *
 * Shape blocks create Signal<shape> values representing drawable shapes.
 * These map directly to HTML5 Canvas primitives:
 * - Ellipse (includes circles when rx=ry)
 * - Rect (rectangles)
 * - Path (arbitrary paths - future)
 *
 * Shapes are NOT fields - they have cardinality ONE.
 * Use Array to create Field<shape> for many instances.
 */

import {registerBlock} from './registry';
import {signalType} from '../core/canonical-types';
import {defaultSourceConst} from '../types';

// =============================================================================
// Ellipse
// =============================================================================

/**
 * Ellipse - Creates an ellipse shape (circle when rx=ry)
 *
 * Maps directly to Canvas ellipse() API.
 * For circles, just set rx=ry.
 *
 * Outputs a shape signal that can be:
 * 1. Passed to Array to create many instances
 * 2. Connected directly to a renderer
 */
registerBlock({
    type: 'Ellipse',
    label: 'Ellipse',
    category: 'shape',
    description: 'Creates an ellipse shape (circle when rx=ry)',
    form: 'primitive',
    capability: 'pure',
    inputs: {
        rx: {
            label: 'Radius X',
            type: signalType('float'),
            value: 0.02,
            defaultSource: defaultSourceConst(0.02),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
        ry: {
            label: 'Radius Y',
            type: signalType('float'),
            value: 0.02,
            defaultSource: defaultSourceConst(0.02),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
    },
    outputs: {
        shape: {label: 'Shape', type: signalType('shape')},
    },
    lower: ({ctx, inputsById, config}) => {
        // For now, output rx as a placeholder until shape type is fully implemented
        // TODO: Output proper shape descriptor when shape type exists
        const rxInput = inputsById.rx;
        let rxSig;
        if (rxInput && rxInput.k === 'sig') {
            rxSig = rxInput.id;
        } else {
            rxSig = ctx.b.sigConst((config?.rx as number) ?? 0.02, signalType('float'));
        }

        const slot = ctx.b.allocSlot();

        return {
            outputsById: {
                shape: {k: 'sig', id: rxSig, slot},
            },
        };
    },
});

// =============================================================================
// Rect
// =============================================================================

/**
 * Rect - Creates a rectangle shape
 *
 * Maps directly to Canvas fillRect()/strokeRect() API.
 * For squares, just set width=height.
 *
 * Outputs a shape signal that can be:
 * 1. Passed to Array to create many instances
 * 2. Connected directly to a renderer
 */
registerBlock({
    type: 'Rect',
    label: 'Rect',
    category: 'shape',
    description: 'Creates a rectangle shape (square when width=height)',
    form: 'primitive',
    capability: 'pure',
    inputs: {
        width: {
            label: 'Width',
            type: signalType('float'),
            value: 0.04,
            defaultSource: defaultSourceConst(0.04),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
        height: {
            label: 'Height',
            type: signalType('float'),
            value: 0.02,
            defaultSource: defaultSourceConst(0.02),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
    },
    outputs: {
        shape: {label: 'Shape', type: signalType('shape')},
    },
    lower: ({ctx, inputsById, config}) => {
        // For now, output width as a placeholder until shape type is fully implemented
        // TODO: Output proper shape descriptor when shape type exists
        const widthInput = inputsById.width;
        let widthSig;
        if (widthInput && widthInput.k === 'sig') {
            widthSig = widthInput.id;
        } else {
            widthSig = ctx.b.sigConst((config?.width as number) ?? 0.04, signalType('float'));
        }

        const slot = ctx.b.allocSlot();

        return {
            outputsById: {
                shape: {k: 'sig', id: widthSig, slot},
            },
        };
    },
});

// =============================================================================
// Path (Future)
// =============================================================================

// TODO: Path block for arbitrary shapes via canvas path commands
// Will support: moveTo, lineTo, quadraticCurveTo, bezierCurveTo, arc, closePath
