/**
 * Test Arena Helper
 *
 * Provides a pre-initialized arena for use in tests.
 * Tests can use this to avoid initialization boilerplate.
 */

import { RenderBufferArena } from '../../render/RenderBufferArena';

/** Test arena with 50k capacity (sufficient for all tests including stress tests) */
const TEST_ARENA_CAPACITY = 50_000;

let testArena: RenderBufferArena | null = null;

/**
 * Get or create a test arena.
 * Resets the arena on each call to provide clean state.
 */
export function getTestArena(): RenderBufferArena {
  if (!testArena) {
    testArena = new RenderBufferArena(TEST_ARENA_CAPACITY);
    testArena.init();
  }
  testArena.reset();
  return testArena;
}

/**
 * Reset the test arena for a fresh test.
 * Call this in beforeEach() if needed.
 */
export function resetTestArena(): void {
  if (testArena) {
    testArena.reset();
  }
}
