/**
 * Expression Block
 *
 * User-defined mathematical expressions compiled to IR via Expression DSL.
 */

import { registerBlock, ALL_CONCRETE_PAYLOADS } from '../registry';
import { canonicalType, payloadStride, floatConst, axisVar } from '../../core/canonical-types';
import { FLOAT, INT, VEC2, VEC3, COLOR } from '../../core/canonical-types';
import type { CanonicalType } from '../../core/canonical-types';
import { payloadVar, unitVar, inferType } from '../../core/inference-types';
import { compileExpression, type BlockRefsContext } from '../../expr';
import type { ValueExprId } from '../../compiler/ir/Indices';

import { cardinalityVarId } from '../../core/ids';

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
    // Collect input port for block references
    // Accepts variable-length connections with per-edge types
    // [LAW:one-type-per-behavior] Collect edges are normal edges, not a parallel mechanism.
    refs: {
      label: 'Block Refs',
      type: inferType(payloadVar('expr_refs'), unitVar('expr_refs'), {
        cardinality: axisVar(cardinalityVarId('expr_refs')),
      }),
      optional: true,
      exposedAsPort: true,
      collectAccepts: {
        payloads: [FLOAT, INT, VEC2, VEC3, COLOR],
        units: { kind: 'any' },
        extent: { kind: 'signalOnly' },
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

  lower: ({ ctx, collectInputsById, config }) => {
    // Step 1: Extract expression text from config
    const exprText = (config?.expression as string | undefined) ?? '';

    // Step 2: Handle empty expression (output constant 0)
    if (exprText.trim() === '') {
      const outType = ctx.outTypes[0];
      const sigId = ctx.b.constant(floatConst(0), outType);
      return {
        outputsById: {
          out: { id: sigId, slot: undefined, type: outType, stride: payloadStride(outType.payload) },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
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

    // Step 3: Build input map and blockRefs from collect refs
    // [LAW:one-type-per-behavior] Collect entries come from normal edges.
    const inputs = new Map<string, CanonicalType>();
    const inputSignals = new Map<string, ValueExprId>();
    const signalsByShorthand = new Map<string, ValueExprId>();

    const refsEntries = collectInputsById?.refs ?? [];
    for (const entry of refsEntries) {
      const inputType = getExprType(entry.value.id);

      // Build shorthand key from sourceBlockId.sourcePort (canonical address format)
      const shorthand = `${entry.sourceBlockId}.${entry.sourcePort}`;
      signalsByShorthand.set(shorthand, entry.value.id);

      // Register as regular input using alias or shorthand
      const alias = entry.alias ?? shorthand;
      inputs.set(alias, inputType);
      inputSignals.set(alias, entry.value.id);
    }

    // Step 4: Build blockRefs context for member access resolution
    let blockRefs: BlockRefsContext | undefined;
    if (ctx.addressRegistry && signalsByShorthand.size > 0) {
      blockRefs = {
        addressRegistry: ctx.addressRegistry,
        allowedPayloads: [FLOAT, INT, VEC2, VEC3, COLOR],
        signalsByShorthand,
      };
    }

    // Step 5: Compile expression using Expression DSL
    const result = compileExpression(exprText, inputs, ctx.b, inputSignals, blockRefs);

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
    const stride = payloadStride(outType.payload);

    // For multi-component signals (stride > 1), ensure we have a construct expression
    if (stride > 1) {
      // Check if the result is already a construct node
      const expr = ctx.b.getValueExpr(sigId);
      if (expr && expr.kind === 'construct') {
        // Use the construct directly
        const components = expr.components;
        if (components.length !== stride) {
          throw new Error(
            `Expression construct has ${components.length} components but output type requires ${stride}`
          );
        }
        return {
          outputsById: {
            out: { id: sigId, slot: undefined, type: outType, stride, components: [...components] },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      } else {
        // The result is not a construct (e.g., a vec3 input signal)
        // Generate extract nodes and reconstruct
        const components: ValueExprId[] = [];
        for (let i = 0; i < stride; i++) {
          components.push(ctx.b.extract(sigId, i, canonicalType(FLOAT)));
        }
        const constructedSig = ctx.b.construct(components, outType);
        return {
          outputsById: {
            out: { id: constructedSig, slot: undefined, type: outType, stride, components },
          },
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
    } else {
      // Scalar output (stride 1)
      return {
        outputsById: {
          out: { id: sigId, slot: undefined, type: outType, stride },
        },
        effects: {
          slotRequests: [{ portId: 'out', type: outType }],
        },
      };
    }
  },
});
