/**
 * src/pillars/types/validate/axis-validate.ts
 *
 * `validateAxes` — the single axis-invariant enforcement gate.
 * [LAW:single-enforcer] [LAW:no-silent-failure]
 *
 * Runs after the fixpoint produces a `StrictTypedGraph`. Pure — produces
 * diagnostics, never mutates. Callers (the fixpoint driver) null out
 * `FixpointResult.strict` if any diagnostics are returned.
 *
 * Rule groups enforced here:
 *   - EventInvariantBroken  — discrete ⇒ payload:bool AND unit:none
 *   - NoInstance            — cardinality:many must have an instance ref (safety net)
 *   - VarEscape             — residual inference var in a supposedly-concrete graph
 *   - AdapterShapeError     — adapter blocks must have 1×1-field input + 1×1-field output
 *   - CategoryGatingError   — sum⇒numeric; or/and⇒bool; first/last universal
 *
 * One enforcement gate — not scattered across solvers/policies/creators.
 * [LAW:single-enforcer]
 */

import type { DefinedBlock } from '../../block-api';
import type { ZCanonicalType, ZInferenceCanonicalType } from '../schemas';
import type { DraftPortKey, FixpointDiagnostic, StrictTypedGraph } from '../solve/typed-graph';
import { draftPortKey } from '../solve/typed-graph';
import { getContract } from '../solve/contract-lookup';

export function validateAxes(
  strict: StrictTypedGraph,
  catalog: readonly DefinedBlock[],
): readonly FixpointDiagnostic[] {
  const out: FixpointDiagnostic[] = [];

  validatePortTypes(strict.portTypes, out);
  validateAdapterShapes(catalog, out);
  validateCombineModes(strict, catalog, out);

  return out;
}

// ---------------------------------------------------------------------------
// Per-port invariants: event axioms, NoInstance, VarEscape
// ---------------------------------------------------------------------------

function validatePortTypes(
  portTypes: ReadonlyMap<DraftPortKey, ZCanonicalType>,
  out: FixpointDiagnostic[],
): void {
  for (const [portKey, type] of portTypes) {
    checkEventInvariants(portKey, type, out);
    checkNoInstance(portKey, type, out);
    checkVarEscape(portKey, type, out);
  }
}

function checkEventInvariants(
  portKey: DraftPortKey,
  type: ZCanonicalType,
  out: FixpointDiagnostic[],
): void {
  if (type.extent.temporality.kind !== 'discrete') return;

  if (type.payload.kind !== 'bool') {
    out.push({
      code: 'EventInvariantBroken',
      message: `Event port ${portKey} has non-bool payload (${type.payload.kind}); discrete ⇒ bool`,
      stableKey: `EventInvariantBroken:payload:${portKey}`,
      ports: [portKey],
    });
  }
  if (type.unit.kind !== 'none') {
    out.push({
      code: 'EventInvariantBroken',
      message: `Event port ${portKey} has non-none unit (${type.unit.kind}); discrete ⇒ none`,
      stableKey: `EventInvariantBroken:unit:${portKey}`,
      ports: [portKey],
    });
  }
}

function checkNoInstance(
  portKey: DraftPortKey,
  type: ZCanonicalType,
  out: FixpointDiagnostic[],
): void {
  // Safety-net: ZCanonicalType schema already requires instance for many, but
  // manually-constructed StrictTypedGraphs may bypass Zod. [LAW:no-silent-failure]
  const card = type.extent.cardinality;
  if (card.kind === 'many' && !('instance' in card && card.instance)) {
    out.push({
      code: 'NoInstance',
      message: `Field port ${portKey} has cardinality:many but no instance reference`,
      stableKey: `NoInstance:${portKey}`,
      ports: [portKey],
    });
  }
}

function checkVarEscape(
  portKey: DraftPortKey,
  type: ZCanonicalType,
  out: FixpointDiagnostic[],
): void {
  // ZCanonicalType structurally forbids vars at compile time, but a cast from
  // ZInferenceCanonicalType could slip through at runtime. [LAW:no-silent-failure]
  const t = type as unknown as ZInferenceCanonicalType;
  const escaped: string[] = [];
  if (t.payload.kind === 'var') escaped.push('payload');
  if (t.unit.kind === 'var') escaped.push('unit');
  if (t.extent.cardinality.kind === 'var') escaped.push('cardinality');
  if (escaped.length > 0) {
    out.push({
      code: 'VarEscape',
      message: `Port ${portKey} has unresolved inference vars in axes: ${escaped.join(', ')}`,
      stableKey: `VarEscape:${portKey}`,
      ports: [portKey],
    });
  }
}

// ---------------------------------------------------------------------------
// Adapter shape: exactly 1 input slot × 1 field, 1 output slot × 1 field
// ---------------------------------------------------------------------------

function validateAdapterShapes(catalog: readonly DefinedBlock[], out: FixpointDiagnostic[]): void {
  for (const block of catalog) {
    if (!block.adapterSpec || !block.contract) continue;

    const inSlots = Object.keys(block.contract.inputs);
    const outSlots = Object.keys(block.contract.outputs);

    if (inSlots.length !== 1 || outSlots.length !== 1) {
      out.push({
        code: 'AdapterShapeError',
        message: `Adapter '${block.type}' must have exactly 1 input and 1 output slot (got ${inSlots.length} in, ${outSlots.length} out)`,
        stableKey: `AdapterShapeError:slots:${block.type}`,
      });
      continue;
    }

    const inFields = Object.keys(block.contract.inputs[inSlots[0]].type);
    const outFields = Object.keys(block.contract.outputs[outSlots[0]].type);

    if (inFields.length !== 1 || outFields.length !== 1) {
      out.push({
        code: 'AdapterShapeError',
        message: `Adapter '${block.type}' slots must each have exactly 1 field (got ${inFields.length} in-fields, ${outFields.length} out-fields)`,
        stableKey: `AdapterShapeError:fields:${block.type}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Combine-mode category gating
// ---------------------------------------------------------------------------

const NUMERIC_PAYLOADS = new Set(['float', 'int', 'vec2', 'vec3', 'color']);

function validateCombineModes(
  strict: StrictTypedGraph,
  catalog: readonly DefinedBlock[],
  out: FixpointDiagnostic[],
): void {
  for (const graphBlock of strict.graph.blocks) {
    const contract = getContract(graphBlock, catalog);
    if (!contract) continue;

    for (const [slotName, binding] of Object.entries(contract.inputs)) {
      if (!binding.combine) continue;

      for (const fieldName of Object.keys(binding.type)) {
        const portKey = draftPortKey(graphBlock.id, slotName, fieldName, 'in');
        const resolved = strict.portTypes.get(portKey);
        if (!resolved) continue;

        const pk = resolved.payload.kind;
        let violation: string | null = null;

        if (binding.combine === 'sum' && !NUMERIC_PAYLOADS.has(pk)) {
          violation = `'sum' requires numeric payload; got '${pk}'`;
        } else if ((binding.combine === 'or' || binding.combine === 'and') && pk !== 'bool') {
          violation = `'${binding.combine}' requires bool payload; got '${pk}'`;
        }

        if (violation) {
          out.push({
            code: 'CategoryGatingError',
            message: `Combine-mode violation on port ${portKey}: ${violation}`,
            stableKey: `CategoryGatingError:${portKey}:${binding.combine}`,
            ports: [portKey],
          });
        }
      }
    }
  }
}
