/**
 * PatchExporter Service
 *
 * Exports patch data to structured markdown format for LLM context.
 * Produces concise, readable summaries of patch structure and state.
 */

import type { Patch } from '../graph/Patch';
import { requireBlockDef } from '../blocks/registry';
import type { DiagnosticsStore } from '../stores/DiagnosticsStore';
import {
  formatBlockShorthand,
  formatConnectionLine,
  formatConfigValue,
  isNonDefault,
} from './exportFormats';

/**
 * Export options interface
 */
export interface ExportOptions {
  /** Verbosity level: minimal (one-line), normal (tables), verbose (detailed) */
  verbosity?: 'minimal' | 'normal' | 'verbose';
  /** Include values even if they match defaults */
  includeDefaults?: boolean;
  /** Include compilation summary */
  includeCompileInfo?: boolean;
  /** Include runtime error information */
  includeRuntimeError?: boolean;
  /** Output format */
  format?: 'markdown' | 'json' | 'shorthand';
}

/**
 * Default export options
 */
const DEFAULT_OPTIONS: Required<ExportOptions> = {
  verbosity: 'normal',
  includeDefaults: false,
  includeCompileInfo: true,
  includeRuntimeError: true,
  format: 'markdown',
};

/**
 * Exports a patch to markdown format.
 *
 * @param patch - The patch to export
 * @param diagnostics - DiagnosticsStore for compile/runtime status
 * @param options - Export options
 * @returns Markdown string representation
 */
export function exportToMarkdown(
  patch: Patch,
  diagnostics: DiagnosticsStore | null,
  options?: ExportOptions
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Select format based on verbosity
  if (opts.verbosity === 'minimal') {
    return exportMinimal(patch, diagnostics, opts);
  } else if (opts.verbosity === 'verbose') {
    return exportVerbose(patch, diagnostics, opts);
  } else {
    return exportNormal(patch, diagnostics, opts);
  }
}

/**
 * Minimal format: one-line summary with chain notation
 */
function exportMinimal(
  patch: Patch,
  diagnostics: DiagnosticsStore | null,
  opts: Required<ExportOptions>
): string {
  const blockCount = patch.blocks.size;
  const edgeCount = patch.edges.length;

  let result = `Patch: ${blockCount} blocks, ${edgeCount} edges\n`;

  // Build connection chains (simplified - just list connections)
  if (patch.edges.length > 0) {
    for (const edge of patch.edges) {
      result += formatConnectionLine(edge, patch.blocks) + '\n';
    }
  }

  // Status line
  if (opts.includeCompileInfo && diagnostics) {
    const status = getCompileStatusLine(diagnostics);
    result += `\n${status}`;
  }

  return result;
}

/**
 * Normal format: markdown tables for blocks and connections
 */
function exportNormal(
  patch: Patch,
  diagnostics: DiagnosticsStore | null,
  opts: Required<ExportOptions>
): string {
  const lines: string[] = [];

  lines.push('## Patch Export\n');

  // Blocks table
  lines.push(`### Blocks (${patch.blocks.size})\n`);
  if (patch.blocks.size > 0) {
    lines.push('| ID | Type | Config |');
    lines.push('|----|------|--------|');

    for (const [blockId, block] of patch.blocks) {
      const def = requireBlockDef(block.type);
      const configParts: string[] = [];

      for (const [key, currentValue] of Object.entries(block.params)) {
        const inputDef = def.inputs[key];
        if (!inputDef) continue;

        const defaultValue = inputDef.value;
        if (!opts.includeDefaults && !isNonDefault(currentValue, defaultValue)) {
          continue;
        }

        const formattedValue = formatConfigValue(currentValue);
        configParts.push(`${key}=${formattedValue}`);
      }

      const configCell = configParts.length > 0 ? configParts.join(', ') : '';
      lines.push(`| ${blockId} | ${block.type} | ${configCell} |`);
    }
    lines.push('');
  } else {
    lines.push('(no blocks)\n');
  }

  // Connections section
  lines.push(`### Connections (${patch.edges.length})\n`);
  if (patch.edges.length > 0) {
    for (const edge of patch.edges) {
      lines.push(formatConnectionLine(edge, patch.blocks));
    }
    lines.push('');
  } else {
    lines.push('(no connections)\n');
  }

  // Compile status
  if (opts.includeCompileInfo && diagnostics) {
    lines.push('### Compile Status\n');
    const status = getCompileStatus(diagnostics);
    lines.push(status);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Verbose format: includes block details section with explicit defaults
 */
function exportVerbose(
  patch: Patch,
  diagnostics: DiagnosticsStore | null,
  opts: Required<ExportOptions>
): string {
  // Start with normal format
  let result = exportNormal(patch, diagnostics, opts);

  // Add block details section
  const detailsLines: string[] = [];
  detailsLines.push('### Block Details (non-default inputs only)\n');

  let hasDetails = false;
  for (const [blockId, block] of patch.blocks) {
    const def = requireBlockDef(block.type);

    const nonDefaults: Array<[string, unknown, unknown]> = [];
    for (const [key, currentValue] of Object.entries(block.params)) {
      const inputDef = def.inputs[key];
      if (!inputDef) continue;

      const defaultValue = inputDef.value;
      if (isNonDefault(currentValue, defaultValue)) {
        nonDefaults.push([key, currentValue, defaultValue]);
      }
    }

    if (nonDefaults.length > 0) {
      hasDetails = true;
      detailsLines.push(`**${blockId} (${block.type})**`);
      for (const [key, current, defaultVal] of nonDefaults) {
        const currentStr = formatConfigValue(current);
        const defaultStr = formatConfigValue(defaultVal);
        detailsLines.push(`- ${key}: ${currentStr} (default: ${defaultStr})`);
      }
      detailsLines.push('');
    }
  }

  if (hasDetails) {
    result += '\n' + detailsLines.join('\n');
  } else {
    result += '\n### Block Details\n\n(all blocks use default values)\n';
  }

  return result;
}

/**
 * Gets compile status as a single-line summary
 */
function getCompileStatusLine(diagnostics: DiagnosticsStore): string {
  const hasErrors = diagnostics.hasErrors;
  const errors = diagnostics.errors;

  if (hasErrors && errors.length > 0) {
    return `Status: ❌ compile error: "${errors[0].message}"`;
  }

  return 'Status: ✓ compiled';
}

/**
 * Gets compile status with detailed statistics
 */
function getCompileStatus(diagnostics: DiagnosticsStore): string {
  const hasErrors = diagnostics.hasErrors;
  const errors = diagnostics.errors;
  const stats = diagnostics.compilationStats;

  if (hasErrors && errors.length > 0) {
    return `❌ Compile Error\n- ${errors[0].message}`;
  }

  const lines: string[] = [];
  lines.push('✓ Compiled successfully');

  if (stats.count > 0) {
    lines.push(`- Compilations: ${stats.count}`);
    const avgMs = (stats.totalMs / stats.count).toFixed(1);
    lines.push(`- Avg compile: ${avgMs}ms`);
  }

  return lines.join('\n');
}
