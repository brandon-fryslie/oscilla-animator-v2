import type { RuntimeBoundaryFixtureV1 } from './RuntimeService';

export const RUNTIME_BOUNDARY_DUMP_GLOBAL_KEY = '__OSCILLA_BOUNDARY_DUMP__' as const;

export interface RuntimeBoundaryFixtureJsonV1 {
  readonly install: RuntimeBoundaryFixtureV1['install'];
  readonly frame: RuntimeBoundaryFixtureV1['frame'];
}

export interface RuntimeBoundaryDumpBridgeApi {
  readonly dumpFixtureV1: () => RuntimeBoundaryFixtureV1;
  readonly dumpFixtureJsonV1: (space?: number) => string;
  readonly copyFixtureJsonV1: (space?: number) => Promise<string>;
}

type RuntimeBoundaryDumpBridgeHost = typeof globalThis & {
  [RUNTIME_BOUNDARY_DUMP_GLOBAL_KEY]?: RuntimeBoundaryDumpBridgeApi;
};

declare global {
  interface Window {
    __OSCILLA_BOUNDARY_DUMP__?: RuntimeBoundaryDumpBridgeApi;
  }
}

function toFixtureJsonPayload(fixture: RuntimeBoundaryFixtureV1): RuntimeBoundaryFixtureJsonV1 {
  // [LAW:one-source-of-truth] Fixture JSON is derived from the canonical
  // runtime boundary payload pair only.
  return {
    install: fixture.install,
    frame: fixture.frame,
  };
}

function stringifyFixtureJsonV1(fixture: RuntimeBoundaryFixtureV1, space = 2): string {
  return JSON.stringify(toFixtureJsonPayload(fixture), null, space);
}

async function writeClipboardText(text: string): Promise<void> {
  const clipboard = navigator.clipboard;
  if (!clipboard || typeof clipboard.writeText !== 'function') {
    throw new Error('Runtime boundary fixture copy failed: Clipboard API is unavailable');
  }
  await clipboard.writeText(text);
}

export function createRuntimeBoundaryDumpBridge(
  readFixture: () => RuntimeBoundaryFixtureV1,
): RuntimeBoundaryDumpBridgeApi {
  const dumpFixtureV1 = (): RuntimeBoundaryFixtureV1 => readFixture();
  return {
    dumpFixtureV1,
    dumpFixtureJsonV1: (space = 2) => stringifyFixtureJsonV1(dumpFixtureV1(), space),
    copyFixtureJsonV1: async (space = 2) => {
      const fixtureJson = stringifyFixtureJsonV1(dumpFixtureV1(), space);
      await writeClipboardText(fixtureJson);
      return fixtureJson;
    },
  };
}

export function installRuntimeBoundaryDumpBridge(
  readFixture: () => RuntimeBoundaryFixtureV1,
  host: RuntimeBoundaryDumpBridgeHost = globalThis as RuntimeBoundaryDumpBridgeHost,
): RuntimeBoundaryDumpBridgeApi {
  const bridge = createRuntimeBoundaryDumpBridge(readFixture);
  // [LAW:no-shared-mutable-globals] exception: one explicit global bridge key
  // provides stable operator access from DevTools and in-app tooling.
  host[RUNTIME_BOUNDARY_DUMP_GLOBAL_KEY] = bridge;
  return bridge;
}

export function readRuntimeBoundaryDumpBridge(
  host: RuntimeBoundaryDumpBridgeHost = globalThis as RuntimeBoundaryDumpBridgeHost,
): RuntimeBoundaryDumpBridgeApi | null {
  return host[RUNTIME_BOUNDARY_DUMP_GLOBAL_KEY] ?? null;
}
