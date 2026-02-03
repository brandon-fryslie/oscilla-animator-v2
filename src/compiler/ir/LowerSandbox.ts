/**
 * LowerSandbox
 *
 * A constrained IR builder that allows pure blocks to be invoked as macros
 * during lowering. Enforces purity by restricting access to the IRBuilder API.
 *
 * The sandbox wraps an IRBuilder instance and implements PureIRBuilder,
 * exposing only pure expression-building methods. It throws if impure methods
 * (slot allocation, step emission) are accessed.
 *
 * Usage:
 * ```typescript
 * const sandbox = new LowerSandbox(ctx.b, blockDef, portTypes);
 * const outputExprs = sandbox.lowerBlock('HueRainbow', { t: phaseExpr }, {});
 * // outputExprs['out'] is a ValueExprId (no slot allocated yet)
 * ```
 */

import type { IRBuilder } from './IRBuilder';
import type { PureIRBuilder } from './PureIRBuilder';
import type { CanonicalType, ConstValue } from '../../core/canonical-types';
import { payloadStride } from '../../core/canonical-types';
import type {
  ValueExprId,
  BlockIndex,
  InstanceId,
  DomainTypeId,
} from './Indices';
import type { TopologyId } from '../../shapes/types';
import type {
  PureFn,
  OpCode,
  IntrinsicPropertyName,
  PlacementFieldName,
  BasisKind,
} from './types';
import { requireBlockDef, type LowerArgs, type LowerCtx } from '../../blocks/registry';
import type { ValueRefExpr } from './lowerTypes';

/**
 * LowerSandbox provides a constrained IRBuilder for macro expansion.
 *
 * It implements PureIRBuilder by delegating pure methods to the inner IRBuilder,
 * and blocking impure methods by not exposing them.
 */
export class LowerSandbox implements PureIRBuilder {
  constructor(
    private readonly inner: IRBuilder,
    private readonly parentBlockIdx: BlockIndex,
    private readonly parentBlockType: string,
    private readonly parentInstanceId: string,
    private readonly portTypesFromParent?: ReadonlyMap<string, CanonicalType>
  ) {}

  // =========================================================================
  // Pure Expression Methods (delegated to inner)
  // =========================================================================

  constant(value: ConstValue, type: CanonicalType): ValueExprId {
    return this.inner.constant(value, type);
  }

  time(which: 'tMs' | 'phaseA' | 'phaseB' | 'dt' | 'progress' | 'palette' | 'energy', type: CanonicalType): ValueExprId {
    return this.inner.time(which, type);
  }

  kernelMap(input: ValueExprId, fn: PureFn, type: CanonicalType): ValueExprId {
    return this.inner.kernelMap(input, fn, type);
  }

  kernelZip(inputs: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    return this.inner.kernelZip(inputs, fn, type);
  }

  kernelZipSig(field: ValueExprId, signals: readonly ValueExprId[], fn: PureFn, type: CanonicalType): ValueExprId {
    return this.inner.kernelZipSig(field, signals, fn, type);
  }

  broadcast(signal: ValueExprId, type: CanonicalType, signalComponents?: readonly ValueExprId[]): ValueExprId {
    return this.inner.broadcast(signal, type, signalComponents);
  }

  reduce(field: ValueExprId, op: 'min' | 'max' | 'sum' | 'avg', type: CanonicalType): ValueExprId {
    return this.inner.reduce(field, op, type);
  }

  combine(
    inputs: readonly ValueExprId[],
    mode: 'sum' | 'average' | 'max' | 'min' | 'last' | 'product',
    type: CanonicalType
  ): ValueExprId {
    return this.inner.combine(inputs, mode, type);
  }

  intrinsic(intrinsic: IntrinsicPropertyName, type: CanonicalType): ValueExprId {
    return this.inner.intrinsic(intrinsic, type);
  }

  placement(field: PlacementFieldName, basisKind: BasisKind, type: CanonicalType): ValueExprId {
    return this.inner.placement(field, basisKind, type);
  }

  extract(input: ValueExprId, componentIndex: number, type: CanonicalType): ValueExprId {
    return this.inner.extract(input, componentIndex, type);
  }

  construct(components: readonly ValueExprId[], type: CanonicalType): ValueExprId {
    return this.inner.construct(components, type);
  }

  hslToRgb(input: ValueExprId, type: CanonicalType): ValueExprId {
    return this.inner.hslToRgb(input, type);
  }

  eventPulse(source: 'InfiniteTimeRoot'): ValueExprId {
    return this.inner.eventPulse(source);
  }

  eventNever(): ValueExprId {
    return this.inner.eventNever();
  }

  kernel(name: string): PureFn {
    return this.inner.kernel(name);
  }

  opcode(op: OpCode): PureFn {
    return this.inner.opcode(op);
  }

  expr(expression: string): PureFn {
    return this.inner.expr(expression);
  }

  createInstance(
    domainType: DomainTypeId,
    count: number,
    lifecycle?: 'static' | 'dynamic' | 'pooled'
  ): InstanceId {
    return this.inner.createInstance(domainType, count, lifecycle);
  }

  // =========================================================================
  // Macro Expansion
  // =========================================================================

  /**
   * Lower a block as a pure macro.
   *
   * Invokes the block's lower() function through the sandbox, returning only
   * ValueExprIds (no slots allocated). The orchestrator allocates slots later.
   *
   * @param blockType - The block type to lower
   * @param inputsById - Map of port ID to ValueExprId for inputs
   * @param params - Block parameters (config)
   * @returns Map of port ID to ValueExprId for outputs
   *
   * @throws Error if the block is not registered
   * @throws Error if the block is not tagged loweringPurity: 'pure'
   * @throws Error if the block's lower() function fails
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

    // Build synthetic LowerCtx for the macro-expanded block
    // Use a synthetic block index (negative to avoid collision)
    const syntheticBlockIdx = -1 as BlockIndex;

    // Convert ValueExprIds to ValueRefExprs (with slot: undefined for pure blocks)
    const inputRefExprsById: Record<string, ValueRefExpr> = {};
    for (const [portId, exprId] of Object.entries(inputsById)) {
      // Resolve type from inputDef (or use generic if not available)
      const inputDef = blockDef.inputs[portId];
      if (!inputDef) {
        throw new Error(
          `LowerSandbox.lowerBlock: input port "${portId}" not found on block "${blockType}"`
        );
      }
      const inputType = inputDef.type as CanonicalType;
      inputRefExprsById[portId] = {
        id: exprId,
        slot: undefined, // Pure blocks don't have slots yet
        type: inputType,
        stride: payloadStride(inputType.payload),
      };
    }

    // Build outTypes from output definitions (or resolve from portTypes if available)
    const outTypes: CanonicalType[] = Object.values(blockDef.outputs).map(
      (outDef) => outDef.type as CanonicalType
    );

    const ctx: LowerCtx = {
      blockIdx: syntheticBlockIdx,
      blockType,
      instanceId: `${this.parentInstanceId}__macro__${blockType}`,
      inTypes: Object.values(blockDef.inputs)
        .filter((def) => def.exposedAsPort !== false)
        .map((def) => def.type as CanonicalType),
      outTypes,
      b: this as PureIRBuilder,
      seedConstId: 0,
    };

    // Call the block's lower() function
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
