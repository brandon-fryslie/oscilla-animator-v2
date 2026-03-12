export interface ShaderDebugLogger {
  groupCollapsed: (...args: readonly unknown[]) => void;
  info: (...args: readonly unknown[]) => void;
  groupEnd: () => void;
}

export function formatWgslWithLineNumbers(wgsl: string): string {
  return wgsl
    .split('\n')
    .map((line, index) => `${String(index + 1).padStart(4, ' ')} | ${line}`)
    .join('\n');
}

export function dumpShaderWithLineNumbers(
  name: string,
  wgsl: string,
  enabled: boolean,
  logger: ShaderDebugLogger = console,
): void {
  if (!enabled) {
    return;
  }
  // Utility helper for WGSL line-number formatting/logging used by runtime
  // renderer and UI debug consumers where wired up.
  logger.groupCollapsed(`[runtimeConsole] Generated WGSL: ${name}`);
  logger.info(formatWgslWithLineNumbers(wgsl));
  logger.groupEnd();
}
