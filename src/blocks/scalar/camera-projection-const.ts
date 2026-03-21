/**
 * CameraProjectionConst Block
 *
 * Outputs a constant camera projection mode (0=ortho, 1=persp).
 */

import { registerBlock, requireConfigInt } from '../registry';
import { canonicalType, payloadStride, cameraProjectionConst } from '../../core/canonical-types';
import { INT, CAMERA_PROJECTION } from '../../core/canonical-types';
import { cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst } from '../../types';

// [LAW:one-source-of-truth] CameraProjectionConst cardinality policy is declared on CT/ICT.
const CAMERA_PROJECTION_CONST_CARD = cardinalityVar(cardinalityVarId('camera_projection_const_cardinality'), {
  acceptance: 'oneOnly',
  instanceBinding: 'inherit',
});

export function register(): void {
  registerBlock({
    type: 'CameraProjectionConst',
    label: 'Camera Projection',
    category: 'scalar',
    description: 'Outputs a constant camera projection mode (0=ortho, 1=persp)',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      value: {
        type: canonicalType(INT),
        defaultValue: 0,
        defaultSource: defaultSourceConst(0),
        uiHint: { kind: 'select', options: [{ value: '0', label: 'Orthographic' }, { value: '1', label: 'Perspective' }] },
        exposedAsPort: false,
      },
    },
    outputs: {
      out: { label: 'Output', type: canonicalType(CAMERA_PROJECTION, undefined, { cardinality: CAMERA_PROJECTION_CONST_CARD }) },
    },
    constantValueFromConfig: (config) => {
      const rawValue = config.value;
      return rawValue === 1 ? 'perspective' : 'orthographic';
    },
    lower: ({ ctx, config }) => {
      const rawValue = requireConfigInt(config!, 'value', 0, 1);
      const sigId = ctx.b.constant(cameraProjectionConst(rawValue === 1 ? 'perspective' : 'orthographic'), canonicalType(CAMERA_PROJECTION));
      const outType = ctx.outTypes[0];
      return {
        outputsById: {
          out: { id: sigId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'out', type: outType },
          ],
        },
      };
    },
  });
}
