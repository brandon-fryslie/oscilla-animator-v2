/**
 * Compiler Diagnostic Flags Settings
 *
 * GCC-style severity overrides for compiler diagnostic codes.
 * Each flag can be set to 'error', 'warn', or 'ignore'.
 *
 * Single source of truth: DIAGNOSTIC_FLAGS registry in diagnostic-flags.ts.
 * Fields are generated dynamically from the registry.
 */

import { defineSettings } from '../defineSettings';
import {
  DIAGNOSTIC_FLAGS,
  getDefaultDiagnosticFlags,
  type DiagnosticSeverityOverride,
} from '../../compiler/diagnostic-flags';
import type { FieldUIHint } from '../types';

// Build interface type: one field per flag code
export type CompilerFlagsSettings = Record<string, DiagnosticSeverityOverride> & Record<string, unknown>;

// Build defaults from the flag registry (single source of truth)
const defaults: CompilerFlagsSettings = getDefaultDiagnosticFlags();

// Build UI fields from the flag registry (single source of truth)
const fields: Record<string, FieldUIHint> = {};
for (const flag of DIAGNOSTIC_FLAGS) {
  fields[flag.code] = {
    label: flag.label,
    description: flag.description,
    control: 'select',
    options: [
      { label: 'Error', value: 'error' },
      { label: 'Warning', value: 'warn' },
      { label: 'Ignore', value: 'ignore' },
    ],
  };
}

export const compilerFlagsSettings = defineSettings<CompilerFlagsSettings>('compilerFlags', {
  defaults,
  ui: {
    label: 'Compiler Flags',
    description: 'Configure severity for each compiler diagnostic code',
    order: 5,
    fields: fields as any, // Dynamic fields from registry
  },
});
