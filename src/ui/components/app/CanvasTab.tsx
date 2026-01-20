/**
 * Canvas Tab Component
 *
 * Manages the canvas element for 2D rendering.
 * Exposes canvas ref to parent for animation loop integration.
 * Auto-scales canvas to fill container while maintaining animation centering.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { rootStore } from '../../../stores';

interface CanvasTabProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

export const CanvasTab: React.FC<CanvasTabProps> = observer(({ onCanvasReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Resize canvas to match container
  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Get container dimensions (account for any padding)
    const rect = container.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    // Only update if size actually changed (avoid unnecessary re-renders)
    if (width > 0 && height > 0 && (width !== canvasSize.width || height !== canvasSize.height)) {
      setCanvasSize({ width, height });
      // Update canvas element dimensions directly for immediate effect
      canvas.width = width;
      canvas.height = height;
    }
  }, [canvasSize.width, canvasSize.height]);

  // Set up ResizeObserver to track container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });

    resizeObserver.observe(container);

    // Initial size update
    updateCanvasSize();

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateCanvasSize]);

  // Notify parent when canvas is ready
  useEffect(() => {
    if (canvasRef.current && onCanvasReady) {
      onCanvasReady(canvasRef.current);
    }
  }, [onCanvasReady]);

  // Set up mouse interactions for pan/zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse wheel zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, rootStore.viewport.zoom * zoomFactor));

      const dx = mouseX - canvas.width / 2;
      const dy = mouseY - canvas.height / 2;

      rootStore.viewport.panBy(
        (dx * (1 - zoomFactor)) / rootStore.viewport.zoom,
        (dy * (1 - zoomFactor)) / rootStore.viewport.zoom
      );

      rootStore.viewport.setZoom(newZoom);
    };

    // Mouse drag pan
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      rootStore.viewport.panBy(dx / rootStore.viewport.zoom, dy / rootStore.viewport.zoom);
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    const handleMouseLeave = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
    };

    // Double-click to reset view
    const handleDoubleClick = () => {
      rootStore.viewport.resetView();
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('dblclick', handleDoubleClick);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('dblclick', handleDoubleClick);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f0f23',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          cursor: 'grab',
        }}
      />
    </div>
  );
});
