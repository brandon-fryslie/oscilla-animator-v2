/**
 * Field Materializer
 *
 * Converts FieldExpr IR nodes into typed array buffers.
 * Pure IR path - no legacy fallbacks.
 */
import type { DomainId, FieldExprId, SigExprId } from '../core/canonical-types';
import type { FieldExpr, DomainDef, SigExpr } from '../compiler/ir/types';
import type { BufferPool } from './BufferPool';
import type { RuntimeState } from './RuntimeState';
/**
 * Materialize a field expression into a typed array
 *
 * @param fieldId - Field expression ID
 * @param domainId - Domain to materialize over
 * @param fields - Field expression map
 * @param signals - Signal expression map (for lazy evaluation)
 * @param domains - Domain definition map
 * @param state - Runtime state (for signal values)
 * @param pool - Buffer pool for allocation
 * @returns Typed array with materialized field data
 */
export declare function materialize(fieldId: FieldExprId, domainId: DomainId, fields: ReadonlyMap<FieldExprId, FieldExpr>, signals: ReadonlyMap<SigExprId, SigExpr>, domains: ReadonlyMap<DomainId, DomainDef>, state: RuntimeState, pool: BufferPool): ArrayBufferView;
