/**
 * SelectionDetailView — the ONE neutral inspector body, for both boots.
 *
 * Reads the current selection (`useEditorSelection`) and the era's detail
 * (`useSelectionDetail`) and renders block / edge / port / type-preview detail
 * purely from the neutral vocabulary. It holds no era opinion: every fact comes
 * from `SelectionDetail.describe*`, every mutation goes back through a
 * `SelectionDetail` command. A section renders only when the detail carries it, so
 * a pillar block (no default-source / combine-mode / lens sections) shows exactly
 * what it has and never a fabricated V1 panel. [LAW:dataflow-not-control-flow]
 * [LAW:no-silent-failure]
 *
 * WRITES are hint-first, value-guarded: a widget renders only when the stored
 * value matches its type, else a read-only fallback shows the real value — never a
 * fabricated 0/#000000 that lies about what is stored. [LAW:types-are-the-program]
 */

import React, { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { colors } from '../theme';
import '../components/BlockInspector.css';
import {
  NumberInput,
  TextInput,
  SelectInput,
  CheckboxInput,
  ColorInput,
  SliderWithInput,
} from '../components/common';
import { InspectorExpressionField } from '../components/InspectorExpressionField';
import { InspectorEdgeDebugProbe } from '../components/InspectorEdgeDebugProbe';
import type { UIControlHint } from '../../types';
import type { PortTypeDisplay } from './types';
import { useSelectionDetail } from './SelectionDetailContext';
import { useEditorSelection } from './useEditorSelection';
import type {
  BlockDetail,
  CombineModeDetail,
  DefaultSourceDetail,
  DetailControl,
  EdgeDetail,
  EndpointDetail,
  InputPortDetail,
  LensManagementDetail,
  PortDetail,
  PortFeed,
  SelectionDetail,
  TypePreviewDetail,
} from './selection-detail';

/** Navigate the selection to a block (clicking a connected endpoint). */
type Navigate = (blockId: string) => void;

// =============================================================================
// Top-level dispatch
// =============================================================================

export const SelectionDetailView = observer(function SelectionDetailView() {
  const detail = useSelectionDetail();
  const { ref, selectBlock } = useEditorSelection();

  return (
    <div className="block-inspector">
      <div className="block-inspector__content">
        {renderContent(detail, ref, selectBlock)}
      </div>
    </div>
  );
});

function renderContent(
  detail: SelectionDetail,
  ref: ReturnType<typeof useEditorSelection>['ref'],
  navigate: Navigate,
): React.ReactElement {
  switch (ref.kind) {
    case 'none':
      return <NoSelection />;
    case 'typePreview': {
      const preview = detail.describeTypePreview(ref.blockType);
      return preview ? <TypePreviewView preview={preview} /> : <NoSelection />;
    }
    case 'port': {
      const port = detail.describePort(ref.ref);
      return port ? <PortDetailView detail={detail} port={port} navigate={navigate} /> : <NoSelection />;
    }
    case 'edge': {
      const edge = detail.describeEdge(ref.edgeId);
      return edge ? <EdgeDetailView detail={detail} edge={edge} navigate={navigate} /> : <NoSelection />;
    }
    case 'block': {
      const block = detail.describeBlock(ref.blockId);
      return block ? <BlockDetailView detail={detail} block={block} navigate={navigate} /> : <NoSelection />;
    }
    default: {
      const _exhaustive: never = ref;
      throw new Error(`Unhandled selection kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function NoSelection() {
  return (
    <div style={{ color: colors.textSecondary }}>
      <p>Select a block, edge, or port to inspect.</p>
    </div>
  );
}

// =============================================================================
// Block detail
// =============================================================================

const BlockDetailView = observer(function BlockDetailView({
  detail,
  block,
  navigate,
}: {
  detail: SelectionDetail;
  block: BlockDetail;
  navigate: Navigate;
}) {
  if (block.variant === 'timeRoot') {
    return (
      <div style={{ color: colors.textSecondary }}>
        <p>System block (hidden)</p>
        <p style={{ fontSize: '12px', marginTop: '8px' }}>
          Time root blocks are system-managed and not shown in most views.
        </p>
      </div>
    );
  }
  if (block.variant === 'unknownType') {
    return (
      <div style={{ color: colors.error }}>
        <p>Unknown block type: {block.type}</p>
      </div>
    );
  }

  return (
    <div>
      <BlockHeader detail={detail} block={block} />
      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>{block.type}</p>

      {block.inputs.length > 0 && (
        <Section title="Inputs">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {block.inputs.map((port) => (
              <InputPortRow key={port.id} detail={detail} blockId={block.id} port={port} navigate={navigate} />
            ))}
          </ul>
        </Section>
      )}

      {block.outputs.length > 0 && (
        <Section title="Outputs">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {block.outputs.map((port) => (
              <li key={port.id} style={rowStyle}>
                <PortHeaderLine label={port.label} typeDisplay={port.typeDisplay} />
                <TargetList targets={port.targets} navigate={navigate} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      {block.config.length > 0 && (
        <Section title="Configuration">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {block.config.map((field) =>
              field.kind === 'expression' ? (
                <InspectorExpressionField key={`expr:${field.id}`} blockId={field.blockId} value={field.value} />
              ) : (
                <DetailControlField key={field.control.id} detail={detail} control={field.control} />
              ),
            )}
          </div>
        </Section>
      )}
    </div>
  );
});

const BlockHeader = observer(function BlockHeader({
  detail,
  block,
}: {
  detail: SelectionDetail;
  block: BlockDetail;
}) {
  if (!block.canEditDisplayName) {
    return <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>{block.displayName}</h3>;
  }
  return (
    <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>
      <NeutralNameEditor
        current={block.displayName}
        onCommit={(name) => detail.setDisplayName(block.id, name)}
      />
    </h3>
  );
});

const InputPortRow = observer(function InputPortRow({
  detail,
  blockId,
  port,
  navigate,
}: {
  detail: SelectionDetail;
  blockId: string;
  port: InputPortDetail;
  navigate: Navigate;
}) {
  return (
    <li style={rowStyle}>
      <PortHeaderLine label={port.label} typeDisplay={port.typeDisplay} />
      <FeedLine feed={port.feed} navigate={navigate} />
      {port.combineMode && <CombineModeEditor detail={detail} blockId={blockId} portId={port.id} combine={port.combineMode} />}
      {port.defaultSource && <DefaultSourceEditor detail={detail} blockId={blockId} portId={port.id} ds={port.defaultSource} />}
      {port.controls.length > 0 && (
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {port.controls.map((control) => (
            <DetailControlField key={control.id} detail={detail} control={control} />
          ))}
        </div>
      )}
    </li>
  );
});

// =============================================================================
// Edge detail
// =============================================================================

const EdgeDetailView = observer(function EdgeDetailView({
  detail,
  edge,
  navigate,
}: {
  detail: SelectionDetail;
  edge: EdgeDetail;
  navigate: Navigate;
}) {
  return (
    <div>
      <Badge label="EDGE" color={colors.primary} />
      <Section title="Source">
        <EndpointRow endpoint={edge.source} navigate={navigate} />
      </Section>

      <Section title="Transform Chain">
        {edge.chain.length === 0 ? (
          <div style={{ textAlign: 'center', color: colors.textSecondary, fontSize: '12px', padding: '4px 0' }}>
            ↓ direct
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {edge.chain.map((step, idx) => (
              <div
                key={idx}
                style={{
                  padding: '6px 8px',
                  background: step.kind === 'lens' ? 'rgba(78,205,196,0.1)' : 'rgba(255,165,0,0.1)',
                  borderRadius: '3px',
                  fontSize: '12px',
                }}
              >
                <span style={{ color: step.kind === 'lens' ? colors.primary : '#ffa500', fontWeight: 600 }}>
                  {step.kind === 'lens' ? 'Lens' : 'Adapter'}
                </span>
                <span style={{ color: colors.textSecondary, marginLeft: '6px' }}>{step.label}</span>
                {step.fromType && step.toType && (
                  <div style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px' }}>
                    {step.fromType} → {step.toType}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Target">
        <EndpointRow endpoint={edge.target} navigate={navigate} />
      </Section>

      <InspectorEdgeDebugProbe
        edgeId={edge.id}
        label={`${edge.source.blockLabel}.${edge.source.portId} → ${edge.target.blockLabel}.${edge.target.portId}`}
      />

      {edge.lensManagement && <LensManagementView detail={detail} edge={edge} lm={edge.lensManagement} />}

      <button onClick={() => detail.removeEdge(edge.id)} style={deleteButtonStyle}>
        Delete Edge
      </button>
    </div>
  );
});

const LensManagementView = observer(function LensManagementView({
  detail,
  edge,
  lm,
}: {
  detail: SelectionDetail;
  edge: EdgeDetail;
  lm: LensManagementDetail;
}) {
  const [showAdd, setShowAdd] = useState(false);
  // Lens commands address the edge by endpoints; EdgeDetail carries both.
  const edgeRef = {
    sourceBlockId: edge.source.blockId,
    sourcePortId: edge.source.portId,
    targetBlockId: edge.target.blockId,
    targetPortId: edge.target.portId,
  };
  return (
    <Section title={`Lenses (${lm.existing.length})`}>
      {lm.existing.map((lens) => (
        <div key={lens.id} style={{ ...rowStyle, marginBottom: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: colors.primary }}>{lens.label}</span>
            <button onClick={() => detail.removeLens(edgeRef, lens.id)} style={smallButtonStyle}>
              Remove
            </button>
          </div>
          {lens.params.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {lens.params.map((p) => (
                <DetailControlField key={p.id} detail={detail} control={p} />
              ))}
            </div>
          )}
        </div>
      ))}
      {lm.compatible.length > 0 && !showAdd && (
        <button onClick={() => setShowAdd(true)} style={{ ...smallButtonStyle, width: '100%', padding: '6px 10px' }}>
          + Add Lens
        </button>
      )}
      {showAdd && (
        <div style={{ padding: '4px', background: colors.bgPanel, borderRadius: '4px', border: `1px solid ${colors.border}` }}>
          {lm.compatible.map((lens) => (
            <div
              key={lens.blockType}
              onClick={() => {
                detail.addLens(edgeRef, lens.blockType);
                setShowAdd(false);
              }}
              style={{ padding: '6px 8px', cursor: 'pointer', fontSize: '12px', color: colors.textPrimary }}
            >
              {lens.label}
              <div style={{ fontSize: '10px', color: colors.textMuted }}>{lens.description}</div>
            </div>
          ))}
        </div>
      )}
      {lm.existing.length === 0 && lm.compatible.length === 0 && (
        <div style={{ fontSize: '12px', color: colors.textMuted }}>No compatible lenses available</div>
      )}
    </Section>
  );
});

// =============================================================================
// Port detail
// =============================================================================

const PortDetailView = observer(function PortDetailView({
  detail,
  port,
  navigate,
}: {
  detail: SelectionDetail;
  port: PortDetail;
  navigate: Navigate;
}) {
  const isInput = port.direction === 'input';
  return (
    <div>
      <Badge label={`${isInput ? 'INPUT' : 'OUTPUT'} PORT`} color={isInput ? '#3b82f6' : '#f97316'} />
      <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>{port.label}</h3>
      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>{port.ref.portId}</p>

      {port.typeDisplay && (
        <Section title="Port Type">
          <div style={{ padding: '8px', background: colors.bgPanel, borderRadius: '4px', fontSize: '13px' }}>
            {port.typeDisplay.label}
          </div>
        </Section>
      )}

      {port.combineMode && (
        <CombineModeEditor detail={detail} blockId={port.ref.blockId} portId={port.ref.portId} combine={port.combineMode} />
      )}
      {port.defaultSource && (
        <DefaultSourceEditor detail={detail} blockId={port.ref.blockId} portId={port.ref.portId} ds={port.defaultSource} />
      )}
      {port.controls.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {port.controls.map((c) => (
            <DetailControlField key={c.id} detail={detail} control={c} />
          ))}
        </div>
      )}

      <Section title={isInput ? 'Connection' : 'Connections'}>
        {isInput ? <FeedLine feed={port.feed} navigate={navigate} /> : <TargetList targets={port.targets} navigate={navigate} />}
      </Section>

      <Section title="Parent Block">
        <EndpointRow endpoint={port.parentBlock} navigate={navigate} />
      </Section>
    </div>
  );
});

// =============================================================================
// Type preview
// =============================================================================

function TypePreviewView({ preview }: { preview: TypePreviewDetail }) {
  return (
    <div>
      <Badge label="TYPE PREVIEW" color={colors.primary} />
      <h3 style={{ margin: '0 0 8px', fontSize: '18px' }}>{preview.typeLabel}</h3>
      <p style={{ margin: '0 0 16px', color: colors.textSecondary, fontSize: '13px' }}>{preview.type}</p>
      {preview.description && <p style={{ margin: '0 0 16px', fontSize: '14px' }}>{preview.description}</p>}

      <Section title="Inputs">
        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'none' }}>
          {preview.inputs.map((input) => (
            <li key={input.id} style={{ marginBottom: '8px', fontSize: '13px' }}>
              <strong>{input.label}</strong>: {input.typeLabel}
              {input.defaultLabel && (
                <div
                  style={{
                    marginLeft: '16px',
                    fontSize: '12px',
                    color: colors.textSecondary,
                    fontStyle: input.defaultIsTime ? 'italic' : 'normal',
                  }}
                >
                  Default: {input.defaultLabel}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Outputs">
        <ul style={{ margin: 0, paddingLeft: '20px', listStyle: 'none' }}>
          {preview.outputs.map((output) => (
            <li key={output.id} style={{ marginBottom: '4px', fontSize: '13px' }}>
              <strong>{output.label}</strong>: {output.typeLabel}
            </li>
          ))}
        </ul>
      </Section>

      {(preview.form || preview.capability) && (
        <div style={{ marginTop: '16px', padding: '12px', background: colors.bgPanel, borderRadius: '4px' }}>
          {preview.form && (
            <div style={{ fontSize: '12px', color: colors.textSecondary }}>
              <strong>Form:</strong> {preview.form}
            </div>
          )}
          {preview.capability && (
            <div style={{ fontSize: '12px', color: colors.textSecondary }}>
              <strong>Capability:</strong> {preview.capability}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Shared bits
// =============================================================================

const rowStyle: React.CSSProperties = {
  marginBottom: '8px',
  fontSize: '13px',
  padding: '8px',
  background: colors.bgPanel,
  borderRadius: '4px',
};

const deleteButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  background: 'rgba(255,107,107,0.15)',
  color: colors.error,
  border: '1px solid rgba(255,107,107,0.3)',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 600,
  marginTop: '8px',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: colors.textSecondary }}>{title}</h4>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        background: color + '22',
        borderRadius: '4px',
        marginBottom: '16px',
        fontSize: '12px',
        fontWeight: 600,
        color,
      }}
    >
      [{label}]
    </div>
  );
}

function PortHeaderLine({ label, typeDisplay }: { label: string; typeDisplay?: PortTypeDisplay }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <strong>{label}</strong>
        {typeDisplay && <span style={{ color: colors.textSecondary }}> ({typeDisplay.label})</span>}
      </div>
    </div>
  );
}

function EndpointRow({ endpoint, navigate }: { endpoint: EndpointDetail; navigate: Navigate }) {
  return (
    <div
      onClick={() => navigate(endpoint.blockId)}
      style={{
        cursor: 'pointer',
        padding: '8px 12px',
        background: colors.bgPanel,
        borderRadius: '4px',
        fontSize: '13px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <span style={{ color: colors.primary }}>{endpoint.blockLabel}</span>
        <span style={{ color: colors.textSecondary }}>.{endpoint.portId}</span>
      </div>
      {endpoint.typeDisplay && (
        <span
          style={{
            fontSize: '11px',
            padding: '2px 6px',
            background: 'rgba(78,205,196,0.15)',
            borderRadius: '3px',
            color: colors.primary,
          }}
        >
          {endpoint.typeDisplay.label}
        </span>
      )}
    </div>
  );
}

function FeedLine({ feed, navigate }: { feed: PortFeed; navigate: Navigate }) {
  switch (feed.kind) {
    case 'connected':
      return (
        <div style={{ marginTop: '4px', fontSize: '12px', fontFamily: "'Courier New', monospace" }}>
          {feed.sources.map((source, idx) => (
            <div
              key={idx}
              onClick={() => navigate(source.blockId)}
              style={{ color: colors.primary, cursor: 'pointer' }}
            >
              ← {source.blockLabel}.{source.portId}
            </div>
          ))}
        </div>
      );
    case 'default':
      return (
        <div style={{ marginTop: '4px', fontSize: '12px', color: colors.textSecondary }}>
          <span style={{ color: colors.textMuted }}>(not connected)</span> Default: {feed.label}
        </div>
      );
    case 'unconnected':
      return (
        <div style={{ marginTop: '4px', fontSize: '12px', color: colors.textMuted }}>(not connected)</div>
      );
    default: {
      const _exhaustive: never = feed;
      throw new Error(`Unhandled PortFeed: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function TargetList({ targets, navigate }: { targets: readonly EndpointDetail[]; navigate: Navigate }) {
  if (targets.length === 0) {
    return <div style={{ marginTop: '4px', fontSize: '12px', color: colors.textMuted }}>(not connected)</div>;
  }
  return (
    <div style={{ marginTop: '4px', fontSize: '12px', fontFamily: "'Courier New', monospace" }}>
      {targets.map((target, idx) => (
        <div key={idx} onClick={() => navigate(target.blockId)} style={{ color: colors.primary, cursor: 'pointer' }}>
          → {target.blockLabel}.{target.portId}
        </div>
      ))}
    </div>
  );
}

const CombineModeEditor = observer(function CombineModeEditor({
  detail,
  blockId,
  portId,
  combine,
}: {
  detail: SelectionDetail;
  blockId: string;
  portId: string;
  combine: CombineModeDetail;
}) {
  return (
    <div style={{ marginTop: '8px' }}>
      <label style={labelStyle}>Combine Mode</label>
      <SelectInput
        value={combine.current}
        onChange={(mode) => detail.setCombineMode(blockId, portId, mode)}
        options={combine.options.slice()}
        size="sm"
      />
    </div>
  );
});

const DefaultSourceEditor = observer(function DefaultSourceEditor({
  detail,
  blockId,
  portId,
  ds,
}: {
  detail: SelectionDetail;
  blockId: string;
  portId: string;
  ds: DefaultSourceDetail;
}) {
  return (
    <div style={{ marginTop: '8px', opacity: ds.inactive ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <label style={labelStyle}>
          Default Source {ds.inactive && <span style={{ fontSize: '11px' }}>(inactive - connected)</span>}
        </label>
        {ds.canReset && (
          <button onClick={() => detail.setDefaultSource(blockId, portId, undefined)} style={smallButtonStyle}>
            Reset
          </button>
        )}
      </div>
      <SelectInput
        value={ds.blockType}
        onChange={(bt) => detail.setDefaultSource(blockId, portId, bt)}
        options={ds.blockTypeOptions.slice()}
        size="sm"
      />
      {ds.outputPortOptions.length > 1 && (
        <div style={{ marginTop: '8px' }}>
          <SelectInput
            value={ds.outputPortId}
            onChange={(out) => detail.setDefaultSource(blockId, portId, ds.blockType, out)}
            options={ds.outputPortOptions.slice()}
            size="sm"
          />
        </div>
      )}
    </div>
  );
});

// =============================================================================
// Neutral controls
// =============================================================================

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: colors.textSecondary,
  display: 'block',
  marginBottom: '4px',
};

const smallButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: `1px solid ${colors.border}`,
  borderRadius: '4px',
  padding: '2px 6px',
  color: colors.textPrimary,
  cursor: 'pointer',
  fontSize: '11px',
};

const DetailControlField = observer(function DetailControlField({
  detail,
  control,
}: {
  detail: SelectionDetail;
  control: DetailControl;
}) {
  const onChange = (value: unknown) => detail.applyControl(control.target, value);
  return (
    <div>
      <label style={labelStyle}>{control.label}</label>
      <NeutralControl hint={control.hint} value={control.value} onChange={onChange} />
    </div>
  );
});

/**
 * Hint-first, value-guarded widget dispatch. A numeric widget renders only when the
 * value is a number; a boolean/color/text widget likewise. When the stored value
 * does not match the hinted widget, a read-only fallback shows the real value
 * rather than a fabricated default. [LAW:types-are-the-program] [LAW:no-silent-failure]
 */
function NeutralControl({
  hint,
  value,
  onChange,
}: {
  hint?: UIControlHint;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (hint) {
    switch (hint.kind) {
      case 'slider':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min} max={hint.max} step={hint.step} onChange={onChange} />
        ) : (
          <ReadOnly value={value} />
        );
      case 'int':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min ?? 0} max={hint.max ?? 10000} step={hint.step ?? 1} onChange={onChange} />
        ) : (
          <ReadOnly value={value} />
        );
      case 'float':
        return isNumber(value) ? (
          <SliderWithInput label="" value={value} min={hint.min ?? 0} max={hint.max ?? 1} step={hint.step ?? 0.01} onChange={onChange} />
        ) : (
          <ReadOnly value={value} />
        );
      case 'select':
        return <SelectInput value={String(value)} onChange={onChange} options={hint.options.slice()} size="sm" />;
      case 'boolean':
        return <CheckboxInput checked={Boolean(value)} onChange={onChange} />;
      case 'color':
        return isString(value) ? <ColorInput value={value} onChange={onChange} /> : <ReadOnly value={value} />;
      case 'text':
        return <TextInput value={String(value ?? '')} onChange={onChange} size="sm" />;
      case 'xy': {
        if (typeof value !== 'object' || value === null) return <ReadOnly value={value} />;
        const xy = value as { x?: number; y?: number };
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <SliderWithInput label="X" value={xy.x ?? 0} min={-1000} max={1000} step={1} onChange={(x) => onChange({ ...xy, x })} />
            <SliderWithInput label="Y" value={xy.y ?? 0} min={-1000} max={1000} step={1} onChange={(y) => onChange({ ...xy, y })} />
          </div>
        );
      }
      default: {
        const _exhaustive: never = hint;
        throw new Error(`Unhandled UIControlHint: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  // No hint: choose by the stored value's type; never fabricate.
  if (isBoolean(value)) return <CheckboxInput checked={value} onChange={onChange} />;
  if (isNumber(value)) return <NumberInput value={value} onChange={onChange} size="sm" />;
  if (isString(value)) return <TextInput value={value} onChange={onChange} size="sm" />;
  return <ReadOnly value={value} />;
}

function ReadOnly({ value }: { value: unknown }) {
  return (
    <div style={{ padding: '6px 8px', background: colors.bgPanel, borderRadius: '4px', fontSize: '12px', color: colors.textMuted }}>
      {value === undefined || value === null ? '—' : formatValue(value)}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

// =============================================================================
// Neutral name editor
// =============================================================================

function NeutralNameEditor({ current, onCommit }: { current: string; onCommit: (name: string) => { error?: string } }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const escaping = useRef(false);

  // Enter/leave edit mode by resetting the draft to the authoritative name
  // SYNCHRONOUSLY at the transition, so a rejected value never lingers and there is
  // no one-frame flicker of stale text on the next edit.
  const beginEdit = () => {
    setDraft(current);
    setError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(current);
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span style={{ cursor: 'pointer' }} onClick={beginEdit} title="Click to rename">
        {current}
      </span>
    );
  }

  // Commit: validate + surface the store's rejection inline; only leave edit mode on
  // success, so an invalid/duplicate/empty rename is never silently swallowed.
  // [LAW:no-silent-failure]
  const commit = () => {
    const name = draft.trim();
    if (name.length === 0) {
      setError('Name cannot be empty');
      return;
    }
    const result = onCommit(name);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setEditing(false);
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
      <input
        autoFocus
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onBlur={() => {
          // Commit runs on exactly one path — blur. Enter and Escape both blur the
          // input; an escape flag tells this handler to cancel instead of commit, so
          // setDisplayName is never called twice for one edit.
          if (escaping.current) {
            escaping.current = false;
            cancelEdit();
            return;
          }
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            escaping.current = true;
            e.currentTarget.blur();
          }
        }}
        style={{
          fontSize: '18px',
          fontWeight: 'bold',
          background: colors.bgPanel,
          color: colors.textPrimary,
          border: `1px solid ${error ? colors.error : colors.border}`,
          borderRadius: '4px',
        }}
      />
      {error && <span style={{ fontSize: '11px', color: colors.error }}>{error}</span>}
    </div>
  );
}
