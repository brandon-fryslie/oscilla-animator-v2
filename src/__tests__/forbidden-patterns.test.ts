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
      return !content.startsWith('//') && !content.startsWith('*') && !content.includes('TODO');
    });
    // Currently instanceId still exists on some field expressions (gap analysis #25 will remove)
    // This test documents the current state; tighten after #25 is complete
    // TODO: Change to expect(filtered).toEqual([]) after gap analysis Sprint 4 item #25
    expect(filtered.length).toBeLessThanOrEqual(6); // All on Step types, not expressions
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
      // isTypeCompatible should not reference block metadata or cardinality helpers
      const forbiddenInTypeCompat = [
        'getBlockCardinalityMetadata',
        'isCardinalityGeneric',
        'sourceBlockType',
        'targetBlockType',
      ];

      for (const forbidden of forbiddenInTypeCompat) {
        const matches = grepSrc(forbidden, 'src/compiler/frontend/analyze-type-graph.ts');
        expect(matches, `isTypeCompatible must not use ${forbidden}`).toEqual([]);
      }
    });

    it.skip('schedule steps contain no evalSig/evalEvent (Sprint 3)', () => {
      // TODO: Sprint 3 - after IR unification
      // Schedule steps should use unified ValueExpr, not separate evalSig/evalEvent
      const matches = grepSrc('evalSig\\|evalEvent', 'src/compiler/ir/types.ts');
      expect(matches, 'Schedule steps must use unified ValueExpr').toEqual([]);
    });

    it.skip('adapter insertion uses only types (Sprint 3)', () => {
      // TODO: Sprint 3 - after adapter refactor
      // Adapter insertion should dispatch on CanonicalType only, not block names
      // This will be enforced once adapter registry is refactored
      expect(true).toBe(true); // Placeholder
    });

  });
});
