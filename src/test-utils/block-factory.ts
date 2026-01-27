/**
 * Test Block Factory
 *
 * Provides helpers for creating valid Block objects in tests.
 * SINGLE SOURCE OF TRUTH for test block creation - update here when Block shape changes.
 */

import type { Block } from '../graph/Patch';
import type { BlockId, BlockRole } from '../types';

/**
 * Counter for generating unique display names across all tests.
 * Reset via resetBlockFactory() between test suites if needed.
 */
let displayNameCounter = 0;

/**
 * Reset the display name counter.
 * Call this in beforeEach() if tests need isolation.
 */
export function resetBlockFactory(): void {
  displayNameCounter = 0;
}

/**
 * Options for creating a test block.
 */
export interface TestBlockOptions {
  id?: BlockId;
  type?: string;
  params?: Record<string, unknown>;
  displayName?: string;
  domainId?: string | null;
  role?: BlockRole;
  inputPorts?: Map<string, { id: string; combineMode: string }>;
  outputPorts?: Map<string, { id: string }>;
}

/**
 * Create a valid Block object for testing.
 *
 * Auto-generates a unique displayName if not provided.
 * Uses sensible defaults for all required fields.
 *
 * @param options - Override any block fields
 * @returns A valid Block object
 */
export function createTestBlock(options: TestBlockOptions = {}): Block {
  const id = options.id ?? (`test_b${displayNameCounter}` as BlockId);
  const type = options.type ?? 'TestBlock';

  // Auto-generate unique displayName if not provided
  const displayName = options.displayName ?? `${type} ${++displayNameCounter}`;

  return {
    id,
    type,
    params: options.params ?? {},
    displayName,
    domainId: options.domainId ?? null,
    role: options.role ?? { kind: 'user', meta: {} },
    inputPorts: options.inputPorts ?? new Map(),
    outputPorts: options.outputPorts ?? new Map(),
  };
}

/**
 * Create multiple test blocks with unique displayNames.
 *
 * @param configs - Array of block configurations
 * @returns Array of valid Block objects
 */
export function createTestBlocks(configs: TestBlockOptions[]): Block[] {
  return configs.map(config => createTestBlock(config));
}

/**
 * Create a Map of test blocks keyed by BlockId.
 *
 * @param configs - Array of block configurations (must include id)
 * @returns Map suitable for Patch.blocks
 */
export function createTestBlockMap(
  configs: (TestBlockOptions & { id: BlockId })[]
): Map<BlockId, Block> {
  const map = new Map<BlockId, Block>();
  for (const config of configs) {
    const block = createTestBlock(config);
    map.set(block.id, block);
  }
  return map;
}
