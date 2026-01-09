/**
 * Table View Component
 *
 * Matrix showing all blocks and their connections.
 * Primary patch visualization component for center panel.
 */

import type { Patch, Block, Edge } from '../../graph/Patch';
import type { BlockId } from '../../types';
import { getSelectionState } from '../state/selection';
import { colors } from '../theme';

/**
 * Connection information for display.
 */
interface ConnectionInfo {
  readonly targetBlockId: BlockId;
  readonly targetPort: string;
  readonly sourcePort: string;
}

/**
 * Block row data for table display.
 */
interface BlockRowData {
  readonly block: Block;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly connections: ConnectionInfo[];
  readonly domainId?: string;
}

/**
 * Table View component.
 */
export class TableView {
  private container: HTMLElement;
  private patch: Patch | null = null;
  private expandedBlocks = new Set<BlockId>();
  private tableBody: HTMLElement | null = null;
  private unsubscribeSelection: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();

    // Subscribe to selection changes
    const selectionState = getSelectionState();
    this.unsubscribeSelection = selectionState.subscribe(() => {
      this.updateSelection();
    });
  }

  /**
   * Set the patch to display.
   */
  setPatch(patch: Patch): void {
    this.patch = patch;
    this.render();
  }

  /**
   * Render the table view.
   */
  private render(): void {
    this.container.innerHTML = '';

    // Apply container styles
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      background: colors.bgContent,
    });

    // Create header section
    const header = this.createHeader();
    this.container.appendChild(header);

    // Create scrollable table container
    const scrollContainer = document.createElement('div');
    Object.assign(scrollContainer.style, {
      flex: '1',
      overflow: 'auto',
      padding: '0.5rem',
    });

    // Create table
    const table = document.createElement('table');
    table.className = 'oscilla-table-view';
    this.applyTableStyles(table);

    // Create table header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th style="width: 30px;"></th>
        <th style="width: 150px;">Block</th>
        <th style="width: 120px;">Type</th>
        <th style="width: 100px;">Domain</th>
        <th style="width: 80px; text-align: center;">Inputs</th>
        <th style="width: 80px; text-align: center;">Outputs</th>
      </tr>
    `;
    table.appendChild(thead);

    // Create table body
    this.tableBody = document.createElement('tbody');
    table.appendChild(this.tableBody);

    scrollContainer.appendChild(table);
    this.container.appendChild(scrollContainer);

    // Render table content
    if (this.patch) {
      this.renderTableContent();
    }
  }

  /**
   * Create header with search/filter controls.
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '0.75rem 1rem',
      borderBottom: `1px solid ${colors.border}`,
      background: colors.bgPanel,
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      flexShrink: '0',
    });

    // Title
    const title = document.createElement('h3');
    title.textContent = 'Blocks';
    Object.assign(title.style, {
      margin: '0',
      fontSize: '0.875rem',
      fontWeight: '600',
      color: colors.textPrimary,
      flex: '1',
    });
    header.appendChild(title);

    // Search input (placeholder for future)
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search blocks...';
    Object.assign(searchInput.style, {
      padding: '0.25rem 0.5rem',
      background: colors.bgContent,
      border: `1px solid ${colors.border}`,
      borderRadius: '4px',
      color: colors.textPrimary,
      fontSize: '0.75rem',
      width: '200px',
    });
    searchInput.disabled = true; // TODO: Implement search
    header.appendChild(searchInput);

    return header;
  }

  /**
   * Apply styles to table element.
   */
  private applyTableStyles(table: HTMLElement): void {
    Object.assign(table.style, {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '0.8125rem',
      color: colors.textPrimary,
    });

    // Style table headers
    const style = document.createElement('style');
    style.textContent = `
      .oscilla-table-view th {
        text-align: left;
        padding: 0.5rem;
        background: ${colors.bgPanel};
        border-bottom: 1px solid ${colors.border};
        font-weight: 600;
        color: ${colors.textSecondary};
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .oscilla-table-view td {
        padding: 0.5rem;
        border-bottom: 1px solid ${colors.border};
      }
      .oscilla-table-view tbody tr {
        cursor: pointer;
        transition: background 0.1s;
      }
      .oscilla-table-view tbody tr:hover {
        background: rgba(255, 255, 255, 0.03);
      }
      .oscilla-table-view tbody tr.selected {
        background: ${colors.primary}22;
      }
      .oscilla-table-view .expand-icon {
        cursor: pointer;
        user-select: none;
        color: ${colors.textMuted};
        font-family: monospace;
        font-size: 1rem;
        width: 20px;
        display: inline-block;
        text-align: center;
      }
      .oscilla-table-view .block-id {
        font-family: 'Courier New', monospace;
        color: ${colors.primary};
      }
      .oscilla-table-view .block-type {
        color: ${colors.textSecondary};
      }
      .oscilla-table-view .domain-tag {
        font-family: 'Courier New', monospace;
        color: ${colors.primary};
        font-size: 0.75rem;
      }
      .oscilla-table-view .count {
        text-align: center;
        color: ${colors.textMuted};
      }
      .oscilla-table-view .expanded-content {
        background: ${colors.bgPanel};
        padding: 0.5rem 1rem;
      }
      .oscilla-table-view .port-list {
        margin: 0.5rem 0;
        font-size: 0.75rem;
      }
      .oscilla-table-view .port-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0;
        color: ${colors.textSecondary};
      }
      .oscilla-table-view .port-name {
        font-family: 'Courier New', monospace;
        color: ${colors.primary};
        min-width: 100px;
      }
      .oscilla-table-view .port-type {
        color: ${colors.textMuted};
        font-size: 0.7rem;
        min-width: 120px;
      }
      .oscilla-table-view .port-connection {
        color: ${colors.primary};
        font-family: 'Courier New', monospace;
        cursor: pointer;
        text-decoration: underline;
      }
      .oscilla-table-view .port-connection:hover {
        color: ${colors.primary};
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Render table content from patch.
   */
  private renderTableContent(): void {
    if (!this.patch || !this.tableBody) return;

    this.tableBody.innerHTML = '';

    // Analyze patch
    const blockData = this.analyzeBlocks();

    // Render each block as a row
    for (const data of blockData) {
      const row = this.createBlockRow(data);
      this.tableBody.appendChild(row);

      // If expanded, add expanded content row
      if (this.expandedBlocks.has(data.block.id)) {
        const expandedRow = this.createExpandedRow(data);
        this.tableBody.appendChild(expandedRow);
      }
    }

    // Update selection highlight
    this.updateSelection();
  }

  /**
   * Analyze blocks and gather connection information.
   */
  private analyzeBlocks(): BlockRowData[] {
    if (!this.patch) return [];

    const blockData: BlockRowData[] = [];

    for (const block of this.patch.blocks.values()) {
      // Count inputs and outputs (approximate - would need block defs for accurate count)
      const incomingEdges = this.patch.edges.filter(e => e.to.blockId === block.id);
      const outgoingEdges = this.patch.edges.filter(e => e.from.blockId === block.id);

      const connections: ConnectionInfo[] = outgoingEdges.map(e => ({
        targetBlockId: e.to.blockId as BlockId,
        targetPort: e.to.slotId,
        sourcePort: e.from.slotId,
      }));

      // Try to extract domain from params
      let domainId: string | undefined;
      if (block.type === 'DomainN' || block.type === 'GridDomain') {
        // Domain source blocks don't have a domain assigned
        domainId = undefined;
      }

      blockData.push({
        block,
        inputCount: incomingEdges.length,
        outputCount: outgoingEdges.length,
        connections,
        domainId,
      });
    }

    return blockData;
  }

  /**
   * Create a table row for a block.
   */
  private createBlockRow(data: BlockRowData): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.dataset.blockId = data.block.id;

    const isExpanded = this.expandedBlocks.has(data.block.id);

    // Expand/collapse icon
    const expandCell = document.createElement('td');
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';
    expandIcon.textContent = isExpanded ? '▼' : '▸';
    expandIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleExpanded(data.block.id);
    });
    expandCell.appendChild(expandIcon);
    row.appendChild(expandCell);

    // Block ID
    const idCell = document.createElement('td');
    const idSpan = document.createElement('span');
    idSpan.className = 'block-id';
    idSpan.textContent = data.block.label || data.block.id;
    idCell.appendChild(idSpan);
    row.appendChild(idCell);

    // Type
    const typeCell = document.createElement('td');
    const typeSpan = document.createElement('span');
    typeSpan.className = 'block-type';
    typeSpan.textContent = data.block.type;
    typeCell.appendChild(typeSpan);
    row.appendChild(typeCell);

    // Domain
    const domainCell = document.createElement('td');
    if (data.domainId) {
      const domainSpan = document.createElement('span');
      domainSpan.className = 'domain-tag';
      domainSpan.textContent = data.domainId;
      domainCell.appendChild(domainSpan);
    } else {
      domainCell.textContent = '-';
      domainCell.style.color = colors.textMuted;
    }
    row.appendChild(domainCell);

    // Input count
    const inputCell = document.createElement('td');
    inputCell.className = 'count';
    inputCell.textContent = data.inputCount.toString();
    row.appendChild(inputCell);

    // Output count
    const outputCell = document.createElement('td');
    outputCell.className = 'count';
    outputCell.textContent = `${data.outputCount} (${data.connections.length})`;
    row.appendChild(outputCell);

    // Click to select
    row.addEventListener('click', () => {
      getSelectionState().selectBlock(data.block.id);
    });

    return row;
  }

  /**
   * Create expanded content row showing ports and connections.
   */
  private createExpandedRow(data: BlockRowData): HTMLTableRowElement {
    const row = document.createElement('tr');
    row.className = 'expanded-row';

    const cell = document.createElement('td');
    cell.colSpan = 6;

    const content = document.createElement('div');
    content.className = 'expanded-content';

    // Inputs section
    if (data.inputCount > 0) {
      const inputsTitle = document.createElement('div');
      inputsTitle.textContent = 'INPUTS';
      inputsTitle.style.fontWeight = '600';
      inputsTitle.style.marginBottom = '0.5rem';
      inputsTitle.style.color = colors.textSecondary;
      inputsTitle.style.fontSize = '0.7rem';
      content.appendChild(inputsTitle);

      const inputsList = document.createElement('div');
      inputsList.className = 'port-list';

      // Get incoming edges for this block
      const incomingEdges = this.patch?.edges.filter(e => e.to.blockId === data.block.id) || [];

      for (const edge of incomingEdges) {
        const portRow = document.createElement('div');
        portRow.className = 'port-row';

        const portName = document.createElement('span');
        portName.className = 'port-name';
        portName.textContent = `← ${edge.to.slotId}`;
        portRow.appendChild(portName);

        const connection = document.createElement('span');
        connection.className = 'port-connection';
        connection.textContent = `${edge.from.blockId}.${edge.from.slotId}`;
        connection.addEventListener('click', () => {
          getSelectionState().selectBlock(edge.from.blockId as BlockId);
        });
        portRow.appendChild(connection);

        inputsList.appendChild(portRow);
      }

      content.appendChild(inputsList);
    }

    // Outputs section
    if (data.outputCount > 0) {
      const outputsTitle = document.createElement('div');
      outputsTitle.textContent = 'OUTPUTS';
      outputsTitle.style.fontWeight = '600';
      outputsTitle.style.marginTop = '0.75rem';
      outputsTitle.style.marginBottom = '0.5rem';
      outputsTitle.style.color = colors.textSecondary;
      outputsTitle.style.fontSize = '0.7rem';
      content.appendChild(outputsTitle);

      const outputsList = document.createElement('div');
      outputsList.className = 'port-list';

      // Group connections by source port
      const connectionsByPort = new Map<string, ConnectionInfo[]>();
      for (const conn of data.connections) {
        if (!connectionsByPort.has(conn.sourcePort)) {
          connectionsByPort.set(conn.sourcePort, []);
        }
        connectionsByPort.get(conn.sourcePort)!.push(conn);
      }

      for (const [port, conns] of connectionsByPort) {
        const portRow = document.createElement('div');
        portRow.className = 'port-row';

        const portName = document.createElement('span');
        portName.className = 'port-name';
        portName.textContent = `${port} →`;
        portRow.appendChild(portName);

        const connList = document.createElement('span');
        connList.style.display = 'flex';
        connList.style.flexWrap = 'wrap';
        connList.style.gap = '0.5rem';

        for (const conn of conns) {
          const connection = document.createElement('span');
          connection.className = 'port-connection';
          connection.textContent = `${conn.targetBlockId}.${conn.targetPort}`;
          connection.addEventListener('click', () => {
            getSelectionState().selectBlock(conn.targetBlockId);
          });
          connList.appendChild(connection);
        }

        portRow.appendChild(connList);
        outputsList.appendChild(portRow);
      }

      content.appendChild(outputsList);
    }

    cell.appendChild(content);
    row.appendChild(cell);

    return row;
  }

  /**
   * Toggle expanded state for a block.
   */
  private toggleExpanded(blockId: BlockId): void {
    if (this.expandedBlocks.has(blockId)) {
      this.expandedBlocks.delete(blockId);
    } else {
      this.expandedBlocks.add(blockId);
    }
    this.renderTableContent();
  }

  /**
   * Update selection highlight in table.
   */
  private updateSelection(): void {
    if (!this.tableBody) return;

    const selectionState = getSelectionState();
    const selection = selectionState.getSelection();

    // Clear all selected classes
    const rows = this.tableBody.querySelectorAll('tr');
    rows.forEach(row => row.classList.remove('selected'));

    // Highlight selected block
    if (selection.kind === 'block') {
      const row = this.tableBody.querySelector(`tr[data-block-id="${selection.blockId}"]`);
      if (row) {
        row.classList.add('selected');
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
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
