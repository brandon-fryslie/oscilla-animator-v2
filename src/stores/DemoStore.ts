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
import {
  GPU_BOOTSTRAP_DEMO_FILENAME,
  hclDemos,
  hclDemoGroups,
  type HclDemo,
  type HclDemoGroup,
} from '../demo';
import { deserializePatchFromHCL } from '../patch-dsl';
import { verifyGpuPatchCompatibility } from '../services/GpuPatchCompatibility';
import type { PatchStore } from './PatchStore';

function isVerifiedGpuDemo(hcl: string): boolean {
  const parsed = deserializePatchFromHCL(hcl);
  // [LAW:single-enforcer] DemoStore owns the default-demo admission boundary,
  // so parse success and GPU-compatibility are enforced together here.
  return parsed.errors.length === 0 && verifyGpuPatchCompatibility(parsed.patch).ok;
}

function isSelectableDemo(demo: HclDemo): boolean {
  return demo.availability !== 'disabled';
}

export class DemoStore {
  readonly demos: readonly HclDemo[] = hclDemos;
  readonly groups: readonly HclDemoGroup[] = hclDemoGroups;
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
    // [LAW:single-enforcer] Demo availability is enforced here so UI surfaces
    // can render the catalog model without re-implementing selection policy.
    if (!demo || !isSelectableDemo(demo)) return false;

    this.currentFilename = filename;
    this.patchStore.loadFromHCL(demo.hcl);
    return true;
  }

  /**
   * Load the default demo (GPU bootstrap demo when verified).
   */
  loadDefault(): void {
    const selectableDemos = this.demos.filter(isSelectableDemo);
    const preferredDemo = selectableDemos.find((demo) => demo.filename === GPU_BOOTSTRAP_DEMO_FILENAME);
    const verifiedDemo = selectableDemos.find((demo) => isVerifiedGpuDemo(demo.hcl));
    const defaultDemo = preferredDemo && isVerifiedGpuDemo(preferredDemo.hcl)
      ? preferredDemo
      : verifiedDemo
        ?? preferredDemo
        ?? selectableDemos[0];
    if (defaultDemo) {
      this.selectDemo(defaultDemo.filename);
    }
  }
}
