/**
 * src/pillars/scene/validate.ts
 *
 * Validate an authored scene patch against the declared block contracts —
 * without assembling a `ScenePlan`. The editor uses this to surface errors as
 * the user wires blocks: per-edge compatibility verdicts plus a flat diagnostics
 * list. It reads the registry's catalog metadata and the patch graph only; it
 * never calls a block's `contribute()` or touches the renderer.
 *
 * [LAW:no-silent-failure] Every problem is a structured diagnostic; a partial or
 *   unconnected graph yields diagnostics, never a throw.
 * [LAW:dataflow-not-control-flow] An edge's outcome is a `PortCompatibility`
 *   value mapped to a diagnostic value — there is no per-block branch in the
 *   validation walk.
 */

import type { PillarBlock, PillarEdge, PillarPatch } from '../types';
import type {
  SceneRegistry,
  ScenePortDeclaration,
  SceneValueKind,
} from './scene-block';
import {
  compareScenePorts,
  NATIVE_ADAPTATION_ROUTES,
  type AdaptationRoute,
  type PortCompatibility,
} from './port-compatibility';

/** Where a port lives, for diagnostics and editor highlighting. */
export interface ScenePortAddress {
  readonly blockId: string;
  readonly blockType: string;
  readonly portId: string;
  readonly value: SceneValueKind;
}

/**
 * One problem found in a patch. Each kind is a *specific* diagnostic the editor
 * can render distinctly. `unresolved*` kinds keep a partial graph from throwing.
 */
export type SceneValidationDiagnostic =
  | { readonly kind: 'unknownBlock'; readonly blockId: string; readonly blockType: string }
  | {
      readonly kind: 'danglingEdge';
      readonly edgeId: string;
      readonly endpoint: 'source' | 'target';
      readonly missingBlockId: string;
    }
  | {
      readonly kind: 'unresolvedPort';
      readonly edgeId: string;
      readonly endpoint: 'source' | 'target';
      readonly blockId: string;
      readonly portId: string | null;
    }
  | {
      readonly kind: 'incompatiblePorts';
      readonly edgeId: string;
      readonly from: ScenePortAddress;
      readonly to: ScenePortAddress;
    }
  | {
      readonly kind: 'adaptationRequired';
      readonly edgeId: string;
      readonly from: ScenePortAddress;
      readonly to: ScenePortAddress;
      readonly via: string;
    }
  | {
      readonly kind: 'unsupportedCapability';
      readonly edgeId: string;
      readonly address: ScenePortAddress;
      readonly value: SceneValueKind;
    }
  | { readonly kind: 'missingRequiredInput'; readonly address: ScenePortAddress };

/** The per-edge verdict the editor can paint onto each wire. */
export interface SceneEdgeVerdict {
  readonly edgeId: string;
  readonly compatibility: PortCompatibility | { readonly kind: 'unresolved' };
}

export interface SceneValidation {
  readonly edges: readonly SceneEdgeVerdict[];
  readonly diagnostics: readonly SceneValidationDiagnostic[];
}

const UNRESOLVED: SceneEdgeVerdict['compatibility'] = { kind: 'unresolved' };

function addressOf(block: PillarBlock, port: ScenePortDeclaration): ScenePortAddress {
  return { blockId: block.id, blockType: block.type, portId: port.id, value: port.value };
}

/**
 * The output port an edge draws *from*. The edge model names only the target's
 * input slot, so the source port is resolved by elimination: a block with a
 * single output has an unambiguous one. Zero or many outputs cannot be resolved
 * from the edge alone — that is surfaced, not guessed.
 */
function soleOutputPort(ports: readonly ScenePortDeclaration[]): ScenePortDeclaration | null {
  const outputs = ports.filter((p) => p.direction === 'output');
  return outputs.length === 1 ? outputs[0] : null;
}

/**
 * Map a non-compatible verdict to its diagnostic. `compatible` produces none —
 * it is recorded only as the edge verdict. Exhaustive over the union so a new
 * verdict kind forces a decision here.
 */
function diagnoseEdge(
  edgeId: string,
  from: ScenePortAddress,
  to: ScenePortAddress,
  verdict: PortCompatibility,
): SceneValidationDiagnostic | null {
  switch (verdict.kind) {
    case 'compatible':
      return null;
    case 'mismatch':
      return { kind: 'incompatiblePorts', edgeId, from, to };
    case 'adaptationNeeded':
      return { kind: 'adaptationRequired', edgeId, from, to, via: verdict.via };
    case 'unsupported': {
      // Report the deferred endpoint: it is whichever side carries the kind.
      const address = to.value === verdict.value ? to : from;
      return { kind: 'unsupportedCapability', edgeId, address, value: verdict.value };
    }
    default:
      return assertNever(verdict);
  }
}

function assertNever(value: never): never {
  throw new Error(`[scene] unhandled compatibility verdict: ${JSON.stringify(value)}`);
}

export function validateScenePatch(
  registry: SceneRegistry,
  patch: PillarPatch,
  routes: readonly AdaptationRoute[] = NATIVE_ADAPTATION_ROUTES,
): SceneValidation {
  const diagnostics: SceneValidationDiagnostic[] = [];
  const blocksById = new Map(patch.blocks.map((b) => [b.id, b]));

  // Unknown block types: the palette wired a type the registry does not define.
  for (const block of patch.blocks) {
    if (registry.get(block.type) === undefined) {
      diagnostics.push({ kind: 'unknownBlock', blockId: block.id, blockType: block.type });
    }
  }

  // Required inputs: an input port whose default policy is `required` must be fed
  // by an edge. A `configScalar` knob is defaultable — unwired it compiles to its
  // synthesized config default, so an unwired knob is not a missing input.
  // [LAW:dataflow-not-control-flow] The port's typed default policy decides this,
  //   not a per-block special case.
  for (const block of patch.blocks) {
    const def = registry.get(block.type);
    if (def === undefined) continue;
    for (const port of def.catalog.ports) {
      if (port.direction !== 'input') continue;
      if (port.default.kind !== 'required') continue;
      const fed = patch.edges.some((e) => e.target === block.id && e.inputSlot === port.id);
      if (!fed) diagnostics.push({ kind: 'missingRequiredInput', address: addressOf(block, port) });
    }
  }

  const edges = patch.edges.map((edge) =>
    verdictForEdge(edge, registry, blocksById, routes, diagnostics),
  );
  return { edges, diagnostics };
}

/**
 * The human-readable form of a diagnostic, for the editor's error surface.
 *
 * [LAW:one-source-of-truth] Derived from the structured diagnostic on demand —
 *   never stored on it, so the message cannot drift from its fields. Exhaustive
 *   over the union: a new diagnostic kind is a compile error until phrased.
 */
export function formatSceneDiagnostic(d: SceneValidationDiagnostic): string {
  switch (d.kind) {
    case 'unknownBlock':
      return `[scene] block '${d.blockId}': unknown block type '${d.blockType}'`;
    case 'danglingEdge':
      return `[scene] edge '${d.edgeId}': ${d.endpoint} block '${d.missingBlockId}' does not exist`;
    case 'unresolvedPort':
      return d.endpoint === 'source'
        ? `[scene] edge '${d.edgeId}': cannot resolve a single output port on source block '${d.blockId}'`
        : `[scene] edge '${d.edgeId}': block '${d.blockId}' has no input port '${d.portId}'`;
    case 'incompatiblePorts':
      return `[scene] edge '${d.edgeId}': '${d.from.value}' (from '${d.from.blockId}') cannot connect to '${d.to.value}' (on '${d.to.blockId}.${d.to.portId}')`;
    case 'adaptationRequired':
      return `[scene] edge '${d.edgeId}': '${d.from.value}' → '${d.to.value}' needs an explicit adapter block '${d.via}'; implicit coercion is not allowed`;
    case 'unsupportedCapability':
      return `[scene] edge '${d.edgeId}': port value '${d.value}' (on '${d.address.blockId}.${d.address.portId}') has no ScenePlan realization yet`;
    case 'missingRequiredInput':
      return `[scene] block '${d.address.blockId}': required input '${d.address.portId}' (${d.address.value}) is not connected`;
    default:
      return assertNever(d);
  }
}

/**
 * The compatibility verdict for one edge, accumulating any diagnostic it raises.
 * Each unresolved step (missing block, unknown type, unresolvable port) yields an
 * `unresolved` verdict rather than throwing, so a half-wired graph still validates.
 */
function verdictForEdge(
  edge: PillarEdge,
  registry: SceneRegistry,
  blocksById: ReadonlyMap<string, PillarBlock>,
  routes: readonly AdaptationRoute[],
  diagnostics: SceneValidationDiagnostic[],
): SceneEdgeVerdict {
  const sourceBlock = blocksById.get(edge.source);
  const targetBlock = blocksById.get(edge.target);
  if (sourceBlock === undefined) {
    diagnostics.push({ kind: 'danglingEdge', edgeId: edge.id, endpoint: 'source', missingBlockId: edge.source });
  }
  if (targetBlock === undefined) {
    diagnostics.push({ kind: 'danglingEdge', edgeId: edge.id, endpoint: 'target', missingBlockId: edge.target });
  }
  if (sourceBlock === undefined || targetBlock === undefined) {
    return { edgeId: edge.id, compatibility: UNRESOLVED };
  }

  const sourceDef = registry.get(sourceBlock.type);
  const targetDef = registry.get(targetBlock.type);
  // Unknown block types are already reported above; the wire is unresolvable.
  if (sourceDef === undefined || targetDef === undefined) {
    return { edgeId: edge.id, compatibility: UNRESOLVED };
  }

  const sourcePort = soleOutputPort(sourceDef.catalog.ports);
  const targetPort = targetDef.catalog.ports.find(
    (p) => p.direction === 'input' && p.id === edge.inputSlot,
  );
  if (sourcePort === null) {
    diagnostics.push({ kind: 'unresolvedPort', edgeId: edge.id, endpoint: 'source', blockId: sourceBlock.id, portId: null });
  }
  if (targetPort === undefined) {
    diagnostics.push({ kind: 'unresolvedPort', edgeId: edge.id, endpoint: 'target', blockId: targetBlock.id, portId: edge.inputSlot });
  }
  if (sourcePort === null || targetPort === undefined) {
    return { edgeId: edge.id, compatibility: UNRESOLVED };
  }

  const from = addressOf(sourceBlock, sourcePort);
  const to = addressOf(targetBlock, targetPort);
  const compatibility = compareScenePorts(sourcePort.value, targetPort.value, routes);
  const diagnostic = diagnoseEdge(edge.id, from, to, compatibility);
  if (diagnostic !== null) diagnostics.push(diagnostic);
  return { edgeId: edge.id, compatibility };
}
