import type { DockviewApi } from 'dockview';

let dockviewApiRef: DockviewApi | null = null;

export function setDockviewApiRef(api: DockviewApi | null): void {
  dockviewApiRef = api;
}

export function getDockviewApiRef(): DockviewApi | null {
  return dockviewApiRef;
}
