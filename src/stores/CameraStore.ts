/**
 * CameraStore - MobX Store for 3D Preview Camera State
 *
 * Manages the viewer-only 3D projection toggle.
 * Two activation methods:
 * - Hold Shift (momentary)
 * - Toolbar button (persistent toggle)
 *
 * This is purely a viewer concern — it does NOT affect
 * compilation, runtime state, or continuity.
 */

import { makeAutoObservable, computed } from 'mobx';

export class CameraStore {
  /** True while Shift key is held down (momentary preview) */
  isShiftHeld = false;

  /** True when toolbar button is toggled on (persistent preview) */
  isToggled = false;

  constructor() {
    makeAutoObservable(this, {
      isActive: computed,
    });
  }

  /** Whether 3D preview is currently active (either shift-held or toggled) */
  get isActive(): boolean {
    return this.isShiftHeld || this.isToggled;
  }

  setShiftHeld(held: boolean): void {
    this.isShiftHeld = held;
  }

  toggle(): void {
    this.isToggled = !this.isToggled;
  }
}
