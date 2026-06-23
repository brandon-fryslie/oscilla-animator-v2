/**
 * TestPreviewPanel — Full-viewport canvas OR error display for test automation.
 *
 * Bypasses Dockview entirely. Zero chrome.
 * - No errors: shows the canvas (animation renders here)
 * - Errors: opaque overlay with error text (canvas stays mounted underneath)
 *
 * [LAW:one-source-of-truth] Compilation errors come from DiagnosticsStore.
 */

import React, { useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../stores';

interface TestPreviewPanelProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const TestPreviewPanel: React.FC<TestPreviewPanelProps> = observer(({ onCanvasReady }) => {
  const { diagnostics, viewport } = useStores();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (canvasRef.current && !notifiedRef.current && onCanvasReady) {
      notifiedRef.current = true;
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  // Set canvas buffer once on mount — 1:1 square fitted to viewport.
  // No ResizeObserver: setting canvas.width/height clears the buffer,
  // which causes visible jitter if it fires during animation.
  // The viewport is static during test automation.
  const sizedRef = useRef(false);
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || sizedRef.current) return;

    const { width: cw, height: ch } = container.getBoundingClientRect();
    const size = Math.floor(Math.min(cw, ch));
    if (size > 0) {
      sizedRef.current = true;
      canvas.width = size;
      canvas.height = size;
      viewport.setCanvasDimensions(size, size);
    }
  }, [viewport]);

  const errors = diagnostics.logs.filter(e => e.level === 'error');
  const hasErrors = errors.length > 0;

  return (
    <div ref={containerRef} style={{
      width: '100vw',
      height: '100vh',
      position: 'relative',
      background: '#1a1a2e',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Canvas always mounted — RuntimeService attaches to it regardless of error state */}
      <canvas
        ref={canvasRef}
        data-testid="preview-canvas"
        style={{ display: 'block' }}
      />
      {hasErrors && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: '#1a1a2e',
          color: '#ff6b6b',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.5,
          padding: 24,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
        }}>
          {errors.map((e, i) => <div key={i}>{e.message}</div>)}
        </div>
      )}
    </div>
  );
});
