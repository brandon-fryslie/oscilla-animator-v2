/**
 * Expression Block Tests
 *
 * Tests for Expression block definition, lowering, and integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import '../expression-blocks'; // Import to register block
import { getBlockDefinition } from '../registry';
import { signalType, type SignalType, strideOf, isPayloadVar } from '../../core/canonical-types';
import { FLOAT, INT, BOOL, VEC2, VEC3, COLOR, SHAPE, CAMERA_PROJECTION } from '../../core/canonical-types';
import { IRBuilderImpl } from '../../compiler/ir/IRBuilderImpl';
import type { LowerCtx } from '../registry';
import { blockIndex } from '../../graph/passes/pass3-indexing';
import { valueSlot, type SigExprId, type ValueSlot } from '../../compiler/ir/Indices';
import { extractSigExprId, extractSigExpr } from '../../__tests__/ir-test-helpers';
import type { ValueRefPacked } from '../../compiler/ir/lowerTypes';

/** Helper to create a signal ValueRefPacked with proper fields */
function sigRef(id: SigExprId, slot: ValueSlot, type: SignalType): ValueRefPacked {
  const stride = isPayloadVar(type.payload) ? 1 : strideOf(type.payload);
  return { k: 'sig', id, slot, type, stride };
}

describe('Expression Block Definition', () => {
  it('is registered in block registry', () => {
    const def = getBlockDefinition('Expression');
    expect(def).toBeDefined();
    expect(def?.type).toBe('Expression');
  });

  it('has correct metadata', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.category).toBe('math');
    expect(def?.form).toBe('primitive');
    expect(def?.capability).toBe('pure');
    expect(def?.label).toBe('Expression');
  });

  it('has 3 optional input ports (in0, in1, refs)', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.inputs).toBeDefined();

    // Count actual ports (exposedAsPort !== false)
    const portKeys = Object.keys(def!.inputs).filter(
      k => def!.inputs[k].exposedAsPort !== false
    );
    expect(portKeys).toEqual(['in0', 'in1', 'refs']);

    // Verify they're all optional
    expect(def?.inputs.in0.optional).toBe(true);
    expect(def?.inputs.in1.optional).toBe(true);
    expect(def?.inputs.refs.optional).toBe(true);

    // Verify refs is a vararg port
    expect(def?.inputs.refs.isVararg).toBe(true);
    expect(def?.inputs.refs.varargConstraint).toBeDefined();
    expect(def?.inputs.refs.varargConstraint?.payloadType).toBe(FLOAT);
    expect(def?.inputs.refs.varargConstraint?.cardinalityConstraint).toBe('any');
  });

  it('has 1 output port', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.outputs).toBeDefined();
    expect(Object.keys(def!.outputs)).toEqual(['out']);
  });

  it('has expression config parameter', () => {
    const def = getBlockDefinition('Expression');
    expect(def?.inputs.expression).toBeDefined();
    expect(def?.inputs.expression.exposedAsPort).toBe(false); // Config-only
    expect(def?.inputs.expression.uiHint?.kind).toBe('text');
    expect(def?.inputs.expression.value).toBe(''); // Default empty
  });
});

describe('Expression Block Lowering', () => {
  let builder: IRBuilderImpl;
  let ctx: LowerCtx;

  beforeEach(() => {
    builder = new IRBuilderImpl();
    // Expression block outputs float by default
    const floatType = signalType(FLOAT);
    ctx = {
      b: builder,
      blockIdx: blockIndex(0),
      blockType: 'Expression',
      instanceId: 'inst_0',
      inTypes: [],
      outTypes: [floatType], // Expression block has one output
      seedConstId: 0,
    };
  });

  it('compiles empty expression to constant 0', () => {
    const def = getBlockDefinition('Expression')!;
    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: { expression: '' },
    });

    expect(result.outputsById.out).toBeDefined();
    expect(result.outputsById.out.k).toBe('sig');

    // Verify it's a constant 0 (check IR)
    const outputRef = result.outputsById.out;
    expect(outputRef.k).toBe('sig');
    const sigId = extractSigExprId(outputRef);
    expect(sigId).not.toBeNull();
    const sigExpr = extractSigExpr(builder, sigId!);
    expect(sigExpr?.kind).toBe('const');
    expect((sigExpr as any)?.value).toBe(0);
  });

  it('compiles literal expression to constant', () => {
    const def = getBlockDefinition('Expression')!;
    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {},
      config: { expression: '42' },
    });

    expect(result.outputsById.out).toBeDefined();
    expect(result.outputsById.out.k).toBe('sig');

    // Verify it's a constant 42
    const outputRef = result.outputsById.out;
    expect(outputRef.k).toBe('sig');
    const sigId = extractSigExprId(outputRef);
    expect(sigId).not.toBeNull();
    const sigExpr = extractSigExpr(builder, sigId!);
    expect(sigExpr?.kind).toBe('const');
    expect((sigExpr as any)?.value).toBe(42);
  });

  it('compiles binary operation with inputs', () => {
    const def = getBlockDefinition('Expression')!;

    // Create input signals
    const in0Sig = builder.sigConst(5, signalType(INT));
    const in1Sig = builder.sigConst(3, signalType(INT));

    const intType = signalType(INT);
    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {
        in0: sigRef(in0Sig, valueSlot(0), intType),
        in1: sigRef(in1Sig, valueSlot(1), intType),
      },
      config: { expression: 'in0 + in1' },
    });

    expect(result.outputsById.out).toBeDefined();
    expect(result.outputsById.out.k).toBe('sig');

    // Verify it's a zip expression (binary operation)
    const outputRef = result.outputsById.out;
    expect(outputRef.k).toBe('sig');
    const sigId = extractSigExprId(outputRef);
    expect(sigId).not.toBeNull();
    const sigExpr = extractSigExpr(builder, sigId!);
    expect(sigExpr?.kind).toBe('zip'); // Binary ops use zip
  });

  it('throws error for syntax error', () => {
    const def = getBlockDefinition('Expression')!;

    expect(() => {
      def.lower({
        ctx,
        inputs: [],
        inputsById: {},
        config: { expression: 'in0 +' }, // Incomplete expression
      });
    }).toThrow(/Expression.*Syntax/);
  });

  it('throws error for undefined identifier', () => {
    const def = getBlockDefinition('Expression')!;

    expect(() => {
      def.lower({
        ctx,
        inputs: [],
        inputsById: {}, // No inputs wired
        config: { expression: 'foo' }, // Undefined identifier
      });
    }).toThrow(/Expression/);
  });

  it('compiles function call', () => {
    const def = getBlockDefinition('Expression')!;

    // Create input signal
    const in0Sig = builder.sigConst(0, signalType(FLOAT));

    const floatType = signalType(FLOAT);
    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {
        in0: sigRef(in0Sig, valueSlot(0), floatType),
      },
      config: { expression: 'sin(in0)' },
    });

    expect(result.outputsById.out).toBeDefined();
    expect(result.outputsById.out.k).toBe('sig');

    // Verify it's a map expression (unary operation/function)
    const outputRef = result.outputsById.out;
    expect(outputRef.k).toBe('sig');
    const sigId = extractSigExprId(outputRef);
    expect(sigId).not.toBeNull();
    const sigExpr = extractSigExpr(builder, sigId!);
    expect(sigExpr?.kind).toBe('map'); // Functions use map
  });

  it('ignores unwired optional inputs', () => {
    const def = getBlockDefinition('Expression')!;

    // Only wire in0, leave others unwired
    const in0Sig = builder.sigConst(42, signalType(INT));

    const intType = signalType(INT);
    const result = def.lower({
      ctx,
      inputs: [],
      inputsById: {
        in0: sigRef(in0Sig, valueSlot(0), intType),
        // in1, refs unwired
      },
      config: { expression: 'in0 * 2' },
    });

    expect(result.outputsById.out).toBeDefined();
    // Should compile successfully - only uses in0
  });
});
