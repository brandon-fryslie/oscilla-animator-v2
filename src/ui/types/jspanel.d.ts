/**
 * TypeScript declarations for jsPanel4
 *
 * Minimal type definitions to support the Oscilla UI framework.
 * Based on jsPanel v4.16.1
 */

declare module 'jspanel4' {
  export interface JsPanelPosition {
    my?: string;
    at?: string;
    of?: string | HTMLElement;
    offsetX?: number;
    offsetY?: number;
    minLeft?: number | boolean;
    minTop?: number | boolean;
    maxLeft?: number | boolean;
    maxTop?: number | boolean;
    autoposition?: string | boolean;
    modify?: ((position: { left: number; top: number }) => { left: number; top: number }) | boolean;
  }

  export interface JsPanelDragitConfig {
    cursor?: string;
    handles?: string;
    opacity?: number;
    disableOnMaximized?: boolean;
    containment?: number | number[];
    grid?: number[];
    snap?: boolean | object;
    start?: ((panel: JsPanel, position: { left: number; top: number }, event: Event) => void)[];
    drag?: ((panel: JsPanel, position: { left: number; top: number }, event: Event) => void)[];
    stop?: ((panel: JsPanel, position: { left: number; top: number }, event: Event) => void)[];
  }

  export interface JsPanelResizeitConfig {
    handles?: string;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    containment?: number | number[];
    grid?: number[];
    aspectRatio?: boolean | string;
    start?: ((panel: JsPanel, size: { width: number; height: number }, event: Event) => void)[];
    resize?: ((panel: JsPanel, size: { width: number; height: number }, event: Event) => void)[];
    stop?: ((panel: JsPanel, size: { width: number; height: number }, event: Event) => void)[];
  }

  export interface JsPanelHeaderControls {
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    close?: 'remove' | false;
    maximize?: 'remove' | false;
    minimize?: 'remove' | false;
    normalize?: 'remove' | false;
    smallify?: 'remove' | false;
    add?: HTMLElement | HTMLElement[];
  }

  export interface JsPanelOptions {
    id?: string;
    headerTitle?: string | HTMLElement | (() => string | HTMLElement);
    header?: boolean | string;
    headerLogo?: string;
    position?: JsPanelPosition | string;
    panelSize?: { width: number | string; height: number | string } | string;
    contentSize?: { width: number | string; height: number | string } | string;
    container?: string | HTMLElement;
    theme?: string | { bgPanel?: string; bgContent?: string; colorHeader?: string; colorContent?: string; border?: string };
    border?: string;
    borderRadius?: string | number;
    boxShadow?: number | string;
    dragit?: boolean | 'disabled' | JsPanelDragitConfig;
    resizeit?: boolean | 'disabled' | JsPanelResizeitConfig;
    headerControls?: JsPanelHeaderControls;
    footerToolbar?: string | HTMLElement | HTMLElement[];
    content?: string | HTMLElement | ((panel: JsPanel) => void);
    contentAjax?: {
      url: string;
      method?: string;
      async?: boolean;
      user?: string;
      password?: string;
      done?: (responseText: string, textStatus: string, panel: JsPanel) => void;
      fail?: (request: XMLHttpRequest, textStatus: string, errorThrown: string, panel: JsPanel) => void;
    };
    contentFetch?: {
      resource: RequestInfo;
      fetchInit?: RequestInit;
      done?: (response: Response, panel: JsPanel) => void;
      beforeSend?: (panel: JsPanel) => void;
    };
    callback?: ((panel: JsPanel) => void) | ((panel: JsPanel) => void)[];
    onclosed?: ((panel: JsPanel, closedByUser: boolean) => boolean | void)[];
    onbeforeclose?: ((panel: JsPanel) => boolean | void)[];
    onfronted?: ((panel: JsPanel, status: string) => boolean | void)[];
    onminimized?: ((panel: JsPanel, status: string) => boolean | void)[];
    onmaximized?: ((panel: JsPanel, status: string) => boolean | void)[];
    onnormalized?: ((panel: JsPanel, status: string) => boolean | void)[];
    onsmallified?: ((panel: JsPanel, status: string) => boolean | void)[];
    onunsmallified?: ((panel: JsPanel, status: string) => boolean | void)[];
    onstatuschange?: ((panel: JsPanel, status: string) => void)[];
    closeOnEscape?: boolean | ((panel: JsPanel) => boolean);
    maximizedMargin?: number | number[];
    minimizeTo?: string | boolean | HTMLElement;
    setStatus?: 'maximized' | 'minimized' | 'smallified' | 'smallifiedmax';
    animateIn?: string;
    animateOut?: string;
    autoclose?: { time?: string | number; progressbar?: boolean } | false;
    syncMargins?: boolean;
    paneltype?: 'standard' | 'contextmenu' | 'error' | 'hint' | 'modal' | 'tooltip';
    data?: unknown;
  }

  export interface JsPanel extends HTMLElement {
    // Properties
    content: HTMLElement;
    header: HTMLElement;
    headerbar: HTMLElement;
    headertitle: HTMLElement;
    controlbar: HTMLElement;
    footer: HTMLElement;
    options: JsPanelOptions;
    status: 'normalized' | 'maximized' | 'minimized' | 'smallified' | 'smallifiedmax';
    currentData: {
      width: string;
      height: string;
      left: string;
      top: string;
    };

    // Methods
    close: (callback?: () => void, closedByUser?: boolean) => void;
    minimize: () => JsPanel;
    maximize: () => JsPanel;
    normalize: () => JsPanel;
    smallify: () => JsPanel;
    unsmallify: () => JsPanel;
    front: (callback?: () => void) => JsPanel;
    setHeaderTitle: (title: string | HTMLElement | (() => string | HTMLElement)) => JsPanel;
    setHeaderLogo: (logo: string) => JsPanel;
    resize: (options: { width?: number | string; height?: number | string }) => JsPanel;
    reposition: (position?: JsPanelPosition | string, updateCache?: boolean) => JsPanel;
    dragit: (action: 'enable' | 'disable' | JsPanelDragitConfig) => JsPanel;
    resizeit: (action: 'enable' | 'disable' | JsPanelResizeitConfig) => JsPanel;
    setControlStatus: (control: string, action: 'enable' | 'disable' | 'remove' | 'show' | 'hide', callback?: () => void) => JsPanel;
    saveCurrentDimensions: () => JsPanel;
    saveCurrentPosition: () => JsPanel;
    calcSizeFactors: () => JsPanel;
    setBorderRadius: (value: string | number) => JsPanel;
    getThemeDetails: (theme: string) => { color: string; colors: string[] };
    setBorder: (border: string) => JsPanel;
    contentRemove: () => JsPanel;
    setTheme: (theme: string | object) => JsPanel;
    addToolbar: (place: 'header' | 'footer', config: HTMLElement | HTMLElement[] | string, callback?: () => void) => JsPanel;
  }

  export interface JsPanelStatic {
    version: string;
    date: string;
    defaults: JsPanelOptions;
    extensions: Record<string, unknown>;
    idCounter: number;
    icons: Record<string, string>;
    zi: {
      next: () => number;
    };

    // Core methods
    create: (options?: JsPanelOptions, callback?: (panel: JsPanel) => void) => JsPanel;
    extend: (extension: Record<string, unknown>) => void;
    getPanels: (filter?: (panel: JsPanel) => boolean) => JsPanel[];
    setTheme: (theme: string) => void;

    // Utility methods
    emptyNode: (node: HTMLElement) => HTMLElement;
    pOcontainer: (container: string | HTMLElement) => HTMLElement;
    pOcontainment: (containment: number | number[]) => number[];
    pOposition: (position: JsPanelPosition | string) => JsPanelPosition;
    pOsize: (size: { width: number | string; height: number | string } | string) => { width: string; height: string };
    strToHtml: (str: string) => DocumentFragment;
    errorpanel: (error: string) => JsPanel;

    // Layout extension (if loaded)
    layout?: {
      version: string;
      storage: Storage;
      save: (config?: { selector?: string; storagename?: string }) => string;
      getAll: (storagename?: string) => object[] | false;
      restore: (config: { configs: Record<string, JsPanelOptions>; storagename?: string }) => void;
      restoreId: (config: { id: string; config: JsPanelOptions; storagename?: string }) => JsPanel | false;
    };

    // Dock extension (if loaded)
    dock?: {
      version: string;
      defaults: {
        position: JsPanelPosition;
        linkSlaveHeight: boolean;
        linkSlaveWidth: boolean;
      };
    };

    // Modal extension (if loaded)
    modal?: {
      create: (options?: JsPanelOptions, callback?: (panel: JsPanel) => void) => JsPanel;
    };

    // Tooltip extension (if loaded)
    tooltip?: {
      create: (options?: JsPanelOptions & { target: string | HTMLElement; mode?: 'default' | 'semisticky' | 'sticky' }, callback?: (panel: JsPanel) => void) => JsPanel;
    };
  }

  const jsPanel: JsPanelStatic;
  export default jsPanel;
  export { jsPanel };
}

declare module 'jspanel4/es6module/jspanel.js' {
  export * from 'jspanel4';
  import jsPanel from 'jspanel4';
  export default jsPanel;
}

declare module 'jspanel4/dist/jspanel.css' {
  const content: string;
  export default content;
}
