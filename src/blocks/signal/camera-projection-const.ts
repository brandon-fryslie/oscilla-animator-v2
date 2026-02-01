/**
 * CameraProjectionConst Block
 *
 * Outputs a constant camera projection mode (0=ortho, 1=persp).
 */

import { registerBlock } from '../registry';
import { canonicalType, strideOf, cameraProjectionConst } from '../../core/canonical-types';
import { INT, CAMERA_PROJECTION } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'CameraProjectionConst',
  label: 'Camera Projection',
  category: 'signal',
  description: 'Outputs a constant camera projection mode (0=ortho, 1=persp)',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    value: {
      type: canonicalType(INT),
      value: 0,
      defaultSource: defaultSourceConst(0),
      uiHint: { kind: 'select', options: [{ value: '0', label: 'Orthographic' }, { value: '1', label: 'Perspective' }] },
      exposedAsPort: true,
    },
  },
  outputs: {
    out: { label: 'Output', type: canonicalType(CAMERA_PROJECTION) },
  },
  lower: ({ ctx, config }) => {
    const rawValue = (config?.value as number) ?? 0;
    const sigId = ctx.b.constant(cameraProjectionConst(rawValue === 1 ? 'perspective' : 'orthographic'), canonicalType(CAMERA_PROJECTION));
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();
    return { outputsById: { out: { id: sigId, slot, type: outType, stride: strideOf(outType.payload) } } };
  },
});
