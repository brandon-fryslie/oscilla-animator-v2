/**
 * Deep Equality Helper for Patches
 *
 * Testing utility for comparing Patch objects.
 * Used for round-trip serialization tests.
 *
 * NOTE: This is a testing utility, not production code.
 * Uses simple JSON comparison for nested structures.
 */

import type { Patch, Block, Edge, Endpoint, InputPort, OutputPort } from '../graph/Patch';

/**
 * Deep equality check for patches.
 *
 * @param a - First patch
 * @param b - Second patch
 * @returns True if structurally equal
 */
export function patchesEqual(a: Patch, b: Patch): boolean {
  // Compare block counts
  if (a.blocks.size !== b.blocks.size) return false;

  // Compare blocks (order-insensitive)
  for (const [id, blockA] of a.blocks) {
    const blockB = b.blocks.get(id);
    if (!blockB || !blocksEqual(blockA, blockB)) return false;
  }

  // Compare edges (order-sensitive after sorting by sortKey)
  const edgesA = [...a.edges].sort((x, y) => x.sortKey - y.sortKey);
  const edgesB = [...b.edges].sort((x, y) => x.sortKey - y.sortKey);
  if (edgesA.length !== edgesB.length) return false;
  for (let i = 0; i < edgesA.length; i++) {
    if (!edgesEqual(edgesA[i], edgesB[i])) return false;
  }

  return true;
}

/**
 * Deep equality check for blocks.
 */
function blocksEqual(a: Block, b: Block): boolean {
  return a.id === b.id
    && a.type === b.type
    && a.displayName === b.displayName
    && a.domainId === b.domainId
    && deepEqual(a.params, b.params)
    && deepEqual(a.role, b.role)
    && portsEqual(a.inputPorts, b.inputPorts)
    && portsEqual(a.outputPorts, b.outputPorts);
}

/**
 * Deep equality check for edges.
 */
function edgesEqual(a: Edge, b: Edge): boolean {
  return a.id === b.id
    && endpointsEqual(a.from, b.from)
    && endpointsEqual(a.to, b.to)
    && a.enabled === b.enabled
    && a.sortKey === b.sortKey
    && deepEqual(a.role, b.role);
}

/**
 * Deep equality check for endpoints.
 */
function endpointsEqual(a: Endpoint, b: Endpoint): boolean {
  return a.kind === b.kind
    && a.blockId === b.blockId
    && a.slotId === b.slotId;
}

/**
 * Deep equality check for port maps.
 */
function portsEqual(a: ReadonlyMap<string, any>, b: ReadonlyMap<string, any>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, portA] of a) {
    const portB = b.get(id);
    if (!portB || !deepEqual(portA, portB)) return false;
  }
  return true;
}

/**
 * Deep equality for arbitrary values.
 * Uses JSON comparison (good enough for testing).
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
