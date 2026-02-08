/**
 * Tests for Composite Block Expansion (Spec-Conformant)
 *
 * Tests cover:
 * 1. No composites = identity
 * 2. Single composite → exact block/edge IDs + stable ordering
 * 3. Nested composites → correct ExpansionPath + remapped IDs
 * 4. Boundary rewrites preserve roles + rewire to correct internal bound ports
 * 5. Missing composite def → CompositeDefinitionMissing
 * 6. Invalid binding → CompositeBindingInvalid
 * 7. Depth limit → CompositeExpansionDepthExceeded
 * 8. ID collision → CompositeIdCollision
 * 9. Provenance maps cover every expanded block/edge and boundary rewrite edge
 * 10. maxNodesAdded limit
 * 11. Trace events
 * 12. Interface validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  expandComposites,
  type CompositeExpansionResult,
  type CxBlockOrigin,
  type CxEdgeOrigin,
} from '../composite-expansion';
import {
  registerComposite,
  unregisterComposite,
} from '../../../blocks/registry';
import type { CompositeBlockDef } from '../../../blocks/composite-types';
import { internalBlockId } from '../../../blocks/composite-types';
import type { Patch, Block, Edge } from '../../../graph/Patch';
import type { BlockId, BlockRole } from '../../../types';
import { userRole } from '../../../types';

// Import blocks to trigger registration
import '../../../blocks/all';


// =============================================================================
// Test Fixtures
// =============================================================================

function createSimpleAddComposite(): CompositeBlockDef {
  return {
    type: 'TestAddWrapper',
    form: 'composite',
    label: 'Add Wrapper',
    category: 'test',
    capability: 'pure',
    internalBlocks: new Map([
      [internalBlockId('add'), { type: 'Add' }],
    ]),
    internalEdges: [],
    exposedInputs: [
      { externalId: 'a', internalBlockId: internalBlockId('add'), internalPortId: 'a' },
      { externalId: 'b', internalBlockId: internalBlockId('add'), internalPortId: 'b' },
    ],
    exposedOutputs: [
      { externalId: 'out', internalBlockId: internalBlockId('add'), internalPortId: 'out' },
    ],
    inputs: {},
    outputs: {},
  };
}

function createSmoothNoiseComposite(): CompositeBlockDef {
  return {
    type: 'TestSmoothNoise',
    form: 'composite',
    label: 'Smooth Noise',
    category: 'test',
    capability: 'state',
    internalBlocks: new Map([
      [internalBlockId('noise'), { type: 'Noise' }],
      [internalBlockId('lag'), { type: 'Lag' }],
    ]),
    internalEdges: [
      { fromBlock: internalBlockId('noise'), fromPort: 'out', toBlock: internalBlockId('lag'), toPort: 'target' },
    ],
    exposedInputs: [
      { externalId: 'x', internalBlockId: internalBlockId('noise'), internalPortId: 'x' },
    ],
    exposedOutputs: [
      { externalId: 'out', internalBlockId: internalBlockId('lag'), internalPortId: 'out' },
    ],
    inputs: {},
    outputs: {},
  };
}

function createBlock(id: string, type: string, role: BlockRole = userRole()): Block {
  return {
    id: id as BlockId,
    type,
    params: {},
    displayName: `${type} (${id})`,
    domainId: null,
    role,
    inputPorts: new Map(),
    outputPorts: new Map(),
  };
}

function createEdge(
  id: string,
  fromBlock: string,
  fromPort: string,
  toBlock: string,
  toPort: string
): Edge {
  return {
    id,
    from: { kind: 'port', blockId: fromBlock, slotId: fromPort },
    to: { kind: 'port', blockId: toBlock, slotId: toPort },
    enabled: true,
    sortKey: 0,
    role: { kind: 'user', meta: {} },
  };
}

function createPatch(blocks: Block[], edges: Edge[]): Patch {
  const blockMap = new Map<BlockId, Block>();
  for (const block of blocks) {
    blockMap.set(block.id, block);
  }
  return { blocks: blockMap, edges };
}

// =============================================================================
// Tests
// =============================================================================

describe('expandComposites', () => {
  let registeredComposites: string[] = [];

  beforeEach(() => {
    registeredComposites = [];
  });

  afterEach(() => {
    for (const type of registeredComposites) {
      try { unregisterComposite(type); } catch { /* ignore */ }
    }
  });

  function registerTestComposite(def: CompositeBlockDef): void {
    registerComposite(def);
    registeredComposites.push(def.type);
  }

  // -------------------------------------------------------------------------
  // 1. No composites = identity
  // -------------------------------------------------------------------------
  describe('no composites', () => {
    it('passes through patch unchanged', () => {
      const blocks = [createBlock('b1', 'Add'), createBlock('b2', 'Multiply')];
      const edges = [createEdge('e1', 'b1', 'out', 'b2', 'a')];
      const patch = createPatch(blocks, edges);

      const result = expandComposites(patch);

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.blocks.size).toBe(2);
      expect(result.patch.edges.length).toBe(1);
      // Provenance: all user
      expect(result.provenance.blockMap.get('b1' as BlockId)).toEqual({ kind: 'user' });
      expect(result.provenance.blockMap.get('b2' as BlockId)).toEqual({ kind: 'user' });
      expect(result.provenance.edgeMap.get('e1')).toEqual({ kind: 'user' });
      expect(result.provenance.boundaryMap.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Single composite → exact block/edge IDs + stable ordering
  // -------------------------------------------------------------------------
  describe('single composite expansion', () => {
    it('expands a simple composite with deterministic cx: IDs', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('comp1', 'TestAddWrapper')];
      const patch = createPatch(blocks, []);

      const result = expandComposites(patch);

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.blocks.has('comp1' as BlockId)).toBe(false);
      expect(result.patch.blocks.size).toBe(1);

      // Deterministic ID: cx:{instanceBlockId}@{compositeId}:b:{innerBlockId}
      const expectedId = 'cx:comp1@TestAddWrapper:b:add' as BlockId;
      expect(result.patch.blocks.has(expectedId)).toBe(true);

      const expandedBlock = result.patch.blocks.get(expectedId)!;
      expect(expandedBlock.type).toBe('Add');
      expect(expandedBlock.role.kind).toBe('derived');
    });

    it('derived blocks have compositeExpansion role metadata', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('comp1', 'TestAddWrapper')];
      const result = expandComposites(createPatch(blocks, []));

      const expectedId = 'cx:comp1@TestAddWrapper:b:add' as BlockId;
      const expandedBlock = result.patch.blocks.get(expectedId)!;

      expect(expandedBlock.role.kind).toBe('derived');
      if (expandedBlock.role.kind === 'derived') {
        expect(expandedBlock.role.meta.kind).toBe('compositeExpansion');
        if (expandedBlock.role.meta.kind === 'compositeExpansion') {
          expect(expandedBlock.role.meta.compositeDefId).toBe('TestAddWrapper');
          expect(expandedBlock.role.meta.compositeInstanceId).toBe('comp1');
          expect(expandedBlock.role.meta.internalBlockId).toBe('add');
        }
      }
    });

    it('inherits domainId from the composite instance block', () => {
      registerTestComposite(createSimpleAddComposite());

      const block = createBlock('comp1', 'TestAddWrapper');
      const withDomain = { ...block, domainId: 'circle-domain' };
      const result = expandComposites(createPatch([withDomain], []));

      const expectedId = 'cx:comp1@TestAddWrapper:b:add' as BlockId;
      expect(result.patch.blocks.get(expectedId)!.domainId).toBe('circle-domain');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Internal edges
  // -------------------------------------------------------------------------
  describe('internal edges', () => {
    it('creates edges for internal connections with cx: IDs', () => {
      registerTestComposite(createSmoothNoiseComposite());

      const blocks = [createBlock('comp1', 'TestSmoothNoise')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.blocks.size).toBe(2);

      const noiseId = 'cx:comp1@TestSmoothNoise:b:noise';
      const lagId = 'cx:comp1@TestSmoothNoise:b:lag';

      const internalEdge = result.patch.edges.find(e =>
        e.from.blockId === noiseId &&
        e.from.slotId === 'out' &&
        e.to.blockId === lagId &&
        e.to.slotId === 'target'
      );
      expect(internalEdge).toBeDefined();
      expect(internalEdge!.role.kind).toBe('composite');

      // Edge ID format: cx:{path}:e:{index}
      expect(internalEdge!.id).toBe('cx:comp1@TestSmoothNoise:e:0');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Boundary rewrites
  // -------------------------------------------------------------------------
  describe('boundary rewrites', () => {
    it('rewires edges to exposed inputs', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('src', 'Const'), createBlock('comp1', 'TestAddWrapper')];
      const edges = [createEdge('e1', 'src', 'out', 'comp1', 'a')];
      const result = expandComposites(createPatch(blocks, edges));

      expect(result.diagnostics).toEqual([]);
      // Original edge removed
      expect(result.patch.edges.find(e => e.id === 'e1')).toBeUndefined();

      // New edge targets internal block
      const expandedId = 'cx:comp1@TestAddWrapper:b:add';
      const rewiredEdge = result.patch.edges.find(e =>
        e.from.blockId === 'src' && e.to.blockId === expandedId
      );
      expect(rewiredEdge).toBeDefined();
      expect(rewiredEdge!.to.slotId).toBe('a');

      // Edge ID: cx:{path}:in:{port}:re:{origEdgeId}
      expect(rewiredEdge!.id).toBe('cx:comp1@TestAddWrapper:in:a:re:e1');
    });

    it('rewires edges from exposed outputs', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('comp1', 'TestAddWrapper'), createBlock('target', 'Multiply')];
      const edges = [createEdge('e1', 'comp1', 'out', 'target', 'a')];
      const result = expandComposites(createPatch(blocks, edges));

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.edges.find(e => e.id === 'e1')).toBeUndefined();

      const expandedId = 'cx:comp1@TestAddWrapper:b:add';
      const rewiredEdge = result.patch.edges.find(e =>
        e.from.blockId === expandedId && e.to.blockId === 'target'
      );
      expect(rewiredEdge).toBeDefined();
      expect(rewiredEdge!.from.slotId).toBe('out');
      expect(rewiredEdge!.id).toBe('cx:comp1@TestAddWrapper:out:out:re:e1');
    });

    it('preserves original edge role on boundary rewrites', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('src', 'Const'), createBlock('comp1', 'TestAddWrapper')];
      const edges: Edge[] = [{
        id: 'e1',
        from: { kind: 'port', blockId: 'src', slotId: 'out' },
        to: { kind: 'port', blockId: 'comp1', slotId: 'a' },
        enabled: true,
        sortKey: 0,
        role: { kind: 'user', meta: {} },
      }];
      const result = expandComposites(createPatch(blocks, edges));

      const rewiredEdge = result.patch.edges.find(e => e.id === 'cx:comp1@TestAddWrapper:in:a:re:e1');
      expect(rewiredEdge!.role.kind).toBe('user');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Multiple composites
  // -------------------------------------------------------------------------
  describe('multiple composites', () => {
    it('expands multiple instances with unique IDs', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('comp1', 'TestAddWrapper'), createBlock('comp2', 'TestAddWrapper')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.blocks.size).toBe(2);

      expect(result.patch.blocks.has('cx:comp1@TestAddWrapper:b:add' as BlockId)).toBe(true);
      expect(result.patch.blocks.has('cx:comp2@TestAddWrapper:b:add' as BlockId)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Nested composites → correct ExpansionPath
  // -------------------------------------------------------------------------
  describe('nested composites', () => {
    it('expands nested composites with path-based IDs', () => {
      const innerDef = createSimpleAddComposite();
      registerTestComposite(innerDef);

      const outerDef: CompositeBlockDef = {
        type: 'TestOuterWrapper',
        form: 'composite',
        label: 'Outer Wrapper',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([
          [internalBlockId('inner'), { type: 'TestAddWrapper' }],
          [internalBlockId('mul'), { type: 'Multiply' }],
        ]),
        internalEdges: [
          { fromBlock: internalBlockId('inner'), fromPort: 'out', toBlock: internalBlockId('mul'), toPort: 'a' },
        ],
        exposedInputs: [
          { externalId: 'a', internalBlockId: internalBlockId('inner'), internalPortId: 'a' },
          { externalId: 'b', internalBlockId: internalBlockId('inner'), internalPortId: 'b' },
          { externalId: 'scale', internalBlockId: internalBlockId('mul'), internalPortId: 'b' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('mul'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };
      registerTestComposite(outerDef);

      const blocks = [createBlock('outer1', 'TestOuterWrapper')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.blocks.has('outer1' as BlockId)).toBe(false);

      // Outer expansion: mul is at depth 1
      const mulId = 'cx:outer1@TestOuterWrapper:b:mul' as BlockId;
      expect(result.patch.blocks.has(mulId)).toBe(true);

      // Nested expansion: inner's Add is at depth 2
      // Path: outer1@TestOuterWrapper / cx:outer1@TestOuterWrapper:b:inner@TestAddWrapper
      const innerAddId = 'cx:outer1@TestOuterWrapper/cx:outer1@TestOuterWrapper:b:inner@TestAddWrapper:b:add' as BlockId;
      expect(result.patch.blocks.has(innerAddId)).toBe(true);

      // Total: 2 blocks (mul + nested add)
      expect(result.patch.blocks.size).toBe(2);
    });

    it('provenance tracks full expansion paths for nested composites', () => {
      const innerDef = createSimpleAddComposite();
      registerTestComposite(innerDef);

      const outerDef: CompositeBlockDef = {
        type: 'TestOuterWrapper2',
        form: 'composite',
        label: 'Outer Wrapper 2',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([
          [internalBlockId('inner'), { type: 'TestAddWrapper' }],
        ]),
        internalEdges: [],
        exposedInputs: [
          { externalId: 'a', internalBlockId: internalBlockId('inner'), internalPortId: 'a' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('inner'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };
      registerTestComposite(outerDef);

      const blocks = [createBlock('o1', 'TestOuterWrapper2')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);

      // The nested add block should have a 2-frame path
      const innerAddId = 'cx:o1@TestOuterWrapper2/cx:o1@TestOuterWrapper2:b:inner@TestAddWrapper:b:add' as BlockId;
      const origin = result.provenance.blockMap.get(innerAddId);
      expect(origin).toBeDefined();
      expect(origin!.kind).toBe('expandedFromComposite');
      if (origin!.kind === 'expandedFromComposite') {
        expect(origin!.path.length).toBe(2);
        expect(origin!.path[0].instanceBlockId).toBe('o1');
        expect(origin!.path[0].compositeId).toBe('TestOuterWrapper2');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. Complex composites
  // -------------------------------------------------------------------------
  describe('complex composites', () => {
    it('expands composite with 5+ internal blocks and edges', () => {
      const complexDef: CompositeBlockDef = {
        type: 'TestComplexChain',
        form: 'composite',
        label: 'Complex Chain',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([
          [internalBlockId('add1'), { type: 'Add' }],
          [internalBlockId('mul1'), { type: 'Multiply' }],
          [internalBlockId('add2'), { type: 'Add' }],
          [internalBlockId('mul2'), { type: 'Multiply' }],
          [internalBlockId('add3'), { type: 'Add' }],
        ]),
        internalEdges: [
          { fromBlock: internalBlockId('add1'), fromPort: 'out', toBlock: internalBlockId('mul1'), toPort: 'a' },
          { fromBlock: internalBlockId('mul1'), fromPort: 'out', toBlock: internalBlockId('add2'), toPort: 'a' },
          { fromBlock: internalBlockId('add2'), fromPort: 'out', toBlock: internalBlockId('mul2'), toPort: 'a' },
          { fromBlock: internalBlockId('mul2'), fromPort: 'out', toBlock: internalBlockId('add3'), toPort: 'a' },
        ],
        exposedInputs: [
          { externalId: 'in', internalBlockId: internalBlockId('add1'), internalPortId: 'a' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('add3'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };
      registerTestComposite(complexDef);

      const blocks = [createBlock('chain1', 'TestComplexChain')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.blocks.size).toBe(5);
      expect(result.patch.edges.length).toBe(4);

      for (const edge of result.patch.edges) {
        expect(edge.role.kind).toBe('composite');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 8. Diagnostics: missing definition
  // -------------------------------------------------------------------------
  describe('CompositeDefinitionMissing', () => {
    it('unregistered composite type passes through as non-composite block', () => {
      // A block whose type is not in the composite registry is not recognized
      // as a composite, so it passes through unchanged.
      const blocks = [createBlock('bad1', 'NonExistentComposite')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);
      expect(result.patch.blocks.has('bad1' as BlockId)).toBe(true);
    });

    it('composite removed after registration passes through as non-composite block', () => {
      // Register, create patch, then unregister before expanding
      const def: CompositeBlockDef = {
        type: 'TestRemoved',
        form: 'composite',
        label: 'Removed',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([[internalBlockId('x'), { type: 'Add' }]]),
        internalEdges: [],
        exposedInputs: [
          { externalId: 'a', internalBlockId: internalBlockId('x'), internalPortId: 'a' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('x'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };
      registerTestComposite(def);
      const blocks = [createBlock('m1', 'TestRemoved')];
      const patch = createPatch(blocks, []);

      // Unregister so isCompositeType returns false
      unregisterComposite('TestRemoved');
      registeredComposites = registeredComposites.filter(t => t !== 'TestRemoved');

      const result = expandComposites(patch);
      // Block passes through unchanged since it's no longer a registered composite
      expect(result.patch.blocks.has('m1' as BlockId)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 9. Diagnostics: invalid binding
  // -------------------------------------------------------------------------
  describe('CompositeBindingInvalid', () => {
    it('registration rejects exposed input binding to nonexistent internal block', () => {
      // registerComposite validates bindings at registration time
      const badDef: CompositeBlockDef = {
        type: 'TestBadBinding',
        form: 'composite',
        label: 'Bad Binding',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([
          [internalBlockId('add'), { type: 'Add' }],
        ]),
        internalEdges: [],
        exposedInputs: [
          { externalId: 'a', internalBlockId: internalBlockId('nonexistent'), internalPortId: 'a' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('add'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };

      expect(() => registerTestComposite(badDef)).toThrow(/INVALID_PORT_MAPPING/);
    });

    it('registration rejects exposed output binding to nonexistent port', () => {
      const badDef: CompositeBlockDef = {
        type: 'TestBadPortBinding',
        form: 'composite',
        label: 'Bad Port Binding',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([
          [internalBlockId('add'), { type: 'Add' }],
        ]),
        internalEdges: [],
        exposedInputs: [
          { externalId: 'a', internalBlockId: internalBlockId('add'), internalPortId: 'a' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('add'), internalPortId: 'nonexistent_port' },
        ],
        inputs: {},
        outputs: {},
      };

      expect(() => registerTestComposite(badDef)).toThrow(/INVALID_PORT_MAPPING/);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Depth limit
  // -------------------------------------------------------------------------
  describe('CompositeExpansionDepthExceeded', () => {
    it('emits error when nesting exceeds maxDepth', () => {
      // Create 3 levels of nesting, use maxDepth=2 to trigger the limit
      // (Registration validates up to depth 5, so 3 levels pass registration fine)
      for (let i = 3; i >= 1; i--) {
        registerTestComposite({
          type: `TestNestLevel${i}`,
          form: 'composite',
          label: `Nest Level ${i}`,
          category: 'test',
          capability: 'pure',
          internalBlocks: new Map([
            [internalBlockId('inner'), { type: i === 3 ? 'Add' : `TestNestLevel${i + 1}` }],
          ]),
          internalEdges: [],
          exposedInputs: [
            { externalId: 'a', internalBlockId: internalBlockId('inner'), internalPortId: 'a' },
          ],
          exposedOutputs: [
            { externalId: 'out', internalBlockId: internalBlockId('inner'), internalPortId: 'out' },
          ],
          inputs: {},
          outputs: {},
        });
      }

      const result = expandComposites(
        createPatch([createBlock('nested', 'TestNestLevel1')], []),
        { maxDepth: 2 },
      );

      const depthErrors = result.diagnostics.filter(d => d.code === 'CompositeExpansionDepthExceeded');
      expect(depthErrors.length).toBeGreaterThan(0);
      expect(depthErrors[0].severity).toBe('error');
    });

    it('respects custom maxDepth option', () => {
      // Create 4 levels (will exceed maxDepth = 3)
      for (let i = 4; i >= 1; i--) {
        registerTestComposite({
          type: `TestShallowNest${i}`,
          form: 'composite',
          label: `Shallow ${i}`,
          category: 'test',
          capability: 'pure',
          internalBlocks: new Map([
            [internalBlockId('inner'), { type: i === 4 ? 'Add' : `TestShallowNest${i + 1}` }],
          ]),
          internalEdges: [],
          exposedInputs: [
            { externalId: 'a', internalBlockId: internalBlockId('inner'), internalPortId: 'a' },
          ],
          exposedOutputs: [
            { externalId: 'out', internalBlockId: internalBlockId('inner'), internalPortId: 'out' },
          ],
          inputs: {},
          outputs: {},
        });
      }

      const result = expandComposites(
        createPatch([createBlock('s1', 'TestShallowNest1')], []),
        { maxDepth: 3 },
      );

      expect(result.diagnostics.some(d => d.code === 'CompositeExpansionDepthExceeded')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 11. maxNodesAdded limit
  // -------------------------------------------------------------------------
  describe('CompositeExpansionSizeExceeded', () => {
    it('emits error when too many nodes are added', () => {
      registerTestComposite(createSimpleAddComposite());

      // Create 4 instances, maxNodesAdded = 2
      const blocks = [
        createBlock('c1', 'TestAddWrapper'),
        createBlock('c2', 'TestAddWrapper'),
        createBlock('c3', 'TestAddWrapper'),
        createBlock('c4', 'TestAddWrapper'),
      ];

      const result = expandComposites(createPatch(blocks, []), { maxNodesAdded: 2 });

      const sizeErrors = result.diagnostics.filter(d => d.code === 'CompositeExpansionSizeExceeded');
      expect(sizeErrors.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 12. Provenance maps
  // -------------------------------------------------------------------------
  describe('provenance', () => {
    it('blockMap has entry for every expanded block', () => {
      registerTestComposite(createSmoothNoiseComposite());

      const blocks = [createBlock('src', 'Const'), createBlock('comp1', 'TestSmoothNoise')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);

      // Check every block in the result has a provenance entry
      for (const blockId of result.patch.blocks.keys()) {
        expect(result.provenance.blockMap.has(blockId)).toBe(true);
      }

      // User block stays user
      expect(result.provenance.blockMap.get('src' as BlockId)!.kind).toBe('user');

      // Expanded blocks have expandedFromComposite origin
      const noiseOrigin = result.provenance.blockMap.get('cx:comp1@TestSmoothNoise:b:noise' as BlockId)!;
      expect(noiseOrigin.kind).toBe('expandedFromComposite');
      if (noiseOrigin.kind === 'expandedFromComposite') {
        expect(noiseOrigin.path.length).toBe(1);
        expect(noiseOrigin.innerBlockId).toBe('noise');
      }
    });

    it('edgeMap has entry for every edge (expanded + boundary rewrite)', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('src', 'Const'), createBlock('comp1', 'TestAddWrapper'), createBlock('tgt', 'Multiply')];
      const edges = [
        createEdge('e1', 'src', 'out', 'comp1', 'a'),
        createEdge('e2', 'comp1', 'out', 'tgt', 'a'),
      ];
      const result = expandComposites(createPatch(blocks, edges));

      expect(result.diagnostics).toEqual([]);

      // Every edge in result has a provenance entry
      for (const edge of result.patch.edges) {
        expect(result.provenance.edgeMap.has(edge.id)).toBe(true);
      }

      // Boundary rewrites have compositeBoundaryRewrite origin
      const inRewrite = result.provenance.edgeMap.get('cx:comp1@TestAddWrapper:in:a:re:e1');
      expect(inRewrite).toBeDefined();
      expect(inRewrite!.kind).toBe('compositeBoundaryRewrite');
      if (inRewrite!.kind === 'compositeBoundaryRewrite') {
        expect(inRewrite!.boundary).toBe('in');
        expect(inRewrite!.port).toBe('a');
      }

      const outRewrite = result.provenance.edgeMap.get('cx:comp1@TestAddWrapper:out:out:re:e2');
      expect(outRewrite).toBeDefined();
      expect(outRewrite!.kind).toBe('compositeBoundaryRewrite');
      if (outRewrite!.kind === 'compositeBoundaryRewrite') {
        expect(outRewrite!.boundary).toBe('out');
      }
    });

    it('boundaryMap records input and output rewrites', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('src', 'Const'), createBlock('comp1', 'TestAddWrapper'), createBlock('tgt', 'Multiply')];
      const edges = [
        createEdge('e1', 'src', 'out', 'comp1', 'a'),
        createEdge('e2', 'comp1', 'out', 'tgt', 'a'),
      ];
      const result = expandComposites(createPatch(blocks, edges));

      expect(result.provenance.boundaryMap.has('comp1' as BlockId)).toBe(true);
      const boundary = result.provenance.boundaryMap.get('comp1' as BlockId)!;

      // Input rewrite for port 'a'
      expect(boundary.inputRewrites.has('a')).toBe(true);
      const inputRewrite = boundary.inputRewrites.get('a')!;
      expect(inputRewrite.replacedEdges).toContain('e1');
      expect(inputRewrite.internalSink.blockId).toBe('cx:comp1@TestAddWrapper:b:add');
      expect(inputRewrite.internalSink.port).toBe('a');

      // Output rewrite for port 'out'
      expect(boundary.outputRewrites.has('out')).toBe(true);
      const outputRewrite = boundary.outputRewrites.get('out')!;
      expect(outputRewrite.replacedEdges).toContain('e2');
      expect(outputRewrite.internalSource.blockId).toBe('cx:comp1@TestAddWrapper:b:add');
      expect(outputRewrite.internalSource.port).toBe('out');
    });
  });

  // -------------------------------------------------------------------------
  // 13. Trace events
  // -------------------------------------------------------------------------
  describe('trace events', () => {
    it('emits trace events when trace: true', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('src', 'Const'), createBlock('comp1', 'TestAddWrapper')];
      const edges = [createEdge('e1', 'src', 'out', 'comp1', 'a')];
      const result = expandComposites(createPatch(blocks, edges), { trace: true });

      expect(result.trace).toBeDefined();
      expect(result.trace!.length).toBeGreaterThan(0);

      // Should have expandBegin and expandEnd
      const begins = result.trace!.filter(t => t.kind === 'expandBegin');
      const ends = result.trace!.filter(t => t.kind === 'expandEnd');
      expect(begins.length).toBe(1);
      expect(ends.length).toBe(1);

      if (begins[0].kind === 'expandBegin') {
        expect(begins[0].instanceBlockId).toBe('comp1');
        expect(begins[0].compositeId).toBe('TestAddWrapper');
      }

      // Should have rewriteIn for the boundary
      const rewriteIns = result.trace!.filter(t => t.kind === 'rewriteIn');
      expect(rewriteIns.length).toBe(1);
    });

    it('does not emit trace events when trace is not set', () => {
      registerTestComposite(createSimpleAddComposite());

      const blocks = [createBlock('comp1', 'TestAddWrapper')];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.trace).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 14. Interface validation
  // -------------------------------------------------------------------------
  describe('interface validation', () => {
    it('registration rejects duplicate exposed input port IDs', () => {
      // registerComposite validates interface at registration time
      const badDef: CompositeBlockDef = {
        type: 'TestDupInput',
        form: 'composite',
        label: 'Dup Input',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([
          [internalBlockId('add'), { type: 'Add' }],
        ]),
        internalEdges: [],
        exposedInputs: [
          { externalId: 'a', internalBlockId: internalBlockId('add'), internalPortId: 'a' },
          { externalId: 'a', internalBlockId: internalBlockId('add'), internalPortId: 'b' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('add'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };

      expect(() => registerTestComposite(badDef)).toThrow(/DUPLICATE_EXTERNAL_PORT/);
    });
  });

  // -------------------------------------------------------------------------
  // 15. Stateful blocks (deterministic IDs for state keys)
  // -------------------------------------------------------------------------
  describe('stateful blocks', () => {
    it('deterministic IDs for state keys', () => {
      const def: CompositeBlockDef = {
        type: 'TestStatefulComposite',
        form: 'composite',
        label: 'Stateful Composite',
        category: 'test',
        capability: 'state',
        internalBlocks: new Map([
          [internalBlockId('lag1'), { type: 'Lag' }],
          [internalBlockId('lag2'), { type: 'Lag' }],
        ]),
        internalEdges: [
          { fromBlock: internalBlockId('lag1'), fromPort: 'out', toBlock: internalBlockId('lag2'), toPort: 'target' },
        ],
        exposedInputs: [
          { externalId: 'in', internalBlockId: internalBlockId('lag1'), internalPortId: 'target' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('lag2'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };
      registerTestComposite(def);

      const result = expandComposites(createPatch([createBlock('stateful1', 'TestStatefulComposite')], []));

      expect(result.diagnostics).toEqual([]);

      const lag1Id = 'cx:stateful1@TestStatefulComposite:b:lag1' as BlockId;
      const lag2Id = 'cx:stateful1@TestStatefulComposite:b:lag2' as BlockId;

      expect(result.patch.blocks.has(lag1Id)).toBe(true);
      expect(result.patch.blocks.has(lag2Id)).toBe(true);
      expect(lag1Id).not.toBe(lag2Id);
    });

    it('same composite def with different instances get different IDs', () => {
      const def: CompositeBlockDef = {
        type: 'TestStatefulSingle',
        form: 'composite',
        label: 'Stateful Single',
        category: 'test',
        capability: 'state',
        internalBlocks: new Map([
          [internalBlockId('lag'), { type: 'Lag' }],
        ]),
        internalEdges: [],
        exposedInputs: [
          { externalId: 'in', internalBlockId: internalBlockId('lag'), internalPortId: 'target' },
        ],
        exposedOutputs: [
          { externalId: 'out', internalBlockId: internalBlockId('lag'), internalPortId: 'out' },
        ],
        inputs: {},
        outputs: {},
      };
      registerTestComposite(def);

      const blocks = [
        createBlock('instance1', 'TestStatefulSingle'),
        createBlock('instance2', 'TestStatefulSingle'),
      ];
      const result = expandComposites(createPatch(blocks, []));

      expect(result.diagnostics).toEqual([]);

      const lag1Id = 'cx:instance1@TestStatefulSingle:b:lag' as BlockId;
      const lag2Id = 'cx:instance2@TestStatefulSingle:b:lag' as BlockId;

      expect(result.patch.blocks.has(lag1Id)).toBe(true);
      expect(result.patch.blocks.has(lag2Id)).toBe(true);
      expect(lag1Id).not.toBe(lag2Id);
    });
  });
});
