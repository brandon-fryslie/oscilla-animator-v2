/**
 * Block Inspector Component
 *
 * Detailed view of selected block showing ports, connections, and parameters.
 */

import type { Patch, Block, Edge } from '../../graph/Patch';
import type { BlockId } from '../../types';
import { getSelectionState } from '../state/selection';
import { colors } from '../theme';

/**
 * Port info for inspector display.
 */
interface PortInfo {
  readonly id: string;
  readonly direction: 'input' | 'output';
  readonly connections: string[]; // "blockId.portId" format
}

/**
 * Block Inspector component.
 */
export class BlockInspector {
  private container: HTMLElement;
  private patch: Patch | null = null;
  private unsubscribeSelection: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;

    // Subscribe to selection changes
    const selectionState = getSelectionState();
    this.unsubscribeSelection = selectionState.subscribe(() => {
      this.render();
    });

    this.render();
  }

  /**
   * Set the patch to inspect.
   */
  setPatch(patch: Patch): void {
    this.patch = patch;
    this.render();
  }

  /**
   * Render the inspector.
   */
  private render(): void {
    this.container.innerHTML = '';

    // Apply container styles
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'auto',
      padding: '1rem',
      background: colors.bgContent,
      color: colors.textPrimary,
      fontSize: '0.8125rem',
    });

    const selectionState = getSelectionState();
    const selection = selectionState.getSelection();

    if (selection.kind !== 'block' || !this.patch) {
      this.renderNoSelection();
      return;
    }

    const block = this.patch.blocks.get(selection.blockId);
    if (!block) {
      this.renderBlockNotFound(selection.blockId);
      return;
    }

    this.renderBlockDetails(block);
  }

  /**
   * Render "no selection" state.
   */
  private renderNoSelection(): void {
    const message = document.createElement('div');
    message.textContent = 'No block selected';
    Object.assign(message.style, {
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: '2rem',
    });
    this.container.appendChild(message);
  }

  /**
   * Render "block not found" error.
   */
  private renderBlockNotFound(blockId: BlockId): void {
    const message = document.createElement('div');
    message.textContent = `Block not found: ${blockId}`;
    Object.assign(message.style, {
      color: colors.secondary,
      textAlign: 'center',
      marginTop: '2rem',
    });
    this.container.appendChild(message);
  }

  /**
   * Render block details.
   */
  private renderBlockDetails(block: Block): void {
    // Header: Block ID
    const header = document.createElement('div');
    Object.assign(header.style, {
      marginBottom: '1rem',
      paddingBottom: '0.75rem',
      borderBottom: `1px solid ${colors.border}`,
    });

    const idLabel = document.createElement('div');
    idLabel.textContent = block.label || block.id;
    Object.assign(idLabel.style, {
      fontSize: '1.125rem',
      fontWeight: '600',
      color: colors.primary,
      fontFamily: "'Courier New', monospace",
      marginBottom: '0.25rem',
    });
    header.appendChild(idLabel);

    const typeLabel = document.createElement('div');
    typeLabel.textContent = block.type;
    Object.assign(typeLabel.style, {
      fontSize: '0.875rem',
      color: colors.textSecondary,
    });
    header.appendChild(typeLabel);

    this.container.appendChild(header);

    // Analyze ports
    const portInfo = this.analyzeBlockPorts(block);

    // Inputs section
    if (portInfo.inputs.length > 0) {
      const inputsSection = this.createPortSection('INPUTS', portInfo.inputs);
      this.container.appendChild(inputsSection);
    }

    // Outputs section
    if (portInfo.outputs.length > 0) {
      const outputsSection = this.createPortSection('OUTPUTS', portInfo.outputs);
      this.container.appendChild(outputsSection);
    }

    // Parameters section
    const paramEntries = Object.entries(block.params);
    if (paramEntries.length > 0) {
      const paramsSection = this.createParamsSection(paramEntries);
      this.container.appendChild(paramsSection);
    }

    // Default sources section (placeholder for future)
    // Domain section (placeholder for future)
  }

  /**
   * Analyze block ports and connections.
   */
  private analyzeBlockPorts(block: Block): { inputs: PortInfo[]; outputs: PortInfo[] } {
    if (!this.patch) {
      return { inputs: [], outputs: [] };
    }

    const inputs: PortInfo[] = [];
    const outputs: PortInfo[] = [];

    // Gather input connections
    const incomingEdges = this.patch.edges.filter(e => e.to.blockId === block.id);
    const inputPortMap = new Map<string, string[]>();

    for (const edge of incomingEdges) {
      const portId = edge.to.slotId;
      if (!inputPortMap.has(portId)) {
        inputPortMap.set(portId, []);
      }
      inputPortMap.get(portId)!.push(`${edge.from.blockId}.${edge.from.slotId}`);
    }

    for (const [portId, connections] of inputPortMap) {
      inputs.push({
        id: portId,
        direction: 'input',
        connections,
      });
    }

    // Gather output connections
    const outgoingEdges = this.patch.edges.filter(e => e.from.blockId === block.id);
    const outputPortMap = new Map<string, string[]>();

    for (const edge of outgoingEdges) {
      const portId = edge.from.slotId;
      if (!outputPortMap.has(portId)) {
        outputPortMap.set(portId, []);
      }
      outputPortMap.get(portId)!.push(`${edge.to.blockId}.${edge.to.slotId}`);
    }

    for (const [portId, connections] of outputPortMap) {
      outputs.push({
        id: portId,
        direction: 'output',
        connections,
      });
    }

    return { inputs, outputs };
  }

  /**
   * Create a port section (INPUTS or OUTPUTS).
   */
  private createPortSection(title: string, ports: PortInfo[]): HTMLElement {
    const section = document.createElement('div');
    Object.assign(section.style, {
      marginBottom: '1.5rem',
    });

    // Section title
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
      fontSize: '0.7rem',
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '0.75rem',
    });
    section.appendChild(titleEl);

    // Port list
    const portList = document.createElement('div');

    for (const port of ports) {
      const portRow = this.createPortRow(port);
      portList.appendChild(portRow);
    }

    section.appendChild(portList);

    return section;
  }

  /**
   * Create a port row.
   */
  private createPortRow(port: PortInfo): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      marginBottom: '0.75rem',
      paddingBottom: '0.75rem',
      borderBottom: `1px solid ${colors.border}`,
    });

    // Port name
    const nameEl = document.createElement('div');
    nameEl.textContent = port.id;
    Object.assign(nameEl.style, {
      fontFamily: "'Courier New', monospace",
      color: colors.primary,
      marginBottom: '0.5rem',
    });
    row.appendChild(nameEl);

    // Connections
    if (port.connections.length > 0) {
      const connectionsLabel = document.createElement('div');
      connectionsLabel.textContent = port.direction === 'input' ? 'From:' : 'To:';
      Object.assign(connectionsLabel.style, {
        fontSize: '0.7rem',
        color: colors.textMuted,
        marginBottom: '0.25rem',
      });
      row.appendChild(connectionsLabel);

      for (const conn of port.connections) {
        const connEl = document.createElement('div');
        connEl.textContent = `• ${conn}`;
        Object.assign(connEl.style, {
          fontSize: '0.75rem',
          color: colors.primary,
          fontFamily: "'Courier New', monospace",
          cursor: 'pointer',
          marginLeft: '0.5rem',
          marginBottom: '0.25rem',
          textDecoration: 'underline',
        });

        // Navigate to connected block on click
        connEl.addEventListener('click', () => {
          const [blockId] = conn.split('.');
          getSelectionState().selectBlock(blockId as BlockId);
        });

        connEl.addEventListener('mouseenter', () => {
          connEl.style.color = colors.primary;
        });

        connEl.addEventListener('mouseleave', () => {
          connEl.style.color = colors.primary;
        });

        row.appendChild(connEl);
      }
    } else {
      const noConnLabel = document.createElement('div');
      noConnLabel.textContent = '(not connected)';
      Object.assign(noConnLabel.style, {
        fontSize: '0.7rem',
        color: colors.textMuted,
        fontStyle: 'italic',
      });
      row.appendChild(noConnLabel);
    }

    return row;
  }

  /**
   * Create parameters section.
   */
  private createParamsSection(params: [string, unknown][]): HTMLElement {
    const section = document.createElement('div');
    Object.assign(section.style, {
      marginBottom: '1.5rem',
    });

    // Section title
    const titleEl = document.createElement('div');
    titleEl.textContent = 'PARAMETERS';
    Object.assign(titleEl.style, {
      fontSize: '0.7rem',
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '0.75rem',
    });
    section.appendChild(titleEl);

    // Parameters grid
    const paramsGrid = document.createElement('div');
    Object.assign(paramsGrid.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 2fr',
      gap: '0.5rem',
      fontSize: '0.75rem',
    });

    for (const [key, value] of params) {
      // Key
      const keyEl = document.createElement('div');
      keyEl.textContent = key;
      Object.assign(keyEl.style, {
        color: colors.textSecondary,
        fontWeight: '500',
      });
      paramsGrid.appendChild(keyEl);

      // Value
      const valueEl = document.createElement('div');
      valueEl.textContent = this.formatParamValue(value);
      Object.assign(valueEl.style, {
        color: colors.textPrimary,
        fontFamily: "'Courier New', monospace",
      });
      paramsGrid.appendChild(valueEl);
    }

    section.appendChild(paramsGrid);

    return section;
  }

  /**
   * Format parameter value for display.
   */
  private formatParamValue(value: unknown): string {
    if (typeof value === 'string') {
      return `"${value}"`;
    } else if (typeof value === 'number') {
      return Number.isInteger(value) ? value.toString() : value.toFixed(3);
    } else if (typeof value === 'boolean') {
      return value.toString();
    } else if (value === null || value === undefined) {
      return 'null';
    } else {
      return JSON.stringify(value);
    }
  }

  /**
   * Destroy the component and cleanup.
   */
  destroy(): void {
    if (this.unsubscribeSelection) {
      this.unsubscribeSelection();
      this.unsubscribeSelection = null;
    }
    this.container.innerHTML = '';
  }
}
