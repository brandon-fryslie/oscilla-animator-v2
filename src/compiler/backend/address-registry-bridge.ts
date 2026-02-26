import type { AddressResolution, AddressResolver } from '../../graph/address-registry';
import type { CompilerGraph, CompilerGraphBlock } from '../ir/CompilerGraph';
import type { CanonicalAddress } from '../../types/canonical-address';
import type { BlockId, PortId } from '../../types';
import { addressToString, parseAddress } from '../../types/canonical-address';
import { getBlockDefinition } from '../../blocks/registry';
import { normalizeCanonicalName } from '../../core/canonical-name';

function normalizeAddressCanonicalName(address: string): string {
  const parsed = parseAddress(address);
  if (!parsed) return address;
  return addressToString({
    ...parsed,
    canonicalName: normalizeCanonicalName(parsed.canonicalName),
  });
}

function canonicalNameForBlock(block: CompilerGraphBlock): string {
  return normalizeCanonicalName(block.id);
}

class CompilerAddressRegistry implements AddressResolver {
  private readonly byCanonical: Map<string, AddressResolution>;
  private readonly byShorthand: Map<string, CanonicalAddress>;

  constructor(
    byCanonical: Map<string, AddressResolution>,
    byShorthand: Map<string, CanonicalAddress>,
  ) {
    this.byCanonical = byCanonical;
    this.byShorthand = byShorthand;
  }

  resolve(address: string): AddressResolution | null {
    const normalized = normalizeAddressCanonicalName(address);
    return this.byCanonical.get(normalized) ?? null;
  }

  resolveShorthand(shorthand: string): CanonicalAddress | null {
    const direct = this.byShorthand.get(shorthand);
    if (direct) return direct;

    const [blockPart, portPart] = shorthand.split('.');
    if (!blockPart || !portPart) return null;
    return this.byShorthand.get(`${normalizeCanonicalName(blockPart)}.${portPart}`) ?? null;
  }
}

/**
 * Build an AddressResolver directly from compiler graph data.
 *
 * // [LAW:one-source-of-truth] Backend address lookup derives from compiler graph only.
 * // [LAW:one-way-deps] No synthetic Patch reconstruction in backend.
 */
export function buildAddressRegistryForCompilerGraph(graph: CompilerGraph): AddressResolver {
  const byCanonical = new Map<string, AddressResolution>();
  const byShorthand = new Map<string, CanonicalAddress>();

  for (const node of graph.blocks) {
    const blockDef = getBlockDefinition(node.type);
    if (!blockDef) continue;

    const canonicalName = canonicalNameForBlock(node);
    const blockView = { id: node.id, type: node.type };

    const blockAddr: CanonicalAddress = {
      kind: 'block',
      blockId: node.id as BlockId,
      canonicalName,
    };
    byCanonical.set(addressToString(blockAddr), { kind: 'block', block: blockView });

    for (const [portId, outDef] of Object.entries(blockDef.outputs)) {
      const outAddr: CanonicalAddress = {
        kind: 'output',
        blockId: node.id as BlockId,
        canonicalName,
        portId: portId as PortId,
      };
      byCanonical.set(addressToString(outAddr), {
        kind: 'output',
        block: blockView,
        type: outDef.type,
      });

      // Support both canonical and raw-id shorthands.
      byShorthand.set(`${canonicalName}.${portId}`, outAddr);
      byShorthand.set(`${node.id}.${portId}`, outAddr);
    }

    for (const [portId, inputDef] of Object.entries(blockDef.inputs)) {
      const inAddr: CanonicalAddress = {
        kind: 'input',
        blockId: node.id as BlockId,
        canonicalName,
        portId: portId as PortId,
      };
      byCanonical.set(addressToString(inAddr), {
        kind: 'input',
        block: blockView,
        type: inputDef.type,
      });
    }
  }

  return new CompilerAddressRegistry(byCanonical, byShorthand);
}
