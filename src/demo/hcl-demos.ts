/// <reference types="vite/client" />

/**
 * HCL Demo Loader
 *
 * Uses Vite's import.meta.glob to auto-discover all .hcl files in the hcl/ directory.
 * Each file is bundled as a raw string at build time — no runtime filesystem access needed.
 */

import {
  DEMO_GROUP_LABELS,
  DEMO_GROUP_ORDER,
  GPU_BOOTSTRAP_DEMO_FILENAME,
  type DemoCatalogEntry,
  type DemoGroup,
  hclDemoCatalog,
} from './demo-catalog';

export interface HclDemo extends DemoCatalogEntry {
  /** Display name extracted from the `patch "Name" { ... }` header */
  name: string;
  /** Raw HCL source text */
  hcl: string;
}

export interface HclDemoGroup {
  key: DemoGroup;
  label: string;
  demos: readonly HclDemo[];
}

// Vite glob import: all .hcl files as raw strings, eagerly loaded at build time
const hclModules = import.meta.glob('./hcl/**/*.hcl', { query: '?raw', eager: true }) as Record<
  string,
  { default: string }
>;

const hclModuleByRelativePath = new Map(
  Object.entries(hclModules).map(([path, mod]) => [path.replace('./hcl/', ''), mod.default]),
);

function extractName(hcl: string, filename: string): string {
  const match = hcl.match(/patch\s+"([^"]+)"/);
  return match ? match[1] : filename.replace('.hcl', '');
}

function requireHcl(relativePath: string): string {
  const hcl = hclModuleByRelativePath.get(relativePath);
  if (!hcl) {
    throw new Error(`Missing HCL demo module for ${relativePath}`);
  }
  return hcl;
}

function assertUniqueDemoFilenames(entries: readonly DemoCatalogEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.filename)) {
      throw new Error(`Duplicate demo filename in catalog: ${entry.filename}`);
    }
    seen.add(entry.filename);
  }
}

assertUniqueDemoFilenames(hclDemoCatalog);

// [LAW:one-source-of-truth] Demo catalog owns curation, grouping, and order.
// This loader only materializes raw HCL alongside that canonical metadata.
export const hclDemos: HclDemo[] = hclDemoCatalog.map((entry) => {
  const hcl = requireHcl(entry.relativePath);
  return {
    ...entry,
    name: extractName(hcl, entry.filename),
    hcl,
  };
});

export const hclDemoGroups: HclDemoGroup[] = DEMO_GROUP_ORDER
  .map((key) => ({
    key,
    label: DEMO_GROUP_LABELS[key],
    demos: hclDemos.filter((demo) => demo.group === key),
  }))
  .filter((group) => group.demos.length > 0);

export function getHclDemo(filename: string): HclDemo | undefined {
  return hclDemos.find((entry) => entry.filename === filename);
}

export { GPU_BOOTSTRAP_DEMO_FILENAME };
