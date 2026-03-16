import nagaShimWasmAssetUrl from './pkg/oscilla_naga_shim_bg.wasm?url';

function resolveNagaShimFetchUrl(assetUrl: string): string {
  if (/^https?:\/\//.test(assetUrl)) {
    const parsed = new URL(assetUrl);
    parsed.pathname = parsed.pathname.replace(/^\/\/+/, '/');
    return parsed.href;
  }
  const pageOrigin = globalThis.location?.origin;
  if (typeof pageOrigin !== 'string' || pageOrigin.length === 0) {
    throw new Error(`Naga shim fetch cannot resolve page origin for ${assetUrl}`);
  }
  return new URL(assetUrl, pageOrigin).href;
}

export async function fetchNagaShimWasmBytes(): Promise<ArrayBuffer> {
  const resolvedWasmUrl = resolveNagaShimFetchUrl(nagaShimWasmAssetUrl);
  const response = await fetch(resolvedWasmUrl);
  if (!response.ok) {
    throw new Error(`Naga shim wasm fetch failed: ${response.status} ${response.statusText}`);
  }
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 4));
  // [LAW:single-enforcer] Validate Naga shim bytes once at the page-owned
  // bootstrap boundary before transferring them into the compile worker.
  if (
    header.length < 4
    || header[0] !== 0x00
    || header[1] !== 0x61
    || header[2] !== 0x73
    || header[3] !== 0x6d
  ) {
    const contentType = response.headers.get('content-type') ?? 'unknown';
    throw new Error(
      `Naga shim fetch returned non-wasm bytes from ${resolvedWasmUrl} (content-type=${contentType})`,
    );
  }
  return bytes;
}
