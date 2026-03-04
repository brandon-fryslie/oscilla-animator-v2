import { exportSerializableTopologies } from '../../shapes/registry';
import type { SerializableTopologyDef, TopologyDef, TopologyId } from '../../shapes/types';
import type { CompiledProgramIR, ProgramTopologyTableIR } from './program';

type ProgramWithValueExprs = Pick<CompiledProgramIR, 'valueExprs'>;

// [LAW:one-source-of-truth] Program topology ownership is emitted once on the
// compiled program and consumed everywhere else from that table.
export function collectProgramTopologyIds(program: ProgramWithValueExprs): readonly TopologyId[] {
  const ids = new Set<TopologyId>();
  for (const expr of program.valueExprs.nodes as readonly unknown[]) {
    if (!expr || typeof expr !== 'object') continue;

    const candidate = expr as {
      kind?: string;
      topologyId?: unknown;
      kernelKind?: string;
    };

    if (candidate.kind === 'shapeRef' && typeof candidate.topologyId === 'number') {
      ids.add(candidate.topologyId as TopologyId);
      continue;
    }

    if (
      candidate.kind === 'kernel' &&
      (candidate.kernelKind === 'pathDerivative' || candidate.kernelKind === 'pathSample') &&
      typeof candidate.topologyId === 'number'
    ) {
      ids.add(candidate.topologyId as TopologyId);
    }
  }
  return [...ids];
}

export function collectAllProgramTopologyIds(input: {
  readonly valueExprs: ProgramWithValueExprs['valueExprs'];
  readonly steps: readonly unknown[];
}): readonly TopologyId[] {
  void input.steps;
  // [LAW:one-source-of-truth] Topology ownership is derived from ValueExpr
  // references only; render steps consume canonical shape handles.
  return collectProgramTopologyIds({ valueExprs: input.valueExprs });
}

export function buildProgramTopologyTable(
  definitions: readonly SerializableTopologyDef[],
): ProgramTopologyTableIR {
  const definitionIndexById = new Map<TopologyId, number>();
  for (let index = 0; index < definitions.length; index++) {
    const topology = definitions[index];
    if (definitionIndexById.has(topology.id)) {
      throw new Error(`Duplicate program topology definition for id ${topology.id}`);
    }
    definitionIndexById.set(topology.id, index);
  }
  return {
    definitions,
    definitionIndexById,
  };
}

export function buildProgramTopologyTableFromIds(
  topologyIds: readonly TopologyId[],
): ProgramTopologyTableIR {
  return buildProgramTopologyTable(exportSerializableTopologies(topologyIds));
}

export const EMPTY_PROGRAM_TOPOLOGY_TABLE = buildProgramTopologyTable([]);

export function getProgramTopology(
  program: Pick<CompiledProgramIR, 'topologyTable'>,
  topologyId: TopologyId,
): TopologyDef {
  const index = program.topologyTable.definitionIndexById.get(topologyId);
  if (index === undefined) {
    throw new Error(`Compiled program is missing topology definition ${topologyId}`);
  }
  return program.topologyTable.definitions[index] as TopologyDef;
}
