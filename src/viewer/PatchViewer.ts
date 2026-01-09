/**
 * PatchViewer - Renders Patch graphs as Mermaid diagrams
 *
 * Manages the rendering of a Patch to a DOM element using Mermaid.js.
 * Supports zoom, pan, and block inspection.
 */

import mermaid from 'mermaid';
import type { Patch, Block } from '../graph/Patch';
import { patchToMermaid } from './patch-to-mermaid';

let mermaidInitialized = false;

export class PatchViewer {
  private renderCount = 0;
  private currentPatch: Patch | null = null;
  private zoom = 0.25;  // Start zoomed out to see full diagram
  private panX = 0;
  private panY = 0;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private diagramContainer: HTMLElement | null = null;
  private onBlockClick: ((block: Block) => void) | null = null;

  constructor(private container: HTMLElement) {
    // Initialize Mermaid once globally
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        flowchart: {
          curve: 'basis',
          padding: 10,
          nodeSpacing: 50,
          rankSpacing: 60,
          useMaxWidth: false,
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
   * Set callback for when a block node is clicked.
   */
  setOnBlockClick(callback: (block: Block) => void) {
    this.onBlockClick = callback;
  }

  /**
   * Render a patch as a Mermaid diagram.
   * Clears previous content and renders new diagram.
   */
  async render(patch: Patch): Promise<void> {
    this.currentPatch = patch;

    try {
      // Convert patch to mermaid syntax
      const mermaidCode = patchToMermaid(patch);

      // Generate unique ID for this render
      const diagramId = `mermaid-diagram-${this.renderCount++}`;

      // Clear container
      this.container.innerHTML = '';

      // Create wrapper for zoom/pan - must fill container and clip content
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrapper';
      wrapper.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: hidden;
        cursor: grab;
      `;
      // Make container relative for absolute positioning
      this.container.style.position = 'relative';
      this.container.appendChild(wrapper);

      // Create a div for the diagram
      const diagramDiv = document.createElement('div');
      diagramDiv.className = 'mermaid-container';
      diagramDiv.style.cssText = `
        transform-origin: top left;
        transition: transform 0.1s ease-out;
      `;
      wrapper.appendChild(diagramDiv);
      this.diagramContainer = diagramDiv;

      // Render with mermaid
      const { svg } = await mermaid.render(diagramId, mermaidCode);

      // Insert SVG
      diagramDiv.innerHTML = svg;

      // Apply initial transform
      this.updateTransform();

      // Setup interaction handlers
      this.setupZoomPan(wrapper);
      this.setupClickHandling(diagramDiv);

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

  /**
   * Setup zoom and pan interactions.
   */
  private setupZoomPan(wrapper: HTMLElement) {
    // Mouse wheel zoom
    wrapper.addEventListener('wheel', (e) => {
      e.preventDefault();

      const rect = wrapper.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom factor
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(5, this.zoom * zoomFactor));

      // Adjust pan to zoom toward mouse position
      const dx = mouseX - this.panX;
      const dy = mouseY - this.panY;
      this.panX += dx * (1 - zoomFactor);
      this.panY += dy * (1 - zoomFactor);

      this.zoom = newZoom;
      this.updateTransform();
    }, { passive: false });

    // Mouse drag pan
    wrapper.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      wrapper.style.cursor = 'grabbing';
    });

    wrapper.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.panX += dx;
      this.panY += dy;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.updateTransform();
    });

    wrapper.addEventListener('mouseup', () => {
      this.isDragging = false;
      wrapper.style.cursor = 'grab';
    });

    wrapper.addEventListener('mouseleave', () => {
      this.isDragging = false;
      wrapper.style.cursor = 'grab';
    });

    // Double-click to reset view
    wrapper.addEventListener('dblclick', () => {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.updateTransform();
    });
  }

  /**
   * Setup click handling for block nodes.
   */
  private setupClickHandling(diagramDiv: HTMLElement) {
    // Find all nodes in the SVG and attach click handlers
    const svg = diagramDiv.querySelector('svg');
    if (!svg || !this.currentPatch) return;

    // Mermaid creates nodes with IDs matching the sanitized block IDs
    // We need to map from sanitized IDs back to block IDs
    const blockMap = new Map<string, Block>();
    for (const block of this.currentPatch.blocks.values()) {
      // Match the sanitization in patch-to-mermaid.ts
      const sanitized = block.id.replace(/[^a-zA-Z0-9_]/g, '_');
      blockMap.set(sanitized, block);
    }

    // Find all node groups (Mermaid wraps nodes in <g> elements with IDs like "flowchart-{nodeId}-{number}")
    const nodes = svg.querySelectorAll('g.node');
    for (const node of nodes) {
      const nodeId = (node as SVGElement).id;

      // Extract the block ID from the Mermaid node ID
      // Format is typically "flowchart-{blockId}-{number}"
      const match = nodeId.match(/^flowchart-(.+)-\d+$/);
      if (match) {
        const sanitizedId = match[1];
        const block = blockMap.get(sanitizedId);

        if (block && this.onBlockClick) {
          (node as SVGElement).style.cursor = 'pointer';
          (node as SVGElement).addEventListener('click', (e) => {
            e.stopPropagation();
            this.onBlockClick!(block);
          });
        }
      }
    }

    // Also try to handle clicks on the node shapes themselves (rect, polygon, etc.)
    const shapes = svg.querySelectorAll('.node rect, .node polygon, .node circle, .node ellipse');
    for (const shape of shapes) {
      const parentNode = shape.closest('g.node');
      if (parentNode) {
        (shape as SVGElement).style.cursor = 'pointer';
      }
    }
  }

  /**
   * Update the CSS transform for zoom/pan.
   */
  private updateTransform() {
    if (!this.diagramContainer) return;
    this.diagramContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }
}
