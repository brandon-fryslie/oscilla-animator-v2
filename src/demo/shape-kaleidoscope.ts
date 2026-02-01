// /**
//  * Shape Kaleidoscope - Dual topology demo
//  *
//  * Two layouts: ellipses in a circle, rectangles in a grid.
//  * Both topologies render simultaneously in the same patch (two render passes).
//  * Demonstrates the full shape2d pipeline with multiple topologies.
//  */
//
// import { timeRootRole } from '../types';
// import type { PatchBuilder } from './types';
//
// export const patchShapeKaleidoscope: PatchBuilder = (b) => {
//   const time = b.addBlock('InfiniteTimeRoot', {
//     periodAMs: 6000,
//     periodBMs: 10000,
//   }, { role: timeRootRole() });
//
//   // Animated scale: pulsing between 0.6 and 1.8
//   const eScaleExpr = b.addBlock('Expression', {
//     expression: '1.2 + 0.6 * sin(in0 * 6.28)', // pulse with phaseA
//   });
//   b.wire(time, 'phaseA', eScaleExpr, 'in0');
//
//   const rScaleExpr = b.addBlock('Expression', {
//     expression: '1.5 + 0.8 * sin(in0 * 6.28 + 3.14)', // counter-pulse with phaseB
//   });
//   b.wire(time, 'phaseB', rScaleExpr, 'in0');
//
//   // === LAYER 1: Ellipses (circle layout) ===
//   const ellipse = b.addBlock('Ellipse', { rx: 0.015, ry: 0.015 });
//   const ellipseArray = b.addBlock('Array', { count: 150 });
//   b.wire(ellipse, 'shape', ellipseArray, 'element');
//
//   // Circle layout for ellipses
//   const eCircleLayout = b.addBlock('CircleLayoutUV', { radius: 0.4 });
//   b.wire(ellipseArray, 'elements', eCircleLayout, 'elements');
//
//   // Ellipse color: warm constant
//   const eColor = b.addBlock('Const', { value: { r: 1.0, g: 0.5, b: 0.3, a: 0.8 } }); // Warm orange
//
//   const eRender = b.addBlock('RenderInstances2D', {});
//   b.wire(eCircleLayout, 'position', eRender, 'pos');
//   b.wire(eColor, 'out', eRender, 'color');
//   b.wire(ellipse, 'shape', eRender, 'shape');
//   b.wire(eScaleExpr, 'out', eRender, 'scale'); // animated scale
//
//   // === LAYER 2: Rectangles (grid layout) ===
//   const rect = b.addBlock('Rect', { width: 0.025, height: 0.012 });
//   const rectArray = b.addBlock('Array', { count: 100 });
//   b.wire(rect, 'shape', rectArray, 'element');
//
//   // Grid layout for rectangles
//   const rGridLayout = b.addBlock('GridLayoutUV', { rows: 10, cols: 10 });
//   b.wire(rectArray, 'elements', rGridLayout, 'elements');
//
//   // Rect color: cool constant
//   const rColor = b.addBlock('Const', { value: { r: 0.3, g: 0.5, b: 1.0, a: 0.7 } }); // Cool blue
//
//   const rRender = b.addBlock('RenderInstances2D', {});
//   b.wire(rGridLayout, 'position', rRender, 'pos');
//   b.wire(rColor, 'out', rRender, 'color');
//   b.wire(rect, 'shape', rRender, 'shape');
//   b.wire(rScaleExpr, 'out', rRender, 'scale'); // animated counter-pulse scale
// };
