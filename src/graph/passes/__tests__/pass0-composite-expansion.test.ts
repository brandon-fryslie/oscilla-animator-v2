/**
 * Tests for Pass 0: Composite Expansion
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pass0CompositeExpansion } from '../pass0-composite-expansion';
import {
  registerComposite,
  unregisterComposite,
} from '../../../blocks/registry';
import type { CompositeBlockDef } from '../../../blocks/composite-types';
import { internalBlockId, COMPOSITE_EXPANSION_PREFIX } from '../../../blocks/composite-types';
import type { Patch, Block, Edge } from '../../Patch';
import type { BlockId, BlockRole } from '../../../types';
import { userRole } from '../../../types';

// Import blocks to ensure they're registered (Add, Mul, Noise, Lag, Const)
import '../../../blocks/math-blocks';   // Add, Mul, Noise
import '../../../blocks/signal-blocks'; // Lag, Const

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Simple composite: wraps an Add block, exposing all ports.
 */
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
    // Computed from exposed ports (simplified for test)
    inputs: {},
    outputs: {},
  };
}

/**
 * Chain composite: Noise → Lag for smooth random.
 * Uses actual port names from the block definitions.
 */
function createSmoothNoiseComposite(): CompositeBlockDef {
  return {
    type: 'TestSmoothNoise',
    form: 'composite',
    label: 'Smooth Noise',
    category: 'test',
    capability: 'state', // Lag is stateful
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

/**
 * Create a test block.
 */
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

/**
 * Create a test edge.
 */
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

/**
 * Create a test patch.
 */
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

describe('pass0CompositeExpansion', () => {
  // Track registered composites for cleanup
  let registeredComposites: string[] = [];

  beforeEach(() => {
    registeredComposites = [];
  });

  afterEach(() => {
    // Unregister all test composites
    for (const type of registeredComposites) {
      try {
        unregisterComposite(type);
      } catch {
        // Ignore if already unregistered
      }
    }
  });

  /**
   * Register a composite for testing and track for cleanup.
   */
  function registerTestComposite(def: CompositeBlockDef): void {
    registerComposite(def);
    registeredComposites.push(def.type);
  }

  describe('no composites', () => {
    it('passes through patch unchanged when no composites', () => {
      const blocks = [
        createBlock('b1', 'Add'),
        createBlock('b2', 'Multiply'),
      ];
      const edges = [createEdge('e1', 'b1', 'out', 'b2', 'a')];
      const patch = createPatch(blocks, edges);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.patch.blocks.size).toBe(2);
        expect(result.patch.edges.length).toBe(1);
        expect(result.expansionMap.size).toBe(0);
      }
    });
  });

  describe('simple composite expansion', () => {
    it('expands a simple composite into its internal blocks', () => {
      const compositeDef = createSimpleAddComposite();
      registerTestComposite(compositeDef);

      // Patch with one composite block
      const blocks = [createBlock('comp1', 'TestAddWrapper')];
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Composite should be removed, internal block added
        expect(result.patch.blocks.has('comp1' as BlockId)).toBe(false);
        expect(result.patch.blocks.size).toBe(1); // Just the internal Add block

        // Check expanded block ID format
        const expandedId = `${COMPOSITE_EXPANSION_PREFIX}comp1_add`;
        expect(result.patch.blocks.has(expandedId as BlockId)).toBe(true);

        // Check expansion info
        expect(result.expansionMap.has('comp1')).toBe(true);
        const info = result.expansionMap.get('comp1')!;
        expect(info.compositeDefId).toBe('TestAddWrapper');
        expect(info.expandedBlockIds).toContain(expandedId);
      }
    });

    it('derived blocks have compositeExpansion role metadata', () => {
      const compositeDef = createSimpleAddComposite();
      registerTestComposite(compositeDef);

      const blocks = [createBlock('comp1', 'TestAddWrapper')];
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        const expandedId = `${COMPOSITE_EXPANSION_PREFIX}comp1_add` as BlockId;
        const expandedBlock = result.patch.blocks.get(expandedId)!;

        expect(expandedBlock.role.kind).toBe('derived');
        if (expandedBlock.role.kind === 'derived') {
          expect(expandedBlock.role.meta.kind).toBe('compositeExpansion');
          if (expandedBlock.role.meta.kind === 'compositeExpansion') {
            expect(expandedBlock.role.meta.compositeDefId).toBe('TestAddWrapper');
            expect(expandedBlock.role.meta.compositeInstanceId).toBe('comp1');
            expect(expandedBlock.role.meta.internalBlockId).toBe('add');
          }
        }
      }
    });
  });

  describe('edge rewiring', () => {
    it('rewires edges to exposed inputs', () => {
      const compositeDef = createSimpleAddComposite();
      registerTestComposite(compositeDef);

      // Source → CompositeInput
      const blocks = [
        createBlock('src', 'Const'),
        createBlock('comp1', 'TestAddWrapper'),
      ];
      const edges = [
        createEdge('e1', 'src', 'out', 'comp1', 'a'),
      ];
      const patch = createPatch(blocks, edges);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Original edge should be replaced
        expect(result.patch.edges.find(e => e.id === 'e1')).toBeUndefined();

        // New edge should target the internal block
        const expandedId = `${COMPOSITE_EXPANSION_PREFIX}comp1_add`;
        const rewiredEdge = result.patch.edges.find(e =>
          e.from.blockId === 'src' && e.to.blockId === expandedId
        );
        expect(rewiredEdge).toBeDefined();
        expect(rewiredEdge!.to.slotId).toBe('a'); // Internal port
      }
    });

    it('rewires edges from exposed outputs', () => {
      const compositeDef = createSimpleAddComposite();
      registerTestComposite(compositeDef);

      // CompositeOutput → Target
      const blocks = [
        createBlock('comp1', 'TestAddWrapper'),
        createBlock('target', 'Multiply'),
      ];
      const edges = [
        createEdge('e1', 'comp1', 'out', 'target', 'a'),
      ];
      const patch = createPatch(blocks, edges);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Original edge should be replaced
        expect(result.patch.edges.find(e => e.id === 'e1')).toBeUndefined();

        // New edge should come from the internal block
        const expandedId = `${COMPOSITE_EXPANSION_PREFIX}comp1_add`;
        const rewiredEdge = result.patch.edges.find(e =>
          e.from.blockId === expandedId && e.to.blockId === 'target'
        );
        expect(rewiredEdge).toBeDefined();
        expect(rewiredEdge!.from.slotId).toBe('out'); // Internal port
      }
    });
  });

  describe('internal edges', () => {
    it('creates edges for internal connections', () => {
      const compositeDef = createSmoothNoiseComposite();
      registerTestComposite(compositeDef);

      const blocks = [createBlock('comp1', 'TestSmoothNoise')];
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Should have two internal blocks
        expect(result.patch.blocks.size).toBe(2);

        // Should have internal edge: noise.out → lag.target
        const noiseId = `${COMPOSITE_EXPANSION_PREFIX}comp1_noise`;
        const lagId = `${COMPOSITE_EXPANSION_PREFIX}comp1_lag`;
        const internalEdge = result.patch.edges.find(e =>
          e.from.blockId === noiseId &&
          e.from.slotId === 'out' &&
          e.to.blockId === lagId &&
          e.to.slotId === 'target'
        );
        expect(internalEdge).toBeDefined();
        expect(internalEdge!.role.kind).toBe('composite');
      }
    });
  });

  describe('multiple composites', () => {
    it('expands multiple composite instances', () => {
      const compositeDef = createSimpleAddComposite();
      registerTestComposite(compositeDef);

      const blocks = [
        createBlock('comp1', 'TestAddWrapper'),
        createBlock('comp2', 'TestAddWrapper'),
      ];
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Both composites should be expanded
        expect(result.patch.blocks.size).toBe(2); // One Add each

        const expandedId1 = `${COMPOSITE_EXPANSION_PREFIX}comp1_add`;
        const expandedId2 = `${COMPOSITE_EXPANSION_PREFIX}comp2_add`;
        expect(result.patch.blocks.has(expandedId1 as BlockId)).toBe(true);
        expect(result.patch.blocks.has(expandedId2 as BlockId)).toBe(true);

        expect(result.expansionMap.size).toBe(2);
      }
    });
  });

  describe('nested composites', () => {
    it('expands nested composites (composite containing composite)', () => {
      // First register the inner composite
      const innerDef = createSimpleAddComposite();
      registerTestComposite(innerDef);

      // Then register the outer composite that contains the inner
      const outerDef: CompositeBlockDef = {
        type: 'TestOuterWrapper',
        form: 'composite',
        label: 'Outer Wrapper',
        category: 'test',
        capability: 'pure',
        internalBlocks: new Map([
          [internalBlockId('inner'), { type: 'TestAddWrapper' }], // References inner composite
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
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Original composite should be gone
        expect(result.patch.blocks.has('outer1' as BlockId)).toBe(false);

        // Should have 2 blocks: the fully expanded Add from inner + Mul from outer
        // The nested TestAddWrapper should also be expanded
        expect(result.patch.blocks.size).toBe(2);

        // Check for the deeply nested Add block
        // First expansion: outer1 -> _comp_outer1_inner (TestAddWrapper), _comp_outer1_mul
        // Second expansion: _comp_outer1_inner -> _comp__comp_outer1_inner_add
        const innerExpandedId = `${COMPOSITE_EXPANSION_PREFIX}${COMPOSITE_EXPANSION_PREFIX}outer1_inner_add`;
        const mulExpandedId = `${COMPOSITE_EXPANSION_PREFIX}outer1_mul`;

        expect(result.patch.blocks.has(innerExpandedId as BlockId)).toBe(true);
        expect(result.patch.blocks.has(mulExpandedId as BlockId)).toBe(true);

        // Both expansions should be tracked
        expect(result.expansionMap.size).toBe(2);
      }
    });
  });

  describe('complex composites', () => {
    it('expands complex composite with 5+ internal blocks', () => {
      // Create a composite with 5 blocks: Add -> Mul -> Add -> Mul -> Add
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
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Should have 5 expanded blocks
        expect(result.patch.blocks.size).toBe(5);

        // Should have 4 internal edges
        expect(result.patch.edges.length).toBe(4);

        // All edges should have composite role
        for (const edge of result.patch.edges) {
          expect(edge.role.kind).toBe('composite');
        }
      }
    });
  });

  describe('error handling', () => {
    it('returns error for max nesting exceeded', () => {
      // Create deeply nested composites (more than MAX_COMPOSITE_NESTING_DEPTH)
      // We'll create level1 -> level2 -> level3 -> level4 -> level5 -> level6
      // This should exceed the 5-level limit

      const defs: CompositeBlockDef[] = [];
      for (let i = 6; i >= 1; i--) {
        const def: CompositeBlockDef = {
          type: `TestNestLevel${i}`,
          form: 'composite',
          label: `Nest Level ${i}`,
          category: 'test',
          capability: 'pure',
          internalBlocks: new Map([
            [internalBlockId('inner'), { type: i === 6 ? 'Add' : `TestNestLevel${i + 1}` }],
          ]),
          internalEdges: [],
          exposedInputs: i === 6
            ? [{ externalId: 'a', internalBlockId: internalBlockId('inner'), internalPortId: 'a' }]
            : [{ externalId: 'a', internalBlockId: internalBlockId('inner'), internalPortId: 'a' }],
          exposedOutputs: i === 6
            ? [{ externalId: 'out', internalBlockId: internalBlockId('inner'), internalPortId: 'out' }]
            : [{ externalId: 'out', internalBlockId: internalBlockId('inner'), internalPortId: 'out' }],
          inputs: {},
          outputs: {},
        };
        defs.push(def);
      }

      // Register from deepest to outermost
      for (const def of defs) {
        registerTestComposite(def);
      }

      const blocks = [createBlock('nested', 'TestNestLevel1')];
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0].code).toBe('MAX_NESTING_EXCEEDED');
      }
    });
  });

  describe('stateful blocks in composites', () => {
    it('stateful internal blocks get deterministic IDs for state keys', () => {
      // Composite with Lag (stateful block)
      const statefulDef: CompositeBlockDef = {
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
      registerTestComposite(statefulDef);

      const blocks = [createBlock('stateful1', 'TestStatefulComposite')];
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Both Lag blocks should be expanded with deterministic IDs
        const lag1Id = `${COMPOSITE_EXPANSION_PREFIX}stateful1_lag1`;
        const lag2Id = `${COMPOSITE_EXPANSION_PREFIX}stateful1_lag2`;

        expect(result.patch.blocks.has(lag1Id as BlockId)).toBe(true);
        expect(result.patch.blocks.has(lag2Id as BlockId)).toBe(true);

        // The IDs are deterministic, so state keys will be:
        // stableStateId('_comp_stateful1_lag1', 'lag') = '_comp_stateful1_lag1:lag'
        // stableStateId('_comp_stateful1_lag2', 'lag') = '_comp_stateful1_lag2:lag'
        // These are unique and deterministic
        const lag1Block = result.patch.blocks.get(lag1Id as BlockId)!;
        const lag2Block = result.patch.blocks.get(lag2Id as BlockId)!;

        expect(lag1Block.id).not.toBe(lag2Block.id);
        expect(lag1Block.type).toBe('Lag');
        expect(lag2Block.type).toBe('Lag');
      }
    });

    it('same composite def with different instances get different state keys', () => {
      const statefulDef: CompositeBlockDef = {
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
      registerTestComposite(statefulDef);

      // Two instances of the same composite
      const blocks = [
        createBlock('instance1', 'TestStatefulSingle'),
        createBlock('instance2', 'TestStatefulSingle'),
      ];
      const patch = createPatch(blocks, []);

      const result = pass0CompositeExpansion(patch);

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        // Each instance gets its own expanded block with unique ID
        const lag1Id = `${COMPOSITE_EXPANSION_PREFIX}instance1_lag` as BlockId;
        const lag2Id = `${COMPOSITE_EXPANSION_PREFIX}instance2_lag` as BlockId;

        expect(result.patch.blocks.has(lag1Id)).toBe(true);
        expect(result.patch.blocks.has(lag2Id)).toBe(true);

        // IDs are different, so state keys will be different
        expect(lag1Id).not.toBe(lag2Id);
      }
    });
  });
});
