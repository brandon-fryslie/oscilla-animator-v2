/**
 * DemoStore - Observable Demo State
 *
 * Owns the list of available demos and current selection.
 * Delegates patch loading to PatchStore. Does NOT compile —
 * the live recompile reaction handles that automatically.
 *
 * [LAW:one-source-of-truth] Demo list comes from hclDemos import.
 * [LAW:single-enforcer] Only DemoStore mutates demo selection state.
 */

import { makeObservable, observable, action } from 'mobx';
import { GPU_BOOTSTRAP_DEMO_FILENAME, hclDemos, type HclDemo } from '../demo';
import { deserializePatchFromHCL } from '../patch-dsl';
import { verifyGpuPatchCompatibility } from '../services/GpuPatchCompatibility';
import type { PatchStore } from './PatchStore';

function isVerifiedGpuDemo(hcl: string): boolean {
  const parsed = deserializePatchFromHCL(hcl);
  // [LAW:single-enforcer] DemoStore owns the default-demo admission boundary,
  // so parse success and GPU-compatibility are enforced together here.
  return parsed.errors.length === 0 && verifyGpuPatchCompatibility(parsed.patch).ok;
}

export class DemoStore {
  readonly demos: readonly HclDemo[] = hclDemos;
  currentFilename: string | null = null;

  constructor(private readonly patchStore: PatchStore) {
    makeObservable(this, {
      currentFilename: observable,
      selectDemo: action,
      loadDefault: action,
    });
  }

  /**
   * Switch to an HCL demo by filename.
   * Loads the HCL into PatchStore — live recompile handles compilation.
   *
   * @returns true if demo was found and loaded, false otherwise
   */
  selectDemo(filename: string): boolean {
    const demo = this.demos.find(d => d.filename === filename);
    if (!demo) return false;

    this.currentFilename = filename;
    this.patchStore.loadFromHCL(demo.hcl);
    return true;
  }

  /**
   * Load the default demo (GPU bootstrap demo when verified).
   */
  loadDefault(): void {
    const preferredDemo = this.demos.find((demo) => demo.filename === GPU_BOOTSTRAP_DEMO_FILENAME);
    const verifiedDemo = this.demos.find((demo) => isVerifiedGpuDemo(demo.hcl));
    const defaultDemo = preferredDemo && isVerifiedGpuDemo(preferredDemo.hcl)
      ? preferredDemo
      : verifiedDemo
        ?? preferredDemo
        ?? this.demos[0];
    if (defaultDemo) {
      this.selectDemo(defaultDemo.filename);
    }
  }
}
