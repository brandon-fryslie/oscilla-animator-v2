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

export class ViewportStore {
  // Observable state
  pan: Pan = { x: 0, y: 0 };
  zoom: number = 1.0;

  constructor() {
    makeObservable(this, {
      pan: observable,
      zoom: observable,
      setPan: action,
      setZoom: action,
      panBy: action,
      zoomBy: action,
      resetView: action,
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
}
