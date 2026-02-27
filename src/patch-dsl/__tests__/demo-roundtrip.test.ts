import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { basename, join } from 'path';
import { deserializePatchFromHCL, serializePatchToHCL } from '../index';
import type { Block, Edge, Patch } from '../../graph/Patch';
import { registerAllBlocks } from '../../blocks/all';

registerAllBlocks();

const HCL_DEMO_DIR = join(__dirname, '../../demo/hcl');
const HCL_DEMO_FILES = readdirSync(HCL_DEMO_DIR)
  .filter((file) => file.endsWith('.hcl'))
  .sort((a, b) => a.localeCompare(b));

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeValue(entryValue)]),
    );
  }
  return value;
}

function blockSnapshot(block: Block): Record<string, unknown> {
  return {
    type: block.type,
    displayName: block.displayName,
    domainId: block.domainId,
    role: normalizeValue(block.role),
    params: normalizeValue(block.params),
    inputPorts: normalizeValue(block.inputPorts),
    outputPorts: normalizeValue(block.outputPorts),
  };
}

function edgeSnapshot(
  edge: Edge,
  blockNameById: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const fromBlockName = blockNameById.get(edge.from.blockId);
  const toBlockName = blockNameById.get(edge.to.blockId);
  if (!fromBlockName || !toBlockName) {
    throw new Error(`Missing block name for edge "${edge.id}" endpoint`);
  }
  // [LAW:behavior-not-structure] Roundtrip contract validates connection behavior;
  // edge.sortKey is parser-assigned ordering metadata, not semantic graph structure.
  return {
    fromBlockName,
    fromSlotId: edge.from.slotId,
    toBlockName,
    toSlotId: edge.to.slotId,
    enabled: edge.enabled,
    role: normalizeValue(edge.role),
    alias: edge.alias,
  };
}

function patchSnapshot(patch: Patch): Record<string, unknown> {
  const blockNameById = new Map<string, string>();
  const seenDisplayNames = new Set<string>();
  const blocks = [...patch.blocks.values()]
    .sort((left, right) => left.displayName.localeCompare(right.displayName))
    .map((block) => {
      if (blockNameById.has(block.id)) {
        throw new Error(`Duplicate block id encountered while snapshotting "${block.id}"`);
      }
      if (seenDisplayNames.has(block.displayName)) {
        throw new Error(`Expected unique block displayName in demo patch, found "${block.displayName}"`);
      }
      seenDisplayNames.add(block.displayName);
      blockNameById.set(block.id, block.displayName);
      return blockSnapshot(block);
    });
  const edges = [...patch.edges]
    .map((edge) => edgeSnapshot(edge, blockNameById))
    .sort((left, right) => {
      const leftKey = `${String(left.fromBlockName)}.${String(left.fromSlotId)}->${String(left.toBlockName)}.${String(left.toSlotId)}:${String(left.alias)}`;
      const rightKey = `${String(right.fromBlockName)}.${String(right.fromSlotId)}->${String(right.toBlockName)}.${String(right.toSlotId)}:${String(right.alias)}`;
      return leftKey.localeCompare(rightKey);
    });
  const blockTypes = blocks
    .map((block) => String(block.type))
    .sort((left, right) => left.localeCompare(right));
  const connections = edges
    .map((edge) => `${String(edge.fromBlockName)}.${String(edge.fromSlotId)}->${String(edge.toBlockName)}.${String(edge.toSlotId)}`)
    .sort((left, right) => left.localeCompare(right));

  // [LAW:one-source-of-truth] Compare one canonical snapshot to avoid
  // fragmented assertions that can drift and miss structural changes.
  return {
    blockCount: patch.blocks.size,
    edgeCount: patch.edges.length,
    blockTypes,
    connections,
    blocks,
    edges,
  };
}

function inferPatchName(hcl: string, file: string): string {
  const match = hcl.match(/patch\s+"([^"]+)"/);
  return match?.[1] ?? basename(file, '.hcl');
}

describe('demo HCL parser round-trip', () => {
  for (const file of HCL_DEMO_FILES) {
    it(`preserves structure for ${file}`, () => {
      const hcl = readFileSync(join(HCL_DEMO_DIR, file), 'utf-8');
      const firstParse = deserializePatchFromHCL(hcl);
      expect(firstParse.errors).toEqual([]);

      const serialized = serializePatchToHCL(firstParse.patch, {
        name: inferPatchName(hcl, file),
      });
      const secondParse = deserializePatchFromHCL(serialized);
      expect(secondParse.errors).toEqual([]);

      expect(patchSnapshot(secondParse.patch)).toEqual(patchSnapshot(firstParse.patch));
    });
  }
});
