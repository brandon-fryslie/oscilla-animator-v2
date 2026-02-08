/**
 * CompilationInspectorService - Compilation Pipeline Observation
 *
 * Singleton service that captures intermediate representations from each
 * compilation pass, enabling developers to inspect the data flow through
 * the compiler pipeline.
 *
 * Sprint: debugging-toolkit / compilation-inspector
 *
 * Data flow: Compiler → (capture calls) → Service → (query) → UI
 */

import { makeAutoObservable } from 'mobx';
import type { CompileError } from '../compiler/types';
import type { ValueExprTable } from '../compiler/ir/program';
import type { ValueExpr, ValueExprId } from '../compiler/ir/value-expr';

/**
 * Snapshot of a single compilation pass.
 */
export interface PassSnapshot {
  /** Pass number (1-7) */
  passNumber: number;

  /** Pass name (e.g., "normalization", "type-graph") */
  passName: string;

  /** Timestamp when pass completed */
  timestamp: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Input to this pass (serialized) */
  input: unknown;

  /** Output from this pass (serialized) */
  output: unknown;

  /** Errors encountered during this pass */
  errors: CompileError[];

  /** Estimated size of input (bytes) */
  inputSize: number;

  /** Estimated size of output (bytes) */
  outputSize: number;
}

/**
 * Snapshot of an entire compilation.
 */
export interface CompilationSnapshot {
  /** Unique ID for this compilation */
  compileId: string;

  /** Timestamp when compilation started */
  timestamp: number;

  /** Total duration in milliseconds */
  totalDurationMs: number;

  /** Snapshots from each pass */
  passes: PassSnapshot[];

  /** Compilation status */
  status: 'success' | 'failure';

  /**
   * ValueExprTable extracted from block-lowering pass (raw, not serialized).
   * Stored separately to preserve function references that would be lost in serialization.
   */
  valueExprs?: readonly ValueExpr[];
}

/**
 * Search result for finding IDs in IR.
 */
export interface SearchResult {
  /** Pass name where match was found */
  passName: string;

  /** JSON path to the matched value */
  path: string[];

  /** Key that matched */
  key: string;

  /** Matched value */
  value: unknown;
}

/**
 * Summary statistics about the value expression table.
 */
export interface ValueExprStats {
  /** Total number of value expressions */
  total: number;

  /** Count by top-level kind */
  byKind: Record<string, number>;

  /** Count by derived kind (signal/field/event/const) */
  byDerivedKind: Record<string, number>;

  /** Count by payload type */
  byPayload: Record<string, number>;
}

/**
 * CompilationInspectorService - Captures compiler pass outputs
 *
 * Responsibilities:
 * - Capture input/output of each compiler pass
 * - Store last 2 compilation snapshots for comparison
 * - Handle circular references and functions in IR
 * - Provide search API for finding IDs across passes
 * - Query ValueExprTable with dispatch on ValueExpr.kind
 *
 * Limitations:
 * - Only stores last 2 snapshots (memory bounded)
 * - Serialization may be expensive for large patches
 */
class CompilationInspectorService {
  /** Stored compilation snapshots (max 2) */
  snapshots: CompilationSnapshot[] = [];

  /** Currently building snapshot (null when not compiling) */
  private currentSnapshot: CompilationSnapshot | null = null;

  /** Pass start time for duration tracking */
  private passStartTime = 0;

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Begin a new compilation capture.
   * Called at the start of compile().
   *
   * @param compileId - Unique ID for this compilation
   */
  // [LAW:single-enforcer] Inspector methods are internally resilient — callers never need try/catch.
  beginCompile(compileId: string): void {
    try {
      this.currentSnapshot = {
        compileId,
        timestamp: Date.now(),
        totalDurationMs: 0,
        passes: [],
        status: 'success',
      };
    } catch (e) {
      console.error('[CompilationInspector] Failed in beginCompile:', e);
    }
  }

  /**
   * Capture a compilation pass.
   * Called after each pass completes.
   *
   * @param passName - Name of the pass
   * @param input - Input to the pass
   * @param output - Output from the pass
   */
  capturePass(passName: string, input: unknown, output: unknown): void {
    if (!this.currentSnapshot) {
      return; // Expected when compile() early-exits before inspector starts
    }

    const now = performance.now();
    const durationMs = this.passStartTime > 0 ? now - this.passStartTime : 0;
    this.passStartTime = now;

    try {
      // Extract ValueExprs from block-lowering pass BEFORE serialization
      if (passName === 'block-lowering' && output && typeof output === 'object') {
        const unlinkedIR = output as { builder?: { getValueExprs?: () => readonly ValueExpr[] } };
        if (unlinkedIR.builder?.getValueExprs) {
          this.currentSnapshot.valueExprs = unlinkedIR.builder.getValueExprs();
        }
      }

      // Serialize with circular reference handling
      const serializedInput = serializeIR(input);
      const serializedOutput = serializeIR(output);

      const passSnapshot: PassSnapshot = {
        passNumber: this.currentSnapshot.passes.length + 1,
        passName,
        timestamp: Date.now(),
        durationMs,
        input: serializedInput,
        output: serializedOutput,
        errors: [],
        inputSize: estimateSize(serializedInput),
        outputSize: estimateSize(serializedOutput),
      };

      this.currentSnapshot.passes.push(passSnapshot);
    } catch (e) {
      console.error('[CompilationInspector] Failed to capture pass:', passName, e);
    }
  }

  /**
   * End compilation capture.
   * Called at the end of compile(), regardless of success/failure.
   *
   * @param status - Compilation status
   */
  endCompile(status: 'success' | 'failure'): void {
    if (!this.currentSnapshot) {
      return; // Idempotent — safe to call multiple times or without beginCompile
    }

    try {
      this.currentSnapshot.status = status;
      this.currentSnapshot.totalDurationMs = Date.now() - this.currentSnapshot.timestamp;

      // Add to snapshots array
      this.snapshots.push(this.currentSnapshot);

      // Keep only last 2 snapshots
      if (this.snapshots.length > 2) {
        this.snapshots.shift();
      }
    } catch (e) {
      console.error('[CompilationInspector] Failed in endCompile:', e);
    } finally {
      this.currentSnapshot = null;
      this.passStartTime = 0;
    }
  }

  /**
   * Get the latest compilation snapshot.
   *
   * @returns Latest snapshot or undefined if none exist
   */
  getLatestSnapshot(): CompilationSnapshot | undefined {
    return this.snapshots[this.snapshots.length - 1];
  }

  /**
   * Get a specific pass snapshot.
   *
   * @param compileId - Compilation ID
   * @param passName - Pass name
   * @returns Pass snapshot or undefined if not found
   */
  getPassSnapshot(compileId: string, passName: string): PassSnapshot | undefined {
    const compilation = this.snapshots.find((s) => s.compileId === compileId);
    if (!compilation) return undefined;

    return compilation.passes.find((p) => p.passName === passName);
  }

  /**
   * Search for a query string across all passes in the latest snapshot.
   *
   * @param query - Search query (case-insensitive)
   * @returns Array of search results
   */
  search(query: string): SearchResult[] {
    const latest = this.getLatestSnapshot();
    if (!latest) return [];

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const pass of latest.passes) {
      // Search in output only (input is redundant with previous pass output)
      const passResults = searchIR(pass.output, lowerQuery, []);
      for (const result of passResults) {
        results.push({
          passName: pass.passName,
          ...result,
        });
      }
    }

    return results;
  }

  /**
   * Clear all stored snapshots.
   * Called when patch is unloaded.
   */
  clear(): void {
    this.snapshots = [];
    this.currentSnapshot = null;
    this.passStartTime = 0;
  }

  /**
   * Get resolved port types from the latest TypedPatch.
   * Returns a Map where keys are "blockIndex:portName:in" or "blockIndex:portName:out"
   * and values are resolved SignalTypes.
   *
   * @returns Port types map or undefined if not available
   */
  getResolvedPortTypes(): Map<string, unknown> | undefined {
    const latest = this.getLatestSnapshot();
    if (!latest) return undefined;

    // Find the type-graph pass
    const typeGraphPass = latest.passes.find(
      (p) => p.passName === 'type-graph'
    );
    if (!typeGraphPass) return undefined;

    // Extract portTypes from the output
    const output = typeGraphPass.output as { portTypes?: unknown };
    if (!output || typeof output !== 'object') return undefined;

    // portTypes is serialized from a Map - reconstruct if possible
    const portTypes = output.portTypes;
    if (portTypes instanceof Map) {
      return portTypes as Map<string, unknown>;
    }

    // If serialized as object entries, convert back to Map
    if (Array.isArray(portTypes)) {
      return new Map(portTypes as [string, unknown][]);
    }

    return undefined;
  }

  /**
   * Look up the resolved CanonicalType for a specific port by blockId.
   * Handles the blockId → blockIndex mapping internally.
   *
   * @returns Resolved CanonicalType or undefined if not available
   */
  getResolvedPortType(blockId: string, portName: string, dir: 'in' | 'out'): unknown | undefined {
    const latest = this.getLatestSnapshot();
    if (!latest) return undefined;

    // type-constraints pass output is TypeResolvedPatch (has blockIndex + portTypes)
    const tcPass = latest.passes.find(
      (p) => p.passName === 'type-constraints'
    );
    if (!tcPass) return undefined;

    const output = tcPass.output as {
      blockIndex?: ReadonlyMap<string, number> | [string, number][];
      portTypes?: ReadonlyMap<string, unknown> | [string, unknown][];
    };
    if (!output || typeof output !== 'object') return undefined;

    // Reconstruct blockIndex map
    let blockIndexMap: ReadonlyMap<string, number> | undefined;
    if (output.blockIndex instanceof Map) {
      blockIndexMap = output.blockIndex;
    } else if (Array.isArray(output.blockIndex)) {
      blockIndexMap = new Map(output.blockIndex);
    }
    if (!blockIndexMap) return undefined;

    const idx = blockIndexMap.get(blockId);
    if (idx === undefined) return undefined;

    // Reconstruct portTypes map
    let portTypes: ReadonlyMap<string, unknown> | undefined;
    if (output.portTypes instanceof Map) {
      portTypes = output.portTypes;
    } else if (Array.isArray(output.portTypes)) {
      portTypes = new Map(output.portTypes);
    }
    if (!portTypes) return undefined;

    const key = `${idx}:${portName}:${dir}`;
    return portTypes.get(key);
  }

  /**
   * Get the CycleSummary from the latest Frontend compilation.
   *
   * @returns CycleSummary or undefined if not available
   */
  getCycleSummary(): unknown | undefined {
    const latest = this.getLatestSnapshot();
    if (!latest) return undefined;

    // Find the cycle-analysis pass
    const cyclePass = latest.passes.find(
      (p) => p.passName === 'cycle-analysis'
    );
    if (!cyclePass) return undefined;

    return cyclePass.output;
  }

  // =============================================================================
  // ValueExpr Query API (ValueExpr dispatch migration)
  // =============================================================================

  /**
   * Get the ValueExprTable from the latest snapshot.
   * ValueExprs are extracted during block-lowering pass before serialization.
   *
   * @returns ValueExprTable or undefined if not available
   */
  getValueExprTable(): ValueExprTable | undefined {
    const latest = this.getLatestSnapshot();
    if (!latest || !latest.valueExprs) return undefined;

    return { nodes: latest.valueExprs };
  }

  /**
   * Get all value expressions of a specific kind.
   * Dispatches on ValueExpr.kind (not legacy sig/field/event).
   *
   * @param kind - ValueExpr kind discriminant
   * @returns Array of matching value expressions
   */
  getValueExprsByKind(kind: ValueExpr['kind']): ValueExpr[] {
    const table = this.getValueExprTable();
    if (!table) return [];

    // Dispatch on ValueExpr.kind
    return table.nodes.filter((expr) => expr.kind === kind);
  }

  /**
   * Get a value expression by ID.
   *
   * @param id - ValueExprId
   * @returns ValueExpr or undefined if not found
   */
  getValueExpr(id: ValueExprId): ValueExpr | undefined {
    const table = this.getValueExprTable();
    if (!table) return undefined;

    // ValueExprId is a dense array index
    const idx = id as number;
    if (idx < 0 || idx >= table.nodes.length) return undefined;

    return table.nodes[idx];
  }

  /**
   * Get summary statistics about the value expression table.
   * Dispatches on ValueExpr.kind and CanonicalType properties.
   *
   * @returns Statistics object
   */
  getValueExprStats(): ValueExprStats {
    const table = this.getValueExprTable();
    if (!table) {
      return {
        total: 0,
        byKind: {},
        byDerivedKind: {},
        byPayload: {},
      };
    }

    const byKind: Record<string, number> = {};
    const byDerivedKind: Record<string, number> = {};
    const byPayload: Record<string, number> = {};

    for (const expr of table.nodes) {
      // Count by top-level kind
      byKind[expr.kind] = (byKind[expr.kind] || 0) + 1;

      // Count by derived kind (signal/field/event/const)
      const derivedKind = deriveDerivedKind(expr);
      byDerivedKind[derivedKind] = (byDerivedKind[derivedKind] || 0) + 1;

      // Count by payload kind
      const payloadKind = expr.type.payload.kind;
      byPayload[payloadKind] = (byPayload[payloadKind] || 0) + 1;
    }

    return {
      total: table.nodes.length,
      byKind,
      byDerivedKind,
      byPayload,
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Derive the signal/field/event/const family from CanonicalType.
 * Mirrors derivedKindLabel from axis-validate.ts but accessible here.
 *
 * @param expr - ValueExpr with CanonicalType
 * @returns Derived kind label
 */
function deriveDerivedKind(expr: ValueExpr): string {
  const extent = expr.type.extent;

  // Check temporality
  if (extent.temporality.kind === 'inst') {
    const tempo = extent.temporality.value;
    if (tempo.kind === 'discrete') {
      return 'event';
    }
  }

  // Check cardinality
  if (extent.cardinality.kind === 'inst') {
    const card = extent.cardinality.value;
    if (card.kind === 'many') {
      return 'field';
    }
    if (card.kind === 'zero') {
      return 'const';
    }
  }

  return 'signal';
}

/**
 * Serialize IR with circular reference and function handling.
 *
 * @param value - Value to serialize
 * @returns Serialized value (JSON-safe)
 */
function serializeIR(value: unknown): unknown {
  const visited = new WeakSet();

  function replacer(val: unknown): unknown {
    // Handle null/undefined
    if (val === null || val === undefined) {
      return val;
    }

    // Handle primitives
    if (typeof val !== 'object' && typeof val !== 'function') {
      return val;
    }

    // Handle functions
    if (typeof val === 'function') {
      return '[Function]';
    }

    // Handle circular references
    if (visited.has(val as object)) {
      return '[Circular]';
    }
    visited.add(val as object);

    // Handle Maps
    if (val instanceof Map) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of val.entries()) {
        obj[String(k)] = replacer(v);
      }
      return { __type: 'Map', entries: obj };
    }

    // Handle Sets
    if (val instanceof Set) {
      return { __type: 'Set', values: Array.from(val).map(replacer) };
    }

    // Handle Arrays
    if (Array.isArray(val)) {
      return val.map(replacer);
    }

    // Handle Objects
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as object)) {
      result[k] = replacer(v);
    }
    return result;
  }

  return replacer(value);
}

/**
 * Estimate size of a value in bytes (rough approximation).
 *
 * @param value - Value to estimate
 * @returns Estimated size in bytes
 */
function estimateSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/**
 * Search for a query string in an IR structure.
 *
 * @param obj - Object to search
 * @param query - Lowercase query string
 * @param path - Current JSON path
 * @returns Array of search results
 */
function searchIR(obj: unknown, query: string, path: string[]): Omit<SearchResult, 'passName'>[] {
  const results: Omit<SearchResult, 'passName'>[] = [];

  function traverse(val: unknown, currentPath: string[]): void {
    if (val === null || val === undefined) return;

    // Match string values
    if (typeof val === 'string' && val.toLowerCase().includes(query)) {
      results.push({
        path: currentPath,
        key: currentPath[currentPath.length - 1] || '',
        value: val,
      });
    }

    // Match keys
    if (typeof val === 'object' && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val)) {
        if (k.toLowerCase().includes(query)) {
          results.push({
            path: [...currentPath, k],
            key: k,
            value: v,
          });
        }
        traverse(v, [...currentPath, k]);
      }
    }

    // Traverse arrays
    if (Array.isArray(val)) {
      val.forEach((item, idx) => {
        traverse(item, [...currentPath, String(idx)]);
      });
    }
  }

  traverse(obj, path);
  return results;
}

/**
 * Singleton instance.
 * Exported for use by compiler and UI.
 */
export const compilationInspector = new CompilationInspectorService();
