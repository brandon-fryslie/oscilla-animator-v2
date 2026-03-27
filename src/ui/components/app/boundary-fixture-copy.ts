import { readRuntimeBoundaryDumpBridge } from '../../../services/runtime-boundary-dump-bridge';

export interface BoundaryFixtureCopyResult {
  readonly success: boolean;
  readonly message: string;
  readonly error?: Error;
}

export async function copyBoundaryFixtureJsonFromBridge(): Promise<BoundaryFixtureCopyResult> {
  try {
    const bridge = readRuntimeBoundaryDumpBridge();
    if (!bridge) {
      throw new Error('Boundary fixture bridge is unavailable');
    }
    await bridge.copyFixtureJsonV1();
    return {
      success: true,
      message: 'Copied boundary fixture JSON to clipboard',
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return {
      success: false,
      message: error.message || 'Failed to copy boundary fixture JSON',
      error,
    };
  }
}
