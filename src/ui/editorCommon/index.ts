/**
 * Editor Common Module Exports
 *
 * Generic abstractions for editor implementations.
 * Allows UI components to work with any editor (Rete, ReactFlow, etc.)
 * through a consistent interface.
 */

export type { EditorHandle } from './EditorHandle';
export { EditorProvider, useEditor } from './EditorContext';
