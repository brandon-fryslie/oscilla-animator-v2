/**
 * Expression Block
 *
 * User-defined mathematical expressions compiled to IR via Expression DSL.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, payloadStride, floatConst, requireInst } from '../../core/canonical-types';
import { FLOAT } from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';
import { compileExpression } from '../../expr';
import type { ValueExprId } from '../../compiler/ir/Indices';

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
      refs: ALL_CONCRETE_PAYLOADS,
      out: ALL_CONCRETE_PAYLOADS,
    },
    // Expression block has dynamic type resolution based on expression text
    // The output type depends on the expression, not a fixed combination
    semantics: 'typeSpecific',
  },

  // Inputs include both wirable ports AND config parameters
  // Config parameters have exposedAsPort: false
  inputs: {
    // Varargs input port for block references
    // Accepts variable-length connections with aliases
    // Varargs cannot have defaultSource (explicit connections only)
    refs: {
      label: 'Block Refs',
      type: canonicalType(FLOAT),  // Base type for validation
      optional: true,
      exposedAsPort: true,
      isVararg: true,
      varargConstraint: {
        payloadType: FLOAT,
        cardinalityConstraint: 'any',  // Accept Signal or Field
      },
    },
    // Config parameter (not a port - cannot be wired)
    // Note: Inspector UI will detect Expression block and render this as multiline
    expression: {
      label: 'Expression',
      type: canonicalType(FLOAT),  // Config-only, type not used
      exposedAsPort: false,       // Config-only, not wirable
      defaultValue: '',            // Default: empty expression
      uiHint: { kind: 'text' },   // Text input (Inspector will make it multiline)
    },
  },

  outputs: {
    out: {
      label: 'Output',
      type: canonicalType(FLOAT), // Default - actual type inferred during lowering
    },
  },

  lower: ({ ctx, varargInputsById, config }) => {
    // Step 1: Extract expression text from config
    const exprText = (config?.expression as string | undefined) ?? '';

    // Step 2: Handle empty expression (output constant 0)
    if (exprText.trim() === '') {
      const sigId = ctx.b.constant(floatConst(0), canonicalType(FLOAT));
      const outType = ctx.outTypes[0];
      const slot = ctx.b.allocSlot();
      return {
        outputsById: {
          out: { id: sigId, slot, type: outType, stride: payloadStride(outType.payload) },
        },
      };
    }

    // Helper: Get actual type from ValueExpr using unified getValueExpr()
    const getExprType = (exprId: ValueExprId): CanonicalType => {
      const expr = ctx.b.getValueExpr(exprId);
      if (!expr) {
        throw new Error(`ValueExpr ${exprId} not found - this indicates a compiler bug`);
      }
      return expr.type;
    };

    // Step 3: Build input map from vararg refs
    const inputs = new Map<string, CanonicalType>();
    const inputSignals = new Map<string, ValueExprId>();

    const refsValues = varargInputsById?.refs ?? [];
    const refsConnections = ctx.varargConnections?.get('refs') ?? [];
    for (let i = 0; i < refsValues.length; i++) {
      const value = refsValues[i];
      const conn = refsConnections[i];
      const isSignal = value && 'type' in value && requireInst(value.type.extent.cardinality, 'cardinality').kind !== 'many';
      if (value && isSignal && conn) {
        const alias = conn.alias ?? conn.sourceAddress;
        const inputType = getExprType(value.id);
        inputs.set(alias, inputType);
        inputSignals.set(alias, value.id);
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
        out: { id: sigId, slot, type: outType, stride: payloadStride(outType.payload) },
      },
    };
  },
});
