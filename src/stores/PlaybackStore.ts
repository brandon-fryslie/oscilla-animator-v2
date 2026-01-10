/**
 * PlaybackStore - Time and Playback State
 *
 * Stores runtime playback state (time, speed, playing state).
 * Independent of other stores - no dependencies.
 */

import { makeObservable, observable, action } from 'mobx';

export class PlaybackStore {
  // Observable state
  time: number = 0;
  isPlaying: boolean = false;
  speed: number = 1.0;
  seed: number = 0;

  constructor() {
    makeObservable(this, {
      time: observable,
      isPlaying: observable,
      speed: observable,
      seed: observable,
      play: action,
      pause: action,
      togglePlayPause: action,
      setSpeed: action,
      setSeed: action,
      setTime: action,
      reset: action,
    });
  }

  // =============================================================================
  // Actions
  // =============================================================================

  /**
   * Starts playback.
   */
  play(): void {
    this.isPlaying = true;
  }

  /**
   * Pauses playback.
   */
  pause(): void {
    this.isPlaying = false;
  }

  /**
   * Toggles play/pause state.
   */
  togglePlayPause(): void {
    this.isPlaying = !this.isPlaying;
  }

  /**
   * Sets playback speed multiplier.
   */
  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(10, speed));
  }

  /**
   * Sets random seed for procedural generation.
   */
  setSeed(seed: number): void {
    this.seed = seed;
  }

  /**
   * Sets current time.
   */
  setTime(time: number): void {
    this.time = Math.max(0, time);
  }

  /**
   * Resets playback state to defaults.
   */
  reset(): void {
    this.time = 0;
    this.isPlaying = false;
    this.speed = 1.0;
  }
}
