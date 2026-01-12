// /**
//  * Block Type Registry for UI
//  *
//  * Catalog of available block types organized by category.
//  * This is separate from the compiler's block registry and focused on UI presentation.
//  */
//
// /**
//  * Block category for organizing the library.
//  */
// export type BlockCategory =
//   | 'Time'
//   | 'Domain'
//   | 'Constants'
//   | 'Field Operations'
//   | 'Rendering'
//   | 'Math'
//   | 'Color';
//
// /**
//  * Port definition for UI display.
//  * Uses simple string types for display rather than full SignalType objects.
//  */
// export interface PortDef {
//   readonly id: string;
//   readonly label: string;
//   readonly typeStr: string; // Human-readable type (e.g., "Signal<number>", "Field<vec2>")
// }
//
// /**
//  * Block type information for UI.
//  */
// export interface BlockTypeInfo {
//   readonly type: string;
//   readonly label: string;
//   readonly category: BlockCategory;
//   readonly description: string;
//   readonly inputs: readonly PortDef[];
//   readonly outputs: readonly PortDef[];
//   readonly tags?: readonly string[];
// }
//
// /**
//  * Block type registry.
//  */
// class BlockTypeRegistry {
//   private types = new Map<string, BlockTypeInfo>();
//
//   register(info: BlockTypeInfo): void {
//     this.types.set(info.type, info);
//   }
//
//   get(type: string): BlockTypeInfo | undefined {
//     return this.types.get(type);
//   }
//
//   getAll(): BlockTypeInfo[] {
//     return Array.from(this.types.values());
//   }
//
//   getByCategory(category: BlockCategory): BlockTypeInfo[] {
//     return this.getAll().filter(info => info.category === category);
//   }
//
//   search(query: string): BlockTypeInfo[] {
//     const lowerQuery = query.toLowerCase();
//     return this.getAll().filter(info =>
//       info.type.toLowerCase().includes(lowerQuery) ||
//       info.label.toLowerCase().includes(lowerQuery) ||
//       info.description.toLowerCase().includes(lowerQuery) ||
//       info.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
//     );
//   }
//
//   getCategories(): BlockCategory[] {
//     return ['Time', 'Domain', 'Constants', 'Field Operations', 'Rendering', 'Math', 'Color'];
//   }
// }
//
// const registry = new BlockTypeRegistry();
//
// // =============================================================================
// // Block Type Definitions
// // =============================================================================
//
// // Time blocks
// registry.register({
//   type: 'InfiniteTimeRoot',
//   label: 'Infinite Time Root',
//   category: 'Time',
//   description: 'Continuous time source with dual-phase output (phaseA, phaseB)',
//   inputs: [],
//   outputs: [
//     { id: 'phaseA', label: 'Phase A', typeStr: 'Signal<phase>' },
//     { id: 'phaseB', label: 'Phase B', typeStr: 'Signal<phase>' },
//   ],
//   tags: ['time', 'phase', 'animation'],
// });
//
// registry.register({
//   type: 'FiniteTimeRoot',
//   label: 'Finite Time Root',
//   category: 'Time',
//   description: 'Time source with finite duration',
//   inputs: [],
//   outputs: [
//     { id: 'phaseA', label: 'Phase A', typeStr: 'Signal<phase>' },
//     { id: 'phaseB', label: 'Phase B', typeStr: 'Signal<phase>' },
//   ],
//   tags: ['time', 'phase', 'finite'],
// });
//
// // Domain blocks
// registry.register({
//   type: 'DomainN',
//   label: 'Domain N',
//   category: 'Domain',
//   description: 'N-element domain with fixed count',
//   inputs: [],
//   outputs: [
//     { id: 'domain', label: 'Domain', typeStr: 'Static<domain>' },
//     { id: 'rand', label: 'Random', typeStr: 'Field<float>' },
//   ],
//   tags: ['domain', 'particles', 'elements'],
// });
//
// registry.register({
//   type: 'GridDomain',
//   label: 'Grid Domain',
//   category: 'Domain',
//   description: '2D grid domain with rows and columns',
//   inputs: [],
//   outputs: [
//     { id: 'domain', label: 'Domain', typeStr: 'Static<domain>' },
//     { id: 'pos', label: 'Position', typeStr: 'Field<vec2>' },
//   ],
//   tags: ['domain', 'grid', '2d'],
// });
//
// // Constants
// registry.register({
//   type: 'ConstFloat',
//   label: 'Const Float',
//   category: 'Constants',
//   description: 'Constant floating-point value',
//   inputs: [],
//   outputs: [
//     { id: 'out', label: 'Value', typeStr: 'Signal<float>' },
//   ],
//   tags: ['constant', 'number', 'float'],
// });
//
// // Field Operations
// registry.register({
//   type: 'FieldFromDomainId',
//   label: 'Field From Domain ID',
//   category: 'Field Operations',
//   description: 'Generate field from element IDs (normalized 0..1)',
//   inputs: [
//     { id: 'domain', label: 'Domain', typeStr: 'Static<domain>' },
//   ],
//   outputs: [
//     { id: 'id01', label: 'ID (0..1)', typeStr: 'Field<float>' },
//   ],
//   tags: ['field', 'domain', 'id'],
// });
//
// registry.register({
//   type: 'FieldPulse',
//   label: 'Field Pulse',
//   category: 'Field Operations',
//   description: 'Per-element pulsing animation with phase offset',
//   inputs: [
//     { id: 'phase', label: 'Phase', typeStr: 'Signal<phase>' },
//     { id: 'id01', label: 'ID', typeStr: 'Field<float>' },
//     { id: 'base', label: 'Base', typeStr: 'Signal<float>' },
//     { id: 'amplitude', label: 'Amplitude', typeStr: 'Signal<float>' },
//     { id: 'spread', label: 'Spread', typeStr: 'Signal<float>' },
//   ],
//   outputs: [
//     { id: 'value', label: 'Value', typeStr: 'Field<float>' },
//   ],
//   tags: ['field', 'pulse', 'animation'],
// });
//
// registry.register({
//   type: 'FieldAdd',
//   label: 'Field Add',
//   category: 'Field Operations',
//   description: 'Add two fields element-wise',
//   inputs: [
//     { id: 'a', label: 'A', typeStr: 'Field<float>' },
//     { id: 'b', label: 'B', typeStr: 'Field<float>' },
//   ],
//   outputs: [
//     { id: 'out', label: 'Result', typeStr: 'Field<float>' },
//   ],
//   tags: ['field', 'math', 'add'],
// });
//
// registry.register({
//   type: 'FieldGoldenAngle',
//   label: 'Field Golden Angle',
//   category: 'Field Operations',
//   description: 'Generate angles using golden ratio for even distribution',
//   inputs: [
//     { id: 'id01', label: 'ID', typeStr: 'Field<float>' },
//   ],
//   outputs: [
//     { id: 'angle', label: 'Angle', typeStr: 'Field<phase>' },
//   ],
//   tags: ['field', 'angle', 'golden', 'distribution'],
// });
//
// registry.register({
//   type: 'FieldAngularOffset',
//   label: 'Field Angular Offset',
//   category: 'Field Operations',
//   description: 'Add angular offset based on phase and spin',
//   inputs: [
//     { id: 'phase', label: 'Phase', typeStr: 'Signal<phase>' },
//     { id: 'id01', label: 'ID', typeStr: 'Field<float>' },
//     { id: 'spin', label: 'Spin', typeStr: 'Signal<float>' },
//   ],
//   outputs: [
//     { id: 'offset', label: 'Offset', typeStr: 'Field<phase>' },
//   ],
//   tags: ['field', 'angle', 'rotation'],
// });
//
// registry.register({
//   type: 'FieldRadiusSqrt',
//   label: 'Field Radius Sqrt',
//   category: 'Field Operations',
//   description: 'Square root distribution for even area coverage',
//   inputs: [
//     { id: 'id01', label: 'ID', typeStr: 'Field<float>' },
//     { id: 'radius', label: 'Radius', typeStr: 'Field<float>' },
//   ],
//   outputs: [
//     { id: 'radius', label: 'Radius', typeStr: 'Field<float>' },
//   ],
//   tags: ['field', 'radius', 'distribution'],
// });
//
// registry.register({
//   type: 'FieldPolarToCartesian',
//   label: 'Field Polar To Cartesian',
//   category: 'Field Operations',
//   description: 'Convert polar coordinates (angle, radius) to Cartesian (x, y)',
//   inputs: [
//     { id: 'centerX', label: 'Center X', typeStr: 'Signal<float>' },
//     { id: 'centerY', label: 'Center Y', typeStr: 'Signal<float>' },
//     { id: 'angle', label: 'Angle', typeStr: 'Field<phase>' },
//     { id: 'radius', label: 'Radius', typeStr: 'Field<float>' },
//   ],
//   outputs: [
//     { id: 'pos', label: 'Position', typeStr: 'Field<vec2>' },
//   ],
//   tags: ['field', 'polar', 'cartesian', 'convert'],
// });
//
// registry.register({
//   type: 'FieldJitter2D',
//   label: 'Field Jitter 2D',
//   category: 'Field Operations',
//   description: 'Add random jitter to 2D positions',
//   inputs: [
//     { id: 'pos', label: 'Position', typeStr: 'Field<vec2>' },
//     { id: 'rand', label: 'Random', typeStr: 'Field<float>' },
//     { id: 'amountX', label: 'Amount X', typeStr: 'Signal<float>' },
//     { id: 'amountY', label: 'Amount Y', typeStr: 'Signal<float>' },
//   ],
//   outputs: [
//     { id: 'pos', label: 'Position', typeStr: 'Field<vec2>' },
//   ],
//   tags: ['field', 'jitter', 'random', '2d'],
// });
//
// // Color blocks
// registry.register({
//   type: 'FieldHueFromPhase',
//   label: 'Field Hue From Phase',
//   category: 'Color',
//   description: 'Generate hue values from phase and ID',
//   inputs: [
//     { id: 'phase', label: 'Phase', typeStr: 'Signal<phase>' },
//     { id: 'id01', label: 'ID', typeStr: 'Field<float>' },
//   ],
//   outputs: [
//     { id: 'hue', label: 'Hue', typeStr: 'Field<float>' },
//   ],
//   tags: ['color', 'hue', 'rainbow'],
// });
//
// registry.register({
//   type: 'HsvToRgb',
//   label: 'HSV to RGB',
//   category: 'Color',
//   description: 'Convert HSV color to RGB',
//   inputs: [
//     { id: 'hue', label: 'Hue', typeStr: 'Field<float>' },
//     { id: 'sat', label: 'Saturation', typeStr: 'Signal<float>' },
//     { id: 'val', label: 'Value', typeStr: 'Signal<float>' },
//   ],
//   outputs: [
//     { id: 'color', label: 'Color', typeStr: 'Field<color>' },
//   ],
//   tags: ['color', 'hsv', 'rgb', 'convert'],
// });
//
// // Rendering
// registry.register({
//   type: 'RenderInstances2D',
//   label: 'Render Instances 2D',
//   category: 'Rendering',
//   description: 'Render 2D instances (particles, sprites)',
//   inputs: [
//     { id: 'domain', label: 'Domain', typeStr: 'Static<domain>' },
//     { id: 'pos', label: 'Position', typeStr: 'Field<vec2>' },
//     { id: 'color', label: 'Color', typeStr: 'Field<color>' },
//     { id: 'size', label: 'Size', typeStr: 'Field<float>' },
//   ],
//   outputs: [],
//   tags: ['render', '2d', 'particles', 'instances'],
// });
//
// // =============================================================================
// // Export
// // =============================================================================
//
// export const blockTypeRegistry = registry;
//
// /**
//  * Get all block types.
//  */
// export function getAllBlockTypes(): BlockTypeInfo[] {
//   return registry.getAll();
// }
//
// /**
//  * Get block types by category.
//  */
// export function getBlockTypesByCategory(category: BlockCategory): BlockTypeInfo[] {
//   return registry.getByCategory(category);
// }
//
// /**
//  * Get block type info.
//  */
// export function getBlockTypeInfo(type: string): BlockTypeInfo | undefined {
//   return registry.get(type);
// }
//
// /**
//  * Search block types.
//  */
// export function searchBlockTypes(query: string): BlockTypeInfo[] {
//   return registry.search(query);
// }
//
// /**
//  * Get all categories.
//  */
// export function getBlockCategories(): BlockCategory[] {
//   return registry.getCategories();
// }
