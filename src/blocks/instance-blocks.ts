/**
 * Instance Blocks (NEW - Domain Refactor Sprint 3)
 *
 * Blocks that create instances of domain types.
 * These replace the old GridDomain/DomainN blocks.
 */

import { registerBlock } from './registry';
import { signalType, signalTypeField } from '../core/canonical-types';
import { DOMAIN_CIRCLE } from '../core/domain-registry';
import type { LayoutSpec } from '../compiler/ir/types';

// =============================================================================
// Layout Blocks
// =============================================================================

/**
 * GridLayout - Creates a grid layout specification
 *
 * NOTE: Layout blocks output 'int' signals as placeholders. The actual LayoutSpec
 * is carried as metadata. This is a compile-time construct.
 */
registerBlock({
  type: 'GridLayout',
  label: 'Grid Layout',
  category: 'layout',
  description: 'Creates a grid layout with rows and columns',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'rows', label: 'Rows', type: signalType('int'), defaultValue: 10 },
    { id: 'cols', label: 'Columns', type: signalType('int'), defaultValue: 10 },
  ],
  outputs: [
    { id: 'layout', label: 'Layout', type: signalType('int') },
  ],
  params: {
    defaultRows: 10,
    defaultCols: 10,
  },
  lower: ({ ctx, inputsById, config }) => {
    // For now, layouts are compile-time only, so we extract const values
    // TODO: Support dynamic layouts when runtime supports it
    const rows = (config?.defaultRows as number) ?? 10;
    const cols = (config?.defaultCols as number) ?? 10;

    // Create layout spec object
    const layout: LayoutSpec = { kind: 'grid', rows, cols };

    // Store layout as metadata on a signal (layouts are not executable IR, they're config)
    // Use int(0) as a placeholder value
    const layoutSignal = ctx.b.sigConst(0, signalType('int'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        layout: { k: 'sig', id: layoutSignal, slot, metadata: { layoutSpec: layout } },
      },
    };
  },
});

/**
 * LinearLayout - Creates a linear layout specification
 */
registerBlock({
  type: 'LinearLayout',
  label: 'Linear Layout',
  category: 'layout',
  description: 'Creates a linear layout with direction and spacing',
  form: 'primitive',
  capability: 'pure',
  inputs: [
    { id: 'direction', label: 'Direction', type: signalType('vec2'), defaultValue: [1, 0] },
    { id: 'spacing', label: 'Spacing', type: signalType('float'), defaultValue: 10 },
  ],
  outputs: [
    { id: 'layout', label: 'Layout', type: signalType('int') },
  ],
  params: {
    defaultSpacing: 10,
  },
  lower: ({ ctx, config }) => {
    const spacing = (config?.defaultSpacing as number) ?? 10;

    const layout: LayoutSpec = { kind: 'linear', spacing };

    const layoutSignal = ctx.b.sigConst(0, signalType('int'));
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        layout: { k: 'sig', id: layoutSignal, slot, metadata: { layoutSpec: layout } },
      },
    };
  },
});

// =============================================================================
// CircleInstance
// =============================================================================

registerBlock({
  type: 'CircleInstance',
  label: 'Circle Instance',
  category: 'instance',
  description: 'Creates an instance of circles with specified layout',
  form: 'primitive',
  capability: 'identity',
  inputs: [
    { id: 'count', label: 'Count', type: signalType('int'), defaultValue: 100 },
    { id: 'layout', label: 'Layout', type: signalType('int'), optional: true },
  ],
  outputs: [
    { id: 'position', label: 'Position', type: signalTypeField('vec2', 'default') },
    { id: 'radius', label: 'Radius', type: signalTypeField('float', 'default') },
    { id: 'index', label: 'Index', type: signalTypeField('int', 'default') },
    { id: 't', label: 'T (normalized)', type: signalTypeField('float', 'default') },
  ],
  params: {
    count: 100,
    layoutKind: 'grid',
    rows: 10,
    cols: 10,
  },
  lower: ({ ctx, inputsById, config }) => {
    const count = (config?.count as number) ?? 100;

    // Try to get layout from input
    const layoutInput = inputsById.layout;
    let layout: LayoutSpec;

    if (layoutInput && (layoutInput as any).metadata?.layoutSpec) {
      // Use layout from connected block
      layout = (layoutInput as any).metadata.layoutSpec;
    } else {
      // Fallback to config-based layout
      const layoutKind = (config?.layoutKind as string) ?? 'grid';
      const rows = (config?.rows as number) ?? 10;
      const cols = (config?.cols as number) ?? 10;

      if (layoutKind === 'grid') {
        layout = { kind: 'grid', rows, cols };
      } else {
        layout = { kind: 'unordered' };
      }
    }

    // Create instance using new IRBuilder method
    const instanceId = ctx.b.createInstance(DOMAIN_CIRCLE, count, layout);

    // Create field expressions for intrinsic properties
    const positionField = ctx.b.fieldIntrinsic(instanceId, 'position', signalTypeField('vec2', 'default'));
    const radiusField = ctx.b.fieldIntrinsic(instanceId, 'radius', signalTypeField('float', 'default'));
    const indexField = ctx.b.fieldIntrinsic(instanceId, 'index', signalTypeField('int', 'default'));
    const tField = ctx.b.fieldIntrinsic(instanceId, 'normalizedIndex', signalTypeField('float', 'default'));

    // Allocate slots
    const positionSlot = ctx.b.allocSlot();
    const radiusSlot = ctx.b.allocSlot();
    const indexSlot = ctx.b.allocSlot();
    const tSlot = ctx.b.allocSlot();

    return {
      outputsById: {
        position: { k: 'field', id: positionField, slot: positionSlot },
        radius: { k: 'field', id: radiusField, slot: radiusSlot },
        index: { k: 'field', id: indexField, slot: indexSlot },
        t: { k: 'field', id: tField, slot: tSlot },
      },
    };
  },
});
