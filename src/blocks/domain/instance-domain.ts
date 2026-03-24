/**
 * InstanceDomain Block
 *
 * Provides per-element domain identity: rank (normalized [0,1]) and index (raw integer).
 * This block is the origin of a new instance domain. It dictates the WebGPU thread dispatch count
 * and binds the shape element that will be rendered by downstream blocks.
 */

import { registerBlock } from '../registry';
import { payloadStride, FLOAT, INT, SHAPE, type PayloadType, requireInst, canonicalType } from '../../core/canonical-types';
import { inferType, cardinalityVar } from '../../core/inference-types';
import { cardinalityVarId } from '../../core/ids';
import { defaultSourceConst, defaultSource } from '../../types';
import { DOMAIN_CIRCLE } from '../../core/domain-registry';
import { tryResolveInputConstant } from '../lower-utils';

// [LAW:one-source-of-truth] InstanceDomain field outputs share one declared cardinality policy.
const INSTANCE_DOMAIN_CARD = cardinalityVar(cardinalityVarId('instance_domain_fields'), {
  relation: 'uniform',
  acceptance: 'manyOnly',
  instanceBinding: { kind: 'create', domainType: DOMAIN_CIRCLE },
});

// [LAW:single-enforcer] Instance fan-out safety is enforced at one boundary.
const ARRAY_SAFE_MAX_COUNT = 1_000_000;

export function register(): void {
  registerBlock({
    type: 'InstanceDomain',
    label: 'Instance Domain',
    category: 'domain',
    description: 'Provides per-element domain identity: rank and index',
    form: 'primitive',
    capability: 'identity',
    loweringPurity: 'pure',
    payload: {
      allowedPayloads: {
        element: [SHAPE],
      },
      combinations: [SHAPE].map(p => ({
        inputs: [p] as PayloadType[],
        output: p,
      })),
      semantics: 'typeSpecific',
    },
    inputs: {
      element: {
        label: 'Element',
        type: canonicalType(SHAPE),
        defaultSource: defaultSource('Ellipse', 'shape'),
      },
      count: {
        label: 'Count',
        type: canonicalType(INT),
        defaultSource: defaultSourceConst(500),
        exposedAsPort: true,
        uiHint: { kind: 'slider', min: 64, max: 2048, step: 1 },
        semantic: 'instanceCount',
      },
    },
    outputs: {
      rank: { label: 'Rank', type: inferType(FLOAT, { kind: 'none' }, { cardinality: INSTANCE_DOMAIN_CARD }) },
      index: { label: 'Index', type: inferType(INT, { kind: 'none' }, { cardinality: INSTANCE_DOMAIN_CARD }) },
    },
    lower: ({ ctx, inputsById, config }) => {
      const countInput = inputsById.count;
      if (!countInput) throw new Error('InstanceDomain: count input not wired');
      const staticCount = tryResolveInputConstant(ctx, countInput, 'count', { min: 1, max: ARRAY_SAFE_MAX_COUNT });
      const elementInput = inputsById.element;

      if (!elementInput || !('type' in elementInput && requireInst(elementInput.type.extent.cardinality, 'cardinality').kind === 'one')) {
        throw new Error('InstanceDomain block requires an element with one-cardinality');
      }

      const configuredCount = typeof config.count === 'number' && Number.isFinite(config.count)
        ? Math.floor(config.count)
        : 500;
      const clampedMaxCount = Math.min(ARRAY_SAFE_MAX_COUNT, Math.max(1, configuredCount));

      const instanceId = staticCount !== null
        ? ctx.b.createInstance(DOMAIN_CIRCLE, staticCount, elementInput.id)
        : ctx.b.createInstance(
            DOMAIN_CIRCLE,
            {
              kind: 'dynamic',
              countExpr: countInput.id,
              maxCount: clampedMaxCount,
            },
            elementInput.id,
            'dynamic',
          );

      const rankType = ctx.outTypes[0];
      const indexType = ctx.outTypes[1];

      // [LAW:one-source-of-truth] Domain properties resolve via domain_property intrinsic kind.
      const rankField = ctx.b.domainProperty('rank', rankType);
      const indexField = ctx.b.domainProperty('index', indexType);

      return {
        outputsById: {
          rank: { id: rankField, slot: undefined, type: rankType, stride: payloadStride(rankType.payload) },
          index: { id: indexField, slot: undefined, type: indexType, stride: payloadStride(indexType.payload) },
        },
        effects: {
          // Zero-allocation: Intrinsics do not require memory slots.
        },
        instanceContext: instanceId,
      };
    },
  });
}
