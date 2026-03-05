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

// ─── loadDemoPatch (EXCEPTION: pre-React, raw URLSearchParams) ───────────────
// Must run before React mounts.
// Cannot use nuqs because nuqs hooks require the React tree.

const SESSION_KEY = 'oscilla-test:loadDemoPatch';

/**
 * Detect ?loadDemoPatch=<filename>, stash in sessionStorage, and strip the param
 * from the current URL without reloading.
 * Returns false because no navigation is performed.
 *
 * Flow:
 * 1. Test runner navigates to ?loadDemoPatch=breathing-ring.hcl&showPreview=true
 * 2. This function stashes filename in sessionStorage
 * 3. Removes loadDemoPatch from the URL via history.replaceState (same document)
 * 4. RuntimeService consumes the marker and applies demo load during init
 */
export function interceptLoadDemoPatch(): boolean {
  const params = new URLSearchParams(window.location.search);
  const filename = params.get('loadDemoPatch');
  if (!filename) return false;

  // [LAW:one-source-of-truth] sessionStorage marker remains the canonical
  // carrier from pre-React parsing to RuntimeService init.
  sessionStorage.setItem(SESSION_KEY, filename);

  // Strip loadDemoPatch from URL, preserve all other params, no reload.
  params.delete('loadDemoPatch');
  const remaining = params.toString();
  const newUrl = window.location.pathname + (remaining ? `?${remaining}` : '');
  window.history.replaceState(window.history.state, '', newUrl);
  return false;
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
