/**
 * Compiler Tester — Standalone Entry Point
 *
 * A separate web app that compiles graph fixtures through the C1 backend
 * and renders them via the Rust WASM renderer.
 * Zero imports from stores or the main app UI.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureCrossOriginIsolationForSharedArrayBuffer } from '../services/cross-origin-isolation';
import { CompilerTesterApp } from './CompilerTesterApp';

async function main() {
  const shouldBoot = await ensureCrossOriginIsolationForSharedArrayBuffer();
  if (!shouldBoot) return;

  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const root = createRoot(container);
  root.render(React.createElement(CompilerTesterApp));
}

main().catch((err) => {
  console.error('Compiler tester failed to boot:', err);
  const container = document.getElementById('app');
  if (container) {
    container.textContent = `Fatal: ${err instanceof Error ? err.message : String(err)}`;
  }
});
