/// <reference types="vite/client" />

/**
 * HCL Demo Loader
 *
 * Uses Vite's import.meta.glob to auto-discover all .hcl files in the hcl/ directory.
 * Each file is bundled as a raw string at build time — no runtime filesystem access needed.
 */

export interface HclDemo {
  /** Display name extracted from the `patch "Name" { ... }` header */
  name: string;
  /** Filename without path (e.g. "breathing-ring.hcl") */
  filename: string;
  /** Raw HCL source text */
  hcl: string;
  /** Menu/category routing for demo pickers */
  category: 'standard' | 'diagnostic';
}

// Vite glob import: all .hcl files as raw strings, eagerly loaded at build time
const hclModules = import.meta.glob('./hcl/*.hcl', { query: '?raw', eager: true }) as Record<
  string,
  { default: string }
>;

function extractName(hcl: string, filename: string): string {
  const match = hcl.match(/patch\s+"([^"]+)"/);
  return match ? match[1] : filename.replace('.hcl', '');
}

function classifyDemoCategory(filename: string): 'standard' | 'diagnostic' {
  // [LAW:one-source-of-truth] Filename prefix is the canonical category signal
  // for demo routing (loader + toolbar consume the same derived field).
  return filename.startsWith('diagnostic-') ? 'diagnostic' : 'standard';
}

/** All HCL demo patches, sorted alphabetically by name */
export const hclDemos: HclDemo[] = Object.entries(hclModules)
  .map(([path, mod]) => {
    const filename = path.split('/').pop()!;
    const hcl = mod.default;
    return {
      name: extractName(hcl, filename),
      filename,
      hcl,
      category: classifyDemoCategory(filename),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
