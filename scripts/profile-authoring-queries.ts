import fs from 'node:fs';
import path from 'node:path';
import { registerAllBlocks } from '../src/blocks/all';
import { getBlockCategories, getBlockTypesByCategory, requireAnyBlockDef } from '../src/blocks/registry';
import {
  queryAddSourceBlocks,
  queryConnectTargetsForSource,
} from '../src/compiler/frontend/authoring-queries';
import { importPatchFromHCL } from '../src/services/PatchPersistence';
import type { BlockId, PortId } from '../src/types';

registerAllBlocks();

const repoRoot = process.cwd();
const demoFiles = [
  'src/demo/hcl/examples/simple.hcl',
  'src/demo/hcl/showcase/breathing-ring.hcl',
  'src/demo/hcl/showcase/library-kitchen-sink.hcl',
];

function allBlockDefs() {
  return getBlockCategories().flatMap((category) => getBlockTypesByCategory(category));
}

function findFirstBindableInput(patch: ReturnType<typeof importPatchFromHCL>['patch']): { blockId: BlockId; portId: PortId } | null {
  for (const [blockId, block] of patch.blocks) {
    const def = requireAnyBlockDef(block.type);
    for (const [portId, inputDef] of Object.entries(def.inputs)) {
      if (inputDef.exposedAsPort === false) continue;
      return { blockId, portId: portId as PortId };
    }
  }
  return null;
}

function findFirstVisibleOutput(patch: ReturnType<typeof importPatchFromHCL>['patch']): { blockId: BlockId; portId: PortId } | null {
  for (const [blockId, block] of patch.blocks) {
    const def = requireAnyBlockDef(block.type);
    for (const [portId, outputDef] of Object.entries(def.outputs)) {
      if (outputDef.hidden) continue;
      return { blockId, portId: portId as PortId };
    }
  }
  return null;
}

for (const relativePath of demoFiles) {
  const absolutePath = path.join(repoRoot, relativePath);
  const hcl = fs.readFileSync(absolutePath, 'utf8');
  const imported = importPatchFromHCL(hcl);
  if (!imported) {
    console.log(`\n# ${relativePath}`);
    console.log('import: failed');
    continue;
  }

  const target = findFirstBindableInput(imported.patch);
  const source = findFirstVisibleOutput(imported.patch);
  if (!target || !source) {
    console.log(`\n# ${relativePath}`);
    console.log('profile: skipped (missing bindable input or visible output)');
    continue;
  }

  const addSource = queryAddSourceBlocks(
    imported.patch,
    {
      kind: 'addSourceBlocks',
      target,
      candidates: allBlockDefs().map((def) => ({
        candidateId: def.type,
        blockType: def.type,
      })),
    },
    { mutationMode: 'replaceWriter' },
  );

  const targetCandidates = Array.from(imported.patch.blocks.entries())
    .flatMap(([blockId, block]) => {
      const def = requireAnyBlockDef(block.type);
      return Object.entries(def.inputs)
        .filter(([, inputDef]) => inputDef.exposedAsPort !== false)
        .map(([portId]) => ({
          candidateId: `${blockId}:${portId}`,
          targetBlockId: blockId,
          targetPortId: portId as PortId,
        }));
    })
    .slice(0, 20);

  const connectTargets = queryConnectTargetsForSource(
    imported.patch,
    {
      kind: 'connectTargetsForSource',
      source,
      candidates: targetCandidates,
    },
    { mutationMode: 'addWriter' },
  );

  console.log(`\n# ${relativePath}`);
  console.log(JSON.stringify({
    addSourceBlocks: addSource.metrics,
    connectTargetsForSource: connectTargets.metrics,
  }, null, 2));
}
