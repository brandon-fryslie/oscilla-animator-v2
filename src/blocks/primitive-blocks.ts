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
import {canonicalType, strideOf, floatConst, requireInst} from '../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../core/canonical-types';
import {TOPOLOGY_ID_ELLIPSE, TOPOLOGY_ID_RECT} from '../shapes/registry';
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
    cardinality: {
        cardinalityMode: 'signalOnly',
        laneCoupling: 'laneLocal',
        broadcastPolicy: 'disallowSignalMix',
    },
    inputs: {
        rx: {
            label: 'Radius X',
            type: canonicalType(FLOAT),
            value: 0.02,
            defaultSource: defaultSourceConst(0.02),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
        ry: {
            label: 'Radius Y',
            type: canonicalType(FLOAT),
            value: 0.02,
            defaultSource: defaultSourceConst(0.02),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
        rotation: {
            label: 'Rotation',
            type: canonicalType(FLOAT),
            value: 0,
            defaultSource: defaultSourceConst(0),
            uiHint: {kind: 'slider', min: 0, max: 6.28, step: 0.01},
        },
    },
    outputs: {
        shape: {label: 'Shape', type: canonicalType(SHAPE)},
    },
    lower: ({ctx, inputsById, config}) => {
        // Resolve rx parameter
        const rxInput = inputsById.rx;
        let rxSig;
        const rxIsSignal = rxInput && 'type' in rxInput && requireInst(rxInput.type.extent.cardinality, 'cardinality').kind !== 'many';
        if (rxInput && rxIsSignal) {
            rxSig = rxInput.id;
        } else {
            rxSig = ctx.b.constant(floatConst((config?.rx as number) ?? 0.02), canonicalType(FLOAT));
        }

        // Resolve ry parameter
        const ryInput = inputsById.ry;
        let rySig;
        const ryIsSignal = ryInput && 'type' in ryInput && requireInst(ryInput.type.extent.cardinality, 'cardinality').kind !== 'many';
        if (ryInput && ryIsSignal) {
            rySig = ryInput.id;
        } else {
            rySig = ctx.b.constant(floatConst((config?.ry as number) ?? 0.02), canonicalType(FLOAT));
        }

        // Resolve rotation parameter
        const rotationInput = inputsById.rotation;
        let rotationSig;
        const rotationIsSignal = rotationInput && 'type' in rotationInput && requireInst(rotationInput.type.extent.cardinality, 'cardinality').kind !== 'many';
        if (rotationInput && rotationIsSignal) {
            rotationSig = rotationInput.id;
        } else {
            rotationSig = ctx.b.constant(floatConst((config?.rotation as number) ?? 0), canonicalType(FLOAT));
        }

        // Create shape reference with ellipse topology and param signals
        const shapeRefSig = ctx.b.shapeRef(
            TOPOLOGY_ID_ELLIPSE,
            [rxSig, rySig, rotationSig],
            canonicalType(SHAPE)
        );

        const slot = ctx.b.allocSlot();
        const shapeType = ctx.outTypes[0];

        return {
            outputsById: {
                shape: {id: shapeRefSig, slot, type: shapeType, stride: strideOf(shapeType.payload)},
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
    cardinality: {
        cardinalityMode: 'signalOnly',
        laneCoupling: 'laneLocal',
        broadcastPolicy: 'disallowSignalMix',
    },
    inputs: {
        width: {
            label: 'Width',
            type: canonicalType(FLOAT),
            value: 0.04,
            defaultSource: defaultSourceConst(0.04),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
        height: {
            label: 'Height',
            type: canonicalType(FLOAT),
            value: 0.02,
            defaultSource: defaultSourceConst(0.02),
            uiHint: {kind: 'slider', min: 0.001, max: 0.5, step: 0.001},
        },
        rotation: {
            label: 'Rotation',
            type: canonicalType(FLOAT),
            value: 0,
            defaultSource: defaultSourceConst(0),
            uiHint: {kind: 'slider', min: 0, max: 6.28, step: 0.01},
        },
        cornerRadius: {
            label: 'Corner Radius',
            type: canonicalType(FLOAT),
            value: 0,
            defaultSource: defaultSourceConst(0),
            uiHint: {kind: 'slider', min: 0, max: 0.1, step: 0.001},
        },
    },
    outputs: {
        shape: {label: 'Shape', type: canonicalType(SHAPE)},
    },
    lower: ({ctx, inputsById, config}) => {
        // Resolve width parameter
        const widthInput = inputsById.width;
        let widthSig;
        const widthIsSignal = widthInput && 'type' in widthInput && requireInst(widthInput.type.extent.cardinality, 'cardinality').kind !== 'many';
        if (widthInput && widthIsSignal) {
            widthSig = widthInput.id;
        } else {
            widthSig = ctx.b.constant(floatConst((config?.width as number) ?? 0.04), canonicalType(FLOAT));
        }

        // Resolve height parameter
        const heightInput = inputsById.height;
        let heightSig;
        const heightIsSignal = heightInput && 'type' in heightInput && requireInst(heightInput.type.extent.cardinality, 'cardinality').kind !== 'many';
        if (heightInput && heightIsSignal) {
            heightSig = heightInput.id;
        } else {
            heightSig = ctx.b.constant(floatConst((config?.height as number) ?? 0.02), canonicalType(FLOAT));
        }

        // Resolve rotation parameter
        const rotationInput = inputsById.rotation;
        let rotationSig;
        const rotationIsSignal = rotationInput && 'type' in rotationInput && requireInst(rotationInput.type.extent.cardinality, 'cardinality').kind !== 'many';
        if (rotationInput && rotationIsSignal) {
            rotationSig = rotationInput.id;
        } else {
            rotationSig = ctx.b.constant(floatConst((config?.rotation as number) ?? 0), canonicalType(FLOAT));
        }

        // Resolve cornerRadius parameter
        const cornerRadiusInput = inputsById.cornerRadius;
        let cornerRadiusSig;
        const cornerRadiusIsSignal = cornerRadiusInput && 'type' in cornerRadiusInput && requireInst(cornerRadiusInput.type.extent.cardinality, 'cardinality').kind !== 'many';
        if (cornerRadiusInput && cornerRadiusIsSignal) {
            cornerRadiusSig = cornerRadiusInput.id;
        } else {
            cornerRadiusSig = ctx.b.constant(floatConst((config?.cornerRadius as number) ?? 0), canonicalType(FLOAT));
        }

        // Create shape reference with rect topology and param signals
        const shapeRefSig = ctx.b.shapeRef(
            TOPOLOGY_ID_RECT,
            [widthSig, heightSig, rotationSig, cornerRadiusSig],
            canonicalType(SHAPE)
        );

        const slot = ctx.b.allocSlot();
        const shapeType = ctx.outTypes[0];

        return {
            outputsById: {
                shape: {id: shapeRefSig, slot, type: shapeType, stride: strideOf(shapeType.payload)},
            },
        };
    },
});

// =============================================================================
// Path (Future)
// =============================================================================

// TODO: Path block for arbitrary shapes via canvas path commands
// Will support: moveTo, lineTo, quadraticCurveTo, bezierCurveTo, arc, closePath
