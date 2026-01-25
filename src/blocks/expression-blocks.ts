/**
 * Expression Block
 *
 * User-defined mathematical expressions compiled to IR via Expression DSL.
 * Provides flexible signal computation without creating new blocks.
 *
 * Architecture:
 * - Fixed inputs (in0-in4): Simplifies v1, avoids dynamic port complexity
 * - Payload-Generic inputs: Accept any concrete payload type
 * - Expression config parameter: Text string, not wirable
 * - Compilation: Delegated to Expression DSL (src/expr/)
 *
 * Design Decisions:
 * - ONE SOURCE OF TRUTH: Expression DSL is the sole compiler (no duplicate logic)
 * - SINGLE ENFORCER: Type checking happens once in expression compiler
 * - ISOLATION: Expression DSL stays in src/expr/, minimal integration surface
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from './registry';
import { signalType, strideOf, type PayloadType } from '../core/canonical-types';
import { compileExpression } from '../expr';
import type { SigExprId, SigExpr } from '../compiler/ir/types';
import type { SignalType } from '../core/canonical-types';

// =============================================================================
// Expression (Payload-Generic)
// =============================================================================

registerBlock({
  type: 'Expression',
  label: 'Expression',
  category: 'math',
  description: 'Compute signal from mathematical expression',
  form: 'primitive',
  capability: 'pure',
  cardinality: {
    cardinalityMode: 'preserve',
    laneCoupling: 'laneLocal',
    broadcastPolicy: 'allowZipSig',
  },
  payload: {
    allowedPayloads: {
      in0: ALL_CONCRETE_PAYLOADS,
      in1: ALL_CONCRETE_PAYLOADS,
      in2: ALL_CONCRETE_PAYLOADS,
      in3: ALL_CONCRETE_PAYLOADS,
      in4: ALL_CONCRETE_PAYLOADS,
      out: ALL_CONCRETE_PAYLOADS,
    },
    // Expression block has dynamic type resolution based on expression text
    // The output type depends on the expression, not a fixed combination
    semantics: 'typeSpecific',
  },

  // Inputs include both wirable ports AND config parameters
  // Config parameters have exposedAsPort: false
  inputs: {
    // Fixed input ports (5 optional inputs)
    // User wires signals to in0, in1, etc. and references them by name in expression
    in0: {
      label: 'In 0',
      type: signalType('float'), // Default type - actual type inferred during lowering
      optional: true,            // Unwired inputs are unavailable in expression
      exposedAsPort: true,
    },
    in1: {
      label: 'In 1',
      type: signalType('float'),
      optional: true,
      exposedAsPort: true,
    },
    in2: {
      label: 'In 2',
      type: signalType('float'),
      optional: true,
      exposedAsPort: true,
    },
    in3: {
      label: 'In 3',
      type: signalType('float'),
      optional: true,
      exposedAsPort: true,
    },
    in4: {
      label: 'In 4',
      type: signalType('float'),
      optional: true,
      exposedAsPort: true,
    },
    // Config parameter (not a port - cannot be wired)
    // Note: Inspector UI will detect Expression block and render this as multiline
    expression: {
      label: 'Expression',
      type: signalType('float'),  // Config-only, type not used
      exposedAsPort: false,       // Config-only, not wirable
      value: '',                  // Default: empty expression
      uiHint: { kind: 'text' },   // Text input (Inspector will make it multiline)
    },
  },

  outputs: {
    out: {
      label: 'Output',
      type: signalType('float'), // Default - actual type inferred during lowering
    },
  },

  /**
   * Lower Expression block to IR.
   *
   * Algorithm:
   * 1. Extract expression text from config
   * 2. Handle empty expression (output constant 0)
   * 3. Build input type map (only wired inputs)
   * 4. Build input signal map (only wired inputs)
   * 5. Call compileExpression() from Expression DSL
   * 6. Handle success: return output signal
   * 7. Handle error: throw CompileError with clear message
   *
   * Error Handling:
   * - Syntax errors: thrown by parser with position info
   * - Type errors: thrown by type checker with suggestions
   * - Undefined identifiers: lists available inputs
   */
  lower: ({ ctx, inputsById, config }) => {
    // Step 1: Extract expression text from config
    const exprText = (config?.expression as string | undefined) ?? '';

    // Step 2: Handle empty expression (output constant 0)
    if (exprText.trim() === '') {
      const sigId = ctx.b.sigConst(0, signalType('float'));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
        },
      };
    }

    // Step 3 & 4: Build input type map and input signal map (only wired inputs)
    const inputs = new Map<string, SignalType>();
    const inputSignals = new Map<string, SigExprId>();

    // Helper: Get actual type from signal expression
    // IRBuilder tracks types for all signal expressions
    const getSigType = (sigId: SigExprId): SignalType => {
      const sigExprs = ctx.b.getSigExprs();
      const sigExpr = sigExprs[sigId as number];
      if (!sigExpr) {
        throw new Error(`Signal expression ${sigId} not found - this indicates a compiler bug`);
      }
      return sigExpr.type;
    };

    // Process fixed input ports (in0-in4)
    for (const key of ['in0', 'in1', 'in2', 'in3', 'in4'] as const) {
      const input = inputsById[key];
      if (input && input.k === 'sig') {
        // Input is wired - get actual type from signal expression
        const inputType = getSigType(input.id as SigExprId);
        inputs.set(key, inputType);
        inputSignals.set(key, input.id as SigExprId);
      }
    }

    // Step 5: Compile expression using Expression DSL
    const result = compileExpression(exprText, inputs, ctx.b, inputSignals);

    // Step 6 & 7: Handle compilation result
    if (!result.ok) {
      // Compilation failed - format error message
      const err = result.error;
      const positionInfo = err.position
        ? ` at position ${err.position.start}`
        : '';
      const suggestionInfo = err.suggestion
        ? `\nSuggestion: ${err.suggestion}`
        : '';

      throw new Error(
        `Expression ${err.code}: ${err.message}${positionInfo}${suggestionInfo}`
      );
    }

    // Compilation succeeded - return output signal
    const sigId = result.value;
    const outType = ctx.outTypes[0];
    const slot = ctx.b.allocSlot();

    return {
      outputsById: {
        out: { k: 'sig', id: sigId, slot, type: outType, stride: strideOf(outType.payload) },
      },
    };
  },
});
