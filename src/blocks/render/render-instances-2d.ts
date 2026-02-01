/**
 * RenderInstances2D Block
 *
 * Renders 2D instances at positions with color.
 */

import { registerBlock } from '../registry';
import { instanceId as makeInstanceId, domainTypeId as makeDomainTypeId } from '../../core/ids';
import { canonicalType, canonicalField, unitWorld3, requireInst, FLOAT, VEC3, COLOR } from '../../core/canonical-types';
import { defaultSourceConst } from '../../types';

registerBlock({
  type: 'RenderInstances2D',
  label: 'Render Instances 2D',
  category: 'render',
  description: 'Renders 2D instances at positions with color. Shape comes from wired element.',
  form: 'primitive',
  capability: 'render',
  cardinality: {
    cardinalityMode: 'fieldOnly',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  inputs: {
    pos: { label: 'Position', type: canonicalField(VEC3, unitWorld3(), { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    color: { label: 'Color', type: canonicalField(COLOR, { kind: 'scalar' }, { instanceId: makeInstanceId('default'), domainTypeId: makeDomainTypeId('default') }) },
    shape: { label: 'Shape', type: canonicalType(FLOAT) },
    scale: {
      label: 'Scale',
      type: canonicalType(FLOAT),
      value: 1.0,
      defaultSource: defaultSourceConst(1.0),
      uiHint: { kind: 'slider', min: 0.1, max: 1, step: 0.1 },
    },
  },
  outputs: {},
  lower: ({ ctx, inputsById }) => {
    const pos = inputsById.pos;
    const color = inputsById.color;

    const posIsField = pos && 'type' in pos && requireInst(pos.type.extent.cardinality, 'cardinality').kind === 'many';

    if (!pos || !posIsField) {
      throw new Error('RenderInstances2D pos input must be a field');
    }
    if (!color) {
      throw new Error('RenderInstances2D color input is required');
    }
    // color may be a signal (one) when wired from a Const via allowZipSig broadcast — that's valid

    const instance = ctx.inferredInstance;
    if (!instance) {
      throw new Error('RenderInstances2D requires field inputs with instance context');
    }

    return {
      outputsById: {},
    };
  },
});
