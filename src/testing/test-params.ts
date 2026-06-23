/**
 * Test Automation Query Parameters
 *
 * Single source of truth for test parameter detection and nuqs parsers.
 *
 * Two params:
 * - `loadDemoPatch=<filename>` — pre-React, raw URLSearchParams (EXCEPTION: cannot use nuqs)
 * - `showPreview=<true|false|1|0>` — nuqs hook for minimal preview layout
 * - `runtimeConsole=<true|false|1|0>` — enable periodic runtime frame logs in browser console
 *
 * [LAW:one-source-of-truth] All test param logic lives here.
 * [LAW:single-enforcer] Pre-React validation runs once in main.ts.
 */

import { createParser, useQueryState } from 'nuqs';
import { resolveLocalStorageCapability } from '../services/local-storage-capability';

// ─── loadDemoPatch (EXCEPTION: pre-React, raw URLSearchParams) ───────────────
// Must run before React mounts to trigger browser reload for clean state.
// Cannot use nuqs because nuqs hooks require the React tree.

const SESSION_KEY = 'oscilla-test:loadDemoPatch';

/**
 * Detect ?loadDemoPatch=<filename>, clear localStorage, stash in sessionStorage, reload.
 * Returns true if a reload was triggered (caller should bail out of main()).
 *
 * Flow:
 * 1. Test runner navigates to ?loadDemoPatch=breathing-ring.hcl&showPreview=true
 * 2. This function clears localStorage (prevents stale patch restore)
 * 3. Stashes filename in sessionStorage (survives reload)
 * 4. window.location.replace() → same path without loadDemoPatch (preserves other params)
 * 5. Full page reload → all JS state recreated fresh
 */
export function interceptLoadDemoPatch(): boolean {
  const params = new URLSearchParams(window.location.search);
  const filename = params.get('loadDemoPatch');
  if (!filename) return false;

  // Stash the filename for post-reload consumption
  sessionStorage.setItem(SESSION_KEY, filename);

  // [LAW:single-enforcer] localStorage capability detection is centralized.
  resolveLocalStorageCapability()?.clear?.();

  // Strip loadDemoPatch from URL, preserve all other params
  params.delete('loadDemoPatch');
  const remaining = params.toString();
  const newUrl = window.location.pathname + (remaining ? `?${remaining}` : '');

  // Replace (not push) so back button doesn't re-trigger
  window.location.replace(newUrl);
  return true;
}

/**
 * Consume the sessionStorage marker set by interceptLoadDemoPatch.
 * Returns the demo filename or null. One-shot: clears after reading.
 */
export function consumeTestDemoFilename(): string | null {
  const filename = sessionStorage.getItem(SESSION_KEY);
  if (filename) {
    sessionStorage.removeItem(SESSION_KEY);
  }
  return filename;
}

// ─── scenePlan (ScenePlan steel-thread selector) ────────────────────────────

const SCENE_PLAN_PARAM = 'scenePlan';

/**
 * Read ?scenePlan=<id> — select an authored patch to render through the
 * ScenePlan → Three backend steel thread instead of the V1 editor runtime.
 * Returns the id or null.
 *
 * Unlike loadDemoPatch this needs no reload: it touches neither localStorage
 * nor the V1 patch store, so it is read directly at runtime init.
 *
 * [LAW:single-enforcer] All test-param parsing lives in this module.
 */
export function readScenePlanSelection(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(SCENE_PLAN_PARAM);
}

// ─── showPreview (nuqs) ─────────────────────────────────────────────────────

const VALID_SHOW_PREVIEW = new Set(['true', 'false', '1', '0']);
const VALID_RUNTIME_CONSOLE = new Set(['true', 'false', '1', '0']);

/**
 * Validate ?showPreview= early (pre-React).
 * Throws on invalid values — fast feedback for test runners.
 * No-op if param is absent.
 */
export function validateShowPreview(): void {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('showPreview');
  if (value !== null && !VALID_SHOW_PREVIEW.has(value)) {
    throw new Error(
      `[test-params] Invalid showPreview value: "${value}". Must be true/false/1/0.`
    );
  }
}

/**
 * Validate ?runtimeConsole= early (pre-React).
 * Throws on invalid values — fast feedback for debugging sessions.
 * No-op if param is absent.
 */
export function validateRuntimeConsole(): void {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('runtimeConsole');
  if (value !== null && !VALID_RUNTIME_CONSOLE.has(value)) {
    throw new Error(
      `[test-params] Invalid runtimeConsole value: "${value}". Must be true/false/1/0.`
    );
  }
}

/** Custom nuqs parser: true/false/1/0 → boolean, else null */
export const parseAsStrictBoolean = createParser({
  parse: (v: string) =>
    v === 'true' || v === '1' ? true : v === 'false' || v === '0' ? false : null,
  serialize: (v: boolean) => String(v),
});

/**
 * Hook for the showPreview query parameter. Use inside NuqsAdapter tree.
 * Returns true when ?showPreview=true or ?showPreview=1.
 */
export function useShowPreview(): boolean {
  const [value] = useQueryState('showPreview', parseAsStrictBoolean.withDefault(false));
  return value;
}

/**
 * Returns true when runtime console frame logs are enabled via
 * ?runtimeConsole=true|1.
 *
 * [LAW:one-source-of-truth] Runtime console query parsing is centralized with
 * other startup query params to avoid drift.
 */
export function isRuntimeConsoleEnabled(): boolean {
  const value = new URLSearchParams(window.location.search).get('runtimeConsole');
  return value === 'true' || value === '1';
}
