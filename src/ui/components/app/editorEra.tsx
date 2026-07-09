/**
 * EditorEra — the one value that captures everything that differs by boot era.
 *
 * The editor no longer knows which era it renders: `resolveEditorEra(boot)` picks
 * a single value carrying the era's block catalog, its selection-detail factory,
 * and its shell component; App reads that value and mounts it. There is no
 * `if (era === 'v1')` at the mount site — the era IS the value. [LAW:dataflow-not-control-flow]
 *
 * The two shells share EditorWorkspace (Toolbar + Dockview). They differ only in
 * era-specific CHROME that is genuinely model-bound: the V1 shell wires the flow
 * editor's imperative handle to the global hotkeys (which act on the V1 PatchStore)
 * and the composite-editor tab; the scene shell mounts the workspace bare, because
 * scene hotkeys (editor-ux .8) and their handle plumbing are not yet built and a
 * V1-store hotkey would silently no-op on a pillar selection. [LAW:no-silent-failure]
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BootSelection } from '../../../testing/test-params';
import type { RootStore } from '../../../stores';
import { EditorProvider, type EditorHandle, useEditor } from '../../editorCommon';
import { useGlobalHotkeys, type HotkeyFeedback } from '../../hotkeys';
import type { BlockCatalog } from '../../graphEditor/block-catalog';
import type { SelectionDetail } from '../../graphEditor/selection-detail';
import { v1BlockCatalog } from '../../graphEditor/V1BlockCatalog';
import { sceneBlockCatalog } from '../../graphEditor/SceneBlockCatalog';
import { V1SelectionDetail } from '../../graphEditor/V1SelectionDetail';
import { SceneSelectionDetail } from '../../graphEditor/SceneSelectionDetail';
import { v1LayoutPolicy, sceneLayoutPolicy } from '../../dockview/layoutPolicies';
import { Toast } from '../common/Toast';
import { EditorWorkspace } from './EditorWorkspace';
import { EngineDebugOverlay } from './EngineDebugOverlay';

export interface EditorShellProps {
  stats: string;
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export interface EditorEra {
  readonly id: 'v1' | 'scene';
  readonly blockCatalog: BlockCatalog;
  readonly makeSelectionDetail: (store: RootStore) => SelectionDetail;
  readonly Shell: React.FC<EditorShellProps>;
}

// ─── V1 shell ────────────────────────────────────────────────────────────────

/**
 * Registers global hotkeys. Must be inside EditorProvider.
 */
const GlobalHotkeys: React.FC<{ onFeedback: (feedback: HotkeyFeedback) => void }> = ({ onFeedback }) => {
  useGlobalHotkeys({ onFeedback });
  return null;
};

/**
 * Captures EditorContext methods so the App-level handle wiring can push the
 * active editor's imperative handle into the context. [LAW:single-enforcer]
 */
const EditorContextCapture: React.FC<{
  contextRef: React.MutableRefObject<{ setEditorHandle: (handle: EditorHandle | null) => void } | null>;
  onReady?: (ready: boolean) => void;
}> = ({ contextRef, onReady }) => {
  const { setEditorHandle } = useEditor();

  useEffect(() => {
    contextRef.current = { setEditorHandle };
    onReady?.(true);
    return () => {
      contextRef.current = null;
      onReady?.(false);
    };
  }, [contextRef, onReady, setEditorHandle]);

  return null;
};

const V1EditorShell: React.FC<EditorShellProps> = ({ stats, onCanvasReady }) => {
  const reactFlowHandleRef = useRef<EditorHandle | null>(null);
  const editorContextRef = useRef<{ setEditorHandle: (handle: EditorHandle | null) => void } | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<'flow-editor' | 'composite-editor' | null>('flow-editor');
  const [editorReady, setEditorReady] = useState(false);
  const [editorContextReady, setEditorContextReady] = useState(false);

  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success');

  const handleEditorContextReady = useCallback((ready: boolean) => {
    setEditorContextReady(ready);
  }, []);

  const handleReactFlowEditorReady = useCallback((adapter: EditorHandle) => {
    reactFlowHandleRef.current = adapter;
    setEditorReady(true);
    if (activeEditorTab === 'flow-editor') {
      editorContextRef.current?.setEditorHandle(adapter);
    }
  }, [activeEditorTab]);

  const handleActivePanelChange = useCallback((panelId: string | undefined) => {
    if (panelId === 'flow-editor') {
      setActiveEditorTab('flow-editor');
    } else if (panelId === 'composite-editor') {
      // CompositeEditor manages its own EditorHandle via useEditor()
      setActiveEditorTab('composite-editor');
    }
  }, []);

  // Update EditorContext when active editor changes or editor becomes ready.
  useEffect(() => {
    if (!editorContextReady || !editorContextRef.current) return;

    if (activeEditorTab === 'flow-editor' && editorReady) {
      editorContextRef.current.setEditorHandle(reactFlowHandleRef.current);
    }
    // composite-editor sets its own handle — don't interfere.
  }, [activeEditorTab, editorReady, editorContextReady]);

  const handleHotkeyFeedback = useCallback((feedback: HotkeyFeedback) => {
    setToastMessage(feedback.message);
    setToastSeverity(feedback.severity);
    setToastOpen(true);
  }, []);

  return (
    <EditorProvider>
      <EditorContextCapture contextRef={editorContextRef} onReady={handleEditorContextReady} />
      <GlobalHotkeys onFeedback={handleHotkeyFeedback} />

      <EditorWorkspace
        stats={stats}
        policy={v1LayoutPolicy}
        onCanvasReady={onCanvasReady}
        onReactFlowEditorReady={handleReactFlowEditorReady}
        onActivePanelChange={handleActivePanelChange}
      />

      <Toast
        open={toastOpen}
        message={toastMessage}
        severity={toastSeverity}
        onClose={() => setToastOpen(false)}
      />
      <EngineDebugOverlay />
    </EditorProvider>
  );
};

// ─── Scene (pillar) shell ──────────────────────────────────────────────────────

const SceneEditorShell: React.FC<EditorShellProps> = ({ stats, onCanvasReady }) => (
  <>
    <EditorWorkspace
      stats={stats}
      policy={sceneLayoutPolicy}
      patchMenuEnabled={false}
      onCanvasReady={onCanvasReady}
    />
    <EngineDebugOverlay />
  </>
);

// ─── Era selection ─────────────────────────────────────────────────────────────

const v1Era: EditorEra = {
  id: 'v1',
  blockCatalog: v1BlockCatalog,
  makeSelectionDetail: (store) => new V1SelectionDetail(store.patch, store.frontend),
  Shell: V1EditorShell,
};

const sceneEra: EditorEra = {
  id: 'scene',
  blockCatalog: sceneBlockCatalog,
  makeSelectionDetail: (store) => new SceneSelectionDetail(store.pillarPatch),
  Shell: SceneEditorShell,
};

/**
 * The default boot and the fixed-demo boot render the pillar patch; only the
 * explicit `?v1=true` opt-in selects the V1 era. This mirrors the runtime
 * dispatch in RuntimeService, which reads the same BootSelection. [LAW:one-source-of-truth]
 *
 * Note: `scene-plan-demo` keeps the V1 shell it had before this convergence — it
 * is a fixed steel-thread demo whose editing chrome is the V1 editor; only the
 * live `native-editor` surface moves to the pillar shell here.
 */
export function resolveEditorEra(boot: BootSelection): EditorEra {
  return boot.kind === 'native-editor' ? sceneEra : v1Era;
}
