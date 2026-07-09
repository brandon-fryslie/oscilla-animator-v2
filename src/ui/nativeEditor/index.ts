/**
 * src/ui/nativeEditor/index.ts
 *
 * Pillar-native editor panel BODIES. The hand-rolled layout (NativeEditorLayout
 * and its bespoke graph canvas) was retired in editor-ux .20 — both eras now
 * render the one dockview shell. What remains here are the two pillar-native
 * authoring surfaces (the block palette and the modulation table) that the
 * dockview scene panels host, plus the pure table model they read.
 */

export { NativeEditorPanel } from './NativeEditorPanel';
export { ModulationTablePanel } from './ModulationTablePanel';
