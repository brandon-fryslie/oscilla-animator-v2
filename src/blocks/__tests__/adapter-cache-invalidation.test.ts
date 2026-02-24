import { describe, expect, it } from 'vitest';
import { canonicalType, unitNone } from '../../core/canonical-types';
import { BOOL, CAMERA_PROJECTION, FLOAT, INT } from '../../core/canonical-types';
import { findAdapter } from '../adapter-spec';
import { getBlockDefinition, registerBlock } from '../registry';
import '../all';

describe('adapter cache invalidation', () => {
  it('picks up adapters registered after first lookup', () => {
    // Prime adapter cache before registering the late adapter.
    findAdapter(canonicalType(FLOAT, unitNone()), canonicalType(INT, unitNone()));

    const lateAdapterType = 'TestLateAdapter_BoolToCameraProjection';
    if (!getBlockDefinition(lateAdapterType)) {
      registerBlock({
        type: lateAdapterType,
        label: 'Late Bool→CameraProjection',
        category: 'test',
        form: 'primitive',
        capability: 'pure',
        inputs: {
          in: { label: 'In', type: canonicalType(BOOL, unitNone()) },
        },
        outputs: {
          out: { label: 'Out', type: canonicalType(CAMERA_PROJECTION, unitNone()) },
        },
        adapterSpec: {
          from: {
            payload: BOOL,
            unit: unitNone(),
            extent: 'any',
          },
          to: {
            payload: CAMERA_PROJECTION,
            unit: unitNone(),
            extent: 'any',
          },
          inputPortId: 'in',
          outputPortId: 'out',
          description: 'Late-registered test adapter',
          purity: 'pure',
          stability: 'stable',
        },
        lower: () => ({ outputsById: {}, effects: {} }),
      });
    }

    const adapter = findAdapter(
      canonicalType(BOOL, unitNone()),
      canonicalType(CAMERA_PROJECTION, unitNone()),
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.blockType).toBe(lateAdapterType);
  });
});
