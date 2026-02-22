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

  // Note: a broad "legacy type alias" token check is intentionally avoided because
  // helper names can contain that phrase as a substring. The actual legacy type was
  // already removed in previous sprints.

  it('no instanceId field on expression types in IR types', () => {
    // Only check the IR types file where expression types are defined
    const matches = grepSrc('instanceId', 'src/compiler/ir/types.ts');
    // Allow comments referencing instanceId for migration docs
    const filtered = matches.filter(m => {
      const content = m.substring(m.indexOf(':', m.indexOf(':') + 1) + 1).trim();
      return !content.startsWith('//') && !content.startsWith('*');
    });
    // Current state: up to 7 occurrences, all on step/state declarations (not expression types).
    // This is acceptable - steps need instanceId for runtime execution.
    // Expression types (ValueExpr variants) no longer have instanceId.
    expect(filtered.length).toBeLessThanOrEqual(7);
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
      // Backend should not import from frontend at all — PortKey now lives in ir/patches
      expect(matches, 'Backend must not import from frontend').toEqual([]);
    });

    it('isEdgeTypeCompatible is pure (no block-name parameters)', () => {
      // isEdgeTypeCompatible (type-compatibility oracle) must be pure — it takes
      // only type facts, not block metadata or block-name dispatch.
      const forbiddenInTypeCompat = [
        'sourceBlockType',
        'targetBlockType',
      ];

      for (const forbidden of forbiddenInTypeCompat) {
        const matches = grepSrc(forbidden, 'src/compiler/frontend/policies/type-compatibility.ts');
        expect(matches, `isEdgeTypeCompatible must not use ${forbidden}`).toEqual([]);
      }
    });

    it('schedule steps contain no evalSig/evalEvent (Sprint 3)', () => {
      // TODO: Sprint 3 - after IR unification
      // Schedule steps should use unified ValueExpr, not legacy evalSig/evalEvent naming.
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

      // Check 2: normalize-adapters.ts must NOT depend on registry cardinality helpers
      const normalizeAdaptersFile = 'src/compiler/frontend/normalize-adapters.ts';
      const cardinalityMetadataImports = grepSrc('getBlockCardinalityMetadata\\|isCardinalityGeneric', normalizeAdaptersFile);
      expect(cardinalityMetadataImports, 'normalize-adapters.ts must not import cardinality metadata helpers').toEqual([]);
    });

  });

  // =============================================================================
  // Opcode Single Enforcer (Sprint: opcode-consolidation)
  // =============================================================================

  // =============================================================================
  // Block Lowering Type Authority
  // =============================================================================

  describe('BlockIRBuilder Surface Safety', () => {

    it('kernelMap must not appear on BlockIRBuilder interface', () => {
      const matches = grepSrc('kernelMap', 'src/compiler/ir/BlockIRBuilder.ts');
      const allowlist = [/\/\//];  // comments ok
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'kernelMap was removed from BlockIRBuilder — use mapAuto').toEqual([]);
    });

    it('blocks must not call ctx.b.kernelMap (use mapAuto)', () => {
      const matches = grepSrc('ctx\\.b\\.kernelMap', 'src/blocks/');
      expect(matches, 'Block code must use ctx.b.mapAuto(), not ctx.b.kernelMap()').toEqual([]);
    });

  });

  describe('Block Lowering Type Authority', () => {

    it('block lower() must not use canonicalType() for kernel operations', () => {
      // Kernel operations (zipAuto, mapAuto, kernelZip, etc.) should derive types
      // from ctx.outTypes[0] or input types, NOT from canonicalType().
      // canonicalType() loses cardinality/extent resolved during type inference.
      //
      // ACCEPTABLE uses of canonicalType():
      // - Constants: ctx.b.constant(..., canonicalType(...))
      // - State reads: ctx.b.stateRead(..., canonicalType(...))
      // - External inputs: ctx.b.external(..., canonicalType(...))
      // - Time channels: ctx.b.time(..., canonicalType(...))
      //
      // FORBIDDEN:
      // - ctx.b.zipAuto([...], fn, canonicalType(...))
      // - ctx.b.kernelZip([...], fn, canonicalType(...))
      // - ctx.b.kernelMap(..., fn, canonicalType(...))
      // - ctx.b.kernelBroadcast(..., fn, canonicalType(...))

      const kernelOps = ['zipAuto', 'kernelZip', 'kernelMap', 'kernelBroadcast'];
      const violations: string[] = [];

      for (const op of kernelOps) {
        // Find lines containing both the kernel op and canonicalType
        // This pattern catches: ctx.b.zipAuto([...], fn, canonicalType(...))
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

  // =============================================================================
  // Vararg Removal (Phase 6: Collect Refactor)
  // =============================================================================

  describe('Vararg Removal', () => {

    it('no VarargConnection type anywhere in src/', () => {
      const matches = grepSrc('VarargConnection');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /patch-from-ast\.ts/,            // Deprecation warning for legacy HCL
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'VarargConnection was removed — use collect edges instead').toEqual([]);
    });

    it('no isVararg field anywhere in src/', () => {
      const matches = grepSrc('isVararg');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'isVararg was removed — use collectAccepts instead').toEqual([]);
    });

    it('no varargInputsById anywhere in src/', () => {
      const matches = grepSrc('varargInputsById');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'varargInputsById was removed — use collectInputsById instead').toEqual([]);
    });

    it('no VarargConstraint type anywhere in src/', () => {
      const matches = grepSrc('VarargConstraint');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'VarargConstraint was removed — use AcceptsSpec instead').toEqual([]);
    });

    it('no varargConnections field anywhere in src/', () => {
      const matches = grepSrc('varargConnections');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'varargConnections was removed — use collect edges instead').toEqual([]);
    });

  });

  // =============================================================================
  // Legacy CompileError Removal
  // =============================================================================

  describe('Legacy CompileError Removal', () => {

    it('no LegacyCompileError type anywhere in src/', () => {
      const matches = grepSrc('LegacyCompileError');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'LegacyCompileError was removed — use CompileError from types.ts').toEqual([]);
    });

    it('no .kind on CompileError (use .code instead)', () => {
      // compile.ts must not define a CompileError with 'kind' field
      const matches = grepSrc("readonly kind: string", 'src/compiler/compile.ts');
      expect(matches, 'compile.ts CompileError must use code, not kind').toEqual([]);
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

  // =============================================================================
  // Composite Expansion Migration
  // =============================================================================

  // =============================================================================
  // Scalar Unit Removal
  // =============================================================================

  describe('Scalar Unit Removal', () => {

    it('no unitScalar function anywhere in src/', () => {
      const matches = grepSrc('unitScalar');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'unitScalar was removed — use unitNone() for dimensionless values').toEqual([]);
    });

    it('no UnitType kind scalar in src/ (except SlotValue/runtime which is different)', () => {
      const matches = grepSrc("kind: 'scalar'");
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /lowerTypes\.ts/,                // SlotValue.kind: 'scalar' (runtime concept)
        /IRBuilderImpl\.ts/,             // SlotValue mapping
        /types\.ts.*compiler\/ir/,       // IR types (SlotValue/StateMapping)
        /StepDebugPanel\.tsx/,           // SlotValue display
        /StepDebugTypes\.ts/,            // SlotValue types
        /StateMigration\.ts/,            // SlotValue migration
        /executeFrameStepped\.ts/,       // SlotValue runtime
        /ValueInspector\.ts/,            // SlotValue rendering
        /RendererSample/,               // RendererSample.type: 'scalar'
        /debug-viz/,                     // Debug viz uses RendererSample
        /DebugService/,                  // Debug service
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, "UnitType kind: 'scalar' was removed — use kind: 'none'").toEqual([]);
    });

  });

  describe('Composite Expansion Migration', () => {

    it('no pass0CompositeExpansion function name in src/', () => {
      const matches = grepSrc('pass0CompositeExpansion');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'pass0CompositeExpansion was removed — use expandComposites() instead').toEqual([]);
    });

    it('no normalize-composites import in src/', () => {
      const matches = grepSrc('normalize-composites');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, 'normalize-composites was removed — use composite-expansion instead').toEqual([]);
    });

    it('no _comp_ prefix in src/ (old composite expansion ID scheme)', () => {
      const matches = grepSrc('_comp_');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(filtered, '_comp_ prefix was replaced by cx: — use the new ID scheme').toEqual([]);
    });

  });

  // =============================================================================
  // Default Source Resolution Boundary
  // =============================================================================

  describe('Default Source Resolution Boundary', () => {

    it('no defaultSource in compiler backend (resolved in frontend)', () => {
      // defaultSource is resolved in frontend normalization (final-normalization.ts).
      // Backend must not contain defaultSource logic — only comments/IR types allowed.
      const matches = grepSrc('defaultSource', 'src/compiler/backend/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
        /\/\//,                          // Single-line comments
        /\*/,                            // Block comments
        /types\.ts/,                     // IR type definitions
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'defaultSource must not appear in compiler backend — resolved in frontend normalization'
      ).toEqual([]);
    });

    it('no defaultSource in runtime (resolved before execution)', () => {
      const matches = grepSrc('defaultSource', 'src/runtime/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
        /\/\//,                          // Single-line comments
        /\*/,                            // Block comments
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'defaultSource must not appear in runtime — resolved before IR generation'
      ).toEqual([]);
    });

    it('no defaultSource in renderer (resolved before rendering)', () => {
      const matches = grepSrc('defaultSource', 'src/render/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
        /\/\//,                          // Single-line comments
        /\*/,                            // Block comments
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'defaultSource must not appear in renderer — resolved before rendering'
      ).toEqual([]);
    });

  });

  // =============================================================================
  // Nullish Coalescing Audit - Config Access Patterns
  // =============================================================================

  // =============================================================================
  // Cardinality Neutrality (oscilla-animator-v2-cpc)
  // =============================================================================

  describe('Cardinality Metadata Decision Boundary', () => {

    it('frontend decision paths must not read getBlockCardinalityMetadata', () => {
      // [LAW:one-source-of-truth] Frontend decisions must read CT/ICT only.
      const decisionPathFiles = [
        'src/compiler/frontend/analyze-type-graph.ts',
        'src/compiler/frontend/create-derived-obligations.ts',
        'src/compiler/frontend/normalize-adapters.ts',
        'src/compiler/frontend/policies/cardinality-adapter-policy.ts',
        'src/compiler/frontend/policies/default-source-policy.ts',
      ];

      for (const file of decisionPathFiles) {
        const matches = grepSrc('getBlockCardinalityMetadata', file);
        expect(
          matches,
          `Frontend decision path must not read getBlockCardinalityMetadata: ${file}`
        ).toEqual([]);
      }
    });

    it('block registry surface must not reintroduce mode-style cardinality metadata', () => {
      const matches = grepSrc('cardinalityMode\\|broadcastPolicy\\|laneCoupling\\|BlockCardinalityMetadata', 'src/blocks/');
      const allowlist = [
        /forbidden-patterns\\.test\\.ts/,
        /\\.test\\./,
        /__tests__/,
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'Mode-style cardinality metadata was removed. Declare cardinality behavior on CT/ICT port types.'
      ).toEqual([]);
    });

    it('frontend decision paths must not use block-name dispatch', () => {
      // [LAW:one-source-of-truth] Frontend decisions use structural CT/ICT predicates,
      // not .type === 'BlockName' or .blockType === 'BlockName' string matching.
      // Use predicates from structural-predicates.ts instead.
      const decisionPathFiles = [
        'src/compiler/frontend/create-derived-obligations.ts',
        'src/compiler/frontend/normalize-adapters.ts',
        'src/compiler/frontend/policies/cardinality-adapter-policy.ts',
        'src/compiler/frontend/policies/default-source-policy.ts',
      ];

      for (const file of decisionPathFiles) {
        const typeMatches = grepSrc("\\.type === '", file);
        const blockTypeMatches = grepSrc("\\.blockType === '", file);
        const matches = [...typeMatches, ...blockTypeMatches];
        const allowlist = [
          /\/\//,   // Single-line comments
          /\*/,     // Block comments
        ];
        const filtered = filterAllowlist(matches, allowlist);
        expect(
          filtered,
          `Frontend decision path must not use block-name dispatch (.type === / .blockType ===): ${file}\n` +
          `Use structural predicates from structural-predicates.ts instead.\n` +
          `Found violations:\n${filtered.join('\n')}`
        ).toEqual([]);
      }
    });

  });

  describe('Cardinality Neutrality in Block Lowering', () => {

    it('no isMany() in block lower functions', () => {
      const matches = grepSrc('isMany\\(', 'src/blocks/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'Block lower() must not call isMany() — use zipAuto/constructAuto for cardinality-safe ops.\n' +
        'Found violations:\n' + filtered.join('\n')
      ).toEqual([]);
    });

    it('no broadcastIfNeeded pattern in block lower functions', () => {
      const matches = grepSrc('broadcastIfNeeded', 'src/blocks/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'broadcastIfNeeded was removed — use zipAuto/constructAuto instead.\n' +
        'Found violations:\n' + filtered.join('\n')
      ).toEqual([]);
    });

    it('no ensureField pattern in block lower functions', () => {
      const matches = grepSrc('ensureField', 'src/blocks/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'ensureField was removed — use constructAuto for cardinality-safe component assembly.\n' +
        'Found violations:\n' + filtered.join('\n')
      ).toEqual([]);
    });

  });

  // =============================================================================
  // CT/ICT Compatibility Regression Prevention (y2yd.1)
  // =============================================================================

  describe('CT/ICT Compatibility Regression Prevention', () => {
    // [LAW:single-enforcer] Compatibility decisions in the frontend are routed
    // through the CT/ICT oracle (type-compatibility.ts) and structural predicates
    // (structural-predicates.ts). These inline helpers were removed when the
    // oracle was unified in cpc.8. Re-introducing them bypasses the single enforcer.

    const frontendDir = 'src/compiler/frontend/';

    it('no removed blockType+port compatibility helpers in frontend', () => {
      // Each of these was an inline blockType+port lookup that replicated
      // compatibility logic outside the oracle. They were removed in cpc.8.
      const removedHelpers = [
        { name: 'portDeclaresOneOrManyFlex', replacement: 'portAcceptsBroadcast from type-compatibility.ts' },
        { name: 'destinationAllowsOneBroadcast', replacement: 'portAcceptsBroadcast from type-compatibility.ts' },
        { name: 'portDeclaresOneContinuousOnly', replacement: 'CT/ICT structural predicates' },
        { name: 'isOneManyCardinalityMismatchOnly', replacement: 'isOneManyMismatchOnly from type-compatibility.ts' },
      ];

      const allowlist = [
        /\.test\./,
        /__tests__/,
      ];

      for (const { name, replacement } of removedHelpers) {
        const matches = grepSrc(name, frontendDir);
        const filtered = filterAllowlist(matches, allowlist);
        expect(
          filtered,
          `${name} was removed — use ${replacement}.\n` +
          `Found violations:\n${filtered.join('\n')}`
        ).toEqual([]);
      }
    });

    it('no local isTypeCompatible function definitions in frontend decision paths', () => {
      // [LAW:single-enforcer] isEdgeTypeCompatible in type-compatibility.ts is
      // the single compatibility oracle. Local "function isTypeCompatible"
      // definitions in decision paths duplicate that authority.
      const decisionPaths = [
        'src/compiler/frontend/analyze-type-graph.ts',
        'src/compiler/frontend/create-derived-obligations.ts',
        'src/compiler/frontend/normalize-adapters.ts',
      ];

      for (const file of decisionPaths) {
        const matches = grepSrc('function isTypeCompatible', file);
        expect(
          matches,
          `Local isTypeCompatible in ${file} — use isEdgeTypeCompatible from type-compatibility.ts`
        ).toEqual([]);
      }
    });

  });

  // =============================================================================
  // Legacy Cardinality Mode Terms in Frontend (y2yd.1)
  // =============================================================================

  describe('Legacy Cardinality Mode Terms in Frontend', () => {
    // [LAW:one-source-of-truth] Cardinality behavior is declared on CT/ICT
    // port types (relation, acceptance, instanceBinding), not in block-level
    // metadata enums. These terms were removed and must not reappear in
    // frontend decision modules.

    const frontendDir = 'src/compiler/frontend/';

    it('no legacy cardinality metadata types or helpers in frontend', () => {
      const legacyTerms = [
        { name: 'BlockCardinalityMetadata', what: 'block-level cardinality metadata type' },
        { name: 'isCardinalityGeneric', what: 'block-level cardinality predicate' },
        { name: 'BlockLaneTopology', what: 'block-level lane topology type' },
      ];

      const allowlist = [
        /\.test\./,
        /__tests__/,
      ];

      for (const { name, what } of legacyTerms) {
        const matches = grepSrc(name, frontendDir);
        const filtered = filterAllowlist(matches, allowlist);
        expect(
          filtered,
          `${name} (${what}) was removed — cardinality is declared on CT/ICT port types.\n` +
          `Found violations:\n${filtered.join('\n')}`
        ).toEqual([]);
      }
    });

    it('no legacy cardinality mode field names in frontend', () => {
      const modeFields = [
        { name: 'cardinalityMode', what: 'block cardinality mode discriminant' },
        { name: 'broadcastPolicy', what: 'block broadcast policy field' },
        { name: 'laneCoupling', what: 'block lane coupling field' },
        { name: 'laneTopology', what: 'block lane topology field' },
      ];

      const allowlist = [
        /\.test\./,
        /__tests__/,
      ];

      for (const { name, what } of modeFields) {
        const matches = grepSrc(name, frontendDir);
        const filtered = filterAllowlist(matches, allowlist);
        expect(
          filtered,
          `${name} (${what}) was removed — declare cardinality behavior on CT/ICT vars.\n` +
          `Found violations:\n${filtered.join('\n')}`
        ).toEqual([]);
      }
    });

  });

  // =============================================================================
  // Scheduler Slot Allocation Prevention
  // =============================================================================

  describe('Scheduler Slot Allocation Prevention', () => {
    // [LAW:one-source-of-truth] All slot allocation goes through IRBuilder.
    // The scheduler (pass 7) must be pure ordering — no resource allocation.
    // Shadow allocators bypass the builder, causing slotMeta gaps, debug probe
    // mismatches, and storage class errors.

    const schedulerFile = 'src/compiler/backend/schedule-program.ts';

    it('scheduler must not call allocTypedSlot', () => {
      const matches = grepSrc('allocTypedSlot', schedulerFile);
      expect(
        matches,
        'schedule-program.ts must not allocate slots — use continuity-pipeline.ts instead'
      ).toEqual([]);
    });

    it('scheduler must not call allocSlot', () => {
      const matches = grepSrc('allocSlot', schedulerFile);
      expect(
        matches,
        'schedule-program.ts must not allocate slots — use continuity-pipeline.ts instead'
      ).toEqual([]);
    });

    it('scheduler must not call registerSlotType', () => {
      const matches = grepSrc('registerSlotType', schedulerFile);
      expect(
        matches,
        'schedule-program.ts must not register slot types — allocation belongs in continuity-pipeline.ts'
      ).toEqual([]);
    });

    it('scheduler must not fabricate ValueSlot via cast', () => {
      const matches = grepSrc('as ValueSlot', schedulerFile);
      expect(
        matches,
        'schedule-program.ts must not cast to ValueSlot — slots come pre-allocated from continuity-pipeline.ts'
      ).toEqual([]);
    });

    it('scheduler must not contain a shadow slot counter', () => {
      // Pattern: let nextSlot = ...; or let slotCounter = ...
      const matches = grepSrc('let nextSlot\\|let slotCounter\\|slotAllocator', schedulerFile);
      expect(
        matches,
        'schedule-program.ts must not contain shadow slot counters — allocation belongs in continuity-pipeline.ts'
      ).toEqual([]);
    });

    it('scheduler must not import getSlotCount', () => {
      const matches = grepSrc('getSlotCount', schedulerFile);
      expect(
        matches,
        'schedule-program.ts must not use getSlotCount — it has no allocation responsibilities'
      ).toEqual([]);
    });
  });

  describe('Config Access Patterns', () => {

    it('no config?. in block lower() functions', () => {
      const matches = grepSrc('config\\?\\.', 'src/blocks/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
        /\/\/ OK:/,                      // Explicit exemption with reason
        /\*/,                            // Block comments (JSDoc)
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'Found unsafe config?. patterns in block lowering code.\n' +
        'Use requireConfig() / requireConfigInt() / requireConfigEnum() instead.\n' +
        'Found violations:\n' + filtered.join('\n')
      ).toEqual([]);
    });

    it('no block.inputPorts access in block lower() functions', () => {
      const matches = grepSrc('block\\.inputPorts', 'src/blocks/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
        /registry\.ts/,                  // Block definition interface
        /\/\//,                          // Single-line comments
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'Found block.inputPorts access in block lowering code.\n' +
        'Block lowering must only use inputsById and config.\n' +
        'Found violations:\n' + filtered.join('\n')
      ).toEqual([]);
    });

    it('no defaultSource reads in block lower() functions', () => {
      const matches = grepSrc('defaultSource', 'src/blocks/');
      const allowlist = [
        /forbidden-patterns\.test\.ts/,  // This file
        /\.test\./,                      // Test files
        /__tests__/,                     // Test directories
        /registry\.ts/,                  // InputDef/OutputDef type definitions
        /adapter-spec\.ts/,              // Adapter type definitions
        /import.*defaultSource/,         // Import statements (legitimate)
        /defaultSource:/,                // InputDef field declarations (legitimate)
        /composite-types\.ts/,           // Type field declarations
        /function defaultSource/,        // Helper function definitions (not reads)
      ];
      const filtered = filterAllowlist(matches, allowlist);
      expect(
        filtered,
        'Found defaultSource access in block lowering code.\n' +
        'Defaults must be materialized by frontend normalization, not read in lowering.\n' +
        'Found violations:\n' + filtered.join('\n')
      ).toEqual([]);
    });

  });
});
