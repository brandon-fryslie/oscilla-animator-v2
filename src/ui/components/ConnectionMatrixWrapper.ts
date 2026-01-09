/**
 * Connection Matrix Wrapper
 *
 * Wrapper for the React ConnectionMatrix component to integrate with vanilla TypeScript UI.
 */

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { ConnectionMatrix } from './ConnectionMatrix';
import type { Patch } from '../../graph/Patch';

/**
 * Wrapper class to use React ConnectionMatrix component in vanilla TypeScript.
 */
export class ConnectionMatrixWrapper {
  private container: HTMLElement;
  private reactRoot: Root | null = null;
  private patch: Patch | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  /**
   * Set the patch to display.
   */
  setPatch(patch: Patch): void {
    this.patch = patch;
    this.render();
  }

  /**
   * Render the React component.
   */
  private render(): void {
    // Create React root if not exists
    if (!this.reactRoot) {
      this.reactRoot = createRoot(this.container);
    }

    // Render the React component
    this.reactRoot.render(
      createElement(ConnectionMatrix, { patch: this.patch })
    );
  }

  /**
   * Destroy the component and cleanup.
   */
  destroy(): void {
    if (this.reactRoot) {
      this.reactRoot.unmount();
      this.reactRoot = null;
    }
    this.container.innerHTML = '';
  }
}
