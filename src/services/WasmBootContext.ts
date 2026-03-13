/**
 * WasmBootContext — runtime-scoped typed state machine for WASM compiler initialization.
 *
 * Spec: docs/WebGPU-Complete/P5-1__WASM_Boot__Developer_Experience_&_Migration.md
 *
 * [LAW:no-shared-mutable-globals] Each call to createWasmBootContext() produces an
 * independent context. No module-level singleton exists.
 *
 * [LAW:one-source-of-truth] WasmBootContext is the single authority for WASM boot
 * state. Downstream services query this context, never maintain parallel state.
 *
 * [LAW:no-silent-fallbacks] Boot failure is fatal. There is no legacy compiler
 * fallback path.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Strict state machine: initial → loading → ready | error. No other transitions. */
export type BootState = 'initial' | 'loading' | 'ready' | 'error';

/**
 * Runtime-scoped boot context for the WASM compiler boundary.
 *
 * After construction the context starts in 'initial'. Awaiting `initPromise`
 * drives the state machine to either 'ready' or 'error'. `compileIr` is only
 * callable once the state reaches 'ready'.
 */
export interface WasmBootContext {
  readonly state: BootState;
  readonly initPromise: Promise<void>;
  readonly compileIr: (module: unknown) => unknown;
  readonly lastError: Error | null;
}

/**
 * Configuration accepted by {@link createWasmBootContext}.
 *
 * The WASM init function is pluggable so callers can supply the real
 * wasm-bindgen wrapper or a test double.
 */
export interface WasmBootConfig {
  /** Async function that initialises the WASM module and returns the compile function. */
  readonly initWasm: () => Promise<(module: unknown) => unknown>;
  /** Optional module passed to compileIr as a boot smoke-check. Defaults to `{}`. */
  readonly smokeCheckModule?: unknown;
}

// ---------------------------------------------------------------------------
// Internal mutable carrier
// ---------------------------------------------------------------------------

/**
 * Internal mutable object backing a WasmBootContext. The mutation boundary is
 * strictly limited to the boot sequence inside `runBootSequence`. Once the
 * promise resolves, no further writes occur.
 */
interface MutableBootContext {
  state: BootState;
  initPromise: Promise<void>;
  compileIr: (module: unknown) => unknown;
  lastError: Error | null;
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

/**
 * Execute the boot sequence, mutating `ctx` through the state machine.
 *
 * State transitions:
 *   initial → loading → ready   (happy path)
 *   initial → loading → error   (any failure)
 */
async function runBootSequence(
  ctx: MutableBootContext,
  config: WasmBootConfig,
): Promise<void> {
  // initial → loading
  ctx.state = 'loading';

  try {
    // Step 1-2: Initialise the WASM module and obtain the compile function.
    const wasmCompileIr = await config.initWasm();

    // Step 3: Boot smoke-check — prove the binding is callable.
    // [LAW:verifiable-goals] A successful boot requires a deterministic compile
    // call, not just a loaded module.
    const smokeModule = config.smokeCheckModule ?? {};
    wasmCompileIr(smokeModule);

    // Step 4: Publish ready.
    ctx.compileIr = wasmCompileIr;
    ctx.state = 'ready';
  } catch (raw: unknown) {
    // [LAW:no-silent-fallbacks] Boot failure is explicit and fatal.
    const error =
      raw instanceof Error
        ? raw
        : new Error(String(raw));
    ctx.lastError = error;
    ctx.state = 'error';
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a runtime-scoped WASM boot context.
 *
 * Returns immediately with state 'initial'. The returned `initPromise` drives
 * the state machine to 'ready' or 'error'. Callers must `await initPromise`
 * before using `compileIr`.
 *
 * [LAW:no-shared-mutable-globals] Every invocation produces an independent
 * context — no module-level singleton.
 */
export function createWasmBootContext(config: WasmBootConfig): WasmBootContext {
  const ctx: MutableBootContext = {
    state: 'initial',
    // Replaced by runBootSequence; placeholder throws until ready.
    compileIr: () => {
      throw new Error(
        // [LAW:no-silent-fallbacks] Calling compileIr before boot completes is
        // a programmer error, not a recoverable condition.
        '[WasmBootContext] compileIr called before boot reached "ready" state',
      );
    },
    lastError: null,
    // Assigned below — TypeScript needs the field present for the interface.
    initPromise: undefined!,
  };

  ctx.initPromise = runBootSequence(ctx, config);

  return ctx;
}

// ---------------------------------------------------------------------------
// Enforcement gate
// ---------------------------------------------------------------------------

/**
 * Guard that throws if the boot context is not in the 'ready' state.
 *
 * [LAW:single-enforcer] This is THE single place where boot readiness is
 * enforced. Downstream services call this instead of checking state themselves.
 */
export function requireBootReady(ctx: WasmBootContext): void {
  // [LAW:dataflow-not-control-flow] The guard always executes; the thrown error
  // is the "value" that varies based on the state.
  const message = BOOT_NOT_READY_MESSAGES[ctx.state];
  if (message !== null) {
    throw new Error(message);
  }
}

/**
 * Maps each BootState to either an error message (non-ready) or null (ready).
 * [LAW:dataflow-not-control-flow] Variability lives in the data, not in
 * conditional branches.
 */
const BOOT_NOT_READY_MESSAGES: Record<BootState, string | null> = {
  initial: '[WasmBootContext] Boot has not started — await initPromise first',
  loading: '[WasmBootContext] Boot is still in progress — await initPromise first',
  error: '[WasmBootContext] Boot failed — check lastError for details',
  ready: null,
};
