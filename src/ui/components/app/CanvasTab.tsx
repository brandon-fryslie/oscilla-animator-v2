/**
 * Canvas Tab Component
 *
 * Manages the canvas element for 2D rendering.
 * Exposes canvas ref to parent for animation loop integration.
 * Auto-scales canvas to fill container while maintaining animation centering.
 * Writes mouse input to external channels for runtime consumption.
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStores } from '../../../stores';
import type { ExternalWriteBus } from '../../../runtime/ExternalChannel';
import { ActionIcon, Tooltip } from '@mantine/core';
import { ZoomOutMap as ZoomOutMapIcon } from '@mui/icons-material';

interface CanvasTabProps {
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
  externalWriteBus?: ExternalWriteBus;
}

// Target aspect ratio (1:1 square)
const TARGET_ASPECT_RATIO = 1;

// Mouse smoothing lerp factor (matches legacy behavior)
const MOUSE_SMOOTHING_FACTOR = 0.05;

export const CanvasTab: React.FC<CanvasTabProps> = ({ onCanvasReady, externalWriteBus }) => {
  const { viewport } = useStores();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Mouse state for external channels
  const mouseStateRef = useRef({
    rawX: 0.5,
    rawY: 0.5,
    smoothX: 0.5,
    smoothY: 0.5,
    leftHeld: false,
    rightHeld: false,
    isOver: false,
  });

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
      // Update viewport store with new canvas dimensions
      viewport.setCanvasDimensions(width, height);
    }
  }, [canvasSize.width, canvasSize.height, viewport]);

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

  // Helper: normalize mouse position to [0,1] range
  const normalizeMousePosition = useCallback((e: MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  // Update smoothed mouse position and write to channels (called from rAF)
  const updateMouseChannels = useCallback(() => {
    if (!externalWriteBus) return;

    const state = mouseStateRef.current;

    // Apply smoothing (write-side only)
    state.smoothX += (state.rawX - state.smoothX) * MOUSE_SMOOTHING_FACTOR;
    state.smoothY += (state.rawY - state.smoothY) * MOUSE_SMOOTHING_FACTOR;

    // Write smoothed position to channels
    externalWriteBus.set('mouse.x', state.smoothX);
    externalWriteBus.set('mouse.y', state.smoothY);
    externalWriteBus.set('mouse.over', state.isOver ? 1 : 0);
  }, [externalWriteBus]);

  // Set up rAF loop for mouse channel updates
  useEffect(() => {
    if (!externalWriteBus) return;

    let rafId: number;
    const updateLoop = () => {
      updateMouseChannels();
      rafId = requestAnimationFrame(updateLoop);
    };
    rafId = requestAnimationFrame(updateLoop);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [updateMouseChannels, externalWriteBus]);

  // Set up mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Viewport pan/zoom state
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    // Mouse move - update raw position and handle pan
    const handleMouseMove = (e: MouseEvent) => {
      // Update raw mouse position for external channels
      const normalized = normalizeMousePosition(e, canvas);
      mouseStateRef.current.rawX = normalized.x;
      mouseStateRef.current.rawY = normalized.y;

      // Handle viewport panning
      if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        viewport.panBy(dx / viewport.zoom, dy / viewport.zoom);
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    // Mouse down - handle buttons for both viewport and external channels
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left button: viewport pan + external channel
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';

        // External channel: left button
        if (externalWriteBus) {
          mouseStateRef.current.leftHeld = true;
          externalWriteBus.pulse('mouse.button.left.down');
          externalWriteBus.set('mouse.button.left.held', 1);
        }
      } else if (e.button === 2) {
        // Right button: external channel only
        if (externalWriteBus) {
          mouseStateRef.current.rightHeld = true;
          externalWriteBus.pulse('mouse.button.right.down');
          externalWriteBus.set('mouse.button.right.held', 1);
        }
      }
    };

    // Mouse up - handle buttons
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        // Left button
        isDragging = false;
        canvas.style.cursor = 'grab';

        // External channel
        if (externalWriteBus) {
          mouseStateRef.current.leftHeld = false;
          externalWriteBus.pulse('mouse.button.left.up');
          externalWriteBus.set('mouse.button.left.held', 0);
        }
      } else if (e.button === 2) {
        // Right button
        if (externalWriteBus) {
          mouseStateRef.current.rightHeld = false;
          externalWriteBus.pulse('mouse.button.right.up');
          externalWriteBus.set('mouse.button.right.held', 0);
        }
      }
    };

    // Mouse enter - set over state
    const handleMouseEnter = () => {
      mouseStateRef.current.isOver = true;
    };

    // Mouse leave - clear drag and over state
    const handleMouseLeave = () => {
      isDragging = false;
      canvas.style.cursor = 'grab';
      mouseStateRef.current.isOver = false;
    };

    // Mouse wheel - viewport zoom + external channel
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      // Simple zoom without mouse-following
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, viewport.zoom * zoomFactor));

      viewport.setZoom(newZoom);

      // External channel: wheel delta (normalized)
      if (externalWriteBus) {
        // Normalize wheel delta (browsers report different units)
        let dx = e.deltaX;
        let dy = e.deltaY;

        // deltaMode: 0 = pixels, 1 = lines, 2 = pages
        if (e.deltaMode === 1) {
          // lines
          dx *= 20;
          dy *= 20;
        } else if (e.deltaMode === 2) {
          // pages
          dx *= 400;
          dy *= 400;
        }

        // Scale to reasonable range (divide by canvas size for normalization)
        dx /= canvas.width;
        dy /= canvas.height;

        externalWriteBus.add('mouse.wheel.dx', dx);
        externalWriteBus.add('mouse.wheel.dy', dy);
      }
    };

    // Double-click to reset view
    const handleDoubleClick = () => {
      viewport.resetView();
    };

    // Prevent context menu on right click
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Add event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDoubleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleDoubleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [viewport, externalWriteBus, normalizeMousePosition]);

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
        position: 'relative',
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

      {/* Zoom to fit button overlay */}
      <Tooltip label="Zoom to fit all content" position="left" withArrow>
        <ActionIcon
          variant="filled"
          color="violet"
          size="lg"
          onClick={() => viewport.zoomToFit()}
          style={{
            position: 'absolute',
            bottom: '16px',
            right: '16px',
            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.4)',
          }}
        >
          <ZoomOutMapIcon style={{ fontSize: 20 }} />
        </ActionIcon>
      </Tooltip>
    </div>
  );
};
