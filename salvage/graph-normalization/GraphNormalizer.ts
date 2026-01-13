/**
 * Graph Normalizer
 *
 * Pure function that transforms RawGraph (user intent) into NormalizedGraph (compiler input).
 * Materializes default sources as structural blocks with edges.
 *
 * NOW USES THE ALLOWLIST SYSTEM:
 * - Provider blocks can be any type from DEFAULT_SOURCE_PROVIDER_BLOCKS
 * - Provider blocks can have bus inputs (auto-wired to buses)
 * - Provider blocks can have editable inputs (recursively normalized)
 */

import type { RawGraph, NormalizedGraph } from './types';
import type { Block, Edge, PortRef, BlockRole, EdgeRole, TypeDesc, DefaultSource } from '../types';
import { getBlockDefinition } from '../blocks';
import { DEFAULT_SOURCE_PROVIDER_BLOCKS, type DefaultSourceProviderBlockSpec } from '../defaultSources/allowlist';

// =============================================================================
// Types
// =============================================================================

type SlotWorld = 'signal' | 'field' | 'scalar' | 'config';

interface ProviderCreationResult {
  blocks: Block[];
  edges: Edge[];
}

// =============================================================================
// Allowlist Lookup
// =============================================================================

/**
 * Build a lookup map from the allowlist.
 */
const PROVIDER_SPECS_BY_TYPE = new Map<string, DefaultSourceProviderBlockSpec>(
  DEFAULT_SOURCE_PROVIDER_BLOCKS.map(spec => [spec.blockType, spec])
);

/**
 * Get provider spec from allowlist.
 */
function getProviderSpec(blockType: string): DefaultSourceProviderBlockSpec | undefined {
  return PROVIDER_SPECS_BY_TYPE.get(blockType);
}

// =============================================================================
// Provider Type Selection
// =============================================================================

/**
 * Select the default provider block type for a given world + domain.
 * This selects DSConst* blocks by default. Users can override to use
 * other providers like Oscillator via DefaultSourceAttachment.
 */
function selectDefaultProviderType(world: SlotWorld, domain: string): string {
  const normalizedWorld = world === 'config' ? 'scalar' : world;

  // Special case: domain inputs get DomainN
  if (world === 'config' && domain === 'domain') {
    return 'DomainN';
  }

  const key = `${normalizedWorld}:${domain}`;

  const mapping: Record<string, string> = {
    // Scalar providers
    'scalar:float': 'DSConstScalarFloat',
    'scalar:int': 'DSConstScalarInt',
    'scalar:string': 'DSConstScalarString',
    'scalar:waveform': 'DSConstScalarWaveform',

    // Signal providers
    'signal:float': 'DSConstSignalFloat',
    'signal:int': 'DSConstSignalInt',
    'signal:color': 'DSConstSignalColor',
    'signal:vec2': 'DSConstSignalPoint',
    'signal:point': 'DSConstSignalPoint',
    'signal:phase': 'DSConstSignalPhase',
    'signal:time': 'DSConstSignalTime',

    // Field providers
    'field:float': 'DSConstFieldFloat',
    'field:vec2': 'DSConstFieldVec2',
    'field:color': 'DSConstFieldColor',
  };

  return mapping[key] ?? 'DSConstSignalFloat';
}

// =============================================================================
// Helper Functions
// =============================================================================

function isInputDriven(raw: RawGraph, blockId: string, slotId: string): boolean {
  return raw.edges.some(
    e => e.to.kind === 'port' && e.to.blockId === blockId && e.to.slotId === slotId
  );
}

function generateProviderId(blockId: string, slotId: string): string {
  return `${blockId}_default_${slotId}`;
}

function extractDomain(inputType: TypeDesc): string {
  return inputType.domain;
}

// =============================================================================
// Provider Block Creation
// =============================================================================

/**
 * Create a provider block and all its structural edges.
 *
 * This is the core of the normalization logic:
 * 1. Creates the provider block itself
 * 2. Creates edge from provider output to target input
 * 3. For bus inputs: creates edges from buses to provider inputs
 * 4. For editable inputs: recursively creates their default providers
 */
function createProviderForInput(
  targetBlock: Block,
  targetSlotId: string,
  defaultSource: DefaultSource,
  inputType: TypeDesc,
  raw: RawGraph,
  depth: number = 0
): ProviderCreationResult {
  // Prevent infinite recursion
  if (depth > 10) {
    console.warn(`Max recursion depth reached for ${targetBlock.id}.${targetSlotId}`);
    return { blocks: [], edges: [] };
  }

  const blocks: Block[] = [];
  const edges: Edge[] = [];

  const world: SlotWorld = defaultSource.world ?? 'signal';
  const domain = extractDomain(inputType);

  // Check for per-block provider override first
  const overrideProviderType = targetBlock.defaultSourceProviders[targetSlotId];

  // Use override if specified and valid, otherwise fall back to default
  let providerType: string;
  if (overrideProviderType && getProviderSpec(overrideProviderType)) {
    providerType = overrideProviderType;
  } else {
    providerType = selectDefaultProviderType(world, domain);
  }

  // Get provider spec from allowlist
  const providerSpec = getProviderSpec(providerType);
  if (!providerSpec) {
    console.warn(`Provider type ${providerType} not in allowlist`);
    return { blocks: [], edges: [] };
  }

  // Get provider block definition
  const providerDef = getBlockDefinition(providerType);
  if (!providerDef) {
    console.warn(`Provider block definition not found: ${providerType}`);
    return { blocks: [], edges: [] };
  }

  const providerId = generateProviderId(targetBlock.id, targetSlotId);

  // Build params for the provider
  // DSConst* blocks get { value: X }, DomainN gets { n, seed }
  let providerParams: Record<string, unknown>;
  if (providerType === 'DomainN') {
    const count = typeof defaultSource.value === 'number'
      ? Math.max(1, Math.floor(defaultSource.value))
      : 30;
    providerParams = { n: count, seed: 0 };
  } else if (providerDef.inputs.length === 0) {
    // DSConst* blocks have no inputs - value goes in params
    providerParams = { value: defaultSource.value };
  } else {
    // Blocks with inputs (like Oscillator) - params are for non-input config
    providerParams = {};
  }

  // Create the provider block
  const targetPort: PortRef = {
    blockId: targetBlock.id,
    slotId: targetSlotId,
    direction: 'input',
  };

  const blockRole: BlockRole = {
    kind: 'structural',
    meta: {
      kind: 'defaultSource',
      target: { kind: 'port', port: targetPort }
    }
  };

  const provider: Block = {
    id: providerId,
    type: providerType,
    label: `Default ${targetSlotId}`,
    position: { x: 0, y: 0 },
    params: providerParams,
    form: 'primitive',
    role: blockRole,
    defaultSourceProviders: {},  // Structural blocks use defaults
  };
  blocks.push(provider);

  // Create edge from provider output to target input
  const edgeRole: EdgeRole = {
    kind: 'default',
    meta: { defaultSourceBlockId: providerId }
  };

  const mainEdge: Edge = {
    id: `${providerId}_edge`,
    from: { kind: 'port', blockId: providerId, slotId: providerSpec.outputPortId },
    to: { kind: 'port', blockId: targetBlock.id, slotId: targetSlotId },
    enabled: true,
    role: edgeRole,
  };
  edges.push(mainEdge);

  // Handle bus inputs - create edges from buses to provider inputs
  for (const [inputId, busName] of Object.entries(providerSpec.busInputs)) {
    const busEdge: Edge = {
      id: `${providerId}_bus_${inputId}`,
      from: { kind: 'bus', busId: busName },
      to: { kind: 'port', blockId: providerId, slotId: inputId },
      enabled: true,
      role: { kind: 'bus', meta: { busId: busName } },
    };
    edges.push(busEdge);
  }

  // Handle editable inputs - recursively create their default providers
  for (const editableInputId of providerSpec.editableInputs) {
    // Find this input in the provider's definition
    const inputDef = providerDef.inputs.find(i => i.id === editableInputId);
    if (!inputDef) {
      console.warn(`Editable input ${editableInputId} not found on ${providerType}`);
      continue;
    }

    // Skip if no default source defined
    if (!inputDef.defaultSource) {
      continue;
    }

    // Check if this input is already driven (by a bus input)
    if (providerSpec.busInputs[editableInputId]) {
      // This input is fed by a bus, not a default provider
      continue;
    }

    // Recursively create provider for this input
    // Provider blocks are structural and don't have custom overrides
    const nestedResult = createProviderForInput(
      provider,  // Use the provider block we just created
      editableInputId,
      inputDef.defaultSource,
      inputDef.type,
      raw,
      depth + 1
    );
    blocks.push(...nestedResult.blocks);
    edges.push(...nestedResult.edges);
  }

  return { blocks, edges };
}

// =============================================================================
// Main Normalization Function
// =============================================================================

/**
 * Normalize a RawGraph into a NormalizedGraph.
 *
 * For each undriven input with a defaultSource:
 * 1. Creates a provider block from the allowlist
 * 2. Wires provider output to target input
 * 3. Wires provider's bus inputs to buses
 * 4. Recursively creates providers for provider's editable inputs
 */
export function normalize(raw: RawGraph): NormalizedGraph {
  const structuralBlocks: Block[] = [];
  const structuralEdges: Edge[] = [];

  for (const block of raw.blocks) {
    const blockDef = getBlockDefinition(block.type);
    if (!blockDef) continue;

    for (const inputDef of blockDef.inputs) {
      if (!inputDef.defaultSource) continue;
      if (isInputDriven(raw, block.id, inputDef.id)) continue;

      const result = createProviderForInput(
        block,  // Pass the full block for per-instance override lookup
        inputDef.id,
        inputDef.defaultSource,
        inputDef.type,
        raw,
        0
      );

      structuralBlocks.push(...result.blocks);
      structuralEdges.push(...result.edges);
    }
  }

  return {
    blocks: [...raw.blocks, ...structuralBlocks],
    edges: [...raw.edges, ...structuralEdges],
  };
}
