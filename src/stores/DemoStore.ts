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
import { hclDemos, type HclDemo } from '../demo';
import type { PatchStore } from './PatchStore';

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
   * Load the default demo ('simple.hcl' or first available).
   */
  loadDefault(): void {
    const defaultDemo = this.demos.find(d => d.filename === 'simple.hcl') ?? this.demos[0];
    if (defaultDemo) {
      this.selectDemo(defaultDemo.filename);
    }
  }
}
