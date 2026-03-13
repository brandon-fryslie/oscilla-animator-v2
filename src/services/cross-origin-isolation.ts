const COI_RELOAD_FLAG = 'oscilla.coi.reload.pending';
const COI_SERVICE_WORKER_FILE = 'coi-serviceworker.js';

type EnsureCrossOriginIsolationOptions = {
  readonly reload?: () => void;
};

function getBaseScopePath(): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

export async function ensureCrossOriginIsolationForSharedArrayBuffer(
  options?: EnsureCrossOriginIsolationOptions,
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return true;
  }
  if (window.crossOriginIsolated) {
    window.sessionStorage.removeItem(COI_RELOAD_FLAG);
    return true;
  }
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    return true;
  }

  const scope = getBaseScopePath();
  const scriptUrl = `${scope}${COI_SERVICE_WORKER_FILE}`;
  await navigator.serviceWorker.register(scriptUrl, { scope });

  if (!navigator.serviceWorker.controller) {
    if (window.sessionStorage.getItem(COI_RELOAD_FLAG) !== '1') {
      window.sessionStorage.setItem(COI_RELOAD_FLAG, '1');
      (options?.reload ?? (() => window.location.reload()))();
      return false;
    }
    return true;
  }

  window.sessionStorage.removeItem(COI_RELOAD_FLAG);
  return true;
}
