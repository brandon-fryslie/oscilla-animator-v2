/**
 * InspectorEdgeDebugProbe — the debug-viz realization of an edge's live value
 * probe for the neutral inspector.
 *
 * The edge inspector shows the live runtime value flowing on the selected edge
 * when debug is enabled. That reads the debug store + history service by edge id —
 * a debug-viz concern (a parity row owned by that subsystem), not an era's patch
 * model. So the neutral edge view mounts THIS leaf, which self-manages via the
 * edge id + a human label; it stays dark until debug is on. Preserves the V1 edge
 * probe without pulling debug-store coupling into the inspector. [LAW:decomposition]
 */

import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStores } from '../../stores';
import { useDebugMiniView } from '../debug-viz/useDebugMiniView';
import { DebugEdgeValueDisplay } from '../debug-viz/DebugMiniView';
import { colors } from '../theme';

export const InspectorEdgeDebugProbe = observer(function InspectorEdgeDebugProbe({
  edgeId,
  label,
}: {
  edgeId: string;
  label: string;
}) {
  const { debug } = useStores();
  return (
    <div style={{ marginBottom: '12px' }}>
      <h4 style={{ margin: '0 0 6px', fontSize: '13px', color: colors.textSecondary }}>
        Debug{' '}
        <span style={{ fontSize: '10px', color: debug.enabled ? colors.primary : colors.textMuted }}>
          ({debug.enabled ? 'active' : 'disabled'})
        </span>
      </h4>
      {/* The polling hook lives in ActiveProbe, which MOUNTS only when debug is on —
          a conditional mount, not a conditional hook — so the 250ms poll and history
          tracking never start while debug is disabled. */}
      {debug.enabled && <ActiveProbe edgeId={edgeId} label={label} />}
    </div>
  );
});

const ActiveProbe = observer(function ActiveProbe({ edgeId, label }: { edgeId: string; label: string }) {
  const data = useDebugMiniView(edgeId, label);
  if (data) return <DebugEdgeValueDisplay data={data} />;
  return (
    <div style={{ padding: '8px', background: colors.bgPanel, borderRadius: '4px', fontSize: '12px', color: colors.textMuted }}>
      No debug data available for this edge
    </div>
  );
});
