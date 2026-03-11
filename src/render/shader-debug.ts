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
  // [LAW:one-source-of-truth] WGSL line-number formatting/logging is shared
  // by runtime renderer and UI debug consumers via one utility boundary.
  logger.groupCollapsed(`[runtimeConsole] Generated WGSL: ${name}`);
  logger.info(formatWgslWithLineNumbers(wgsl));
  logger.groupEnd();
}
