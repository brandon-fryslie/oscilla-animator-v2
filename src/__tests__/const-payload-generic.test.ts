/**
 * Test: Const Block Payload Generic Resolution
 *
 * Verifies that the Const block uses payloadVar for its output type,
 * allowing it to resolve to any payload type based on context.
 *
 * This is a regression test for the bug where Const.out was hardcoded
 * to 'float', causing type unification failures when used as a default
 * source for int inputs (e.g., Polygon.sides).
 */

import { describe, it, expect } from 'vitest';
import { getBlockDefinition } from '../blocks/registry';
import { isPayloadVar, FLOAT, INT, BOOL, VEC2, COLOR } from '../core/canonical-types';

// Import signal-blocks to register Const block
import '../blocks/signal-blocks';

describe('Const Block Payload Generic', () => {
  it('should have polymorphic payload type (payloadVar), not hardcoded float', () => {
    const constDef = getBlockDefinition('Const');
    expect(constDef).toBeDefined();

    const outType = constDef!.outputs.out.type;

    // The payload should be a variable, not a concrete type
    expect(isPayloadVar(outType.payload)).toBe(true);

    // If it were hardcoded, this would fail
    expect(outType.payload).not.toBe('float');
    expect(outType.payload).not.toBe('int');
  });

  it('should allow key concrete payloads including int', () => {
    const constDef = getBlockDefinition('Const');
    expect(constDef).toBeDefined();

    // The allowedPayloads should include key types, especially int for default sources
    const allowedPayloads = constDef!.payload?.allowedPayloads?.out;
    expect(allowedPayloads).toBeDefined();
    expect(allowedPayloads).toContain(FLOAT);
    expect(allowedPayloads).toContain(INT); // Critical for Polygon.sides default source
    expect(allowedPayloads).toContain(BOOL);
    expect(allowedPayloads).toContain(VEC2);
    expect(allowedPayloads).toContain(COLOR);
  });
});
