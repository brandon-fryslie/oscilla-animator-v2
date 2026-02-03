/**
 * LowerSandbox
 *
 * Allows pure blocks to be invoked as macros during lowering.
 * Enforces that only blocks tagged loweringPurity:'pure' can be macro-expanded.
 *
 * Purity enforcement at the API level is via the PureIRBuilder TypeScript interface
 * (compile-time restriction). The sandbox checks the loweringPurity tag at runtime
 * as a safety gate before invoking a block's lower().
 *
 * Usage:
 * ```typescript
 * const sandbox = new LowerSandbox(ctx.b, ctx.blockType, ctx.instanceId);
 * const outputExprs = sandbox.lowerBlock('HueRainbow', { t: phaseExpr }, {});
 * // outputExprs['out'] is a ValueExprId (no slot allocated yet)
 * ```
 */

import type { IRBuilder } from './IRBuilder';
import type { BlockIndex } from '../frontend/normalize-indexing';
import type { CanonicalType } from '../../core/canonical-types';
import { payloadStride } from '../../core/canonical-types';
import type { ValueExprId } from './Indices';
import { requireBlockDef, type LowerArgs, type LowerCtx } from '../../blocks/registry';
import type { ValueRefExpr } from './lowerTypes';

/**
 * LowerSandbox — macro expansion utility for pure blocks.
 *
 * Builds synthetic LowerArgs and invokes a pure block's lower() function,
 * returning only ValueExprIds (no slots allocated). The orchestrator
 * (lower-blocks.ts) allocates slots on behalf of pure blocks post-lowering.
 */
export class LowerSandbox {
  constructor(
    private readonly builder: IRBuilder,
    private readonly parentBlockType: string,
    private readonly parentInstanceId: string,
  ) {}

  /**
   * Lower a block as a pure macro.
   *
   * Invokes the block's lower() function, returning only ValueExprIds
   * (no slots allocated). The calling block's orchestrator handles slot allocation.
   *
   * @param blockType - The block type to lower
   * @param inputsById - Map of port ID to ValueExprId for inputs
   * @param params - Block parameters (config)
   * @returns Map of port ID to ValueExprId for outputs
   *
   * @throws Error if the block is not registered
   * @throws Error if the block is not tagged loweringPurity: 'pure'
   */
  lowerBlock(
    blockType: string,
    inputsById: Record<string, ValueExprId>,
    params?: Record<string, unknown>
  ): Record<string, ValueExprId> {
    const blockDef = requireBlockDef(blockType);

    // Enforce purity constraint
    if (blockDef.loweringPurity !== 'pure') {
      throw new Error(
        `LowerSandbox.lowerBlock: block "${blockType}" is not tagged loweringPurity:'pure' ` +
        `(parent: ${this.parentBlockType}#${this.parentInstanceId}). ` +
        `Only pure blocks can be macro-expanded.`
      );
    }

    // Convert ValueExprIds to ValueRefExprs (with slot: undefined for pure blocks)
    const inputRefExprsById: Record<string, ValueRefExpr> = {};
    for (const [portId, exprId] of Object.entries(inputsById)) {
      const inputDef = blockDef.inputs[portId];
      if (!inputDef) {
        throw new Error(
          `LowerSandbox.lowerBlock: input port "${portId}" not found on block "${blockType}"`
        );
      }
      const inputType = inputDef.type as CanonicalType;
      inputRefExprsById[portId] = {
        id: exprId,
        slot: undefined,
        type: inputType,
        stride: payloadStride(inputType.payload),
      };
    }

    // Build outTypes from output definitions
    const outTypes: CanonicalType[] = Object.values(blockDef.outputs).map(
      (outDef) => outDef.type as CanonicalType
    );

    // Synthetic block index (negative to avoid collision with real blocks)
    const syntheticBlockIdx = -1 as BlockIndex;

    const ctx: LowerCtx = {
      blockIdx: syntheticBlockIdx,
      blockType,
      instanceId: `${this.parentInstanceId}__macro__${blockType}`,
      inTypes: Object.values(blockDef.inputs)
        .filter((def) => def.exposedAsPort !== false)
        .map((def) => def.type as CanonicalType),
      outTypes,
      b: this.builder,
      seedConstId: 0,
    };

    const lowerArgs: LowerArgs = {
      ctx,
      inputs: Object.values(inputRefExprsById),
      inputsById: inputRefExprsById,
      config: params,
    };

    const result = blockDef.lower(lowerArgs);

    // Extract ValueExprIds from the result
    const outputExprs: Record<string, ValueExprId> = {};
    for (const [portId, ref] of Object.entries(result.outputsById)) {
      outputExprs[portId] = ref.id;
    }

    return outputExprs;
  }
}
