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

    // If center is provided, adjust pan to zoom towards that point
    if (centerX !== undefined && centerY !== undefined) {
      const zoomChange = newZoom / oldZoom;
      this.pan = {
        x: centerX - (centerX - this.pan.x) * zoomChange,
        y: centerY - (centerY - this.pan.y) * zoomChange,
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
   * Uses stored canvas dimensions and content bounds (in normalized [0,1] space).
   */
  zoomToFit(padding: number = 0.9): void {
    if (!this.contentBounds) {
      // No content bounds available - just reset to default view
      this.resetView();
      return;
    }

    const bounds = this.contentBounds;
    // Bounds are in normalized [0,1] space
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;

    // Handle empty or zero-size content
    if (contentWidth <= 0 || contentHeight <= 0) {
      this.resetView();
      return;
    }

    // Calculate how much to zoom to fill the viewport
    // We want content to fill 'padding' fraction of the viewport (default 90%)
    const zoomX = (this.canvasWidth * padding) / (contentWidth * this.canvasWidth);
    const zoomY = (this.canvasHeight * padding) / (contentHeight * this.canvasHeight);
    const newZoom = Math.min(zoomX, zoomY);

    // Clamp zoom to valid range
    const clampedZoom = Math.max(0.1, Math.min(10, newZoom));

    // Calculate center of content in normalized space
    const contentCenterNormX = (bounds.minX + bounds.maxX) / 2;
    const contentCenterNormY = (bounds.minY + bounds.maxY) / 2;

    // Convert to world pixels
    const contentCenterPxX = contentCenterNormX * this.canvasWidth;
    const contentCenterPxY = contentCenterNormY * this.canvasHeight;

    // Calculate pan to center the content
    // Pan moves the center of the canvas to align with content center
    const newPanX = this.canvasWidth / 2 - contentCenterPxX;
    const newPanY = this.canvasHeight / 2 - contentCenterPxY;

    // Apply zoom and pan
    this.zoom = clampedZoom;
    this.pan = { x: newPanX, y: newPanY };
  }
}
