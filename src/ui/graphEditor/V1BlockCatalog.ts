/**
 * V1BlockCatalog — the V1 registry projected into the neutral BlockCatalog.
 *
 * This is the ONE file in `src/ui` permitted to read the V1 block registry for
 * catalog queries. The registry-read code that used to live inline in the block
 * library, connection picker, and replacement menu is MOVED here — moved, not
 * rewritten — and translated once into neutral `CatalogEntry` facts.
 * [LAW:single-enforcer] [LAW:carrying-cost]
 *
 * A grep gate (`block-catalog-registry-gate.test.ts`) enforces that no other
 * editor file imports the registry's catalog functions.
 */

import {
  getBlockCategories,
  getBlockTypesByCategory,
  getAnyBlockDefinition,
  type BlockDef,
  type BlockOpenBehaviorDef,
  type InputDef,
  type OutputDef,
} from '../../blocks/registry';
import { type CompositeBlockDef, isCompositeBlockDef } from '../../blocks/composite-types';
import { typeDisplayFor } from './neutral-projection';
import type {
  BlockCatalog,
  CatalogEntry,
  CatalogOpenBehavior,
  CatalogPort,
} from './block-catalog';

type AnyDef = BlockDef | CompositeBlockDef;

/** Map the V1 open-behavior descriptor to the neutral one. */
function toOpenBehavior(behavior: BlockOpenBehaviorDef): CatalogOpenBehavior {
  return behavior.kind === 'open-expression-editor'
    ? { kind: 'expressionEditor' }
    : { kind: 'none' };
}

/** Wireable input ports only — config-only inputs never cross the seam. */
function inputPorts(def: AnyDef): readonly CatalogPort[] {
  return Object.entries(def.inputs)
    .filter(([, input]: [string, InputDef]) => input.exposedAsPort !== false)
    .map(([id, input]: [string, InputDef]) => ({
      id,
      label: input.label ?? id,
      typeDisplay: typeDisplayFor(input.type),
    }));
}

/** Visible output ports only — hidden outputs never cross the seam. */
function outputPorts(def: AnyDef): readonly CatalogPort[] {
  return Object.entries(def.outputs)
    .filter(([, output]: [string, OutputDef]) => !output.hidden)
    .map(([id, output]: [string, OutputDef]) => ({
      id,
      label: output.label ?? id,
      typeDisplay: typeDisplayFor(output.type),
    }));
}

function toCatalogEntry(def: AnyDef): CatalogEntry {
  const composite = isCompositeBlockDef(def);
  return {
    type: def.type,
    label: def.label,
    description: def.description,
    category: def.category,
    form: def.form,
    // Only library composites are locked; primitives + user composites are editable.
    editable: composite ? def.readonly !== true : true,
    // A V1 time root is a singleton — not palette-insertable, not a replacement candidate.
    insertable: def.capability !== 'time',
    openBehavior: toOpenBehavior(def.ui.openBehavior),
    inputs: inputPorts(def),
    outputs: outputPorts(def),
  };
}

/**
 * Build the V1 catalog. Enumerates the registry exactly as the block library did
 * (categories → types), so the neutral entry set is the same set the editor
 * always showed. [LAW:one-source-of-truth]
 *
 * The projection reads the registry FRESH on every access — it holds no snapshot.
 * The V1 registry is a mutable global: `registerAllBlocks()` populates it at boot
 * and `registerComposite()` adds user-authored composites at runtime. A cached
 * snapshot would both risk capturing an empty registry (if built before boot
 * registration) and silently omit runtime composites forever. Reading fresh
 * mirrors the old per-render registry reads and stays correct as the registry
 * grows. Lookup uses the registry's own O(1) index rather than materializing the
 * whole catalog. [LAW:no-silent-failure]
 */
export function createV1BlockCatalog(): BlockCatalog {
  return {
    get entries(): readonly CatalogEntry[] {
      return getBlockCategories()
        .flatMap((category) => getBlockTypesByCategory(category))
        .map(toCatalogEntry);
    },
    getEntry: (type) => {
      const def = getAnyBlockDefinition(type);
      return def ? toCatalogEntry(def) : undefined;
    },
  };
}

/** The V1 catalog is a live projection of the registry (no snapshot). */
export const v1BlockCatalog: BlockCatalog = createV1BlockCatalog();
