/**
 * Startup Query Parameters
 *
 * Single source of truth for startup/test parameter detection and nuqs parsers,
 * including the product boot-path selection (see {@link resolveBootSelection}).
 *
 * Params:
 * - `v1=<true|false|1|0>` — opt into the legacy V1 runtime (default boot is Three)
 * - `scenePlan=<id>` — select the native editor (`editor`) or a fixed demo steel thread
 * - `loadDemoPatch=<filename>` — pre-React, raw URLSearchParams (EXCEPTION: cannot use nuqs)
 * - `showPreview=<true|false|1|0>` — nuqs hook for minimal preview layout
 * - `runtimeConsole=<true|false|1|0>` — enable periodic runtime frame logs in browser console
 *
 * [LAW:one-source-of-truth] All startup param logic lives here.
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

// ─── boot selection (which render path the URL selects) ─────────────────────

const SCENE_PLAN_PARAM = 'scenePlan';
const V1_OPT_IN_PARAM = 'v1';
const VALID_V1_OPT_IN = new Set(['true', 'false', '1', '0']);

/**
 * The reserved `?scenePlan=` id that selects the live native editor instead of a
 * fixed demo fixture: the authored patch is driven from `PillarPatchStore` and
 * recompiled into the renderer on every edit, rather than compiled once. This is
 * the explicit spelling of the default boot path (see {@link resolveBootSelection}).
 */
const NATIVE_EDITOR_SCENE_PLAN_ID = 'editor';

/**
 * The boot path the current URL selects. Exactly one of three outcomes; this
 * compiler-checked union is the single authority that both the runtime dispatch
 * (`RuntimeService.init`) and the UI layout (`App`) match on.
 *
 * [LAW:types-are-the-program] Three boot outcomes are three variants, not an
 *   overloaded `string | null` where one branch's absence silently meant "V1".
 *   The default and the V1 opt-in are encoded once in the resolver below, never
 *   re-derived from a "was a param present?" check at a callsite.
 */
export type BootSelection =
  | { readonly kind: 'native-editor' }
  | { readonly kind: 'scene-plan-demo'; readonly planId: string }
  | { readonly kind: 'v1-legacy' };

function isV1OptIn(params: URLSearchParams): boolean {
  const value = params.get(V1_OPT_IN_PARAM);
  return value === 'true' || value === '1';
}

/**
 * Resolve which render path boot selects from the current URL. The Three-backed
 * native editor is the default; the legacy V1 runtime is an explicit opt-in.
 *
 * Policy (single authority for boot-path selection):
 *   ?v1=true|1            → V1 legacy runtime (the documented escape hatch)
 *   ?scenePlan=editor     → native editor (explicit spelling of the default)
 *   ?scenePlan=<other>    → fixed ScenePlan demo steel thread
 *   (no relevant param)   → native editor
 *
 * [LAW:single-enforcer] All boot-path URL policy lives here; consumers match the
 *   union, they never re-read these params.
 * [LAW:dataflow-not-control-flow] The default is a value the resolver emits, not
 *   a "no param ⇒ fall through to V1" branch hidden at the dispatch site.
 */
export function resolveBootSelection(): BootSelection {
  if (typeof window === 'undefined') return { kind: 'native-editor' };
  const params = new URLSearchParams(window.location.search);
  if (isV1OptIn(params)) return { kind: 'v1-legacy' };
  const planId = params.get(SCENE_PLAN_PARAM);
  if (planId === null || planId === NATIVE_EDITOR_SCENE_PLAN_ID) {
    return { kind: 'native-editor' };
  }
  return { kind: 'scene-plan-demo', planId };
}

/**
 * Validate ?v1= early (pre-React). Throws on invalid values — fast feedback for
 * the legacy opt-in. No-op if param is absent.
 */
export function validateV1OptIn(): void {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(V1_OPT_IN_PARAM);
  if (value !== null && !VALID_V1_OPT_IN.has(value)) {
    throw new Error(
      `[test-params] Invalid v1 value: "${value}". Must be true/false/1/0.`
    );
  }
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
