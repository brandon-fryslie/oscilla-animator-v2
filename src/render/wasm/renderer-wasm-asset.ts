import rendererWasmAssetUrl from './pkg/oscilla_rust_renderer_bg.wasm?url';

function resolveRendererWasmFetchUrl(assetUrl: string): string {
  if (/^https?:\/\//.test(assetUrl)) {
    const parsed = new URL(assetUrl);
    parsed.pathname = parsed.pathname.replace(/^\/\/+/, '/');
    return parsed.href;
  }
  const pageOrigin = globalThis.location?.origin;
  if (typeof pageOrigin !== 'string' || pageOrigin.length === 0) {
    throw new Error(`Rust renderer wasm fetch cannot resolve page origin for ${assetUrl}`);
  }
  return new URL(assetUrl, pageOrigin).href;
}

export async function fetchRustRendererWasmBytes(): Promise<ArrayBuffer> {
  const resolvedWasmUrl = resolveRendererWasmFetchUrl(rendererWasmAssetUrl);
  const response = await fetch(resolvedWasmUrl);
  if (!response.ok) {
    throw new Error(`Rust renderer wasm fetch failed: ${response.status} ${response.statusText}`);
  }
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 4));
  // [LAW:single-enforcer] Validate renderer wasm bytes once at the page-owned
  // bootstrap boundary before transferring them into the worker.
  if (
    header.length < 4
    || header[0] !== 0x00
    || header[1] !== 0x61
    || header[2] !== 0x73
    || header[3] !== 0x6d
  ) {
    const contentType = response.headers.get('content-type') ?? 'unknown';
    throw new Error(
      `Rust renderer wasm fetch returned non-wasm bytes from ${resolvedWasmUrl} (content-type=${contentType})`,
    );
  }
  return bytes;
}
