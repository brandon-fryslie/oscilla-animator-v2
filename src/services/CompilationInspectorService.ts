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
import type { CompileError } from '../compiler/compile';

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
 * CompilationInspectorService - Captures compiler pass outputs
 *
 * Responsibilities:
 * - Capture input/output of each compiler pass
 * - Store last 2 compilation snapshots for comparison
 * - Handle circular references and functions in IR
 * - Provide search API for finding IDs across passes
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
  beginCompile(compileId: string): void {
    this.currentSnapshot = {
      compileId,
      timestamp: Date.now(),
      totalDurationMs: 0,
      passes: [],
      status: 'success',
    };
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
      console.warn('[CompilationInspector] capturePass called without beginCompile');
      return;
    }

    const now = performance.now();
    const durationMs = this.passStartTime > 0 ? now - this.passStartTime : 0;
    this.passStartTime = now;

    try {
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
      console.warn('[CompilationInspector] endCompile called without beginCompile');
      return;
    }

    this.currentSnapshot.status = status;
    this.currentSnapshot.totalDurationMs = Date.now() - this.currentSnapshot.timestamp;

    // Add to snapshots array
    this.snapshots.push(this.currentSnapshot);

    // Keep only last 2 snapshots
    if (this.snapshots.length > 2) {
      this.snapshots.shift();
    }

    this.currentSnapshot = null;
    this.passStartTime = 0;
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

    // Find the type-graph pass (or frontend:type-graph)
    const typeGraphPass = latest.passes.find(
      (p) => p.passName === 'type-graph' || p.passName === 'frontend:type-graph'
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
   * Get the CycleSummary from the latest Frontend compilation.
   *
   * @returns CycleSummary or undefined if not available
   */
  getCycleSummary(): unknown | undefined {
    const latest = this.getLatestSnapshot();
    if (!latest) return undefined;

    // Find the cycle-analysis pass
    const cyclePass = latest.passes.find(
      (p) => p.passName === 'frontend:cycle-analysis'
    );
    if (!cyclePass) return undefined;

    return cyclePass.output;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

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
