/**
 * Canvas Tab Component
 *
 * Manages the canvas element for 2D rendering.
 * Exposes canvas ref to parent for animation loop integration.
 * Auto-scales canvas to fill container while maintaining animation centering.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../../stores';

interface CanvasTabProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}

// Target aspect ratio (1:1 square)
const TARGET_ASPECT_RATIO = 1;

export const CanvasTab: React.FC<CanvasTabProps> = observer(({ onCanvasReady }) => {
  const { viewport } = useStores();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Resize canvas to fit container while maintaining aspect ratio
  const updateCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Get container dimensions
    const rect = container.getBoundingClientRect();
    const containerWidth = Math.floor(rect.width);
    const containerHeight = Math.floor(rect.height);

    if (containerWidth <= 0 || containerHeight <= 0) return;

    // Calculate canvas size that fits container while maintaining aspect ratio
    const containerAspect = containerWidth / containerHeight;
    let width: number;
    let height: number;

    if (containerAspect > TARGET_ASPECT_RATIO) {
      // Container is wider than target - fit to height, letterbox sides
      height = containerHeight;
      width = Math.floor(height * TARGET_ASPECT_RATIO);
    } else {
      // Container is taller than target - fit to width, letterbox top/bottom
      width = containerWidth;
      height = Math.floor(width / TARGET_ASPECT_RATIO);
    }

    // Only update if size actually changed (avoid unnecessary re-renders)
    if (width !== canvasSize.width || height !== canvasSize.height) {
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
      const newZoom = Math.max(0.1, Math.min(10, viewport.zoom * zoomFactor));

      const dx = mouseX - canvas.width / 2;
      const dy = mouseY - canvas.height / 2;

      viewport.panBy(
        (dx * (1 - zoomFactor)) / viewport.zoom,
        (dy * (1 - zoomFactor)) / viewport.zoom
      );

      viewport.setZoom(newZoom);
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
      viewport.panBy(dx / viewport.zoom, dy / viewport.zoom);
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
      viewport.resetView();
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
  }, [viewport]);

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
