/**
 * Payload Tester Fixtures
 *
 * STUB: Old WGSL-pass and V1 boundary-contract fixtures deleted (scorched earth).
 * hello-triangle fixture added in Phase 2 of the single-triangle vertical slice.
 */

export interface PayloadFixture {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly payload: unknown;
}

export const PAYLOAD_FIXTURES: readonly PayloadFixture[] = [];
