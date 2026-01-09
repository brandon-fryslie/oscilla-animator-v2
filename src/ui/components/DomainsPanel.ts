/**
 * Domains Panel Component
 *
 * View domain definitions in the patch.
 * For now, extracts domains from DomainN/GridDomain blocks.
 */

import type { Patch, Block } from '../../graph/Patch';
import { colors } from '../theme';

/**
 * Domain information extracted from blocks.
 */
interface DomainInfo {
  readonly blockId: string;
  readonly kind: 'n' | 'grid';
  readonly n?: number;  // For DomainN
  readonly rows?: number;  // For GridDomain
  readonly cols?: number;  // For GridDomain
  readonly seed?: number;
  readonly usedByCount: number;
}

/**
 * Domains Panel component.
 */
export class DomainsPanel {
  private container: HTMLElement;
  private patch: Patch | null = null;
  private expandedDomains = new Set<string>();

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
   * Render the panel.
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

    // Header
    const header = this.createHeader();
    this.container.appendChild(header);

    // Scrollable content
    const scrollContainer = document.createElement('div');
    Object.assign(scrollContainer.style, {
      flex: '1',
      overflow: 'auto',
      padding: '0.75rem',
    });

    if (!this.patch) {
      const message = document.createElement('div');
      message.textContent = 'No patch loaded';
      Object.assign(message.style, {
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: '2rem',
        fontSize: '0.8125rem',
      });
      scrollContainer.appendChild(message);
    } else {
      const domains = this.extractDomains();

      if (domains.length === 0) {
        const message = document.createElement('div');
        message.textContent = 'No domains defined';
        Object.assign(message.style, {
          color: colors.textMuted,
          textAlign: 'center',
          marginTop: '2rem',
          fontSize: '0.8125rem',
        });
        scrollContainer.appendChild(message);
      } else {
        for (const domain of domains) {
          const domainCard = this.createDomainCard(domain);
          scrollContainer.appendChild(domainCard);
        }
      }
    }

    this.container.appendChild(scrollContainer);
  }

  /**
   * Create header.
   */
  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '0.75rem 1rem',
      borderBottom: `1px solid ${colors.border}`,
      background: colors.bgPanel,
      flexShrink: '0',
    });

    const title = document.createElement('h3');
    title.textContent = 'Domains';
    Object.assign(title.style, {
      margin: '0',
      fontSize: '0.875rem',
      fontWeight: '600',
      color: colors.textPrimary,
    });
    header.appendChild(title);

    return header;
  }

  /**
   * Extract domain information from patch.
   */
  private extractDomains(): DomainInfo[] {
    if (!this.patch) return [];

    const domains: DomainInfo[] = [];

    for (const block of this.patch.blocks.values()) {
      if (block.type === 'DomainN') {
        // Count blocks using this domain's output
        const usedByCount = this.patch.edges.filter(e =>
          e.from.blockId === block.id && e.from.slotId === 'domain'
        ).length;

        domains.push({
          blockId: block.id,
          kind: 'n',
          n: typeof block.params.n === 'number' ? block.params.n : undefined,
          seed: typeof block.params.seed === 'number' ? block.params.seed : undefined,
          usedByCount,
        });
      } else if (block.type === 'GridDomain') {
        const usedByCount = this.patch.edges.filter(e =>
          e.from.blockId === block.id && e.from.slotId === 'domain'
        ).length;

        domains.push({
          blockId: block.id,
          kind: 'grid',
          rows: typeof block.params.rows === 'number' ? block.params.rows : undefined,
          cols: typeof block.params.cols === 'number' ? block.params.cols : undefined,
          seed: typeof block.params.seed === 'number' ? block.params.seed : undefined,
          usedByCount,
        });
      }
    }

    return domains;
  }

  /**
   * Create a domain card.
   */
  private createDomainCard(domain: DomainInfo): HTMLElement {
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: colors.bgPanel,
      border: `1px solid ${colors.border}`,
      borderRadius: '6px',
      padding: '0.75rem',
      marginBottom: '0.75rem',
    });

    const isExpanded = this.expandedDomains.has(domain.blockId);

    // Header row
    const headerRow = document.createElement('div');
    Object.assign(headerRow.style, {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '0.5rem',
      cursor: 'pointer',
      userSelect: 'none',
    });

    // Expand icon
    const expandIcon = document.createElement('span');
    expandIcon.textContent = isExpanded ? '▼' : '▸';
    Object.assign(expandIcon.style, {
      marginRight: '0.5rem',
      color: colors.textMuted,
      fontFamily: 'monospace',
      fontSize: '0.875rem',
    });
    headerRow.appendChild(expandIcon);

    // Domain name/ID
    const nameEl = document.createElement('span');
    nameEl.textContent = domain.blockId;
    Object.assign(nameEl.style, {
      fontSize: '0.875rem',
      fontWeight: '600',
      color: colors.primary,
      fontFamily: "'Courier New', monospace",
      flex: '1',
    });
    headerRow.appendChild(nameEl);

    // Toggle expand on click
    headerRow.addEventListener('click', () => {
      if (this.expandedDomains.has(domain.blockId)) {
        this.expandedDomains.delete(domain.blockId);
      } else {
        this.expandedDomains.add(domain.blockId);
      }
      this.render();
    });

    card.appendChild(headerRow);

    // Summary row
    const summaryRow = document.createElement('div');
    Object.assign(summaryRow.style, {
      fontSize: '0.75rem',
      color: colors.textSecondary,
      marginBottom: '0.5rem',
    });

    if (domain.kind === 'n') {
      summaryRow.textContent = `N Elements: ${domain.n ?? '?'}`;
    } else if (domain.kind === 'grid') {
      summaryRow.textContent = `Grid: ${domain.rows ?? '?'} × ${domain.cols ?? '?'}`;
    }

    card.appendChild(summaryRow);

    // Used by count
    const usedByEl = document.createElement('div');
    usedByEl.textContent = `Used by: ${domain.usedByCount} blocks`;
    Object.assign(usedByEl.style, {
      fontSize: '0.7rem',
      color: colors.textMuted,
    });
    card.appendChild(usedByEl);

    // Expanded details
    if (isExpanded) {
      const details = document.createElement('div');
      Object.assign(details.style, {
        marginTop: '0.75rem',
        paddingTop: '0.75rem',
        borderTop: `1px solid ${colors.border}`,
        fontSize: '0.75rem',
      });

      const detailsGrid = document.createElement('div');
      Object.assign(detailsGrid.style, {
        display: 'grid',
        gridTemplateColumns: '1fr 2fr',
        gap: '0.5rem',
      });

      // Kind
      this.addDetailRow(detailsGrid, 'Kind', domain.kind === 'n' ? 'N Elements' : 'Grid 2D');

      // Parameters
      if (domain.n !== undefined) {
        this.addDetailRow(detailsGrid, 'Count', domain.n.toString());
      }
      if (domain.rows !== undefined) {
        this.addDetailRow(detailsGrid, 'Rows', domain.rows.toString());
      }
      if (domain.cols !== undefined) {
        this.addDetailRow(detailsGrid, 'Cols', domain.cols.toString());
      }
      if (domain.seed !== undefined) {
        this.addDetailRow(detailsGrid, 'Seed', domain.seed.toString());
      }

      details.appendChild(detailsGrid);
      card.appendChild(details);
    }

    return card;
  }

  /**
   * Add a detail row to the details grid.
   */
  private addDetailRow(grid: HTMLElement, label: string, value: string): void {
    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    Object.assign(labelEl.style, {
      color: colors.textSecondary,
      fontWeight: '500',
    });
    grid.appendChild(labelEl);

    const valueEl = document.createElement('div');
    valueEl.textContent = value;
    Object.assign(valueEl.style, {
      color: colors.textPrimary,
      fontFamily: "'Courier New', monospace",
    });
    grid.appendChild(valueEl);
  }

  /**
   * Destroy the component and cleanup.
   */
  destroy(): void {
    this.container.innerHTML = '';
  }
}
