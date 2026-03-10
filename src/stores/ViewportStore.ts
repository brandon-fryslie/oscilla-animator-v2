/**
 * ViewportStore - Pan/Zoom State
 *
 * Stores viewport transformation state for the graph canvas.
 * Independent of other stores - no dependencies.
 */

import { makeObservable, observable, action } from 'mobx';

export interface Pan {
  x: number;
  y: number;
}

export interface ContentBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class ViewportStore {
  // Observable state
  pan: Pan = { x: 0, y: 0 };
  zoom: number = 1.0;
  canvasWidth: number = 800;
  canvasHeight: number = 800;
  contentBounds: ContentBounds | null = null;

  constructor() {
    makeObservable(this, {
      pan: observable,
      zoom: observable,
      canvasWidth: observable,
      canvasHeight: observable,
      contentBounds: observable,
      setPan: action,
      setZoom: action,
      panBy: action,
      zoomBy: action,
      resetView: action,
      setCanvasDimensions: action,
      setContentBounds: action,
      zoomToFit: action,
    });
  }

  // =============================================================================
  // Actions
  // =============================================================================

  /**
   * Sets absolute pan position.
   */
  setPan(x: number, y: number): void {
    this.pan = { x, y };
  }

  /**
   * Sets absolute zoom level.
   */
  setZoom(zoom: number): void {
    this.zoom = Math.max(0.1, Math.min(10, zoom));
  }

  /**
   * Pans by relative offset.
   */
  panBy(dx: number, dy: number): void {
    this.pan = {
      x: this.pan.x + dx,
      y: this.pan.y + dy,
    };
  }

  /**
   * Zooms by factor, optionally centered on a point.
   */
  zoomBy(factor: number, centerX?: number, centerY?: number): void {
    const oldZoom = this.zoom;
    const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));

    // [LAW:one-source-of-truth] Viewport world-space is zero-centered; with
    // zoom=1 the visible world span is [-1,1] per axis, so zoom anchoring must
    // preserve the world point under the chosen screen pixel.
    if (centerX !== undefined && centerY !== undefined) {
      const halfWidth = this.canvasWidth * 0.5;
      const halfHeight = this.canvasHeight * 0.5;
      const invOldZoom = 1 / oldZoom;
      const invNewZoom = 1 / newZoom;
      this.pan = {
        x: this.pan.x + (centerX - halfWidth) * (invNewZoom - invOldZoom),
        y: this.pan.y + (centerY - halfHeight) * (invNewZoom - invOldZoom),
      };
    }

    this.zoom = newZoom;
  }

  /**
   * Resets view to default state.
   */
  resetView(): void {
    this.pan = { x: 0, y: 0 };
    this.zoom = 1.0;
  }

  /**
   * Sets canvas dimensions (called by CanvasTab on resize).
   */
  setCanvasDimensions(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  /**
   * Sets content bounds (called by AnimationLoop after rendering).
   */
  setContentBounds(bounds: ContentBounds | null): void {
    this.contentBounds = bounds;
  }

  /**
   * Zooms and pans to fit all content in view with padding.
   * Uses stored canvas dimensions and content bounds in zero-centered world space.
   */
  zoomToFit(padding: number = 0.9): void {
    if (!this.contentBounds) {
      // No content bounds available - just reset to default view
      this.resetView();
      return;
    }

    const bounds = this.contentBounds;
    // Bounds are in world space (zero-centered, clip-like range at zoom=1)
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;

    // Handle empty or zero-size content
    if (contentWidth <= 0 || contentHeight <= 0) {
      this.resetView();
      return;
    }

    // [LAW:one-source-of-truth] At zoom=1 visible world span is 2 units per axis,
    // so fit-zoom is derived from that canonical span.
    const zoomX = (2 * padding) / contentWidth;
    const zoomY = (2 * padding) / contentHeight;
    const newZoom = Math.min(zoomX, zoomY);

    // Clamp zoom to valid range
    const clampedZoom = Math.max(0.1, Math.min(10, newZoom));

    // Pan is stored in pre-zoom pixel units; center world coord c maps to
    // center screen when pan = -(c * viewportPx/2).
    const contentCenterWorldX = (bounds.minX + bounds.maxX) / 2;
    const contentCenterWorldY = (bounds.minY + bounds.maxY) / 2;
    const newPanX = -contentCenterWorldX * this.canvasWidth * 0.5;
    const newPanY = -contentCenterWorldY * this.canvasHeight * 0.5;

    // Apply zoom and pan
    this.zoom = clampedZoom;
    this.pan = { x: newPanX, y: newPanY };
  }
}
