/**
 * type-oracle-parity.test — the acceptance gate: the oracle's wire verdict equals
 * what the era's compiler would accept, over a fixture MATRIX of real port pairs,
 * in BOTH boots.
 *
 * This is the whole point of the seam: the editor's drag feedback is not a second
 * opinion about types — it is the compiler's own acceptance, wrapped. So for every
 * (output, input) pair we assert the oracle agrees with the era's authority:
 *   - V1: `validateSemanticConnection` (→ the frontend `maySatisfyConnectionTypes`
 *         over resolved types) — the exact gate the V1 editor validated with.
 *   - pillar: `compareScenePorts` — the algebra `validateScenePatch` reports against.
 * Each matrix is required to contain BOTH a permitted and a rejected pair, so the
 * agreement is proven against a discriminating authority, never a vacuous one.
 * [LAW:one-source-of-truth] [LAW:verifiable-goals]
 */

import { describe, expect, it } from 'vitest';

import { registerAllBlocks } from '../../../blocks/all';
import { buildPatch } from '../../../graph';
import { compileFrontend } from '../../../compiler/frontend';
import { FrontendResultStore } from '../../../stores/FrontendResultStore';
import { requireAnyBlockDef } from '../../../blocks/registry';
import { PillarPatchStore } from '../../../stores/PillarPatchStore';
import { compareScenePorts } from '../../../pillars/scene/port-compatibility';
import { validateSemanticConnection } from '../../authoring/semanticQueries';

import { V1TypeOracle } from '../V1TypeOracle';
import { SceneTypeOracle } from '../SceneTypeOracle';
import { verdictPermits } from '../type-oracle';

registerAllBlocks();

/** Assert a matrix agreed everywhere and actually exercised both outcomes. */
function expectDiscriminatingAgreement(
  disagreements: readonly string[],
  permitted: number,
  rejected: number,
): void {
  expect(disagreements).toEqual([]);
  expect(permitted, 'matrix has permitted pairs').toBeGreaterThan(0);
  expect(rejected, 'matrix has rejected pairs').toBeGreaterThan(0);
}

describe('type-oracle parity: oracle verdict == era compile acceptance', () => {
  it('V1 — the oracle agrees with validateSemanticConnection on every real pair', () => {
    const frontend = new FrontendResultStore();
    const patch = buildPatch((b) => {
      b.addBlock('InfiniteTimeRoot');
      b.addBlock('Ellipse');
      b.addBlock('Const');
      b.addBlock('Noise');
    });
    frontend.updateFromFrontendResult(compileFrontend(patch), 1);
    const oracle = new V1TypeOracle(patch, frontend);

    const blocks = Array.from(patch.blocks.entries());
    const disagreements: string[] = [];
    let permitted = 0;
    let rejected = 0;

    for (const [sourceId, sourceBlock] of blocks) {
      const outputs = Object.entries(requireAnyBlockDef(sourceBlock.type).outputs).filter(
        ([, o]) => !o.hidden,
      );
      for (const [targetId, targetBlock] of blocks) {
        if (sourceId === targetId) continue;
        const inputs = Object.entries(requireAnyBlockDef(targetBlock.type).inputs).filter(
          ([, i]) => i.exposedAsPort !== false,
        );
        for (const [outPort] of outputs) {
          for (const [inPort] of inputs) {
            const authority = validateSemanticConnection(
              patch,
              sourceId,
              outPort,
              targetId,
              inPort,
              { frontend },
            ).valid;
            const oraclePermits = verdictPermits(
              oracle.canConnect(
                { blockId: sourceId, portId: outPort },
                { blockId: targetId, portId: inPort },
              ),
            );
            if (oraclePermits !== authority) {
              disagreements.push(
                `${sourceBlock.type}.${outPort} -> ${targetBlock.type}.${inPort}: oracle=${oraclePermits} authority=${authority}`,
              );
            }
            if (authority) permitted++;
            else rejected++;
          }
        }
      }
    }

    expectDiscriminatingAgreement(disagreements, permitted, rejected);
  });

  it('pillar — the oracle agrees with compareScenePorts on every real pair', () => {
    const store = new PillarPatchStore();
    const oracle = new SceneTypeOracle(store);

    const blocks = store.patch.blocks;
    const disagreements: string[] = [];
    let permitted = 0;
    let rejected = 0;

    for (const sourceBlock of blocks) {
      const outputs = (store.registry.get(sourceBlock.type)?.catalog.ports ?? []).filter(
        (p) => p.direction === 'output',
      );
      for (const targetBlock of blocks) {
        if (sourceBlock.id === targetBlock.id) continue;
        const inputs = (store.registry.get(targetBlock.type)?.catalog.ports ?? []).filter(
          (p) => p.direction === 'input',
        );
        for (const outPort of outputs) {
          for (const inPort of inputs) {
            const authorityPermits = ['compatible', 'adaptationNeeded'].includes(
              compareScenePorts(outPort.value, inPort.value).kind,
            );
            const oraclePermits = verdictPermits(
              oracle.canConnect(
                { blockId: sourceBlock.id, portId: outPort.id },
                { blockId: targetBlock.id, portId: inPort.id },
              ),
            );
            if (oraclePermits !== authorityPermits) {
              disagreements.push(
                `${sourceBlock.type}.${outPort.id} -> ${targetBlock.type}.${inPort.id}: oracle=${oraclePermits} authority=${authorityPermits}`,
              );
            }
            if (authorityPermits) permitted++;
            else rejected++;
          }
        }
      }
    }

    expectDiscriminatingAgreement(disagreements, permitted, rejected);
  });
});
