/**
 * src/ui/nativeEditor/NativeEditorPanel.tsx
 *
 * The native (ScenePlan-path) authoring surface: a palette, a per-block config
 * inspector, catalog-driven port connections, and a diagnostics strip. It reads
 * and writes `PillarPatchStore` only — it never touches a renderer or a Three
 * object. The live preview updates because `RuntimeService` observes the store's
 * compiled plan and reinstalls it; this panel knows nothing about that.
 *
 * [LAW:one-way-deps] Depends on the scene catalog + the authored-patch store and
 *   the pure port-compatibility check; nothing renderer-local flows in.
 * [LAW:dataflow-not-control-flow] The connection picker offers exactly the
 *   compatible sources (a derived list); it does not branch on block type.
 */

import React from 'react';
import { observer } from 'mobx-react-lite';

import { useStores } from '../../stores';
import {
  compareScenePorts,
  type SceneCatalogConfigField,
  type SceneConfigControl,
  type ScenePortDeclaration,
  type SceneRegistry,
} from '../../pillars/scene';
import type { PillarBlock } from '../../pillars/types';
import type { PillarPatchStore } from '../../stores/PillarPatchStore';

const styles = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#16161f',
    color: '#e6e6ef',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 13,
    overflow: 'hidden',
  },
  section: { padding: '10px 12px', borderBottom: '1px solid #2a2a38' },
  sectionTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#8a8aa0',
    margin: '0 0 8px',
  },
  paletteRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  paletteButton: {
    background: '#2a2350',
    color: '#d7caff',
    border: '1px solid #4a3f80',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
  },
  blocks: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' },
  block: { margin: '8px 12px', border: '1px solid #2a2a38', borderRadius: 8, background: '#1d1d29' },
  blockHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderBottom: '1px solid #2a2a38',
  },
  blockTitle: { fontWeight: 600 },
  blockId: { color: '#6f6f88', fontFamily: 'monospace', fontSize: 11, marginLeft: 6 },
  removeButton: {
    background: 'transparent',
    color: '#d77',
    border: '1px solid #5a3030',
    borderRadius: 6,
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: 11,
  },
  fieldRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px' },
  fieldLabel: { width: 130, color: '#b7b7c8', flexShrink: 0 },
  input: {
    flex: 1,
    background: '#11111a',
    color: '#e6e6ef',
    border: '1px solid #33334a',
    borderRadius: 5,
    padding: '3px 6px',
    fontSize: 12,
  },
  diagnostics: { padding: '10px 12px', borderTop: '1px solid #2a2a38', maxHeight: 160, overflowY: 'auto' },
  diagOk: { color: '#6fcf97', fontSize: 12 },
  diagItem: { color: '#f2994a', fontSize: 12, fontFamily: 'monospace', marginBottom: 4, whiteSpace: 'pre-wrap' },
} as const;

export const NativeEditorPanel: React.FC = observer(() => {
  const { pillarPatch } = useStores();
  const { patch, catalog, registry, diagnostics } = pillarPatch;

  return (
    <div style={styles.panel as React.CSSProperties}>
      <div style={styles.section as React.CSSProperties}>
        <h3 style={styles.sectionTitle as React.CSSProperties}>Palette</h3>
        <div style={styles.paletteRow as React.CSSProperties}>
          {catalog.map((meta) => (
            <button
              key={meta.type}
              data-testid={`native-add-${meta.type}`}
              style={styles.paletteButton as React.CSSProperties}
              onClick={() => pillarPatch.addBlock(meta.type)}
              title={`Add ${meta.displayName}`}
            >
              + {meta.displayName}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.blocks as React.CSSProperties}>
        {patch.blocks.map((block) => (
          <BlockCard key={block.id} block={block} registry={registry} store={pillarPatch} />
        ))}
      </div>

      <div style={styles.diagnostics as React.CSSProperties}>
        <h3 style={styles.sectionTitle as React.CSSProperties}>Diagnostics</h3>
        {diagnostics.length === 0 ? (
          <div style={styles.diagOk as React.CSSProperties}>No problems — patch renders.</div>
        ) : (
          diagnostics.map((message, i) => (
            <div key={i} style={styles.diagItem as React.CSSProperties}>
              {message}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

const BlockCard: React.FC<{
  block: PillarBlock;
  registry: SceneRegistry;
  store: PillarPatchStore;
}> = observer(({ block, registry, store }) => {
  const def = registry.get(block.type);
  const catalog = def?.catalog;
  const inputPorts = catalog?.ports.filter((p) => p.direction === 'input') ?? [];

  return (
    <div style={styles.block as React.CSSProperties}>
      <div style={styles.blockHeader as React.CSSProperties}>
        <span>
          <span style={styles.blockTitle as React.CSSProperties}>{catalog?.displayName ?? block.type}</span>
          <span style={styles.blockId as React.CSSProperties}>{block.id}</span>
        </span>
        <button style={styles.removeButton as React.CSSProperties} onClick={() => store.removeBlock(block.id)}>
          remove
        </button>
      </div>

      {inputPorts.map((port) => (
        <ConnectionRow key={port.id} block={block} port={port} registry={registry} store={store} />
      ))}

      {(catalog?.configFields ?? []).map((field) => (
        <ConfigRow key={field.key} block={block} field={field} store={store} />
      ))}
    </div>
  );
});

/** A catalog-driven source picker for one input port. */
const ConnectionRow: React.FC<{
  block: PillarBlock;
  port: ScenePortDeclaration;
  registry: SceneRegistry;
  store: PillarPatchStore;
}> = observer(({ block, port, registry, store }) => {
  const { patch } = store;
  const currentSource =
    patch.edges.find((e) => e.target === block.id && e.inputSlot === port.id)?.source ?? '';

  // Candidate sources: other blocks whose single output is compatible with this
  // input's value. The compatibility check is the same algebra the compiler uses.
  const candidates = patch.blocks.filter((candidate) => {
    if (candidate.id === block.id) return false;
    const outputs = registry.get(candidate.type)?.catalog.ports.filter((p) => p.direction === 'output') ?? [];
    if (outputs.length !== 1) return false;
    return compareScenePorts(outputs[0].value, port.value).kind === 'compatible';
  });

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const source = e.target.value;
    if (source === '') {
      const existing = patch.edges.find((edge) => edge.target === block.id && edge.inputSlot === port.id);
      if (existing) store.removeEdge(existing.id);
      return;
    }
    store.addEdge(source, block.id, port.id);
  };

  return (
    <div style={styles.fieldRow as React.CSSProperties}>
      <span style={styles.fieldLabel as React.CSSProperties}>◄ {port.label}</span>
      <select style={styles.input as React.CSSProperties} value={currentSource} onChange={onChange}>
        <option value="">— unconnected —</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {registry.get(candidate.type)?.catalog.displayName ?? candidate.type} ({candidate.id})
          </option>
        ))}
      </select>
    </div>
  );
});

/** One config field control, bound to the authored block config. */
const ConfigRow: React.FC<{
  block: PillarBlock;
  field: SceneCatalogConfigField;
  store: PillarPatchStore;
}> = observer(({ block, field, store }) => {
  const value = block.config[field.key];
  return (
    <div style={styles.fieldRow as React.CSSProperties}>
      <span style={styles.fieldLabel as React.CSSProperties}>{field.label}</span>
      <ConfigControl
        control={field.control}
        value={value}
        testId={`native-config-${block.id}-${field.key}`}
        onChange={(next) => store.updateConfig(block.id, field.key, next)}
      />
    </div>
  );
});

const ConfigControl: React.FC<{
  control: SceneConfigControl;
  value: unknown;
  testId: string;
  onChange: (next: unknown) => void;
}> = ({ control, value, testId, onChange }) => {
  switch (control) {
    case 'number':
    case 'integer':
      return (
        <input
          data-testid={testId}
          style={styles.input as React.CSSProperties}
          type="number"
          step={control === 'integer' ? 1 : 'any'}
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    case 'toggle':
      return (
        <input
          data-testid={testId}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'color':
      return (
        <input
          data-testid={testId}
          type="color"
          value={typeof value === 'string' ? value : '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'colorList':
      // A palette/ramp is a list of hex colors; edit it as a comma-separated
      // text field, parsing back to the array the config schema validates.
      return (
        <input
          data-testid={testId}
          style={styles.input as React.CSSProperties}
          type="text"
          value={Array.isArray(value) ? value.join(', ') : ''}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0),
            )
          }
        />
      );
    case 'asset':
    case 'select':
      return (
        <input
          data-testid={testId}
          style={styles.input as React.CSSProperties}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        />
      );
    default:
      return assertNever(control);
  }
};

function assertNever(value: never): never {
  throw new Error(`NativeEditorPanel: unhandled config control: ${JSON.stringify(value)}`);
}
