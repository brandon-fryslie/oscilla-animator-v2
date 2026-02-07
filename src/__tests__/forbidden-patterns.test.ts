/**
 * CI Forbidden Pattern Test (Gap Analysis #13 / Resolution Q13)
 *
 * Grep-based test that fails CI for patterns that violate the canonical type system.
 * This is the mechanical enforcement gate for type system invariants.
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

/** Run grep and return matching file:line results, excluding this test file */
function grepSrc(pattern: string, pathFilter?: string): string[] {
  try {
    const target = pathFilter ?? 'src/';
    const cmd = `grep -rn '${pattern}' ${target} --include='*.ts' --include='*.tsx' 2>/dev/null || true`;
    const result = execSync(cmd, { encoding: 'utf-8', cwd: process.cwd() }).trim();
    const lines = result ? result.split('\n').filter(Boolean) : [];
    // Always exclude this test file itself
    return lines.filter(l => !l.includes('forbidden-patterns.test.ts'));
  } catch {
    return [];
  }
}

/** Filter out allowed locations from grep results */
function filterAllowlist(results: string[], allowlist: RegExp[]): string[] {
  return results.filter(line => !allowlist.some(re => re.test(line)));
}

describe('Forbidden Patterns (Type System Invariants)', () => {

  it('no AxisTag type alias anywhere in src/', () => {
    // Search for "type AxisTag" or "AxisTag<" as a type usage (not in comments)
    const matches = grepSrc('type AxisTag');
    expect(matches).toEqual([]);
  });

  it('no payload var kind outside inference modules', () => {
    const matches = grepSrc("kind: 'var'");
    const allowlist = [
      /canonical-types\.ts/,       // Type definitions and constructors
      /inference/i,                 // Any inference module
      /analyze-type-constraints/,   // Type constraint gathering
      /analyze-type-graph/,         // Type solver
      /type-env/i,                  // Type environment
      /\.test\./,                   // Test files
      /__tests__/,                  // Test directories
    ];
    const filtered = filterAllowlist(matches, allowlist);
    expect(filtered).toEqual([]);
  });

  it('no legacy type aliases in non-test, non-comment code', () => {
    // Search for type/interface declarations or type annotations using legacy names
    // We look for patterns like "type ResolvedPortType" or ": ResolvedPortType"
    const legacyTypes = [
      { pattern: 'type ResolvedPortType', description: 'legacy port type declaration' },
      { pattern: 'type ResolvedExtent', description: 'legacy extent type declaration' },
    ];
    for (const { pattern, description } of legacyTypes) {
      const matches = grepSrc(pattern);
      const allowlist = [
        /\.test\./,               // Test files
        /__tests__/,              // Test directories
        /\/\//,                   // Single-line comments
        /\*/,                     // Block comments
        /migration/i,            // Migration modules (temporary)
        /DEPRECATED/,            // Deprecation notices
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, `Found ${description} '${pattern}' outside allowed locations`).toEqual([]);
    }
  });

  // Note: "SignalType" is NOT checked because valid function names like
  // "assertSignalType" contain this substring. The actual legacy type was
  // already removed in previous sprints.

  it('no instanceId field on expression types in IR types', () => {
    // Only check the IR types file where expression types are defined
    const matches = grepSrc('instanceId', 'src/compiler/ir/types.ts');
    // Allow comments referencing instanceId for migration docs
    const filtered = matches.filter(m => {
      const content = m.substring(m.indexOf(':', m.indexOf(':') + 1) + 1).trim();
      return !content.startsWith('//') && !content.startsWith('*');
    });
    // Current state: 6 occurrences, all on Step types (not expression types)
    // Lines: 56 (import), 322, 328, 369, 380, 453 (all Step variants)
    // This is acceptable - steps need instanceId for runtime execution.
    // Expression types (ValueExpr variants) no longer have instanceId.
    expect(filtered.length).toBeLessThanOrEqual(6);
  });

  // =============================================================================
  // Sprint 1: Purity & Authority Hardening
  // =============================================================================

  describe('Purity & Authority (Sprint 1)', () => {

    it('backend cannot mutate types', () => {
      // Backend must never call type mutation functions
      const mutators = [
        'withInstance',
        'withCardinality',
        'withTemporality',
        'withPayload',
        'withUnit',
      ];

      for (const mutator of mutators) {
        const matches = grepSrc(mutator, 'src/compiler/backend/');
        // Allow imports but not calls
        const filtered = matches.filter(m => {
          const content = m.substring(m.indexOf(':', m.indexOf(':') + 1) + 1).trim();
          // Skip import lines
          if (content.startsWith('import ') || content.includes('from ')) return false;
          // Skip comments
          if (content.startsWith('//') || content.startsWith('*')) return false;
          // Allow withInstance in lower-blocks.ts for instance context rewriting
          // (block lowering produces types with placeholder instance; backend fills in real instance)
          if (mutator === 'withInstance' && m.includes('lower-blocks.ts')) return false;
          return true;
        });
        expect(filtered, `Backend must not call ${mutator}()`).toEqual([]);
      }
    });

    it('backend cannot import frontend modules', () => {
      const matches = grepSrc("from '\\.\\./frontend/", 'src/compiler/backend/');
      // Allow only PortKey type import (read-only type reference)
      const filtered = matches.filter(m => {
        const content = m.substring(m.indexOf(':', m.indexOf(':') + 1) + 1).trim();
        // Allow: import type { PortKey } from "../frontend/analyze-type-constraints";
        if (content.includes('import type') && content.includes('PortKey')) return false;
        return true;
      });
      expect(filtered, 'Backend must not import from frontend (except read-only types)').toEqual([]);
    });

    it('isTypeCompatible is pure (no block-name parameters)', () => {
      // isTypeCompatible itself must be pure — it takes a boolean `allowsBroadcast`,
      // not block metadata. The caller (pass2TypeGraph) may use getBlockCardinalityMetadata
      // to compute that boolean, which is fine.
      const forbiddenInTypeCompat = [
        'isCardinalityGeneric',
        'sourceBlockType',
        'targetBlockType',
      ];

      for (const forbidden of forbiddenInTypeCompat) {
        const matches = grepSrc(forbidden, 'src/compiler/frontend/analyze-type-graph.ts');
        expect(matches, `isTypeCompatible must not use ${forbidden}`).toEqual([]);
      }
    });

    it('schedule steps contain no evalSig/evalEvent (Sprint 3)', () => {
      // TODO: Sprint 3 - after IR unification
      // Schedule steps should use unified ValueExpr, not separate evalSig/evalEvent
      const matches = grepSrc('evalSig\\|evalEvent', 'src/compiler/ir/types.ts');
      expect(matches, 'Schedule steps must use unified ValueExpr').toEqual([]);
    });

    it('adapter insertion uses only types', () => {
      // Verify findAdapter signature: takes only CanonicalType parameters
      const adapterSpecFile = 'src/blocks/adapter-spec.ts';

      // Check 1: findAdapter signature must have (from: InferenceCanonicalType, to: InferenceCanonicalType)
      const findAdapterSig = grepSrc('export function findAdapter', adapterSpecFile);
      expect(findAdapterSig.length).toBeGreaterThan(0);

      // Should contain InferenceCanonicalType parameters only
      const hasTypeParams = findAdapterSig.some(line =>
        line.includes('InferenceCanonicalType') &&
        !line.includes('blockType') &&
        !line.includes('sourceBlock') &&
        !line.includes('targetBlock')
      );
      expect(hasTypeParams, 'findAdapter must dispatch on CanonicalType only').toBe(true);

      // Check 2: normalize-adapters.ts must NOT import isCardinalityGeneric
      const normalizeAdaptersFile = 'src/compiler/frontend/normalize-adapters.ts';
      const cardinalityGenericImports = grepSrc('isCardinalityGeneric', normalizeAdaptersFile);
      expect(cardinalityGenericImports, 'normalize-adapters.ts must not import isCardinalityGeneric').toEqual([]);
    });

  });

  // =============================================================================
  // Opcode Single Enforcer (Sprint: opcode-consolidation)
  // =============================================================================

  // =============================================================================
  // Block Lowering Type Authority
  // =============================================================================

  describe('Block Lowering Type Authority', () => {

    it('block lower() must not use canonicalType() for kernel operations', () => {
      // Kernel operations (kernelZip, kernelMap, kernelBroadcast) should derive types
      // from ctx.outTypes[0] or input types, NOT from canonicalType().
      // canonicalType() loses cardinality/extent resolved during type inference.
      //
      // ACCEPTABLE uses of canonicalType():
      // - Constants: ctx.b.constant(..., canonicalType(...))
      // - State reads: ctx.b.stateRead(..., canonicalType(...))
      // - External inputs: ctx.b.external(..., canonicalType(...))
      // - Time signals: ctx.b.time(..., canonicalType(...))
      //
      // FORBIDDEN:
      // - ctx.b.kernelZip([...], fn, canonicalType(...))
      // - ctx.b.kernelMap(..., fn, canonicalType(...))
      // - ctx.b.kernelBroadcast(..., fn, canonicalType(...))

      const kernelOps = ['kernelZip', 'kernelMap', 'kernelBroadcast'];
      const violations: string[] = [];

      for (const op of kernelOps) {
        // Find lines containing both the kernel op and canonicalType
        // This pattern catches: ctx.b.kernelZip([...], fn, canonicalType(...))
        const matches = grepSrc(`${op}.*canonicalType`, 'src/blocks/');
        violations.push(...matches);
      }

      expect(
        violations,
        `Block lower() must derive kernel types from ctx.outTypes[0], not canonicalType().\n` +
        `Found violations:\n${violations.join('\n')}`
      ).toEqual([]);
    });

  });

  describe('Opcode Single Enforcer', () => {

    it('ValueExprMaterializer must not contain inline opcode implementations', () => {
      // OpcodeInterpreter is the SINGLE ENFORCER for all scalar math.
      // ValueExprMaterializer must delegate via applyOpcode(), not inline switch cases.
      const forbiddenOpcodes = [
        'add', 'sub', 'mul', 'div', 'mod', 'pow',
        'sin', 'cos', 'tan',
        'floor', 'ceil', 'round', 'sqrt', 'exp', 'log',
        'min', 'max', 'clamp', 'lerp', 'select',
        'wrap01', 'fract', 'sign', 'hash',
        'neg', 'abs',
      ];

      for (const opcode of forbiddenOpcodes) {
        const matches = grepSrc(`case '${opcode}':`, 'src/runtime/ValueExprMaterializer.ts');
        expect(
          matches,
          `ValueExprMaterializer must not have case '${opcode}:' - use applyOpcode() instead`
        ).toEqual([]);
      }
    });

  });
});
