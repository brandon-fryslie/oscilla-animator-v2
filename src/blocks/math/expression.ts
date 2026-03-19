/**
 * Expression Block
 *
 * User-defined mathematical expressions compiled to IR via Expression DSL.
 */

import { registerBlock } from '../registry';
import { canonicalType, payloadStride, floatConst } from '../../core/canonical-types';
import { FLOAT, VEC2, VEC3, VEC4 } from '../../core/canonical-types';
import type { CanonicalType, PayloadType } from '../../core/canonical-types';
import { payloadVar, unitVar, inferType, cardinalityVar } from '../../core/inference-types';
import { compileExpression, type BlockRefsContext } from '../../expr';
import type { ValueExprId } from '../../compiler/ir/Indices';
import type { CompileError } from '../../compiler/types';

import { cardinalityVarId } from '../../core/ids';

// [LAW:one-source-of-truth] Expression cardinality behavior is declared on CT/ICT.
const EXPRESSION_CARD = cardinalityVar(cardinalityVarId('expr_refs'), {
  relation: 'promoteToMany',
  acceptance: 'oneOrMany',
  instanceBinding: 'inherit',
});

const EXPRESSION_ALLOWED_PAYLOADS = [FLOAT, VEC2, VEC3, VEC4] as const;

export function register(): void {
  registerBlock({
    type: 'Expression',
    label: 'Expression',
    category: 'math',
    description: 'Compute value from mathematical expression',
    form: 'primitive',
    capability: 'pure',
    payload: {
      allowedPayloads: {
        refs: EXPRESSION_ALLOWED_PAYLOADS,
        out: EXPRESSION_ALLOWED_PAYLOADS,
      },
      // Expression block has dynamic type resolution based on expression text
      // The output type depends on the expression, not a fixed combination
      semantics: 'typeSpecific',
      unitBehavior: 'requireUnitless',
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
          cardinality: EXPRESSION_CARD,
        }),
        exposedAsPort: true,
        collectAccepts: {
          payloads: EXPRESSION_ALLOWED_PAYLOADS,
          units: { kind: 'any' },
          extent: { kind: 'any' },
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
        type: canonicalType(FLOAT, undefined, { cardinality: EXPRESSION_CARD }), // Default - actual type inferred during lowering
      },
    },
  
    lower: ({ ctx, collectInputsById, config }) => {
      // Step 1: Extract expression text from config (default to empty string)
      const cfg = config;
      const exprText = cfg.expression !== undefined
        ? (cfg.expression as string)
        : '';
  
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
      const refsEntries = collectInputsById ? collectInputsById.refs : [];
      const inputs = new Map<string, CanonicalType>();
      const inputExprs = new Map<string, ValueExprId>();
      const typesByName = new Map<string, PayloadType>();
      const valuesByName = new Map<string, ValueExprId>();
      for (const entry of refsEntries) {
        const inputType = getExprType(entry.value.id);
        inputs.set(entry.alias, inputType);
        inputExprs.set(entry.alias, entry.value.id);
        typesByName.set(entry.alias, inputType.payload);
        valuesByName.set(entry.alias, entry.value.id);
      }

      // Step 4: Build blockRefs context for member access resolution
      const blockRefs: BlockRefsContext = { typesByName, valuesByName };
  
      // Step 5: Compile expression using Expression DSL
      const result = compileExpression(exprText, inputs, ctx.b, inputExprs, blockRefs);
  
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
  
        const error = new Error(
          `Expression ${err.code}: ${err.message}${positionInfo}${suggestionInfo}`
        ) as Error & { code?: string; sourceSpan?: CompileError['sourceSpan'] };
        error.code = err.code;
        error.sourceSpan = {
          kind: 'blockParam',
          blockId: ctx.instanceId,
          paramId: 'expression',
          range: err.position,
          suggestion: err.suggestion,
        };
        throw error;
      }

      const warnings: CompileError[] = result.warnings?.map((warning) => ({
        code: warning.code,
        message: warning.message,
        where: { blockId: ctx.instanceId },
        sourceSpan: {
          kind: 'blockParam',
          blockId: ctx.instanceId,
          paramId: 'expression',
          range: warning.position,
        },
      })) ?? [];
  
      // Compilation succeeded - return output expression
      const outExprId = result.value;
      const outExpr = ctx.b.getValueExpr(outExprId);
      if (!outExpr) {
        throw new Error(`Expression output ${outExprId} not found in value table (compiler bug)`);
      }
      // [LAW:one-source-of-truth] Expression result type drives output type for this block.
      const outType = outExpr.type as CanonicalType;
      const stride = payloadStride(outType.payload);
  
      // For multi-component values (stride > 1), ensure we have a construct expression
      if (stride > 1) {
        // Check if the result is already a construct node
        const expr = ctx.b.getValueExpr(outExprId);
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
              out: { id: outExprId, slot: undefined, type: outType, stride, components: [...components] },
            },
            warnings,
            effects: {
              slotRequests: [{ portId: 'out', type: outType }],
            },
          };
        } else {
          // The result is not a construct (e.g., a vec3 input expression)
          // Generate extract nodes and reconstruct
          const components: ValueExprId[] = [];
          for (let i = 0; i < stride; i++) {
            components.push(ctx.b.extract(outExprId, i, canonicalType(FLOAT, undefined, outType.extent)));
          }
          const constructedExpr = ctx.b.constructAuto(components, outType);
          return {
            outputsById: {
              out: { id: constructedExpr, slot: undefined, type: outType, stride, components },
            },
            warnings,
            effects: {
              slotRequests: [{ portId: 'out', type: outType }],
            },
          };
        }
      } else {
        // Scalar output (stride 1)
        return {
          outputsById: {
            out: { id: outExprId, slot: undefined, type: outType, stride },
          },
          warnings,
          effects: {
            slotRequests: [{ portId: 'out', type: outType }],
          },
        };
      }
    },
  });
}
