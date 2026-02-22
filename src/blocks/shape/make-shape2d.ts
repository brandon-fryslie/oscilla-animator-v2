/**
 * MakeShape2D Block
 *
 * Assembler: accepts deformed Field<vec2> control points and packs them
 * back into a One<shape2d> with auto-generated LINE-based topology.
 *
 * This is the critical piece that closes the Generator -> Deform -> Assemble loop.
 * Any Field<vec2> (e.g. from ProceduralPolygon.controlPoints run through
 * math blocks) can be assembled into a renderable shape.
 */

import { registerBlock, requireConfig } from '../registry';
import { canonicalType, canonicalManyDef, payloadStride, requireInst } from '../../core/canonical-types';
import { BOOL, FLOAT, VEC2 } from '../../core/canonical-types';
import { DOMAIN_CONTROL } from '../../core/domain-registry';
import { registerDynamicTopology } from '../../shapes/registry';
import { createLinePathTopology } from './_topology-helpers';

/**
 * MakeShape2D - Assemble Field<vec2> into One<shape2d>
 *
 * Takes a control-points field (possibly deformed by upstream math) and
 * produces a renderable shape with auto-generated line topology.
 *
 * Inputs:
 * - controlPoints: Field<vec2>  (wireable, the vertex positions)
 * - closed: bool               (config only, default true)
 *
 * Outputs:
 * - shape: One<shape2d>     (assembled shape with topology)
 *
 * Example:
 * ```
 * polygon = ProceduralPolygon(sides=5)
 * offset = Add(polygon.controlPoints, vec2(0.1, 0))
 * shape  = MakeShape2D(controlPoints=offset)
 * ```
 */
export function register(): void {
  registerBlock({
    type: 'MakeShape2D',
    label: 'Make Shape',
    category: 'shape',
    description: 'Assemble Field<vec2> control points into a renderable shape',
    form: 'primitive',
    capability: 'pure',
    loweringPurity: 'pure',
    inputs: {
      controlPoints: {
        label: 'Control Points',
        type: canonicalManyDef(VEC2, { kind: 'none' }),
      },
      closed: {
        label: 'Closed',
        type: canonicalType(BOOL),
        defaultValue: true,
        exposedAsPort: false,
        uiHint: { kind: 'boolean' },
      },
    },
    outputs: {
      shape: { label: 'Shape', type: canonicalType(FLOAT) },
    },
    lower: ({ ctx, inputsById, config }) => {
      // Validate input is field-extent (cardinality many) — I33 enforcement
      const controlPointsInput = inputsById.controlPoints;
      if (!controlPointsInput) {
        throw new Error('MakeShape2D: controlPoints input not wired — normalization bug');
      }
      const cardAxis = controlPointsInput.type.extent.cardinality;
      const card = requireInst(cardAxis, 'cardinality');
      if (card.kind !== 'many') {
        throw new Error(
          `MakeShape2D: controlPoints must be field-extent (cardinality many), ` +
          `got ${card.kind}. Cannot assemble a shape from a single point.`
        );
      }
  
      // Get instance from context (inferred from input field)
      const instance = ctx.inferredInstance !== undefined ? ctx.inferredInstance : ctx.instance;
      if (!instance) {
        throw new Error('MakeShape2D: no instance context — controlPoints must come from a field-producing block');
      }
  
      // Look up instance declaration to get point count
      const instanceDecl = ctx.instances.get(instance);
      if (!instanceDecl) {
        throw new Error(`MakeShape2D: instance '${instance}' not found in instance registry`);
      }
      const pointCount = instanceDecl.count;
      if (typeof pointCount !== 'number') {
        throw new Error(`MakeShape2D: dynamic instance count not supported — topology requires compile-time count`);
      }
  
      // [LAW:single-enforcer] normalize legacy numeric 0/1 and canonical boolean here.
      const closedRaw = config['closed'];
      const closed = typeof closedRaw === 'boolean'
        ? requireConfig<boolean>(config, 'closed', 'boolean')
        : typeof closedRaw === 'number'
          ? closedRaw !== 0
          : (() => {
              throw new Error(`Config 'closed' expected boolean (or legacy 0/1), got ${typeof closedRaw}`);
            })();
  
      // Create and register topology
      const topology = createLinePathTopology(pointCount, closed);
      const topologyId = registerDynamicTopology(topology, `make-shape2d-${pointCount}-${closed}`);
  
      // Create shape reference pointing to the (possibly deformed) control points
      const shapeRefSig = ctx.b.shapeRef(
        topologyId,
        [],
        canonicalType(FLOAT),
        controlPointsInput.id
      );
  
      const shapeType = ctx.outTypes[0];
  
      return {
        outputsById: {
          shape: { id: shapeRefSig, slot: undefined, type: shapeType, stride: payloadStride(shapeType.payload) },
        },
        effects: {
          slotRequests: [
            { portId: 'shape', type: shapeType },
          ],
        },
        instanceContext: instance,
      };
    },
  });
}
