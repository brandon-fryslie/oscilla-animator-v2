/**
 * Payload Tester — Standalone Entry Point
 *
 * A separate web app that boots ONLY the Rust WASM renderer.
 * Zero imports from stores, blocks, compiler, or the main app UI.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureCrossOriginIsolationForSharedArrayBuffer } from '../services/cross-origin-isolation';
import { PayloadTesterApp } from './PayloadTesterApp';

async function main() {
  const shouldBoot = await ensureCrossOriginIsolationForSharedArrayBuffer();
  if (!shouldBoot) {
    // COI service worker was just registered — page will reload
    return;
  }

  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const root = createRoot(container);
  root.render(React.createElement(PayloadTesterApp));
}

main().catch((err) => {
  console.error('Payload tester failed to boot:', err);
  const container = document.getElementById('app');
  if (container) {
    container.textContent = `Fatal: ${err instanceof Error ? err.message : String(err)}`;
  }
});
