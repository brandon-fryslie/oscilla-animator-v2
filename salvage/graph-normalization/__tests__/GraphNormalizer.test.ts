/**
 * GraphNormalizer Test Suite
 *
 * Tests that normalize() correctly materializes DSConst blocks for
 * unconnected inputs with defaultSource.
 *
 * This is the foundation of the "all defaults are blocks" architecture.
 */

import { describe, it, expect } from 'vitest';
import { normalize } from '../GraphNormalizer';
import type { RawGraph } from '../types';
import type { Block, Edge } from '../../types';
import { getBlockDefinition } from '../../blocks';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a minimal GridDomain block for testing.
 * GridDomain has 5 inputs, all with defaultSource.
 */
function createGridDomainBlock(id: string): Block {
  return {
    id,
    type: 'GridDomain',
    label: 'Test Grid',
    position: { x: 0, y: 0 },
    params: {},
    form: 'primitive',
    role: { kind: 'user', meta: {} },
    defaultSourceProviders: {},
  };
}

/**
 * Create a minimal Oscillator block for testing.
 * Oscillator has 4 inputs: phase, shape, amplitude, bias
 */
function createOscillatorBlock(id: string): Block {
  return {
    id,
    type: 'Oscillator',
    label: 'Test Oscillator',
    position: { x: 0, y: 0 },
    params: {},
    form: 'primitive',
    role: { kind: 'user', meta: {} },
    defaultSourceProviders: {},
  };
}

/**
 * Create a user edge for testing.
 */
function createEdge(
  id: string,
  fromBlockId: string,
  fromSlotId: string,
  toBlockId: string,
  toSlotId: string
): Edge {
  return {
    id,
    from: { kind: 'port', blockId: fromBlockId, slotId: fromSlotId },
    to: { kind: 'port', blockId: toBlockId, slotId: toSlotId },
    enabled: true,
    role: { kind: 'user', meta: {} },
  };
}

/**
 * Find structural blocks in the normalized graph (blocks not in raw).
 */
function findStructuralBlocks(raw: RawGraph, normalized: ReturnType<typeof normalize>): Block[] {
  const rawIds = new Set(raw.blocks.map(b => b.id));
  return normalized.blocks.filter(b => !rawIds.has(b.id));
}

/**
 * Find structural edges in the normalized graph (edges not in raw).
 */
function findStructuralEdges(raw: RawGraph, normalized: ReturnType<typeof normalize>): Edge[] {
  const rawIds = new Set(raw.edges.map(e => e.id));
  return normalized.edges.filter(e => !rawIds.has(e.id));
}

// =============================================================================
// Graph Validation Utilities
// =============================================================================

interface ValidationError {
  type: 'missing_block' | 'missing_port' | 'invalid_role';
  message: string;
  context: Record<string, unknown>;
}

/**
 * Validate that all edges reference blocks that exist in the graph.
 */
function validateEdgeBlockReferences(blocks: Block[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const blockIds = new Set(blocks.map(b => b.id));

  for (const edge of edges) {
    if (edge.from.kind === 'port' && !blockIds.has(edge.from.blockId)) {
      errors.push({
        type: 'missing_block',
        message: `Edge ${edge.id} references non-existent source block: ${edge.from.blockId}`,
        context: { edgeId: edge.id, blockId: edge.from.blockId, direction: 'from' },
      });
    }
    if (edge.to.kind === 'port' && !blockIds.has(edge.to.blockId)) {
      errors.push({
        type: 'missing_block',
        message: `Edge ${edge.id} references non-existent target block: ${edge.to.blockId}`,
        context: { edgeId: edge.id, blockId: edge.to.blockId, direction: 'to' },
      });
    }
  }

  return errors;
}

/**
 * Validate that all edge ports exist on their respective block types.
 */
function validateEdgePortReferences(blocks: Block[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const blockMap = new Map(blocks.map(b => [b.id, b]));

  for (const edge of edges) {
    // Validate source port (output)
    if (edge.from.kind === 'port') {
      const sourceBlock = blockMap.get(edge.from.blockId);
      if (sourceBlock) {
        const blockDef = getBlockDefinition(sourceBlock.type);
        if (blockDef) {
          const hasOutput = blockDef.outputs?.some(o => o.id === edge.from.slotId);
          if (!hasOutput) {
            errors.push({
              type: 'missing_port',
              message: `Edge ${edge.id} references non-existent output port: ${sourceBlock.type}.${edge.from.slotId}`,
              context: { edgeId: edge.id, blockType: sourceBlock.type, portId: edge.from.slotId, direction: 'output' },
            });
          }
        }
      }
    }

    // Validate target port (input)
    if (edge.to.kind === 'port') {
      const targetBlock = blockMap.get(edge.to.blockId);
      if (targetBlock) {
        const blockDef = getBlockDefinition(targetBlock.type);
        if (blockDef) {
          const hasInput = blockDef.inputs?.some(i => i.id === edge.to.slotId);
          if (!hasInput) {
            errors.push({
              type: 'missing_port',
              message: `Edge ${edge.id} references non-existent input port: ${targetBlock.type}.${edge.to.slotId}`,
              context: { edgeId: edge.id, blockType: targetBlock.type, portId: edge.to.slotId, direction: 'input' },
            });
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Validate that all blocks have valid role structures.
 */
function validateBlockRoles(blocks: Block[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const block of blocks) {
    if (!block.role) {
      errors.push({
        type: 'invalid_role',
        message: `Block ${block.id} is missing role`,
        context: { blockId: block.id },
      });
      continue;
    }

    if (block.role.kind === 'structural') {
      if (!block.role.meta || !block.role.meta.kind) {
        errors.push({
          type: 'invalid_role',
          message: `Structural block ${block.id} is missing meta.kind`,
          context: { blockId: block.id },
        });
      }
    }
  }

  return errors;
}

/**
 * Run all graph validations and return combined errors.
 * Note: Multiple writers to the same input is explicitly supported via combine modes.
 */
function validateGraph(blocks: Block[], edges: Edge[]): ValidationError[] {
  return [
    ...validateEdgeBlockReferences(blocks, edges),
    ...validateEdgePortReferences(blocks, edges),
    ...validateBlockRoles(blocks),
  ];
}

// =============================================================================
// Tests
// =============================================================================

describe('GraphNormalizer.normalize', () => {
  describe('DSConst block creation', () => {
    it('creates DSConst blocks for unconnected inputs with defaultSource', () => {
      // Create a raw graph with one GridDomain block (5 inputs with defaultSource)
      const raw: RawGraph = {
        blocks: [createGridDomainBlock('grid-1')],
        edges: [],
      };

      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // GridDomain has 5 inputs: rows, cols, spacing, originX, originY
      // All should get DSConst blocks
      expect(structuralBlocks.length).toBe(5);

      // All structural blocks should have role metadata
      for (const block of structuralBlocks) {
        expect(block.role).toBeDefined();
        expect(block.role.kind).toBe('structural');
      }
    });

    it('creates edges from DSConst.out to target inputs', () => {
      const raw: RawGraph = {
        blocks: [createGridDomainBlock('grid-1')],
        edges: [],
      };

      const normalized = normalize(raw);
      const structuralEdges = findStructuralEdges(raw, normalized);

      // Should have 5 structural edges (one per input)
      expect(structuralEdges.length).toBe(5);

      // Each edge should target the GridDomain block
      for (const edge of structuralEdges) {
        expect(edge.to.kind).toBe('port');
        if (edge.to.kind === 'port') {
          expect(edge.to.blockId).toBe('grid-1');
        }
      }

      // Each edge should come from a DSConst.out port
      for (const edge of structuralEdges) {
        expect(edge.from.kind).toBe('port');
        if (edge.from.kind === 'port') {
          expect(edge.from.slotId).toBe('out');
        }
      }
    });

    it('DSConst blocks have correct params with default values', () => {
      const raw: RawGraph = {
        blocks: [createGridDomainBlock('grid-1')],
        edges: [],
      };

      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // Find the DSConst for 'rows' input (should have value: 10)
      const rowsProvider = structuralBlocks.find(b =>
        b.role.kind === 'structural' &&
        b.role.meta.kind === 'defaultSource' &&
        b.role.meta.target.port.slotId === 'rows'
      );

      expect(rowsProvider).toBeDefined();
      expect(rowsProvider?.params?.value).toBe(10);
      expect(rowsProvider?.type).toBe('DSConstScalarInt');

      // Find the DSConst for 'spacing' input (should have value: 20)
      const spacingProvider = structuralBlocks.find(b =>
        b.role.kind === 'structural' &&
        b.role.meta.kind === 'defaultSource' &&
        b.role.meta.target.port.slotId === 'spacing'
      );

      expect(spacingProvider).toBeDefined();
      expect(spacingProvider?.params?.value).toBe(20);
      expect(spacingProvider?.type).toBe('DSConstSignalFloat');
    });

    it('does NOT create DSConst for connected inputs', () => {
      // Create two blocks with an edge connecting them
      const raw: RawGraph = {
        blocks: [
          createOscillatorBlock('osc-1'),
          createGridDomainBlock('grid-1'),
        ],
        edges: [
          createEdge('edge-1', 'osc-1', 'out', 'grid-1', 'spacing'),
        ],
      };

      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // GridDomain has 5 inputs, but 'spacing' is connected
      // So we should have 4 DSConst blocks for rows, cols, originX, originY
      // Plus DSConst blocks for Oscillator's inputs (phase, shape, amplitude, bias)

      // Check that no DSConst was created for 'spacing'
      const spacingProvider = structuralBlocks.find(b =>
        b.role.kind === 'structural' &&
        b.role.meta.kind === 'defaultSource' &&
        b.role.meta.target.port.slotId === 'spacing' &&
        b.role.meta.target.port.blockId === 'grid-1'
      );

      expect(spacingProvider).toBeUndefined();
    });

    it('uses correct DSConst block type based on input world/domain', () => {
      const raw: RawGraph = {
        blocks: [createGridDomainBlock('grid-1')],
        edges: [],
      };

      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // rows is Scalar:int -> DSConstScalarInt
      const rowsProvider = structuralBlocks.find(b =>
        b.role.kind === 'structural' &&
        b.role.meta.kind === 'defaultSource' &&
        b.role.meta.target.port.slotId === 'rows'
      );
      expect(rowsProvider?.type).toBe('DSConstScalarInt');

      // spacing is Signal:float -> DSConstSignalFloat
      const spacingProvider = structuralBlocks.find(b =>
        b.role.kind === 'structural' &&
        b.role.meta.kind === 'defaultSource' &&
        b.role.meta.target.port.slotId === 'spacing'
      );
      expect(spacingProvider?.type).toBe('DSConstSignalFloat');
    });
  });

  describe('structural artifact IDs', () => {
    it('generates deterministic provider IDs based on target', () => {
      const raw: RawGraph = {
        blocks: [createGridDomainBlock('grid-1')],
        edges: [],
      };

      // Normalize twice
      const normalized1 = normalize(raw);
      const normalized2 = normalize(raw);

      const structural1 = findStructuralBlocks(raw, normalized1);
      const structural2 = findStructuralBlocks(raw, normalized2);

      // IDs should be identical
      const ids1 = structural1.map(b => b.id).sort();
      const ids2 = structural2.map(b => b.id).sort();

      expect(ids1).toEqual(ids2);
    });

    it('provider ID format is predictable', () => {
      const raw: RawGraph = {
        blocks: [createGridDomainBlock('grid-1')],
        edges: [],
      };

      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // Provider IDs should follow pattern: {blockId}_default_{slotId}
      for (const block of structuralBlocks) {
        expect(block.id).toMatch(/^grid-1_default_/);
      }
    });
  });

  describe('Rainbow Grid macro (canonical startup patch)', () => {
    /**
     * Rainbow Grid macro structure:
     * - InfiniteTimeRoot: no inputs (source of time)
     * - Oscillator: phase, shape, amplitude, bias (all need defaults except phase if wired)
     * - GridDomain: rows, cols, spacing, originX, originY (from params, but still need DSConst)
     * - FieldFromExpression: domain (wired), signal, expression
     * - FieldStringToColor: strings (wired)
     * - RenderInstances2D: domain (wired), positions (wired), color (wired), radius, opacity, glow, glowIntensity
     */
    function createRainbowGridRaw(): RawGraph {
      const blocks: Block[] = [
        {
          id: 'time-1',
          type: 'InfiniteTimeRoot',
          label: 'Time',
          position: { x: 0, y: 0 },
          params: { periodMs: 5000 },
          form: 'primitive',
          role: { kind: 'user', meta: {} },
          defaultSourceProviders: {},
        },
        {
          id: 'osc-1',
          type: 'Oscillator',
          label: 'Pulse',
          position: { x: 100, y: 0 },
          params: { shape: 'sine', amplitude: 0.5, bias: 0.5 },
          form: 'primitive',
          role: { kind: 'user', meta: {} },
          defaultSourceProviders: {},
        },
        {
          id: 'grid-1',
          type: 'GridDomain',
          label: 'Grid',
          position: { x: 200, y: 0 },
          params: { rows: 12, cols: 12, spacing: 25, originX: 200, originY: 100 },
          form: 'primitive',
          role: { kind: 'user', meta: {} },
          defaultSourceProviders: {},
        },
        {
          id: 'colorExpr-1',
          type: 'FieldFromExpression',
          label: 'Rainbow Colors',
          position: { x: 300, y: 0 },
          params: { expression: 'hsl(i / n * 360 + signal * 360, 90, 60)' },
          form: 'primitive',
          role: { kind: 'user', meta: {} },
          defaultSourceProviders: {},
        },
        {
          id: 'toColor-1',
          type: 'FieldStringToColor',
          label: 'To Color',
          position: { x: 400, y: 0 },
          params: {},
          form: 'primitive',
          role: { kind: 'user', meta: {} },
          defaultSourceProviders: {},
        },
        {
          id: 'render-1',
          type: 'RenderInstances2D',
          label: 'Render',
          position: { x: 500, y: 0 },
          params: {},
          form: 'primitive',
          role: { kind: 'user', meta: {} },
          defaultSourceProviders: {},
        },
      ];

      const edges: Edge[] = [
        // Grid domain to render and colorExpr
        {
          id: 'edge-1',
          from: { kind: 'port', blockId: 'grid-1', slotId: 'domain' },
          to: { kind: 'port', blockId: 'render-1', slotId: 'domain' },
          enabled: true,
          role: { kind: 'user', meta: {} },
        },
        {
          id: 'edge-2',
          from: { kind: 'port', blockId: 'grid-1', slotId: 'domain' },
          to: { kind: 'port', blockId: 'colorExpr-1', slotId: 'domain' },
          enabled: true,
          role: { kind: 'user', meta: {} },
        },
        {
          id: 'edge-3',
          from: { kind: 'port', blockId: 'grid-1', slotId: 'pos0' },
          to: { kind: 'port', blockId: 'render-1', slotId: 'positions' },
          enabled: true,
          role: { kind: 'user', meta: {} },
        },
        // Color chain
        {
          id: 'edge-4',
          from: { kind: 'port', blockId: 'colorExpr-1', slotId: 'field' },
          to: { kind: 'port', blockId: 'toColor-1', slotId: 'strings' },
          enabled: true,
          role: { kind: 'user', meta: {} },
        },
        {
          id: 'edge-5',
          from: { kind: 'port', blockId: 'toColor-1', slotId: 'colors' },
          to: { kind: 'port', blockId: 'render-1', slotId: 'color' },
          enabled: true,
          role: { kind: 'user', meta: {} },
        },
      ];

      return { blocks, edges };
    }

    it('creates DSConst blocks for all unconnected inputs', () => {
      const raw = createRainbowGridRaw();
      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // Expected DSConst blocks for each block's unconnected inputs:
      // - InfiniteTimeRoot: 0 (no inputs - it's a source)
      // - Oscillator: 4 (phase, shape, amplitude, bias - all unconnected)
      // - GridDomain: 5 (rows, cols, spacing, originX, originY - all unconnected)
      // - FieldFromExpression: 2 (signal, expression - domain is wired)
      // - FieldStringToColor: 0 (strings is wired)
      // - RenderInstances2D: 4 (radius, opacity, glow, glowIntensity - domain, positions, color are wired)
      // Total: 15

      expect(structuralBlocks.length).toBe(15);

      // All structural blocks should have role metadata with defaultSource kind
      for (const block of structuralBlocks) {
        expect(block.role).toBeDefined();
        expect(block.role.kind).toBe('structural');
        if (block.role.kind === 'structural') {
          expect(block.role.meta.kind).toBe('defaultSource');
        }
      }
    });

    it('creates DSConst for each specific unconnected input', () => {
      const raw = createRainbowGridRaw();
      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // Helper to find DSConst for a specific port
      const findDSConstFor = (blockId: string, slotId: string) =>
        structuralBlocks.find(b =>
          b.role.kind === 'structural' &&
          b.role.meta.kind === 'defaultSource' &&
          b.role.meta.target.port.blockId === blockId &&
          b.role.meta.target.port.slotId === slotId
        );

      // Oscillator inputs (all unconnected)
      expect(findDSConstFor('osc-1', 'phase')).toBeDefined();
      expect(findDSConstFor('osc-1', 'shape')).toBeDefined();
      expect(findDSConstFor('osc-1', 'amplitude')).toBeDefined();
      expect(findDSConstFor('osc-1', 'bias')).toBeDefined();

      // GridDomain inputs (all unconnected)
      expect(findDSConstFor('grid-1', 'rows')).toBeDefined();
      expect(findDSConstFor('grid-1', 'cols')).toBeDefined();
      expect(findDSConstFor('grid-1', 'spacing')).toBeDefined();
      expect(findDSConstFor('grid-1', 'originX')).toBeDefined();
      expect(findDSConstFor('grid-1', 'originY')).toBeDefined();

      // FieldFromExpression inputs (domain is wired, signal and expression are not)
      expect(findDSConstFor('colorExpr-1', 'signal')).toBeDefined();
      expect(findDSConstFor('colorExpr-1', 'expression')).toBeDefined();

      // RenderInstances2D inputs (domain, positions, color are wired; radius, opacity, glow, glowIntensity are not)
      expect(findDSConstFor('render-1', 'radius')).toBeDefined();
      expect(findDSConstFor('render-1', 'opacity')).toBeDefined();
      expect(findDSConstFor('render-1', 'glow')).toBeDefined();
      expect(findDSConstFor('render-1', 'glowIntensity')).toBeDefined();
    });

    it('creates edges from DSConst blocks to target inputs', () => {
      const raw = createRainbowGridRaw();
      const normalized = normalize(raw);
      const structuralEdges = findStructuralEdges(raw, normalized);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // Should have same number of structural edges as structural blocks (1:1 mapping)
      expect(structuralEdges.length).toBe(structuralBlocks.length);
      expect(structuralEdges.length).toBe(15);

      // Each structural edge should come from a DSConst.out port
      for (const edge of structuralEdges) {
        expect(edge.from.kind).toBe('port');
        if (edge.from.kind === 'port') {
          expect(edge.from.slotId).toBe('out');
          // The source block should be one of the structural blocks
          const sourceBlock = structuralBlocks.find(b => b.id === edge.from.blockId);
          expect(sourceBlock).toBeDefined();
        }
      }

      // Each structural edge should target one of the user blocks' inputs
      for (const edge of structuralEdges) {
        expect(edge.to.kind).toBe('port');
        if (edge.to.kind === 'port') {
          const targetBlock = raw.blocks.find(b => b.id === edge.to.blockId);
          expect(targetBlock).toBeDefined();
        }
      }
    });

    it('connected inputs do NOT get DSConst blocks', () => {
      const raw = createRainbowGridRaw();
      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // Helper to find DSConst for a specific port
      const findDSConstFor = (blockId: string, slotId: string) =>
        structuralBlocks.find(b =>
          b.role.kind === 'structural' &&
          b.role.meta.kind === 'defaultSource' &&
          b.role.meta.target.port.blockId === blockId &&
          b.role.meta.target.port.slotId === slotId
        );

      // These inputs are connected via edges, so should NOT have DSConst:
      // - render-1.domain (from grid-1.domain)
      // - render-1.positions (from grid-1.pos0)
      // - render-1.color (from toColor-1.colors)
      // - colorExpr-1.domain (from grid-1.domain)
      // - toColor-1.strings (from colorExpr-1.field)

      expect(findDSConstFor('render-1', 'domain')).toBeUndefined();
      expect(findDSConstFor('render-1', 'positions')).toBeUndefined();
      expect(findDSConstFor('render-1', 'color')).toBeUndefined();
      expect(findDSConstFor('colorExpr-1', 'domain')).toBeUndefined();
      expect(findDSConstFor('toColor-1', 'strings')).toBeUndefined();
    });

    it('preserves all original user blocks and edges', () => {
      const raw = createRainbowGridRaw();
      const normalized = normalize(raw);

      // All 6 original blocks should still be present
      expect(normalized.blocks.length).toBe(raw.blocks.length + 15); // 6 user + 15 DSConst

      for (const originalBlock of raw.blocks) {
        const found = normalized.blocks.find(b => b.id === originalBlock.id);
        expect(found).toBeDefined();
        expect(found?.type).toBe(originalBlock.type);
      }

      // All 5 original edges should still be present
      for (const originalEdge of raw.edges) {
        const found = normalized.edges.find(e => e.id === originalEdge.id);
        expect(found).toBeDefined();
      }

      // Total edges = 5 original + 15 DSConst edges
      expect(normalized.edges.length).toBe(raw.edges.length + 15);
    });

    it('produces a structurally valid graph ready for compilation', () => {
      const raw = createRainbowGridRaw();
      const normalized = normalize(raw);

      // Run all graph validations
      const errors = validateGraph(normalized.blocks, normalized.edges);

      // The normalized graph should have zero validation errors
      if (errors.length > 0) {
        // Provide detailed error info for debugging
        for (const error of errors) {
          console.error(`Validation error: ${error.message}`, error.context);
        }
      }

      expect(errors).toEqual([]);
    });

  });

  describe('edge cases', () => {
    it('handles empty graph', () => {
      const raw: RawGraph = {
        blocks: [],
        edges: [],
      };

      const normalized = normalize(raw);

      expect(normalized.blocks).toEqual([]);
      expect(normalized.edges).toEqual([]);
    });

    it('handles block with no inputs', () => {
      // TimeRoot has no inputs
      const raw: RawGraph = {
        blocks: [{
          id: 'time-1',
          type: 'InfiniteTimeRoot',
          label: 'Time',
          position: { x: 0, y: 0 },
          params: { periodMs: 10000 },
          form: 'primitive',
          role: { kind: 'user', meta: {} },
        }],
        edges: [],
      };

      const normalized = normalize(raw);
      const structuralBlocks = findStructuralBlocks(raw, normalized);

      // TimeRoot has no inputs, so no DSConst blocks should be created
      expect(structuralBlocks.length).toBe(0);
    });
  });
});
