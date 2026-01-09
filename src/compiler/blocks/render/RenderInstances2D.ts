import type { SigExprId, FieldExprId } from '../../../types';
import {
  registerBlock,
  portId,
  sigType,
  fieldType,
  domainType,
  type BlockLower,
} from '../registry';
import { domainId } from '../../ir/Indices';

const lowerRenderInstances2D: BlockLower = ({ b, inputsById }) => {
  const domain = inputsById.domain;
  const pos = inputsById.pos;
  const color = inputsById.color;
  const size = inputsById.size;
  const opacity = inputsById.opacity;

  if (!domain || domain.kind !== 'domain') {
    throw new Error('RenderInstances2D requires domain input');
  }
  if (!pos || pos.kind !== 'field') {
    throw new Error('RenderInstances2D requires pos (field<vec2>) input');
  }
  if (!color || color.kind !== 'field') {
    throw new Error('RenderInstances2D requires color (field<color>) input');
  }

  // Domain validation: ensure field domains match sink domain
  const posDomain = b.inferFieldDomain(pos.id);
  if (posDomain !== undefined && posDomain !== domain.id) {
    throw new Error(
      `RenderInstances2D: pos field domain '${posDomain}' does not match ` +
      `sink domain '${domain.id}'`
    );
  }

  const colorDomain = b.inferFieldDomain(color.id);
  if (colorDomain !== undefined && colorDomain !== domain.id) {
    throw new Error(
      `RenderInstances2D: color field domain '${colorDomain}' does not match ` +
      `sink domain '${domain.id}'`
    );
  }

  // Size can be a signal or field
  let sizeId: SigExprId | FieldExprId | undefined;
  if (size) {
    if (size.kind === 'sig') {
      sizeId = size.id;
    } else if (size.kind === 'field') {
      sizeId = size.id;
    }
  }

  // Opacity - if provided and is a signal
  let opacitySigId: SigExprId | undefined;
  if (opacity && opacity.kind === 'sig') {
    opacitySigId = opacity.id;
  }

  // Apply opacity to color if provided
  let finalColorId = color.id;
  if (opacitySigId) {
    finalColorId = b.fieldZipSig(
      color.id,
      [opacitySigId],
      { kind: 'kernel', name: 'applyOpacity' },
      fieldType('color')
    );
  }

  // Emit the render step
  b.stepRender(domainId(domain.id), pos.id, finalColorId, sizeId);

  // Render blocks have no outputs (they're sinks)
  return {};
};

registerBlock({
  kind: 'RenderInstances2D',
  inputs: [
    { portId: portId('domain'), type: domainType() },
    { portId: portId('pos'), type: fieldType('vec2') },
    { portId: portId('color'), type: fieldType('color') },
    { portId: portId('size'), type: fieldType('float'), optional: true }, // Can be signal or field
    { portId: portId('opacity'), type: sigType('float'), optional: true },
  ],
  outputs: [],
  lower: lowerRenderInstances2D,
});
