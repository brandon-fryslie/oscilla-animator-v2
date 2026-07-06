/**
 * V1TypeOracle — the V1 provider of the TypeOracle seam.
 *
 * Wraps the SAME authority the V1 editor already uses to gate connections
 * (`validateSemanticConnection` → the compiler-frontend `maySatisfyConnectionTypes`
 * over frontend-resolved types) and the SAME projection the adapters use for
 * display (`typeDisplayFor`). It adds no type opinion of its own — it only
 * translates that authority into the neutral verdict/display vocabulary, so the
 * drag gate is exactly what the V1 compiler would accept. [LAW:one-source-of-truth]
 */

import type { Patch } from '../../graph/Patch';
import type { BlockId, PortId } from '../../types';
import type { FrontendResultStore } from '../../stores/FrontendResultStore';
import { validateSemanticConnection } from '../authoring/semanticQueries';
import { typeDisplayFor } from './neutral-projection';
import type { PortTypeDisplay } from './types';
import type {
  ConnectionVerdict,
  PortDirection,
  PortRef,
  TypeOracle,
} from './type-oracle';

export class V1TypeOracle implements TypeOracle {
  constructor(
    private readonly patch: Patch,
    private readonly frontend: FrontendResultStore | null,
  ) {}

  canConnect(source: PortRef, target: PortRef): ConnectionVerdict {
    const result = validateSemanticConnection(
      this.patch,
      source.blockId,
      source.portId,
      target.blockId,
      target.portId,
      { frontend: this.frontend ?? undefined },
    );
    return result.valid
      ? { kind: 'allowed' }
      : { kind: 'rejected', reason: result.reason ?? 'Incompatible connection' };
  }

  describePort(ref: PortRef, direction: PortDirection): PortTypeDisplay | undefined {
    const type = this.frontend?.getResolvedPortTypeByIds(
      ref.blockId as BlockId,
      ref.portId as PortId,
      direction === 'input' ? 'in' : 'out',
    );
    return type ? typeDisplayFor(type) : undefined;
  }
}
