/**
 * src/ui/nativeEditor/NativeEditorLayout.tsx
 *
 * The native ScenePlan editor surface: the authoring panel on the left, the
 * auto-laid-out node-graph canvas in the center, and the live Three preview on
 * the right. Selected by `?scenePlan=editor`. The preview canvas is handed to
 * `RuntimeService` via `onCanvasReady`; the runtime drives it from the authored
 * patch in `PillarPatchStore` (see `startNativeEditorThread`).
 *
 * [LAW:locality-or-seam] This layout owns only DOM composition + preview-canvas
 *   sizing. It does not compile or install anything — that is the runtime's
 *   boundary — and the graph canvas reads the same authored patch independently.
 */

import React, { useEffect, useRef } from 'react';

import { NativeEditorPanel } from './NativeEditorPanel';
import { NativeGraphCanvas } from './NativeGraphCanvas';

interface NativeEditorLayoutProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const NativeEditorLayout: React.FC<NativeEditorLayoutProps> = ({ onCanvasReady }) => {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#0f0f17',
      }}
    >
      <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid #2a2a38' }}>
        <NativeEditorPanel />
      </div>
      <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid #2a2a38' }}>
        <NativeGraphCanvas />
      </div>
      <PreviewCanvas onCanvasReady={onCanvasReady} />
    </div>
  );
};

const PreviewCanvas: React.FC<NativeEditorLayoutProps> = ({ onCanvasReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notifiedRef = useRef(false);
  const sizedRef = useRef(false);

  // Size the canvas backing store once before the renderer reads it. The Three
  // device calls setSize(canvas.width, canvas.height); a 1:1 square fitted to the
  // pane keeps the grid demo's symmetric camera undistorted.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || sizedRef.current) return;
    const { width, height } = container.getBoundingClientRect();
    const size = Math.floor(Math.min(width, height));
    if (size > 0) {
      sizedRef.current = true;
      canvas.width = size;
      canvas.height = size;
    }
  }, []);

  // Hand the canvas to the runtime once it exists.
  useEffect(() => {
    if (canvasRef.current && !notifiedRef.current && onCanvasReady) {
      notifiedRef.current = true;
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a12',
        overflow: 'hidden',
      }}
    >
      <canvas ref={canvasRef} data-testid="native-editor-canvas" style={{ display: 'block' }} />
    </div>
  );
};
