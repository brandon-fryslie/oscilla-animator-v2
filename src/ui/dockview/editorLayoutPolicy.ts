/**
 * EditorLayoutPolicy — the per-era value the dockview shell reads.
 *
 * The DockviewProvider mechanics (persistence, drag rules, header actions, save
 * debounce) are model-agnostic SHELL, reused by both eras. What varies per era is
 * a VALUE: which panel components exist, how the default layout is built, which
 * localStorage slot holds the arrangement, and which entries the Panels menu
 * offers. Collapsing that variation into one policy means the shell never
 * branches on era — it reads the policy. [LAW:dataflow-not-control-flow]
 * [LAW:one-source-of-truth]
 */

import type { DockviewApi, IDockviewPanelProps } from 'dockview';
import type { PanelDefinition, PanelMenuItem } from './panelMetadata';

export interface EditorLayoutPolicy {
  /** Component map handed to DockviewReact — keys match `PanelDefinition.component`. */
  readonly components: Record<string, React.FC<IDockviewPanelProps>>;
  /** Panel metadata for this era (groups, floating, hidden). */
  readonly definitions: readonly PanelDefinition[];
  /** Panels-menu entries the toolbar offers to (re)open. */
  readonly menuItems: readonly PanelMenuItem[];
  /** localStorage slot for this era's serialized panel arrangement. */
  readonly storageKey: string;
  /** Builds this era's default panel layout into a fresh dockview api. */
  readonly createLayout: (api: DockviewApi) => void;
}
