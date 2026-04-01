/**
 * Test helpers for loading DSL-authored fixtures.
 * Fixtures are pure DSL text files evaluated via evalDsl().
 */

import { evalDsl } from '../../../payload-tester/dsl-eval';
import type { PipelineInstallPayload } from '../../rust/boundary-contract';

// Load fixture source files as raw strings (Vitest uses Vite transforms)
const rawSources = import.meta.glob('../../rust/fixtures/*.ts', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

export function loadFixturePayload(name: string): PipelineInstallPayload {
  const key = `../../rust/fixtures/${name}.ts`;
  const source = rawSources[key];
  if (!source) throw new Error(`Fixture not found: ${key}`);
  const result = evalDsl(source);
  if (!result.ok) throw new Error(`Fixture '${name}' failed: ${result.error}`);
  return result.payload;
}
