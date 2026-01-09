/**
 * PatchViewer - Renders Patch graphs as Mermaid diagrams
 *
 * Manages the rendering of a Patch to a DOM element using Mermaid.js.
 */

import mermaid from 'mermaid';
import type { Patch } from '../graph/Patch';
import { patchToMermaid } from './patch-to-mermaid';

let mermaidInitialized = false;

export class PatchViewer {
  private renderCount = 0;

  constructor(private container: HTMLElement) {
    // Initialize Mermaid once globally
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        flowchart: {
          curve: 'basis',
          padding: 20,
          nodeSpacing: 100,
          rankSpacing: 100,
          useMaxWidth: true,
        },
        themeVariables: {
          // Dark theme colors matching the app
          primaryColor: '#16213e',
          primaryTextColor: '#eee',
          primaryBorderColor: '#0f3460',
          lineColor: '#4ecdc4',
          secondaryColor: '#1a1a2e',
          tertiaryColor: '#0f0f23',
        },
      });
      mermaidInitialized = true;
    }
  }

  /**
   * Render a patch as a Mermaid diagram.
   * Clears previous content and renders new diagram.
   */
  async render(patch: Patch): Promise<void> {
    try {
      // Convert patch to mermaid syntax
      const mermaidCode = patchToMermaid(patch);

      // Generate unique ID for this render
      const diagramId = `mermaid-diagram-${this.renderCount++}`;

      // Clear container
      this.container.innerHTML = '';

      // Create a div for the diagram
      const diagramDiv = document.createElement('div');
      diagramDiv.className = 'mermaid-container';
      this.container.appendChild(diagramDiv);

      // Render with mermaid
      const { svg } = await mermaid.render(diagramId, mermaidCode);

      // Insert SVG
      diagramDiv.innerHTML = svg;

      // Make SVG responsive
      const svgEl = diagramDiv.querySelector('svg');
      if (svgEl) {
        svgEl.style.maxWidth = '100%';
        svgEl.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to render Mermaid diagram:', error);
      this.container.innerHTML = `
        <div style="color: #ff6b6b; padding: 1rem;">
          <strong>Failed to render patch diagram</strong>
          <pre style="margin-top: 0.5rem; font-size: 0.75rem;">${error instanceof Error ? error.message : String(error)}</pre>
        </div>
      `;
    }
  }
}
