# Files

## File: packages/dockview/src/dockview/defaultTab.tsx
```typescript
import React from 'react';
import { CloseButton } from '../svg';
import { DockviewPanelApi, IDockviewPanelHeaderProps } from 'dockview-core';

function useTitle(api: DockviewPanelApi): string | undefined {
    const [title, setTitle] = React.useState<string | undefined>(api.title);

    React.useEffect(() => {
        const disposable = api.onDidTitleChange((event) => {
            setTitle(event.title);
        });

        // Depending on the order in which React effects are run, the title may already be out of sync (cf. issue #1003).
        if (title !== api.title) {
            setTitle(api.title);
        }

        return () => {
            disposable.dispose();
        };
    }, [api]);

    return title;
}

export type IDockviewDefaultTabProps = IDockviewPanelHeaderProps &
    React.HtmlHTMLAttributes<HTMLDivElement> & {
        hideClose?: boolean;
        closeActionOverride?: () => void;
    };

export const DockviewDefaultTab: React.FunctionComponent<
    IDockviewDefaultTabProps
> = ({
    api,
    containerApi: _containerApi,
    params: _params,
    hideClose,
    closeActionOverride,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    tabLocation,
    ...rest
}) => {
    const title = useTitle(api);

    const isMiddleMouseButton = React.useRef<boolean>(false);

    const onClose = React.useCallback(
        (event: React.MouseEvent<HTMLSpanElement>) => {
            event.preventDefault();

            if (closeActionOverride) {
                closeActionOverride();
            } else {
                api.close();
            }
        },
        [api, closeActionOverride]
    );

    const onBtnPointerDown = React.useCallback((event: React.MouseEvent) => {
        event.preventDefault();
    }, []);

    const _onPointerDown = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            isMiddleMouseButton.current = event.button === 1;
            onPointerDown?.(event);
        },
        [onPointerDown]
    );

    const _onPointerUp = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (isMiddleMouseButton && event.button === 1 && !hideClose) {
                isMiddleMouseButton.current = false;
                onClose(event);
            }

            onPointerUp?.(event);
        },
        [onPointerUp, onClose, hideClose]
    );

    const _onPointerLeave = React.useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            isMiddleMouseButton.current = false;
            onPointerLeave?.(event);
        },
        [onPointerLeave]
    );

    return (
        <div
            data-testid="dockview-dv-default-tab"
            {...rest}
            onPointerDown={_onPointerDown}
            onPointerUp={_onPointerUp}
            onPointerLeave={_onPointerLeave}
            className="dv-default-tab"
        >
            <span className="dv-default-tab-content">{title}</span>
            {!hideClose && (
                <div
                    className="dv-default-tab-action"
                    onPointerDown={onBtnPointerDown}
                    onClick={onClose}
                >
                    <CloseButton />
                </div>
            )}
        </div>
    );
};
```

## File: packages/dockview/src/dockview/dockview.tsx
```typescript
import React from 'react';
import {
    DockviewWillDropEvent,
    DockviewApi,
    DockviewGroupPanel,
    IHeaderActionsRenderer,
    DockviewDidDropEvent,
    IWatermarkPanelProps,
    IDockviewHeaderActionsProps,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
    DockviewOptions,
    PROPERTY_KEYS_DOCKVIEW,
    DockviewComponentOptions,
    DockviewFrameworkOptions,
    DockviewReadyEvent,
    createDockview,
} from 'dockview-core';
import { ReactPanelContentPart } from './reactContentPart';
import { ReactPanelHeaderPart } from './reactHeaderPart';
import { ReactPortalStore, usePortalsLifecycle } from '../react';
import { ReactWatermarkPart } from './reactWatermarkPart';
import { ReactHeaderActionsRendererPart } from './headerActionsRenderer';

function createGroupControlElement(
    component: React.FunctionComponent<IDockviewHeaderActionsProps> | undefined,
    store: ReactPortalStore
): ((groupPanel: DockviewGroupPanel) => IHeaderActionsRenderer) | undefined {
    return component
        ? (groupPanel: DockviewGroupPanel) => {
              return new ReactHeaderActionsRendererPart(
                  component,
                  store,
                  groupPanel
              );
          }
        : undefined;
}

const DEFAULT_REACT_TAB = 'props.defaultTabComponent';

export interface IDockviewReactProps extends DockviewOptions {
    tabComponents?: Record<
        string,
        React.FunctionComponent<IDockviewPanelHeaderProps>
    >;
    components: Record<string, React.FunctionComponent<IDockviewPanelProps>>;
    watermarkComponent?: React.FunctionComponent<IWatermarkPanelProps>;
    defaultTabComponent?: React.FunctionComponent<IDockviewPanelHeaderProps>;
    rightHeaderActionsComponent?: React.FunctionComponent<IDockviewHeaderActionsProps>;
    leftHeaderActionsComponent?: React.FunctionComponent<IDockviewHeaderActionsProps>;
    prefixHeaderActionsComponent?: React.FunctionComponent<IDockviewHeaderActionsProps>;
    //
    onReady: (event: DockviewReadyEvent) => void;
    onDidDrop?: (event: DockviewDidDropEvent) => void;
    onWillDrop?: (event: DockviewWillDropEvent) => void;
}

function extractCoreOptions(props: IDockviewReactProps): DockviewOptions {
    const coreOptions = PROPERTY_KEYS_DOCKVIEW.reduce((obj, key) => {
        if (key in props) {
            obj[key] = props[key] as any;
        }
        return obj;
    }, {} as Partial<DockviewComponentOptions>);

    return coreOptions as DockviewOptions;
}

export const DockviewReact = React.forwardRef(
    (props: IDockviewReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const dockviewRef = React.useRef<DockviewApi>();
        const [portals, addPortal] = usePortalsLifecycle();

        React.useImperativeHandle(ref, () => domRef.current!, []);

        const prevProps = React.useRef<Partial<IDockviewReactProps>>({});

        React.useEffect(
            () => {
                const changes: Partial<DockviewOptions> = {};

                PROPERTY_KEYS_DOCKVIEW.forEach((propKey) => {
                    const key = propKey;
                    const propValue = props[key];

                    if (key in props && propValue !== prevProps.current[key]) {
                        changes[key] = propValue as any;
                    }
                });

                if (dockviewRef.current) {
                    dockviewRef.current.updateOptions(changes);
                } else {
                    // not yet fully initialized
                }

                prevProps.current = props;
            },
            PROPERTY_KEYS_DOCKVIEW.map((key) => props[key])
        );

        React.useEffect(() => {
            if (!domRef.current) {
                return;
            }

            const frameworkTabComponents = props.tabComponents ?? {};

            if (props.defaultTabComponent) {
                frameworkTabComponents[DEFAULT_REACT_TAB] =
                    props.defaultTabComponent;
            }

            const frameworkOptions: DockviewFrameworkOptions = {
                createLeftHeaderActionComponent: createGroupControlElement(
                    props.leftHeaderActionsComponent,
                    { addPortal }
                ),
                createRightHeaderActionComponent: createGroupControlElement(
                    props.rightHeaderActionsComponent,
                    { addPortal }
                ),
                createPrefixHeaderActionComponent: createGroupControlElement(
                    props.prefixHeaderActionsComponent,
                    { addPortal }
                ),
                createComponent: (options) => {
                    return new ReactPanelContentPart(
                        options.id,
                        props.components[options.name],
                        {
                            addPortal,
                        }
                    );
                },
                createTabComponent(options) {
                    return new ReactPanelHeaderPart(
                        options.id,
                        frameworkTabComponents[options.name],
                        {
                            addPortal,
                        }
                    );
                },
                createWatermarkComponent: props.watermarkComponent
                    ? () => {
                          return new ReactWatermarkPart(
                              'watermark',
                              props.watermarkComponent!,
                              {
                                  addPortal,
                              }
                          );
                      }
                    : undefined,
                defaultTabComponent: props.defaultTabComponent
                    ? DEFAULT_REACT_TAB
                    : undefined,
            };

            const api = createDockview(domRef.current, {
                ...extractCoreOptions(props),
                ...frameworkOptions,
            });

            const { clientWidth, clientHeight } = domRef.current;
            api.layout(clientWidth, clientHeight);

            if (props.onReady) {
                props.onReady({ api });
            }

            dockviewRef.current = api;

            return () => {
                dockviewRef.current = undefined;
                api.dispose();
            };
        }, []);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return () => {
                    // noop
                };
            }

            const disposable = dockviewRef.current.onDidDrop((event) => {
                if (props.onDidDrop) {
                    props.onDidDrop(event);
                }
            });

            return () => {
                disposable.dispose();
            };
        }, [props.onDidDrop]);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return () => {
                    // noop
                };
            }

            const disposable = dockviewRef.current.onWillDrop((event) => {
                if (props.onWillDrop) {
                    props.onWillDrop(event);
                }
            });

            return () => {
                disposable.dispose();
            };
        }, [props.onWillDrop]);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return;
            }

            dockviewRef.current.updateOptions({
                createComponent: (options) => {
                    return new ReactPanelContentPart(
                        options.id,
                        props.components[options.name],
                        {
                            addPortal,
                        }
                    );
                },
            });
        }, [props.components]);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return;
            }

            const frameworkTabComponents = props.tabComponents ?? {};

            if (props.defaultTabComponent) {
                frameworkTabComponents[DEFAULT_REACT_TAB] =
                    props.defaultTabComponent;
            }

            dockviewRef.current.updateOptions({
                defaultTabComponent: props.defaultTabComponent
                    ? DEFAULT_REACT_TAB
                    : undefined,
                createTabComponent(options) {
                    return new ReactPanelHeaderPart(
                        options.id,
                        frameworkTabComponents[options.name],
                        {
                            addPortal,
                        }
                    );
                },
            });
        }, [props.tabComponents, props.defaultTabComponent]);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return;
            }

            dockviewRef.current.updateOptions({
                createWatermarkComponent: props.watermarkComponent
                    ? () => {
                          return new ReactWatermarkPart(
                              'watermark',
                              props.watermarkComponent!,
                              {
                                  addPortal,
                              }
                          );
                      }
                    : undefined,
            });
        }, [props.watermarkComponent]);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return;
            }
            dockviewRef.current.updateOptions({
                createRightHeaderActionComponent: createGroupControlElement(
                    props.rightHeaderActionsComponent,
                    { addPortal }
                ),
            });
        }, [props.rightHeaderActionsComponent]);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return;
            }
            dockviewRef.current.updateOptions({
                createLeftHeaderActionComponent: createGroupControlElement(
                    props.leftHeaderActionsComponent,
                    { addPortal }
                ),
            });
        }, [props.leftHeaderActionsComponent]);

        React.useEffect(() => {
            if (!dockviewRef.current) {
                return;
            }
            dockviewRef.current.updateOptions({
                createPrefixHeaderActionComponent: createGroupControlElement(
                    props.prefixHeaderActionsComponent,
                    { addPortal }
                ),
            });
        }, [props.prefixHeaderActionsComponent]);

        return (
            <div style={{ height: '100%', width: '100%' }} ref={domRef}>
                {portals}
            </div>
        );
    }
);
DockviewReact.displayName = 'DockviewComponent';
```

## File: packages/dockview/src/dockview/headerActionsRenderer.ts
```typescript
import React from 'react';
import { ReactPart, ReactPortalStore } from '../react';
import {
    DockviewCompositeDisposable,
    DockviewMutableDisposable,
    DockviewApi,
    DockviewGroupPanel,
    DockviewGroupPanelApi,
    PanelUpdateEvent,
    IHeaderActionsRenderer,
    IDockviewHeaderActionsProps,
} from 'dockview-core';

export class ReactHeaderActionsRendererPart implements IHeaderActionsRenderer {
    private readonly mutableDisposable = new DockviewMutableDisposable();
    private readonly _element: HTMLElement;
    private _part?: ReactPart<IDockviewHeaderActionsProps>;

    get element(): HTMLElement {
        return this._element;
    }

    get part(): ReactPart<IDockviewHeaderActionsProps> | undefined {
        return this._part;
    }

    constructor(
        private readonly component: React.FunctionComponent<IDockviewHeaderActionsProps>,
        private readonly reactPortalStore: ReactPortalStore,
        private readonly _group: DockviewGroupPanel
    ) {
        this._element = document.createElement('div');
        this._element.className = 'dv-react-part';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    init(parameters: {
        containerApi: DockviewApi;
        api: DockviewGroupPanelApi;
    }): void {
        this.mutableDisposable.value = new DockviewCompositeDisposable(
            this._group.model.onDidAddPanel(() => {
                this.updatePanels();
            }),
            this._group.model.onDidRemovePanel(() => {
                this.updatePanels();
            }),
            this._group.model.onDidActivePanelChange(() => {
                this.updateActivePanel();
            }),
            parameters.api.onDidActiveChange(() => {
                this.updateGroupActive();
            })
        );

        this._part = new ReactPart(
            this.element,
            this.reactPortalStore,
            this.component,
            {
                api: parameters.api,
                containerApi: parameters.containerApi,
                panels: this._group.model.panels,
                activePanel: this._group.model.activePanel,
                isGroupActive: this._group.api.isActive,
                group: this._group,
            }
        );
    }

    dispose(): void {
        this.mutableDisposable.dispose();
        this._part?.dispose();
    }

    update(event: PanelUpdateEvent): void {
        this._part?.update(event.params);
    }

    private updatePanels(): void {
        this.update({ params: { panels: this._group.model.panels } });
    }

    private updateActivePanel(): void {
        this.update({
            params: {
                activePanel: this._group.model.activePanel,
            },
        });
    }

    private updateGroupActive(): void {
        this.update({
            params: {
                isGroupActive: this._group.api.isActive,
            },
        });
    }
}
```

## File: packages/dockview/src/dockview/reactContentPart.ts
```typescript
import React from 'react';
import { ReactPart, ReactPortalStore } from '../react';
import {
    DockviewEmitter,
    DockviewEvent,
    PanelUpdateEvent,
    IContentRenderer,
    GroupPanelPartInitParameters,
    IDockviewPanelProps,
} from 'dockview-core';

export class ReactPanelContentPart implements IContentRenderer {
    private readonly _element: HTMLElement;
    private part?: ReactPart<IDockviewPanelProps>;

    private readonly _onDidFocus = new DockviewEmitter<void>();
    readonly onDidFocus: DockviewEvent<void> = this._onDidFocus.event;

    private readonly _onDidBlur = new DockviewEmitter<void>();
    readonly onDidBlur: DockviewEvent<void> = this._onDidBlur.event;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        public readonly id: string,
        private readonly component: React.FunctionComponent<IDockviewPanelProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        this._element = document.createElement('div');
        this._element.className = 'dv-react-part';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    focus(): void {
        // TODO
    }

    public init(parameters: GroupPanelPartInitParameters): void {
        this.part = new ReactPart(
            this.element,
            this.reactPortalStore,
            this.component,
            {
                params: parameters.params,
                api: parameters.api,
                containerApi: parameters.containerApi,
            }
        );
    }

    public update(event: PanelUpdateEvent) {
        this.part?.update({ params: event.params });
    }

    public layout(_width: number, _height: number): void {
        // noop
    }

    public dispose(): void {
        this._onDidFocus.dispose();
        this._onDidBlur.dispose();
        this.part?.dispose();
    }
}
```

## File: packages/dockview/src/dockview/reactHeaderPart.ts
```typescript
import React from 'react';
import { ReactPart, ReactPortalStore } from '../react';
import {
    PanelUpdateEvent,
    ITabRenderer,
    TabPartInitParameters,
    IDockviewPanelHeaderProps,
} from 'dockview-core';

export class ReactPanelHeaderPart implements ITabRenderer {
    private readonly _element: HTMLElement;
    private part?: ReactPart<IDockviewPanelHeaderProps>;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        public readonly id: string,
        private readonly component: React.FunctionComponent<IDockviewPanelHeaderProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        this._element = document.createElement('div');
        this._element.className = 'dv-react-part';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    focus(): void {
        //noop
    }

    public init(parameters: TabPartInitParameters): void {
        this.part = new ReactPart(
            this.element,
            this.reactPortalStore,
            this.component,
            {
                params: parameters.params,
                api: parameters.api,
                containerApi: parameters.containerApi,
                tabLocation: parameters.tabLocation,
            }
        );
    }

    public update(event: PanelUpdateEvent): void {
        this.part?.update({ params: event.params });
    }

    public layout(_width: number, _height: number): void {
        // noop - retrieval from api
    }

    public dispose(): void {
        this.part?.dispose();
    }
}
```

## File: packages/dockview/src/dockview/reactWatermarkPart.ts
```typescript
import React from 'react';
import { ReactPart, ReactPortalStore } from '../react';
import {
    PanelUpdateEvent,
    GroupPanelPartInitParameters,
    IWatermarkRenderer,
    WatermarkRendererInitParameters,
    IWatermarkPanelProps,
} from 'dockview-core';

export class ReactWatermarkPart implements IWatermarkRenderer {
    private readonly _element: HTMLElement;
    private part?: ReactPart<IWatermarkPanelProps>;
    private readonly parameters: GroupPanelPartInitParameters | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        public readonly id: string,
        private readonly component: React.FunctionComponent<IWatermarkPanelProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        this._element = document.createElement('div');
        this._element.className = 'dv-react-part';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    init(parameters: WatermarkRendererInitParameters): void {
        this.part = new ReactPart(
            this.element,
            this.reactPortalStore,
            this.component,
            {
                group: parameters.group,
                containerApi: parameters.containerApi,
            }
        );
    }

    focus(): void {
        // noop
    }

    update(params: PanelUpdateEvent): void {
        if (this.parameters) {
            this.parameters.params = params.params;
        }

        this.part?.update({ params: this.parameters?.params ?? {} });
    }

    layout(_width: number, _height: number): void {
        // noop - retrieval from api
    }

    dispose(): void {
        this.part?.dispose();
    }
}
```

## File: packages/dockview/src/gridview/gridview.tsx
```typescript
import React from 'react';
import {
    GridviewPanelApi,
    GridviewApi,
    createGridview,
    GridviewOptions,
    PROPERTY_KEYS_GRIDVIEW,
    GridviewComponentOptions,
    GridviewFrameworkOptions,
} from 'dockview-core';
import { ReactGridPanelView } from './view';
import { usePortalsLifecycle } from '../react';
import { PanelParameters } from '../types';

export interface GridviewReadyEvent {
    api: GridviewApi;
}

export interface IGridviewPanelProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: GridviewPanelApi;
    containerApi: GridviewApi;
}

export interface IGridviewReactProps extends GridviewOptions {
    onReady: (event: GridviewReadyEvent) => void;
    components: Record<string, React.FunctionComponent<IGridviewPanelProps>>;
}

function extractCoreOptions(props: IGridviewReactProps): GridviewOptions {
    const coreOptions = PROPERTY_KEYS_GRIDVIEW.reduce((obj, key) => {
        if (key in props) {
            obj[key] = props[key] as any;
        }
        return obj;
    }, {} as Partial<GridviewComponentOptions>);

    return coreOptions as GridviewOptions;
}

export const GridviewReact = React.forwardRef(
    (props: IGridviewReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const gridviewRef = React.useRef<GridviewApi>();
        const [portals, addPortal] = usePortalsLifecycle();

        React.useImperativeHandle(ref, () => domRef.current!, []);

        const prevProps = React.useRef<Partial<IGridviewReactProps>>({});

        React.useEffect(
            () => {
                const changes: Partial<GridviewOptions> = {};

                PROPERTY_KEYS_GRIDVIEW.forEach((propKey) => {
                    const key = propKey;
                    const propValue = props[key];

                    if (key in props && propValue !== prevProps.current[key]) {
                        changes[key] = propValue as any;
                    }
                });

                if (gridviewRef.current) {
                    gridviewRef.current.updateOptions(changes);
                } else {
                    // not yet fully initialized
                }

                prevProps.current = props;
            },
            PROPERTY_KEYS_GRIDVIEW.map((key) => props[key])
        );

        React.useEffect(() => {
            if (!domRef.current) {
                return () => {
                    // noop
                };
            }

            const frameworkOptions: GridviewFrameworkOptions = {
                createComponent: (options) => {
                    return new ReactGridPanelView(
                        options.id,
                        options.name,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            };

            const api = createGridview(domRef.current, {
                ...extractCoreOptions(props),
                ...frameworkOptions,
            });

            const { clientWidth, clientHeight } = domRef.current;
            api.layout(clientWidth, clientHeight);

            if (props.onReady) {
                props.onReady({ api });
            }

            gridviewRef.current = api;

            return () => {
                gridviewRef.current = undefined;
                api.dispose();
            };
        }, []);

        React.useEffect(() => {
            if (!gridviewRef.current) {
                return;
            }
            gridviewRef.current.updateOptions({
                createComponent: (options) => {
                    return new ReactGridPanelView(
                        options.id,
                        options.name,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            });
        }, [props.components]);

        return (
            <div style={{ height: '100%', width: '100%' }} ref={domRef}>
                {portals}
            </div>
        );
    }
);
GridviewReact.displayName = 'GridviewComponent';
```

## File: packages/dockview/src/gridview/view.ts
```typescript
import {
    GridviewApi,
    GridviewPanel,
    GridviewInitParameters,
    IFrameworkPart,
    GridviewComponent,
} from 'dockview-core';
import { ReactPart, ReactPortalStore } from '../react';
import { IGridviewPanelProps } from './gridview';

export class ReactGridPanelView extends GridviewPanel {
    constructor(
        id: string,
        component: string,
        private readonly reactComponent: React.FunctionComponent<IGridviewPanelProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        super(id, component);
    }

    getComponent(): IFrameworkPart {
        return new ReactPart(
            this.element,
            this.reactPortalStore,
            this.reactComponent,
            {
                params: this._params?.params ?? {},
                api: this.api,
                // TODO: fix casting hack
                containerApi: new GridviewApi(
                    (this._params as GridviewInitParameters)
                        .accessor as GridviewComponent
                ),
            }
        );
    }
}
```

## File: packages/dockview/src/paneview/paneview.tsx
```typescript
import React from 'react';
import {
    PaneviewPanelApi,
    PaneviewApi,
    PaneviewDropEvent,
    createPaneview,
    PaneviewOptions,
    PROPERTY_KEYS_PANEVIEW,
    PaneviewComponentOptions,
    PaneviewFrameworkOptions,
} from 'dockview-core';
import { usePortalsLifecycle } from '../react';
import { PanePanelSection } from './view';
import { PanelParameters } from '../types';

export interface PaneviewReadyEvent {
    api: PaneviewApi;
}

export interface IPaneviewPanelProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: PaneviewPanelApi;
    containerApi: PaneviewApi;
    title: string;
}

export interface IPaneviewReactProps extends PaneviewOptions {
    onReady: (event: PaneviewReadyEvent) => void;
    components: Record<string, React.FunctionComponent<IPaneviewPanelProps>>;
    headerComponents?: Record<
        string,
        React.FunctionComponent<IPaneviewPanelProps>
    >;
    onDidDrop?(event: PaneviewDropEvent): void;
}

function extractCoreOptions(props: IPaneviewReactProps): PaneviewOptions {
    const coreOptions = PROPERTY_KEYS_PANEVIEW.reduce((obj, key) => {
        if (key in props) {
            obj[key] = props[key] as any;
        }
        return obj;
    }, {} as Partial<PaneviewComponentOptions>);

    return coreOptions as PaneviewOptions;
}

export const PaneviewReact = React.forwardRef(
    (props: IPaneviewReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const paneviewRef = React.useRef<PaneviewApi>();
        const [portals, addPortal] = usePortalsLifecycle();

        React.useImperativeHandle(ref, () => domRef.current!, []);

        const prevProps = React.useRef<Partial<IPaneviewReactProps>>({});

        React.useEffect(
            () => {
                const changes: Partial<PaneviewOptions> = {};

                PROPERTY_KEYS_PANEVIEW.forEach((propKey) => {
                    const key = propKey;
                    const propValue = props[key];

                    if (key in props && propValue !== prevProps.current[key]) {
                        changes[key] = propValue as any;
                    }
                });

                if (paneviewRef.current) {
                    paneviewRef.current.updateOptions(changes);
                } else {
                    // not yet fully initialized
                }

                prevProps.current = props;
            },
            PROPERTY_KEYS_PANEVIEW.map((key) => props[key])
        );

        React.useEffect(() => {
            if (!domRef.current) {
                return () => {
                    // noop
                };
            }

            const headerComponents = props.headerComponents ?? {};

            const frameworkOptions: PaneviewFrameworkOptions = {
                createComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        props.components[options.name],
                        { addPortal }
                    );
                },
                createHeaderComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        headerComponents[options.name],
                        { addPortal }
                    );
                },
            };

            const api = createPaneview(domRef.current, {
                ...extractCoreOptions(props),
                ...frameworkOptions,
            });

            const { clientWidth, clientHeight } = domRef.current;
            api.layout(clientWidth, clientHeight);

            if (props.onReady) {
                props.onReady({ api });
            }

            paneviewRef.current = api;

            return () => {
                paneviewRef.current = undefined;
                api.dispose();
            };
        }, []);

        React.useEffect(() => {
            if (!paneviewRef.current) {
                return;
            }
            paneviewRef.current.updateOptions({
                createComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            });
        }, [props.components]);

        React.useEffect(() => {
            if (!paneviewRef.current) {
                return;
            }

            const headerComponents = props.headerComponents ?? {};

            paneviewRef.current.updateOptions({
                createHeaderComponent: (options) => {
                    return new PanePanelSection(
                        options.id,
                        headerComponents[options.name],
                        { addPortal }
                    );
                },
            });
        }, [props.headerComponents]);

        React.useEffect(() => {
            if (!paneviewRef.current) {
                return () => {
                    // noop
                };
            }

            const disposable = paneviewRef.current.onDidDrop((event) => {
                if (props.onDidDrop) {
                    props.onDidDrop(event);
                }
            });

            return () => {
                disposable.dispose();
            };
        }, [props.onDidDrop]);

        return (
            <div style={{ height: '100%', width: '100%' }} ref={domRef}>
                {portals}
            </div>
        );
    }
);
PaneviewReact.displayName = 'PaneviewComponent';
```

## File: packages/dockview/src/paneview/view.ts
```typescript
import React from 'react';
import {
    PanelUpdateEvent,
    IPanePart,
    PanePanelComponentInitParameter,
} from 'dockview-core';
import { ReactPart, ReactPortalStore } from '../react';
import { IPaneviewPanelProps } from './paneview';

export class PanePanelSection implements IPanePart {
    private readonly _element: HTMLElement;
    private part?: ReactPart<IPaneviewPanelProps>;

    get element() {
        return this._element;
    }

    constructor(
        public readonly id: string,
        private readonly component: React.FunctionComponent<IPaneviewPanelProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        this._element = document.createElement('div');
        this._element.style.height = '100%';
        this._element.style.width = '100%';
    }

    public init(parameters: PanePanelComponentInitParameter): void {
        this.part = new ReactPart(
            this.element,
            this.reactPortalStore,
            this.component,
            {
                params: parameters.params,
                api: parameters.api,
                title: parameters.title,
                containerApi: parameters.containerApi,
            }
        );
    }

    public toJSON() {
        return {
            id: this.id,
        };
    }

    public update(params: PanelUpdateEvent) {
        this.part?.update(params.params);
    }

    public dispose() {
        this.part?.dispose();
    }
}
```

## File: packages/dockview/src/splitview/splitview.tsx
```typescript
import React from 'react';
import {
    SplitviewApi,
    SplitviewPanelApi,
    createSplitview,
    SplitviewOptions,
    PROPERTY_KEYS_SPLITVIEW,
    SplitviewFrameworkOptions,
    SplitviewComponentOptions,
} from 'dockview-core';
import { usePortalsLifecycle } from '../react';
import { PanelParameters } from '../types';
import { ReactPanelView } from './view';

export interface SplitviewReadyEvent {
    api: SplitviewApi;
}

export interface ISplitviewPanelProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: SplitviewPanelApi;
    containerApi: SplitviewApi;
}

export interface ISplitviewReactProps extends SplitviewOptions {
    onReady: (event: SplitviewReadyEvent) => void;
    components: Record<string, React.FunctionComponent<ISplitviewPanelProps>>;
}

function extractCoreOptions(props: ISplitviewReactProps): SplitviewOptions {
    const coreOptions = PROPERTY_KEYS_SPLITVIEW.reduce((obj, key) => {
        if (key in props) {
            obj[key] = props[key] as any;
        }
        return obj;
    }, {} as Partial<SplitviewComponentOptions>);

    return coreOptions as SplitviewOptions;
}

export const SplitviewReact = React.forwardRef(
    (props: ISplitviewReactProps, ref: React.ForwardedRef<HTMLDivElement>) => {
        const domRef = React.useRef<HTMLDivElement>(null);
        const splitviewRef = React.useRef<SplitviewApi>();
        const [portals, addPortal] = usePortalsLifecycle();

        React.useImperativeHandle(ref, () => domRef.current!, []);

        const prevProps = React.useRef<Partial<ISplitviewReactProps>>({});

        React.useEffect(
            () => {
                const changes: Partial<SplitviewOptions> = {};

                PROPERTY_KEYS_SPLITVIEW.forEach((propKey) => {
                    const key = propKey;
                    const propValue = props[key];

                    if (key in props && propValue !== prevProps.current[key]) {
                        changes[key] = propValue as any;
                    }
                });

                if (splitviewRef.current) {
                    splitviewRef.current.updateOptions(changes);
                } else {
                    // not yet fully initialized
                }

                prevProps.current = props;
            },
            PROPERTY_KEYS_SPLITVIEW.map((key) => props[key])
        );

        React.useEffect(() => {
            if (!domRef.current) {
                return () => {
                    // noop
                };
            }

            const frameworkOptions: SplitviewFrameworkOptions = {
                createComponent: (options) => {
                    return new ReactPanelView(
                        options.id,
                        options.name,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            };

            const api = createSplitview(domRef.current, {
                ...extractCoreOptions(props),
                ...frameworkOptions,
            });

            const { clientWidth, clientHeight } = domRef.current;
            api.layout(clientWidth, clientHeight);

            if (props.onReady) {
                props.onReady({ api });
            }

            splitviewRef.current = api;

            return () => {
                splitviewRef.current = undefined;
                api.dispose();
            };
        }, []);

        React.useEffect(() => {
            if (!splitviewRef.current) {
                return;
            }
            splitviewRef.current.updateOptions({
                createComponent: (options) => {
                    return new ReactPanelView(
                        options.id,
                        options.name,
                        props.components[options.name],
                        { addPortal }
                    );
                },
            });
        }, [props.components]);

        return (
            <div style={{ height: '100%', width: '100%' }} ref={domRef}>
                {portals}
            </div>
        );
    }
);
SplitviewReact.displayName = 'SplitviewComponent';
```

## File: packages/dockview/src/splitview/view.ts
```typescript
import {
    SplitviewApi,
    PanelViewInitParameters,
    SplitviewPanel,
} from 'dockview-core';
import { ReactPart, ReactPortalStore } from '../react';
import { ISplitviewPanelProps } from './splitview';

export class ReactPanelView extends SplitviewPanel {
    constructor(
        id: string,
        component: string,
        private readonly reactComponent: React.FunctionComponent<ISplitviewPanelProps>,
        private readonly reactPortalStore: ReactPortalStore
    ) {
        super(id, component);
    }

    getComponent(): ReactPart<ISplitviewPanelProps> {
        return new ReactPart(
            this.element,
            this.reactPortalStore,
            this.reactComponent,
            {
                params: this._params?.params ?? {},
                api: this.api,
                containerApi: new SplitviewApi(
                    (this._params as PanelViewInitParameters).accessor
                ),
            }
        );
    }
}
```

## File: packages/dockview/src/index.ts
```typescript
export * from 'dockview-core';

export * from './dockview/dockview';
export * from './dockview/defaultTab';
export * from './splitview/splitview';
export * from './gridview/gridview';
export * from './paneview/paneview';
export * from './types';
export * from './react';
```

## File: packages/dockview/src/react.ts
```typescript
import React from 'react';
import ReactDOM from 'react-dom';
import {
    DockviewDisposable,
    IFrameworkPart,
    DockviewIDisposable,
    Parameters,
} from 'dockview-core';

export interface ReactPortalStore {
    addPortal: (portal: React.ReactPortal) => DockviewIDisposable;
}

interface IPanelWrapperProps {
    component: React.FunctionComponent<{ [key: string]: any }>;
    componentProps: { [key: string]: any };
}

interface IPanelWrapperRef {
    update: (props: { [key: string]: any }) => void;
}

/**
 * This component is intended to interface between vanilla-js and React hence we need to be
 * creative in how we update props.
 * A ref of the component is exposed with an update method; which when called stores the props
 * as a ref within this component and forcefully triggers a re-render of the component using
 * the ref of props we just set on the renderered component as the props passed to the inner
 * component
 */
const ReactComponentBridge: React.ForwardRefRenderFunction<
    IPanelWrapperRef,
    IPanelWrapperProps
> = (props, ref) => {
    const [_, triggerRender] = React.useState<number>();
    const _props = React.useRef<object>(props.componentProps);

    React.useImperativeHandle(
        ref,
        () => ({
            update: (componentProps: object) => {
                _props.current = { ..._props.current, ...componentProps };
                /**
                 * setting a arbitrary piece of state within this component will
                 * trigger a re-render.
                 * we use this rather than updating through a prop since we can
                 * pass a ref into the vanilla-js world.
                 */
                triggerRender(Date.now());
            },
        }),
        []
    );

    return React.createElement(props.component, _props.current);
};
ReactComponentBridge.displayName = 'DockviewReactJsBridge';

/**
 * Since we are storing the React.Portal references in a rendered array they
 * require a key property like any other React element rendered in an array
 * to prevent excessive re-rendering
 */
const uniquePortalKeyGenerator = (() => {
    let value = 1;
    return { next: () => `dockview_react_portal_key_${(value++).toString()}` };
})();

export const ReactPartContext = React.createContext<{}>({});

export class ReactPart<P extends object, C extends object = {}>
    implements IFrameworkPart
{
    private _initialProps: Parameters = {};
    private componentInstance?: IPanelWrapperRef;
    private ref?: {
        portal: React.ReactPortal;
        disposable: DockviewIDisposable;
    };
    private disposed = false;

    constructor(
        private readonly parent: HTMLElement,
        private readonly portalStore: ReactPortalStore,
        private readonly component: React.FunctionComponent<P>,
        private readonly parameters: P,
        private readonly context?: C
    ) {
        this.createPortal();
    }

    public update(props: { [index: string]: any }) {
        if (this.disposed) {
            throw new Error('invalid operation: resource is already disposed');
        }

        if (!this.componentInstance) {
            // if the component is yet to be mounted store the props
            this._initialProps = { ...this._initialProps, ...props };
        } else {
            this.componentInstance.update(props);
        }
    }

    private createPortal() {
        if (this.disposed) {
            throw new Error('invalid operation: resource is already disposed');
        }

        if (!isReactComponent(this.component)) {
            /**
             * we know this isn't a React.FunctionComponent so throw an error here.
             * if we do not intercept then React library will throw a very obsure error
             * for the same reason... at least at this point we will emit a sensible stacktrace.
             */
            throw new Error(
                'Dockview: Only React.memo(...), React.ForwardRef(...) and functional components are accepted as components'
            );
        }

        const bridgeComponent = React.createElement(
            React.forwardRef(ReactComponentBridge),
            {
                component: this
                    .component as unknown as React.FunctionComponent<{}>,
                componentProps: this.parameters as unknown as {},
                ref: (element: IPanelWrapperRef) => {
                    this.componentInstance = element;

                    if (Object.keys(this._initialProps).length > 0) {
                        this.componentInstance.update(this._initialProps);
                        this._initialProps = {}; // don't keep a reference to the users object once no longer required
                    }
                },
            }
        );

        const node = this.context
            ? React.createElement(
                  ReactPartContext.Provider,
                  { value: this.context },
                  bridgeComponent
              )
            : bridgeComponent;

        const portal = ReactDOM.createPortal(
            node,
            this.parent,
            uniquePortalKeyGenerator.next()
        );

        this.ref = {
            portal,
            disposable: this.portalStore.addPortal(portal),
        };
    }

    public dispose() {
        this.ref?.disposable.dispose();
        this.disposed = true;
    }
}

type PortalLifecycleHook = () => [
    React.ReactPortal[],
    (portal: React.ReactPortal) => DockviewIDisposable
];

/**
 * A React Hook that returns an array of portals to be rendered by the user of this hook
 * and a disposable function to add a portal. Calling dispose removes this portal from the
 * portal array
 */
export const usePortalsLifecycle: PortalLifecycleHook = () => {
    const [portals, setPortals] = React.useState<React.ReactPortal[]>([]);

    React.useDebugValue(`Portal count: ${portals.length}`);

    const addPortal = React.useCallback((portal: React.ReactPortal) => {
        setPortals((existingPortals) => [...existingPortals, portal]);
        let disposed = false;
        return DockviewDisposable.from(() => {
            if (disposed) {
                throw new Error('invalid operation: resource already disposed');
            }
            disposed = true;
            setPortals((existingPortals) =>
                existingPortals.filter((p) => p !== portal)
            );
        });
    }, []);

    return [portals, addPortal];
};

export function isReactComponent(component: any): boolean {
    /**
     * Yes, we could use "react-is" but that would introduce an unwanted peer dependency
     * so for now we will check in a rather crude fashion...
     */
    return (
        typeof component === 'function' /** Functional Componnts */ ||
        !!(component as React.ExoticComponent)
            ?.$$typeof /** React.memo(...) Components */
    );
}
```

## File: packages/dockview/src/svg.tsx
```typescript
import React from 'react';

export const CloseButton = () => (
    <svg
        height="11"
        width="11"
        viewBox="0 0 28 28"
        aria-hidden={'false'}
        focusable={false}
        className="dv-svg"
    >
        <path d="M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z"></path>
    </svg>
);

export const ExpandMore = () => {
    return (
        <svg
            width="11"
            height="11"
            viewBox="0 0 24 15"
            aria-hidden={'false'}
            focusable={false}
            className="dv-svg"
        >
            <path d="M12 14.15L0 2.15L2.15 0L12 9.9L21.85 0.0499992L24 2.2L12 14.15Z" />
        </svg>
    );
};
```

## File: packages/dockview/src/types.ts
```typescript
import { Parameters } from 'dockview-core';

export interface PanelParameters<T extends {} = Parameters> {
    params: T;
}
```

## File: packages/dockview/package.json
```json
{
  "name": "dockview",
  "version": "4.13.1",
  "description": "Zero dependency layout manager supporting tabs, grids and splitviews",
  "keywords": [
    "splitview",
    "split-view",
    "gridview",
    "grid-view",
    "dockview",
    "dock-view",
    "grid",
    "tabs",
    "layout",
    "layout manager",
    "dock layout",
    "dock",
    "docking",
    "splitter",
    "drag-and-drop",
    "drag",
    "drop",
    "react",
    "react-component"
  ],
  "homepage": "https://github.com/mathuo/dockview",
  "bugs": {
    "url": "https://github.com/mathuo/dockview/issues"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/mathuo/dockview.git"
  },
  "license": "MIT",
  "author": "https://github.com/mathuo",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/cjs/index.d.ts",
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build:bundle": "rollup -c",
    "build:cjs": "cross-env ../../node_modules/.bin/tsc --build ./tsconfig.json --verbose --extendedDiagnostics",
    "build:css": "node scripts/copy-css.js",
    "build:esm": "cross-env ../../node_modules/.bin/tsc --build ./tsconfig.esm.json --verbose --extendedDiagnostics",
    "build": "npm run build:cjs && npm run build:esm && npm run build:css",
    "clean": "rimraf dist/ .build/ .rollup.cache/",
    "prepublishOnly": "npm run rebuild && npm run build:bundle && npm run test",
    "rebuild": "npm run clean && npm run build",
    "test": "cross-env ../../node_modules/.bin/jest --selectProjects dockview",
    "test:cov": "cross-env ../../node_modules/.bin/jest --selectProjects dockview --coverage"
  },
  "dependencies": {
    "dockview-core": "^4.13.1"
  },
  "peerDependencies": {
    "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"
  }
}
```

## File: packages/dockview-core/src/api/component.api.ts
```typescript
import {
    DockviewMaximizedGroupChanged,
    FloatingGroupOptions,
    IDockviewComponent,
    MovePanelEvent,
    PopoutGroupChangePositionEvent,
    PopoutGroupChangeSizeEvent,
    SerializedDockview,
} from '../dockview/dockviewComponent';
import {
    AddGroupOptions,
    AddPanelOptions,
    DockviewComponentOptions,
    DockviewDndOverlayEvent,
    MovementOptions,
} from '../dockview/options';
import { Parameters } from '../panel/types';
import { Direction } from '../gridview/baseComponentGridview';
import {
    AddComponentOptions,
    IGridviewComponent,
    SerializedGridviewComponent,
} from '../gridview/gridviewComponent';
import { IGridviewPanel } from '../gridview/gridviewPanel';

import {
    AddPaneviewComponentOptions,
    SerializedPaneview,
    IPaneviewComponent,
} from '../paneview/paneviewComponent';
import { IPaneviewPanel } from '../paneview/paneviewPanel';
import {
    AddSplitviewComponentOptions,
    ISplitviewComponent,
    SerializedSplitview,
} from '../splitview/splitviewComponent';
import { IView, Orientation, Sizing } from '../splitview/splitview';
import { ISplitviewPanel } from '../splitview/splitviewPanel';
import {
    DockviewGroupPanel,
    IDockviewGroupPanel,
} from '../dockview/dockviewGroupPanel';
import { Event } from '../events';
import { IDockviewPanel } from '../dockview/dockviewPanel';
import { PaneviewDidDropEvent } from '../paneview/draggablePaneviewPanel';
import {
    GroupDragEvent,
    TabDragEvent,
} from '../dockview/components/titlebar/tabsContainer';
import { Box } from '../types';
import {
    DockviewDidDropEvent,
    DockviewWillDropEvent,
} from '../dockview/dockviewGroupPanelModel';
import { DockviewWillShowOverlayLocationEvent } from '../dockview/events';
import {
    PaneviewComponentOptions,
    PaneviewDndOverlayEvent,
} from '../paneview/options';
import { SplitviewComponentOptions } from '../splitview/options';
import { GridviewComponentOptions } from '../gridview/options';

export interface CommonApi<T = any> {
    readonly height: number;
    readonly width: number;
    readonly onDidLayoutChange: Event<void>;
    readonly onDidLayoutFromJSON: Event<void>;
    focus(): void;
    layout(width: number, height: number): void;
    fromJSON(data: T): void;
    toJSON(): T;
    clear(): void;
    dispose(): void;
}

export class SplitviewApi implements CommonApi<SerializedSplitview> {
    /**
     * The minimum size  the component can reach where size is measured in the direction of orientation provided.
     */
    get minimumSize(): number {
        return this.component.minimumSize;
    }

    /**
     * The maximum size the component can reach where size is measured in the direction of orientation provided.
     */
    get maximumSize(): number {
        return this.component.maximumSize;
    }

    /**
     * Width of the component.
     */
    get width(): number {
        return this.component.width;
    }

    /**
     * Height of the component.
     */
    get height(): number {
        return this.component.height;
    }
    /**
     * The current number of panels.
     */
    get length(): number {
        return this.component.length;
    }

    /**
     * The current orientation of the component.
     */
    get orientation(): Orientation {
        return this.component.orientation;
    }

    /**
     * The list of current panels.
     */
    get panels(): ISplitviewPanel[] {
        return this.component.panels;
    }

    /**
     * Invoked after a layout is loaded through the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * Invoked whenever any aspect of the layout changes.
     * If listening to this event it may be worth debouncing ouputs.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked when a view is added.
     */
    get onDidAddView(): Event<IView> {
        return this.component.onDidAddView;
    }

    /**
     * Invoked when a view is removed.
     */
    get onDidRemoveView(): Event<IView> {
        return this.component.onDidRemoveView;
    }

    constructor(private readonly component: ISplitviewComponent) {}

    /**
     * Removes an existing panel and optionally provide a `Sizing` method
     * for the subsequent resize.
     */
    removePanel(panel: ISplitviewPanel, sizing?: Sizing): void {
        this.component.removePanel(panel, sizing);
    }

    /**
     * Focus the component.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Get the reference to a panel given it's `string` id.
     */
    getPanel(id: string): ISplitviewPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Layout the panel with a width and height.
     */
    layout(width: number, height: number): void {
        return this.component.layout(width, height);
    }

    /**
     * Add a new panel and return the created instance.
     */
    addPanel<T extends object = Parameters>(
        options: AddSplitviewComponentOptions<T>
    ): ISplitviewPanel {
        return this.component.addPanel(options);
    }

    /**
     * Move a panel given it's current and desired index.
     */
    movePanel(from: number, to: number): void {
        this.component.movePanel(from, to);
    }

    /**
     * Deserialize a layout to built a splitivew.
     */
    fromJSON(data: SerializedSplitview): void {
        this.component.fromJSON(data);
    }

    /** Serialize a layout */
    toJSON(): SerializedSplitview {
        return this.component.toJSON();
    }

    /**
     * Remove all panels and clear the component.
     */
    clear(): void {
        this.component.clear();
    }

    /**
     * Update configuratable options.
     */
    updateOptions(options: Partial<SplitviewComponentOptions>): void {
        this.component.updateOptions(options);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        this.component.dispose();
    }
}

export class PaneviewApi implements CommonApi<SerializedPaneview> {
    /**
     * The minimum size  the component can reach where size is measured in the direction of orientation provided.
     */
    get minimumSize(): number {
        return this.component.minimumSize;
    }

    /**
     * The maximum size the component can reach where size is measured in the direction of orientation provided.
     */
    get maximumSize(): number {
        return this.component.maximumSize;
    }

    /**
     * Width of the component.
     */
    get width(): number {
        return this.component.width;
    }

    /**
     * Height of the component.
     */
    get height(): number {
        return this.component.height;
    }

    /**
     * All panel objects.
     */
    get panels(): IPaneviewPanel[] {
        return this.component.panels;
    }

    /**
     * Invoked when any layout change occures, an aggregation of many events.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked after a layout is deserialzied using the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * Invoked when a panel is added. May be called multiple times when moving panels.
     */
    get onDidAddView(): Event<IPaneviewPanel> {
        return this.component.onDidAddView;
    }

    /**
     * Invoked when a panel is removed. May be called multiple times when moving panels.
     */
    get onDidRemoveView(): Event<IPaneviewPanel> {
        return this.component.onDidRemoveView;
    }

    /**
     * Invoked when a Drag'n'Drop event occurs that the component was unable to handle. Exposed for custom Drag'n'Drop functionality.
     */
    get onDidDrop(): Event<PaneviewDidDropEvent> {
        return this.component.onDidDrop;
    }

    get onUnhandledDragOverEvent(): Event<PaneviewDndOverlayEvent> {
        return this.component.onUnhandledDragOverEvent;
    }

    constructor(private readonly component: IPaneviewComponent) {}

    /**
     * Remove a panel given the panel object.
     */
    removePanel(panel: IPaneviewPanel): void {
        this.component.removePanel(panel);
    }

    /**
     * Get a panel object given a `string` id. May return `undefined`.
     */
    getPanel(id: string): IPaneviewPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Move a panel given it's current and desired index.
     */
    movePanel(from: number, to: number): void {
        this.component.movePanel(from, to);
    }

    /**
     *  Focus the component. Will try to focus an active panel if one exists.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Force resize the component to an exact width and height. Read about auto-resizing before using.
     */
    layout(width: number, height: number): void {
        this.component.layout(width, height);
    }

    /**
     * Add a panel and return the created object.
     */
    addPanel<T extends object = Parameters>(
        options: AddPaneviewComponentOptions<T>
    ): IPaneviewPanel {
        return this.component.addPanel(options);
    }

    /**
     * Create a component from a serialized object.
     */
    fromJSON(data: SerializedPaneview): void {
        this.component.fromJSON(data);
    }

    /**
     * Create a serialized object of the current component.
     */
    toJSON(): SerializedPaneview {
        return this.component.toJSON();
    }

    /**
     * Reset the component back to an empty and default state.
     */
    clear(): void {
        this.component.clear();
    }

    /**
     * Update configuratable options.
     */
    updateOptions(options: Partial<PaneviewComponentOptions>): void {
        this.component.updateOptions(options);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        this.component.dispose();
    }
}

export class GridviewApi implements CommonApi<SerializedGridviewComponent> {
    /**
     * Width of the component.
     */
    get width(): number {
        return this.component.width;
    }

    /**
     * Height of the component.
     */
    get height(): number {
        return this.component.height;
    }

    /**
     * Minimum height of the component.
     */
    get minimumHeight(): number {
        return this.component.minimumHeight;
    }

    /**
     * Maximum height of the component.
     */
    get maximumHeight(): number {
        return this.component.maximumHeight;
    }

    /**
     * Minimum width of the component.
     */
    get minimumWidth(): number {
        return this.component.minimumWidth;
    }

    /**
     * Maximum width of the component.
     */
    get maximumWidth(): number {
        return this.component.maximumWidth;
    }

    /**
     * Invoked when any layout change occures, an aggregation of many events.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked when a panel is added. May be called multiple times when moving panels.
     */
    get onDidAddPanel(): Event<IGridviewPanel> {
        return this.component.onDidAddGroup;
    }

    /**
     * Invoked when a panel is removed. May be called multiple times when moving panels.
     */
    get onDidRemovePanel(): Event<IGridviewPanel> {
        return this.component.onDidRemoveGroup;
    }

    /**
     * Invoked when the active panel changes. May be undefined if no panel is active.
     */
    get onDidActivePanelChange(): Event<IGridviewPanel | undefined> {
        return this.component.onDidActiveGroupChange;
    }

    /**
     * Invoked after a layout is deserialzied using the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * All panel objects.
     */
    get panels(): IGridviewPanel[] {
        return this.component.groups;
    }

    /**
     * Current orientation. Can be changed after initialization.
     */
    get orientation(): Orientation {
        return this.component.orientation;
    }

    set orientation(value: Orientation) {
        this.component.updateOptions({ orientation: value });
    }

    constructor(private readonly component: IGridviewComponent) {}

    /**
     *  Focus the component. Will try to focus an active panel if one exists.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Force resize the component to an exact width and height. Read about auto-resizing before using.
     */
    layout(width: number, height: number, force = false): void {
        this.component.layout(width, height, force);
    }

    /**
     * Add a panel and return the created object.
     */
    addPanel<T extends object = Parameters>(
        options: AddComponentOptions<T>
    ): IGridviewPanel {
        return this.component.addPanel(options);
    }

    /**
     * Remove a panel given the panel object.
     */
    removePanel(panel: IGridviewPanel, sizing?: Sizing): void {
        this.component.removePanel(panel, sizing);
    }

    /**
     * Move a panel in a particular direction relative to another panel.
     */
    movePanel(
        panel: IGridviewPanel,
        options: { direction: Direction; reference: string; size?: number }
    ): void {
        this.component.movePanel(panel, options);
    }

    /**
     * Get a panel object given a `string` id. May return `undefined`.
     */
    getPanel(id: string): IGridviewPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Create a component from a serialized object.
     */
    fromJSON(data: SerializedGridviewComponent): void {
        return this.component.fromJSON(data);
    }

    /**
     * Create a serialized object of the current component.
     */
    toJSON(): SerializedGridviewComponent {
        return this.component.toJSON();
    }

    /**
     * Reset the component back to an empty and default state.
     */
    clear(): void {
        this.component.clear();
    }

    updateOptions(options: Partial<GridviewComponentOptions>) {
        this.component.updateOptions(options);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        this.component.dispose();
    }
}

export class DockviewApi implements CommonApi<SerializedDockview> {
    /**
     * The unique identifier for this instance. Used to manage scope of Drag'n'Drop events.
     */
    get id(): string {
        return this.component.id;
    }

    /**
     * Width of the component.
     */
    get width(): number {
        return this.component.width;
    }

    /**
     * Height of the component.
     */
    get height(): number {
        return this.component.height;
    }

    /**
     * Minimum height of the component.
     */
    get minimumHeight(): number {
        return this.component.minimumHeight;
    }

    /**
     * Maximum height of the component.
     */
    get maximumHeight(): number {
        return this.component.maximumHeight;
    }

    /**
     * Minimum width of the component.
     */
    get minimumWidth(): number {
        return this.component.minimumWidth;
    }

    /**
     * Maximum width of the component.
     */
    get maximumWidth(): number {
        return this.component.maximumWidth;
    }

    /**
     * Total number of groups.
     */
    get size(): number {
        return this.component.size;
    }

    /**
     * Total number of panels.
     */
    get totalPanels(): number {
        return this.component.totalPanels;
    }

    /**
     * Invoked when the active group changes. May be undefined if no group is active.
     */
    get onDidActiveGroupChange(): Event<DockviewGroupPanel | undefined> {
        return this.component.onDidActiveGroupChange;
    }

    /**
     * Invoked when a group is added. May be called multiple times when moving groups.
     */
    get onDidAddGroup(): Event<DockviewGroupPanel> {
        return this.component.onDidAddGroup;
    }

    /**
     * Invoked when a group is removed. May be called multiple times when moving groups.
     */
    get onDidRemoveGroup(): Event<DockviewGroupPanel> {
        return this.component.onDidRemoveGroup;
    }

    /**
     * Invoked when the active panel changes. May be undefined if no panel is active.
     */
    get onDidActivePanelChange(): Event<IDockviewPanel | undefined> {
        return this.component.onDidActivePanelChange;
    }

    /**
     * Invoked when a panel is added. May be called multiple times when moving panels.
     */
    get onDidAddPanel(): Event<IDockviewPanel> {
        return this.component.onDidAddPanel;
    }

    /**
     * Invoked when a panel is removed. May be called multiple times when moving panels.
     */
    get onDidRemovePanel(): Event<IDockviewPanel> {
        return this.component.onDidRemovePanel;
    }

    get onDidMovePanel(): Event<MovePanelEvent> {
        return this.component.onDidMovePanel;
    }

    /**
     * Invoked after a layout is deserialzied using the `fromJSON` method.
     */
    get onDidLayoutFromJSON(): Event<void> {
        return this.component.onDidLayoutFromJSON;
    }

    /**
     * Invoked when any layout change occures, an aggregation of many events.
     */
    get onDidLayoutChange(): Event<void> {
        return this.component.onDidLayoutChange;
    }

    /**
     * Invoked when a Drag'n'Drop event occurs that the component was unable to handle. Exposed for custom Drag'n'Drop functionality.
     */
    get onDidDrop(): Event<DockviewDidDropEvent> {
        return this.component.onDidDrop;
    }

    /**
     * Invoked when a Drag'n'Drop event occurs but before dockview handles it giving the user an opportunity to intecept and
     * prevent the event from occuring using the standard `preventDefault()` syntax.
     *
     * Preventing certain events may causes unexpected behaviours, use carefully.
     */
    get onWillDrop(): Event<DockviewWillDropEvent> {
        return this.component.onWillDrop;
    }

    /**
     * Invoked before an overlay is shown indicating a drop target.
     *
     * Calling `event.preventDefault()` will prevent the overlay being shown and prevent
     * the any subsequent drop event.
     */
    get onWillShowOverlay(): Event<DockviewWillShowOverlayLocationEvent> {
        return this.component.onWillShowOverlay;
    }

    /**
     * Invoked before a group is dragged.
     *
     * Calling `event.nativeEvent.preventDefault()` will prevent the group drag starting.
     *
     */
    get onWillDragGroup(): Event<GroupDragEvent> {
        return this.component.onWillDragGroup;
    }

    /**
     * Invoked before a panel is dragged.
     *
     * Calling `event.nativeEvent.preventDefault()` will prevent the panel drag starting.
     */
    get onWillDragPanel(): Event<TabDragEvent> {
        return this.component.onWillDragPanel;
    }

    get onUnhandledDragOverEvent(): Event<DockviewDndOverlayEvent> {
        return this.component.onUnhandledDragOverEvent;
    }

    get onDidPopoutGroupSizeChange(): Event<PopoutGroupChangeSizeEvent> {
        return this.component.onDidPopoutGroupSizeChange;
    }

    get onDidPopoutGroupPositionChange(): Event<PopoutGroupChangePositionEvent> {
        return this.component.onDidPopoutGroupPositionChange;
    }

    get onDidOpenPopoutWindowFail(): Event<void> {
        return this.component.onDidOpenPopoutWindowFail;
    }

    /**
     * All panel objects.
     */
    get panels(): IDockviewPanel[] {
        return this.component.panels;
    }

    /**
     * All group objects.
     */
    get groups(): DockviewGroupPanel[] {
        return this.component.groups;
    }

    /**
     *  Active panel object.
     */
    get activePanel(): IDockviewPanel | undefined {
        return this.component.activePanel;
    }

    /**
     * Active group object.
     */
    get activeGroup(): DockviewGroupPanel | undefined {
        return this.component.activeGroup;
    }

    constructor(private readonly component: IDockviewComponent) {}

    /**
     *  Focus the component. Will try to focus an active panel if one exists.
     */
    focus(): void {
        this.component.focus();
    }

    /**
     * Get a panel object given a `string` id. May return `undefined`.
     */
    getPanel(id: string): IDockviewPanel | undefined {
        return this.component.getGroupPanel(id);
    }

    /**
     * Force resize the component to an exact width and height. Read about auto-resizing before using.
     */
    layout(width: number, height: number, force = false): void {
        this.component.layout(width, height, force);
    }

    /**
     * Add a panel and return the created object.
     */
    addPanel<T extends object = Parameters>(
        options: AddPanelOptions<T>
    ): IDockviewPanel {
        return this.component.addPanel(options);
    }

    /**
     * Remove a panel given the panel object.
     */
    removePanel(panel: IDockviewPanel): void {
        this.component.removePanel(panel);
    }

    /**
     * Add a group and return the created object.
     */
    addGroup(options?: AddGroupOptions): DockviewGroupPanel {
        return this.component.addGroup(options);
    }

    /**
     * Close all groups and panels.
     */
    closeAllGroups(): void {
        return this.component.closeAllGroups();
    }

    /**
     * Remove a group and any panels within the group.
     */
    removeGroup(group: IDockviewGroupPanel): void {
        this.component.removeGroup(<DockviewGroupPanel>group);
    }

    /**
     * Get a group object given a `string` id. May return undefined.
     */
    getGroup(id: string): IDockviewGroupPanel | undefined {
        return this.component.getPanel(id);
    }

    /**
     * Add a floating group
     */
    addFloatingGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: FloatingGroupOptions
    ): void {
        return this.component.addFloatingGroup(item, options);
    }

    /**
     * Create a component from a serialized object.
     */
    fromJSON(
        data: SerializedDockview,
        options?: { reuseExistingPanels: boolean }
    ): void {
        this.component.fromJSON(data, options);
    }

    /**
     * Create a serialized object of the current component.
     */
    toJSON(): SerializedDockview {
        return this.component.toJSON();
    }

    /**
     * Reset the component back to an empty and default state.
     */
    clear(): void {
        this.component.clear();
    }

    /**
     * Move the focus progmatically to the next panel or group.
     */
    moveToNext(options?: MovementOptions): void {
        this.component.moveToNext(options);
    }

    /**
     * Move the focus progmatically to the previous panel or group.
     */
    moveToPrevious(options?: MovementOptions): void {
        this.component.moveToPrevious(options);
    }

    maximizeGroup(panel: IDockviewPanel): void {
        this.component.maximizeGroup(panel.group);
    }

    hasMaximizedGroup(): boolean {
        return this.component.hasMaximizedGroup();
    }

    exitMaximizedGroup(): void {
        this.component.exitMaximizedGroup();
    }

    get onDidMaximizedGroupChange(): Event<DockviewMaximizedGroupChanged> {
        return this.component.onDidMaximizedGroupChange;
    }

    /**
     * Add a popout group in a new Window
     */
    addPopoutGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: {
            position?: Box;
            popoutUrl?: string;
            onDidOpen?: (event: { id: string; window: Window }) => void;
            onWillClose?: (event: { id: string; window: Window }) => void;
        }
    ): Promise<boolean> {
        return this.component.addPopoutGroup(item, options);
    }

    updateOptions(options: Partial<DockviewComponentOptions>) {
        this.component.updateOptions(options);
    }

    /**
     * Release resources and teardown component. Do not call when using framework versions of dockview.
     */
    dispose(): void {
        this.component.dispose();
    }
}
```

## File: packages/dockview-core/src/api/dockviewGroupPanelApi.ts
```typescript
import { Position, positionToDirection } from '../dnd/droptarget';
import { DockviewComponent } from '../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../dockview/dockviewGroupPanel';
import {
    DockviewGroupChangeEvent,
    DockviewGroupLocation,
} from '../dockview/dockviewGroupPanelModel';
import { Emitter, Event } from '../events';
import { GridviewPanelApi, GridviewPanelApiImpl, SizeEvent } from './gridviewPanelApi';

export interface DockviewGroupMoveParams {
    group?: DockviewGroupPanel;
    position?: Position;
    /**
     * The index to place the panel within a group, only applicable if the placement is within an existing group
     */
    index?: number;
    /**
     * Whether to skip setting the group as active after moving
     */
    skipSetActive?: boolean;
}

export interface DockviewGroupPanelApi extends GridviewPanelApi {
    readonly onDidLocationChange: Event<DockviewGroupPanelFloatingChangeEvent>;
    readonly onDidActivePanelChange: Event<DockviewGroupChangeEvent>;
    readonly location: DockviewGroupLocation;
    /**
     * If you require the Window object
     */
    getWindow(): Window;
    moveTo(options: DockviewGroupMoveParams): void;
    maximize(): void;
    isMaximized(): boolean;
    exitMaximized(): void;
    close(): void;
}

export interface DockviewGroupPanelFloatingChangeEvent {
    readonly location: DockviewGroupLocation;
}

const NOT_INITIALIZED_MESSAGE =
    'dockview: DockviewGroupPanelApiImpl not initialized';

export class DockviewGroupPanelApiImpl extends GridviewPanelApiImpl {
    private _group: DockviewGroupPanel | undefined;
    private _pendingSize: SizeEvent | undefined;

    readonly _onDidLocationChange =
        new Emitter<DockviewGroupPanelFloatingChangeEvent>();
    readonly onDidLocationChange: Event<DockviewGroupPanelFloatingChangeEvent> =
        this._onDidLocationChange.event;

    readonly _onDidActivePanelChange = new Emitter<DockviewGroupChangeEvent>();
    readonly onDidActivePanelChange = this._onDidActivePanelChange.event;

    get location(): DockviewGroupLocation {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }
        return this._group.model.location;
    }

    constructor(id: string, private readonly accessor: DockviewComponent) {
        super(id, '__dockviewgroup__');

        this.addDisposables(
            this._onDidLocationChange,
            this._onDidActivePanelChange,
            this._onDidVisibilityChange.event((event) => {
                // When becoming visible, apply any pending size change
                if (event.isVisible && this._pendingSize) {
                    super.setSize(this._pendingSize);
                    this._pendingSize = undefined;
                }
            })
        );
    }

    public override setSize(event: SizeEvent): void {
        // Always store the requested size
        this._pendingSize = { ...event };
        
        // Apply the size change immediately
        super.setSize(event);
    }

    close(): void {
        if (!this._group) {
            return;
        }
        return this.accessor.removeGroup(this._group);
    }

    getWindow(): Window {
        return this.location.type === 'popout'
            ? this.location.getWindow()
            : window;
    }

    moveTo(options: DockviewGroupMoveParams): void {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        const group =
            options.group ??
            this.accessor.addGroup({
                direction: positionToDirection(options.position ?? 'right'),
                skipSetActive: options.skipSetActive ?? false,
            });

        this.accessor.moveGroupOrPanel({
            from: { groupId: this._group.id },
            to: {
                group,
                position: options.group
                    ? options.position ?? 'center'
                    : 'center',
                index: options.index,
            },
            skipSetActive: options.skipSetActive,
        });
    }

    maximize(): void {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        if (this.location.type !== 'grid') {
            // only grid groups can be maximized
            return;
        }

        this.accessor.maximizeGroup(this._group);
    }

    isMaximized(): boolean {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        return this.accessor.isMaximizedGroup(this._group);
    }

    exitMaximized(): void {
        if (!this._group) {
            throw new Error(NOT_INITIALIZED_MESSAGE);
        }

        if (this.isMaximized()) {
            this.accessor.exitMaximizedGroup();
        }
    }

    initialize(group: DockviewGroupPanel): void {
        this._group = group;
    }
}
```

## File: packages/dockview-core/src/api/dockviewPanelApi.ts
```typescript
import { Emitter, Event } from '../events';
import { GridviewPanelApiImpl, GridviewPanelApi } from './gridviewPanelApi';
import { DockviewGroupPanel } from '../dockview/dockviewGroupPanel';
import { CompositeDisposable, MutableDisposable } from '../lifecycle';
import { DockviewPanel } from '../dockview/dockviewPanel';
import { DockviewComponent } from '../dockview/dockviewComponent';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import {
    DockviewGroupMoveParams,
    DockviewGroupPanelFloatingChangeEvent,
} from './dockviewGroupPanelApi';
import { DockviewGroupLocation } from '../dockview/dockviewGroupPanelModel';

export interface TitleEvent {
    readonly title: string;
}

export interface RendererChangedEvent {
    readonly renderer: DockviewPanelRenderer;
}

export interface ActiveGroupEvent {
    readonly isActive: boolean;
}

export interface GroupChangedEvent {
    // empty
}

export type DockviewPanelMoveParams = DockviewGroupMoveParams;

export interface DockviewPanelApi
    extends Omit<
        GridviewPanelApi,
        // omit properties that do not make sense here
        'setVisible' | 'onDidConstraintsChange'
    > {
    /**
     * The id of the tab component renderer
     *
     * Undefined if no custom tab renderer is provided
     */
    readonly tabComponent: string | undefined;
    readonly group: DockviewGroupPanel;
    readonly isGroupActive: boolean;
    readonly renderer: DockviewPanelRenderer;
    readonly title: string | undefined;
    readonly onDidActiveGroupChange: Event<ActiveGroupEvent>;
    readonly onDidGroupChange: Event<GroupChangedEvent>;
    readonly onDidTitleChange: Event<TitleEvent>;
    readonly onDidRendererChange: Event<RendererChangedEvent>;
    readonly location: DockviewGroupLocation;
    readonly onDidLocationChange: Event<DockviewGroupPanelFloatingChangeEvent>;
    close(): void;
    setTitle(title: string): void;
    setRenderer(renderer: DockviewPanelRenderer): void;
    moveTo(options: DockviewPanelMoveParams): void;
    maximize(): void;
    isMaximized(): boolean;
    exitMaximized(): void;
    /**
     * If you require the Window object
     */
    getWindow(): Window;
}

export class DockviewPanelApiImpl
    extends GridviewPanelApiImpl
    implements DockviewPanelApi
{
    private _group: DockviewGroupPanel;
    private readonly _tabComponent: string | undefined;

    readonly _onDidTitleChange = new Emitter<TitleEvent>();
    readonly onDidTitleChange = this._onDidTitleChange.event;

    private readonly _onDidActiveGroupChange = new Emitter<ActiveGroupEvent>();
    readonly onDidActiveGroupChange = this._onDidActiveGroupChange.event;

    private readonly _onDidGroupChange = new Emitter<GroupChangedEvent>();
    readonly onDidGroupChange = this._onDidGroupChange.event;

    readonly _onDidRendererChange = new Emitter<RendererChangedEvent>();
    readonly onDidRendererChange = this._onDidRendererChange.event;

    private readonly _onDidLocationChange =
        new Emitter<DockviewGroupPanelFloatingChangeEvent>();
    readonly onDidLocationChange: Event<DockviewGroupPanelFloatingChangeEvent> =
        this._onDidLocationChange.event;

    private readonly groupEventsDisposable = new MutableDisposable();

    get location(): DockviewGroupLocation {
        return this.group.api.location;
    }

    get title(): string | undefined {
        return this.panel.title;
    }

    get isGroupActive(): boolean {
        return this.group.isActive;
    }

    get renderer(): DockviewPanelRenderer {
        return this.panel.renderer;
    }

    set group(value: DockviewGroupPanel) {
        const oldGroup = this._group;

        if (this._group !== value) {
            this._group = value;

            this._onDidGroupChange.fire({});

            this.setupGroupEventListeners(oldGroup);

            this._onDidLocationChange.fire({
                location: this.group.api.location,
            });
        }
    }

    get group(): DockviewGroupPanel {
        return this._group;
    }

    get tabComponent(): string | undefined {
        return this._tabComponent;
    }

    constructor(
        private readonly panel: DockviewPanel,
        group: DockviewGroupPanel,
        private readonly accessor: DockviewComponent,
        component: string,
        tabComponent?: string
    ) {
        super(panel.id, component);

        this._tabComponent = tabComponent;

        this.initialize(panel);

        this._group = group;
        this.setupGroupEventListeners();

        this.addDisposables(
            this.groupEventsDisposable,
            this._onDidRendererChange,
            this._onDidTitleChange,
            this._onDidGroupChange,
            this._onDidActiveGroupChange,
            this._onDidLocationChange
        );
    }

    getWindow(): Window {
        return this.group.api.getWindow();
    }

    moveTo(options: DockviewPanelMoveParams): void {
        this.accessor.moveGroupOrPanel({
            from: { groupId: this._group.id, panelId: this.panel.id },
            to: {
                group: options.group ?? this._group,
                position: options.group
                    ? options.position ?? 'center'
                    : 'center',
                index: options.index,
            },
            skipSetActive: options.skipSetActive,
        });
    }

    setTitle(title: string): void {
        this.panel.setTitle(title);
    }

    setRenderer(renderer: DockviewPanelRenderer): void {
        this.panel.setRenderer(renderer);
    }

    close(): void {
        this.group.model.closePanel(this.panel);
    }

    maximize(): void {
        this.group.api.maximize();
    }

    isMaximized(): boolean {
        return this.group.api.isMaximized();
    }

    exitMaximized(): void {
        this.group.api.exitMaximized();
    }

    private setupGroupEventListeners(previousGroup?: DockviewGroupPanel) {
        let _trackGroupActive = previousGroup?.isActive ?? false; // prevent duplicate events with same state

        this.groupEventsDisposable.value = new CompositeDisposable(
            this.group.api.onDidVisibilityChange((event) => {
                const hasBecomeHidden = !event.isVisible && this.isVisible;
                const hasBecomeVisible = event.isVisible && !this.isVisible;

                const isActivePanel = this.group.model.isPanelActive(
                    this.panel
                );

                if (hasBecomeHidden || (hasBecomeVisible && isActivePanel)) {
                    this._onDidVisibilityChange.fire(event);
                }
            }),
            this.group.api.onDidLocationChange((event) => {
                if (this.group !== this.panel.group) {
                    return;
                }
                this._onDidLocationChange.fire(event);
            }),
            this.group.api.onDidActiveChange(() => {
                if (this.group !== this.panel.group) {
                    return;
                }

                if (_trackGroupActive !== this.isGroupActive) {
                    _trackGroupActive = this.isGroupActive;
                    this._onDidActiveGroupChange.fire({
                        isActive: this.isGroupActive,
                    });
                }
            })
        );
    }
}
```

## File: packages/dockview-core/src/api/entryPoints.ts
```typescript
import {
    DockviewApi,
    GridviewApi,
    PaneviewApi,
    SplitviewApi,
} from '../api/component.api';
import { DockviewComponent } from '../dockview/dockviewComponent';
import { DockviewComponentOptions } from '../dockview/options';
import { GridviewComponent } from '../gridview/gridviewComponent';
import { GridviewComponentOptions } from '../gridview/options';
import { PaneviewComponentOptions } from '../paneview/options';
import { PaneviewComponent } from '../paneview/paneviewComponent';
import { SplitviewComponentOptions } from '../splitview/options';
import { SplitviewComponent } from '../splitview/splitviewComponent';

export function createDockview(
    element: HTMLElement,
    options: DockviewComponentOptions
): DockviewApi {
    const component = new DockviewComponent(element, options);
    return component.api;
}

export function createSplitview(
    element: HTMLElement,
    options: SplitviewComponentOptions
): SplitviewApi {
    const component = new SplitviewComponent(element, options);
    return new SplitviewApi(component);
}

export function createGridview(
    element: HTMLElement,
    options: GridviewComponentOptions
): GridviewApi {
    const component = new GridviewComponent(element, options);
    return new GridviewApi(component);
}

export function createPaneview(
    element: HTMLElement,
    options: PaneviewComponentOptions
): PaneviewApi {
    const component = new PaneviewComponent(element, options);
    return new PaneviewApi(component);
}
```

## File: packages/dockview-core/src/api/gridviewPanelApi.ts
```typescript
import { Emitter, Event } from '../events';
import { IPanel } from '../panel/types';
import { FunctionOrValue } from '../types';
import { PanelApiImpl, PanelApi } from './panelApi';

export interface GridConstraintChangeEvent {
    readonly minimumWidth?: number;
    readonly minimumHeight?: number;
    readonly maximumWidth?: number;
    readonly maximumHeight?: number;
}

interface GridConstraintChangeEvent2 {
    readonly minimumWidth?: FunctionOrValue<number>;
    readonly minimumHeight?: FunctionOrValue<number>;
    readonly maximumWidth?: FunctionOrValue<number>;
    readonly maximumHeight?: FunctionOrValue<number>;
}

export interface SizeEvent {
    readonly width?: number;
    readonly height?: number;
}

export interface GridviewPanelApi extends PanelApi {
    readonly onDidConstraintsChange: Event<GridConstraintChangeEvent>;
    setConstraints(value: GridConstraintChangeEvent2): void;
    setSize(event: SizeEvent): void;
}

export class GridviewPanelApiImpl
    extends PanelApiImpl
    implements GridviewPanelApi
{
    private readonly _onDidConstraintsChangeInternal =
        new Emitter<GridConstraintChangeEvent2>();
    readonly onDidConstraintsChangeInternal: Event<GridConstraintChangeEvent2> =
        this._onDidConstraintsChangeInternal.event;

    readonly _onDidConstraintsChange = new Emitter<GridConstraintChangeEvent>();
    readonly onDidConstraintsChange: Event<GridConstraintChangeEvent> =
        this._onDidConstraintsChange.event;

    private readonly _onDidSizeChange = new Emitter<SizeEvent>();
    readonly onDidSizeChange: Event<SizeEvent> = this._onDidSizeChange.event;

    constructor(id: string, component: string, panel?: IPanel) {
        super(id, component);

        this.addDisposables(
            this._onDidConstraintsChangeInternal,
            this._onDidConstraintsChange,
            this._onDidSizeChange
        );

        if (panel) {
            this.initialize(panel);
        }
    }

    public setConstraints(value: GridConstraintChangeEvent): void {
        this._onDidConstraintsChangeInternal.fire(value);
    }

    public setSize(event: SizeEvent): void {
        this._onDidSizeChange.fire(event);
    }
}
```

## File: packages/dockview-core/src/api/panelApi.ts
```typescript
import { DockviewEvent, Emitter, Event } from '../events';
import { CompositeDisposable, MutableDisposable } from '../lifecycle';
import { IPanel, Parameters } from '../panel/types';

export interface FocusEvent {
    readonly isFocused: boolean;
}
export interface PanelDimensionChangeEvent {
    readonly width: number;
    readonly height: number;
}

export interface VisibilityEvent {
    readonly isVisible: boolean;
}

export interface ActiveEvent {
    readonly isActive: boolean;
}

export interface PanelApi {
    // events
    readonly onDidDimensionsChange: Event<PanelDimensionChangeEvent>;
    readonly onDidFocusChange: Event<FocusEvent>;
    readonly onDidVisibilityChange: Event<VisibilityEvent>;
    readonly onDidActiveChange: Event<ActiveEvent>;
    readonly onDidParametersChange: Event<Parameters>;
    setActive(): void;
    setVisible(isVisible: boolean): void;
    updateParameters(parameters: Parameters): void;
    /**
     * The id of the component renderer
     */
    readonly component: string;
    /**
     * The id of the panel that would have been assigned when the panel was created
     */
    readonly id: string;
    /**
     * Whether the panel holds the current focus
     */
    readonly isFocused: boolean;
    /**
     * Whether the panel is the actively selected panel
     */
    readonly isActive: boolean;
    /**
     * Whether the panel is visible
     */
    readonly isVisible: boolean;
    /**
     * The panel width in pixels
     */
    readonly width: number;
    /**
     * The panel height in pixels
     */
    readonly height: number;

    readonly onWillFocus: Event<WillFocusEvent>;

    getParameters<T extends Parameters = Parameters>(): T;
}

export class WillFocusEvent extends DockviewEvent {
    constructor() {
        super();
    }
}

/**
 * A core api implementation that should be used across all panel-like objects
 */
export class PanelApiImpl extends CompositeDisposable implements PanelApi {
    private _isFocused = false;
    private _isActive = false;
    private _isVisible = true;
    private _width = 0;
    private _height = 0;
    private _parameters: Parameters = {};

    private readonly panelUpdatesDisposable = new MutableDisposable();

    readonly _onDidDimensionChange = new Emitter<PanelDimensionChangeEvent>();
    readonly onDidDimensionsChange = this._onDidDimensionChange.event;

    readonly _onDidChangeFocus = new Emitter<FocusEvent>();
    readonly onDidFocusChange: Event<FocusEvent> = this._onDidChangeFocus.event;
    //
    readonly _onWillFocus = new Emitter<WillFocusEvent>();
    readonly onWillFocus: Event<WillFocusEvent> = this._onWillFocus.event;
    //
    readonly _onDidVisibilityChange = new Emitter<VisibilityEvent>();
    readonly onDidVisibilityChange: Event<VisibilityEvent> =
        this._onDidVisibilityChange.event;

    readonly _onWillVisibilityChange = new Emitter<VisibilityEvent>();
    readonly onWillVisibilityChange: Event<VisibilityEvent> =
        this._onWillVisibilityChange.event;

    readonly _onDidActiveChange = new Emitter<ActiveEvent>();
    readonly onDidActiveChange: Event<ActiveEvent> =
        this._onDidActiveChange.event;

    readonly _onActiveChange = new Emitter<void>();
    readonly onActiveChange: Event<void> = this._onActiveChange.event;

    readonly _onDidParametersChange = new Emitter<Parameters>();
    readonly onDidParametersChange: Event<Parameters> =
        this._onDidParametersChange.event;

    get isFocused(): boolean {
        return this._isFocused;
    }

    get isActive(): boolean {
        return this._isActive;
    }

    get isVisible(): boolean {
        return this._isVisible;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    constructor(readonly id: string, readonly component: string) {
        super();

        this.addDisposables(
            this.onDidFocusChange((event) => {
                this._isFocused = event.isFocused;
            }),
            this.onDidActiveChange((event) => {
                this._isActive = event.isActive;
            }),
            this.onDidVisibilityChange((event) => {
                this._isVisible = event.isVisible;
            }),
            this.onDidDimensionsChange((event) => {
                this._width = event.width;
                this._height = event.height;
            }),
            this.panelUpdatesDisposable,
            this._onDidDimensionChange,
            this._onDidChangeFocus,
            this._onDidVisibilityChange,
            this._onDidActiveChange,
            this._onWillFocus,
            this._onActiveChange,
            this._onWillFocus,
            this._onWillVisibilityChange,
            this._onDidParametersChange
        );
    }

    getParameters<T extends Parameters = Parameters>(): T {
        return this._parameters as T;
    }

    public initialize(panel: IPanel): void {
        this.panelUpdatesDisposable.value = this._onDidParametersChange.event(
            (parameters) => {
                this._parameters = parameters;
                panel.update({
                    params: parameters,
                });
            }
        );
    }

    setVisible(isVisible: boolean): void {
        this._onWillVisibilityChange.fire({ isVisible });
    }

    setActive(): void {
        this._onActiveChange.fire();
    }

    updateParameters(parameters: Parameters): void {
        this._onDidParametersChange.fire(parameters);
    }
}
```

## File: packages/dockview-core/src/api/paneviewPanelApi.ts
```typescript
import { Emitter, Event } from '../events';
import { PaneviewPanel } from '../paneview/paneviewPanel';
import { SplitviewPanelApi, SplitviewPanelApiImpl } from './splitviewPanelApi';

export interface ExpansionEvent {
    readonly isExpanded: boolean;
}

export interface PaneviewPanelApi extends SplitviewPanelApi {
    readonly isExpanded: boolean;
    readonly onDidExpansionChange: Event<ExpansionEvent>;
    readonly onMouseEnter: Event<MouseEvent>;
    readonly onMouseLeave: Event<MouseEvent>;
    setExpanded(isExpanded: boolean): void;
}

export class PaneviewPanelApiImpl
    extends SplitviewPanelApiImpl
    implements PaneviewPanelApi
{
    readonly _onDidExpansionChange = new Emitter<ExpansionEvent>({
        replay: true,
    });
    readonly onDidExpansionChange: Event<ExpansionEvent> =
        this._onDidExpansionChange.event;

    readonly _onMouseEnter = new Emitter<MouseEvent>({});
    readonly onMouseEnter: Event<MouseEvent> = this._onMouseEnter.event;
    readonly _onMouseLeave = new Emitter<MouseEvent>({});
    readonly onMouseLeave: Event<MouseEvent> = this._onMouseLeave.event;

    private _pane: PaneviewPanel | undefined;

    set pane(pane: PaneviewPanel) {
        this._pane = pane;
    }

    constructor(id: string, component: string) {
        super(id, component);

        this.addDisposables(
            this._onDidExpansionChange,
            this._onMouseEnter,
            this._onMouseLeave
        );
    }

    setExpanded(isExpanded: boolean): void {
        this._pane?.setExpanded(isExpanded);
    }

    get isExpanded(): boolean {
        return !!this._pane?.isExpanded();
    }
}
```

## File: packages/dockview-core/src/api/splitviewPanelApi.ts
```typescript
import { Emitter, Event } from '../events';
import { IDisposable } from '../lifecycle';
import { FunctionOrValue } from '../types';
import { PanelApiImpl, PanelApi } from './panelApi';

interface PanelConstraintChangeEvent2 {
    readonly minimumSize?: FunctionOrValue<number>;
    readonly maximumSize?: FunctionOrValue<number>;
}

export interface PanelConstraintChangeEvent {
    readonly minimumSize?: number;
    readonly maximumSize?: number;
}

export interface PanelSizeEvent {
    readonly size: number;
}

export interface SplitviewPanelApi extends PanelApi {
    readonly onDidConstraintsChange: Event<PanelConstraintChangeEvent>;
    setConstraints(value: PanelConstraintChangeEvent2): void;
    setSize(event: PanelSizeEvent): void;
}

export class SplitviewPanelApiImpl
    extends PanelApiImpl
    implements SplitviewPanelApi, IDisposable
{
    readonly _onDidConstraintsChangeInternal =
        new Emitter<PanelConstraintChangeEvent2>();
    readonly onDidConstraintsChangeInternal: Event<PanelConstraintChangeEvent2> =
        this._onDidConstraintsChangeInternal.event;
    //

    readonly _onDidConstraintsChange = new Emitter<PanelConstraintChangeEvent>({
        replay: true,
    });
    readonly onDidConstraintsChange: Event<PanelConstraintChangeEvent> =
        this._onDidConstraintsChange.event;
    //

    readonly _onDidSizeChange = new Emitter<PanelSizeEvent>();
    readonly onDidSizeChange: Event<PanelSizeEvent> =
        this._onDidSizeChange.event;
    //

    constructor(id: string, component: string) {
        super(id, component);

        this.addDisposables(
            this._onDidConstraintsChangeInternal,
            this._onDidConstraintsChange,
            this._onDidSizeChange
        );
    }

    setConstraints(value: PanelConstraintChangeEvent2) {
        this._onDidConstraintsChangeInternal.fire(value);
    }

    setSize(event: PanelSizeEvent) {
        this._onDidSizeChange.fire(event);
    }
}
```

## File: packages/dockview-core/src/dockview/framework.ts
```typescript
import { DockviewApi } from '../api/component.api';
import { DockviewGroupPanelApi } from '../api/dockviewGroupPanelApi';
import { DockviewPanelApi } from '../api/dockviewPanelApi';
import { PanelParameters } from '../framwork';
import { DockviewGroupPanel, IDockviewGroupPanel } from './dockviewGroupPanel';
import { IDockviewPanel } from './dockviewPanel';

export interface IGroupPanelBaseProps<T extends { [index: string]: any } = any>
    extends PanelParameters<T> {
    api: DockviewPanelApi;
    containerApi: DockviewApi;
}

export type TabLocation = 'header' | 'headerOverflow';

export type IDockviewPanelHeaderProps<
    T extends { [index: string]: any } = any
> = IGroupPanelBaseProps<T> & { tabLocation: TabLocation };

export type IDockviewPanelProps<T extends { [index: string]: any } = any> =
    IGroupPanelBaseProps<T>;

export interface IDockviewHeaderActionsProps {
    api: DockviewGroupPanelApi;
    containerApi: DockviewApi;
    panels: IDockviewPanel[];
    activePanel: IDockviewPanel | undefined;
    isGroupActive: boolean;
    group: DockviewGroupPanel;
}

export interface IGroupHeaderProps {
    api: DockviewGroupPanelApi;
    containerApi: DockviewApi;
    group: IDockviewGroupPanel;
}

export interface IWatermarkPanelProps {
    containerApi: DockviewApi;
    group?: IDockviewGroupPanel;
}

export interface DockviewReadyEvent {
    api: DockviewApi;
}
```

## File: packages/dockview-core/src/dockview/options.ts
```typescript
import { DockviewApi } from '../api/component.api';
import { Direction } from '../gridview/baseComponentGridview';
import { IGridView } from '../gridview/gridview';
import { IContentRenderer, ITabRenderer, IWatermarkRenderer } from './types';
import { Parameters } from '../panel/types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { PanelTransfer } from '../dnd/dataTransfer';
import { IDisposable } from '../lifecycle';
import { DroptargetOverlayModel, Position } from '../dnd/droptarget';
import { GroupOptions } from './dockviewGroupPanelModel';
import { DockviewGroupDropLocation } from './events';
import { IDockviewPanel } from './dockviewPanel';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import { IGroupHeaderProps } from './framework';
import { FloatingGroupOptions } from './dockviewComponent';
import { Contraints } from '../gridview/gridviewPanel';
import { AcceptableEvent, IAcceptableEvent } from '../events';
import { DockviewTheme } from './theme';

export interface IHeaderActionsRenderer extends IDisposable {
    readonly element: HTMLElement;
    init(params: IGroupHeaderProps): void;
}

export interface TabContextMenuEvent {
    event: MouseEvent;
    api: DockviewApi;
    panel: IDockviewPanel;
}

export interface ViewFactoryData {
    content: string;
    tab?: string;
}

export interface DockviewOptions {
    /**
     * Disable the auto-resizing which is controlled through a `ResizeObserver`.
     * Call `.layout(width, height)` to manually resize the container.
     */
    disableAutoResizing?: boolean;
    hideBorders?: boolean;
    singleTabMode?: 'fullwidth' | 'default';
    disableFloatingGroups?: boolean;
    floatingGroupBounds?:
        | 'boundedWithinViewport'
        | {
              minimumHeightWithinViewport?: number;
              minimumWidthWithinViewport?: number;
          };
    popoutUrl?: string;
    defaultRenderer?: DockviewPanelRenderer;
    debug?: boolean;
    // #start dnd
    dndEdges?: false | DroptargetOverlayModel;
    /**
     * @deprecated use `dndEdges` instead. To be removed in a future version.
     * */
    rootOverlayModel?: DroptargetOverlayModel;
    disableDnd?: boolean;
    // #end dnd
    locked?: boolean;
    className?: string;
    /**
     * Define the behaviour of the dock when there are no panels to display. Defaults to `watermark`.
     */
    noPanelsOverlay?: 'emptyGroup' | 'watermark';
    theme?: DockviewTheme;
    disableTabsOverflowList?: boolean;
    /**
     * Select `native` to use built-in scrollbar behaviours and `custom` to use an internal implementation
     * that allows for improved scrollbar overlay UX.
     *
     * This is only applied to the tab header section. Defaults to `custom`.
     */
    scrollbars?: 'native' | 'custom';
}

export interface DockviewDndOverlayEvent extends IAcceptableEvent {
    nativeEvent: DragEvent;
    target: DockviewGroupDropLocation;
    position: Position;
    group?: DockviewGroupPanel;
    getData: () => PanelTransfer | undefined;
}

export class DockviewUnhandledDragOverEvent
    extends AcceptableEvent
    implements DockviewDndOverlayEvent
{
    constructor(
        readonly nativeEvent: DragEvent,
        readonly target: DockviewGroupDropLocation,
        readonly position: Position,
        readonly getData: () => PanelTransfer | undefined,
        readonly group?: DockviewGroupPanel
    ) {
        super();
    }
}

export const PROPERTY_KEYS_DOCKVIEW: (keyof DockviewOptions)[] = (() => {
    /**
     * by readong the keys from an empty value object TypeScript will error
     * when we add or remove new properties to `DockviewOptions`
     */
    const properties: Record<keyof DockviewOptions, undefined> = {
        disableAutoResizing: undefined,
        hideBorders: undefined,
        singleTabMode: undefined,
        disableFloatingGroups: undefined,
        floatingGroupBounds: undefined,
        popoutUrl: undefined,
        defaultRenderer: undefined,
        debug: undefined,
        rootOverlayModel: undefined,
        locked: undefined,
        disableDnd: undefined,
        className: undefined,
        noPanelsOverlay: undefined,
        dndEdges: undefined,
        theme: undefined,
        disableTabsOverflowList: undefined,
        scrollbars: undefined,
    };

    return Object.keys(properties) as (keyof DockviewOptions)[];
})();

export interface CreateComponentOptions {
    /**
     * The unqiue identifer of the component
     */
    id: string;
    /**
     * The component name, this should determine what is rendered.
     */
    name: string;
}

export interface DockviewFrameworkOptions {
    defaultTabComponent?: string;
    createRightHeaderActionComponent?: (
        group: DockviewGroupPanel
    ) => IHeaderActionsRenderer;
    createLeftHeaderActionComponent?: (
        group: DockviewGroupPanel
    ) => IHeaderActionsRenderer;
    createPrefixHeaderActionComponent?: (
        group: DockviewGroupPanel
    ) => IHeaderActionsRenderer;
    createTabComponent?: (
        options: CreateComponentOptions
    ) => ITabRenderer | undefined;
    createComponent: (options: CreateComponentOptions) => IContentRenderer;
    createWatermarkComponent?: () => IWatermarkRenderer;
}

export type DockviewComponentOptions = DockviewOptions &
    DockviewFrameworkOptions;

export interface PanelOptions<P extends object = Parameters> {
    component: string;
    tabComponent?: string;
    params?: P;
    id: string;
    title?: string;
}

type RelativePanel = {
    direction?: Direction;
    referencePanel: string | IDockviewPanel;
    /**
     * The index to place the panel within a group, only applicable if the placement is within an existing group
     */
    index?: number;
};

type RelativeGroup = {
    direction?: Direction;
    referenceGroup: string | DockviewGroupPanel;
    /**
     * The index to place the panel within a group, only applicable if the placement is within an existing group
     */
    index?: number;
};

type AbsolutePosition = {
    direction: Omit<Direction, 'within'>;
};

export type AddPanelPositionOptions =
    | RelativePanel
    | RelativeGroup
    | AbsolutePosition;

export function isPanelOptionsWithPanel(
    data: AddPanelPositionOptions
): data is RelativePanel {
    if ((data as RelativePanel).referencePanel) {
        return true;
    }
    return false;
}

export function isPanelOptionsWithGroup(
    data: AddPanelPositionOptions
): data is RelativeGroup {
    if ((data as RelativeGroup).referenceGroup) {
        return true;
    }
    return false;
}

type AddPanelFloatingGroupUnion = {
    floating: Partial<FloatingGroupOptions> | true;
    position: never;
};

type AddPanelPositionUnion = {
    floating: false;
    position: AddPanelPositionOptions;
};

type AddPanelOptionsUnion = AddPanelFloatingGroupUnion | AddPanelPositionUnion;

export type AddPanelOptions<P extends object = Parameters> = {
    params?: P;
    /**
     * The unique id for the panel
     */
    id: string;
    /**
     * The title for the panel which can be accessed within both the tab and component.
     *
     * If using the default tab renderer this title will be displayed in the tab.
     */
    title?: string;
    /**
     * The id of the component renderer
     */
    component: string;
    /**
     * The id of the tab componnet renderer
     */
    tabComponent?: string;
    /**
     * The rendering mode of the panel.
     *
     * This dictates what happens to the HTML of the panel when it is hidden.
     */
    renderer?: DockviewPanelRenderer;
    /**
     * If true then add the panel without setting it as the active panel.
     *
     * Defaults to `false` which forces newly added panels to become active.
     */
    inactive?: boolean;
    initialWidth?: number;
    initialHeight?: number;
} & Partial<AddPanelOptionsUnion> &
    Partial<Contraints>;

type AddGroupOptionsWithPanel = {
    referencePanel: string | IDockviewPanel;
    direction?: Omit<Direction, 'within'>;
};

type AddGroupOptionsWithGroup = {
    referenceGroup: string | DockviewGroupPanel;
    direction?: Omit<Direction, 'within'>;
};

export type AddGroupOptions = (
    | AddGroupOptionsWithGroup
    | AddGroupOptionsWithPanel
    | AbsolutePosition
) &
    GroupOptions;

export function isGroupOptionsWithPanel(
    data: AddGroupOptions
): data is AddGroupOptionsWithPanel {
    if ((data as AddGroupOptionsWithPanel).referencePanel) {
        return true;
    }
    return false;
}

export function isGroupOptionsWithGroup(
    data: AddGroupOptions
): data is AddGroupOptionsWithGroup {
    if ((data as AddGroupOptionsWithGroup).referenceGroup) {
        return true;
    }
    return false;
}

export interface MovementOptions2 {
    group?: IGridView;
}

export interface MovementOptions extends MovementOptions2 {
    includePanel?: boolean;
    group?: DockviewGroupPanel;
}
```

## File: packages/dockview-core/src/dockview/types.ts
```typescript
import { DockviewPanelApi } from '../api/dockviewPanelApi';
import { PanelInitParameters, IPanel } from '../panel/types';
import { DockviewApi } from '../api/component.api';
import { Optional } from '../types';
import { IDockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import { TabLocation } from './framework';

export interface HeaderPartInitParameters {
    title: string;
}

export interface GroupPanelPartInitParameters
    extends PanelInitParameters,
        HeaderPartInitParameters {
    api: DockviewPanelApi;
    containerApi: DockviewApi;
}

export interface WatermarkRendererInitParameters {
    containerApi: DockviewApi;
    group?: IDockviewGroupPanel;
}

type RendererMethodOptionalList =
    | 'dispose'
    | 'update'
    | 'layout'
    | 'toJSON'
    | 'focus';

export interface IWatermarkRenderer
    extends Optional<Omit<IPanel, 'id' | 'init'>, RendererMethodOptionalList> {
    readonly element: HTMLElement;
    init: (params: WatermarkRendererInitParameters) => void;
}

export interface TabPartInitParameters extends GroupPanelPartInitParameters {
    tabLocation: TabLocation;
}

export interface ITabRenderer
    extends Optional<Omit<IPanel, 'id'>, RendererMethodOptionalList> {
    readonly element: HTMLElement;
    init(parameters: TabPartInitParameters): void;
}

export interface IContentRenderer
    extends Optional<Omit<IPanel, 'id'>, RendererMethodOptionalList> {
    readonly element: HTMLElement;
    init(parameters: GroupPanelPartInitParameters): void;
}

// watermark component

// constructors

export interface IGroupPanelInitParameters
    extends PanelInitParameters,
        HeaderPartInitParameters {
    //
}

export interface GroupviewPanelState {
    id: string;
    contentComponent?: string;
    tabComponent?: string;
    title?: string;
    renderer?: DockviewPanelRenderer;
    params?: { [key: string]: any };
    minimumWidth?: number;
    minimumHeight?: number;
    maximumWidth?: number;
    maximumHeight?: number;
}
```

## File: packages/dockview-core/src/index.ts
```typescript
export {
    getPaneData,
    getPanelData,
    PaneTransfer,
    PanelTransfer,
} from './dnd/dataTransfer';

/**
 * Events, Emitters and Disposables are very common concepts that many codebases will contain, however we need
 * to export them for dockview framework packages to use.
 * To be a good citizen these are exported with a `Dockview` prefix to prevent accidental use by others.
 */
export { Emitter as DockviewEmitter, Event as DockviewEvent } from './events';
export {
    IDisposable as DockviewIDisposable,
    MutableDisposable as DockviewMutableDisposable,
    CompositeDisposable as DockviewCompositeDisposable,
    Disposable as DockviewDisposable,
} from './lifecycle';

export * from './panel/types';

export * from './splitview/splitview';
export {
    SplitviewComponentOptions,
    PanelViewInitParameters,
    SplitviewOptions,
    SplitviewFrameworkOptions,
    PROPERTY_KEYS_SPLITVIEW,
} from './splitview/options';

export * from './paneview/paneview';
export * from './gridview/gridview';
export {
    GridviewComponentOptions,
    GridviewOptions,
    GridviewFrameworkOptions,
    PROPERTY_KEYS_GRIDVIEW,
} from './gridview/options';
export * from './gridview/baseComponentGridview';

export {
    DraggablePaneviewPanel,
    PaneviewDidDropEvent as PaneviewDropEvent,
} from './paneview/draggablePaneviewPanel';

export * from './dockview/components/panel/content';
export * from './dockview/components/tab/tab';
export {
    DockviewGroupPanelModel,
    DockviewDidDropEvent,
    DockviewWillDropEvent,
    DockviewGroupChangeEvent,
} from './dockview/dockviewGroupPanelModel';
export { DockviewWillShowOverlayLocationEvent } from './dockview/events';
export {
    TabDragEvent,
    GroupDragEvent,
} from './dockview/components/titlebar/tabsContainer';
export * from './dockview/types';
export * from './dockview/dockviewGroupPanel';
export {
    IGroupPanelBaseProps,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
    IDockviewHeaderActionsProps,
    IGroupHeaderProps,
    IWatermarkPanelProps,
    DockviewReadyEvent,
} from './dockview/framework';

export * from './dockview/options';
export * from './dockview/theme';
export * from './dockview/dockviewPanel';
export { DefaultTab } from './dockview/components/tab/defaultTab';
export {
    DefaultDockviewDeserialzier,
    IPanelDeserializer,
} from './dockview/deserializer';

export * from './dockview/dockviewComponent';
export * from './gridview/gridviewComponent';
export * from './splitview/splitviewComponent';
export * from './paneview/paneviewComponent';
export {
    PaneviewComponentOptions,
    PaneviewOptions,
    PaneviewFrameworkOptions,
    PROPERTY_KEYS_PANEVIEW,
    PaneviewUnhandledDragOverEvent,
    PaneviewDndOverlayEvent,
} from './paneview/options';

export * from './gridview/gridviewPanel';
export { SplitviewPanel, ISplitviewPanel } from './splitview/splitviewPanel';
export * from './paneview/paneviewPanel';
export * from './dockview/types';

export { DockviewPanelRenderer } from './overlay/overlayRenderContainer';

export {
    Position,
    positionToDirection,
    directionToPosition,
    MeasuredValue,
    DroptargetOverlayModel,
} from './dnd/droptarget';

export {
    FocusEvent,
    PanelDimensionChangeEvent,
    VisibilityEvent,
    ActiveEvent,
    PanelApi,
} from './api/panelApi';
export {
    SizeEvent,
    GridviewPanelApi,
    GridConstraintChangeEvent,
} from './api/gridviewPanelApi';
export {
    TitleEvent,
    RendererChangedEvent,
    DockviewPanelApi,
    DockviewPanelMoveParams,
} from './api/dockviewPanelApi';
export {
    PanelSizeEvent,
    PanelConstraintChangeEvent,
    SplitviewPanelApi,
} from './api/splitviewPanelApi';
export { ExpansionEvent, PaneviewPanelApi } from './api/paneviewPanelApi';
export {
    DockviewGroupPanelApi,
    DockviewGroupPanelFloatingChangeEvent,
    DockviewGroupMoveParams,
} from './api/dockviewGroupPanelApi';
export {
    CommonApi,
    SplitviewApi,
    PaneviewApi,
    GridviewApi,
    DockviewApi,
} from './api/component.api';
export {
    createDockview,
    createGridview,
    createPaneview,
    createSplitview,
} from './api/entryPoints';
```

## File: packages/docs/docs/api/dockview/groupApi.mdx
```markdown
---
title: Group API
sidebar_position: 3
---

:::info
Use the group API sparingly. As you move panels, groups change and if you don't track this correctly you may encounter unexpected
behaviours. You should be able to achieve most things directly through the panel API.
:::

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="DockviewGroupPanelApi" />
```

## File: packages/docs/docs/api/dockview/options.mdx
```markdown
---
title: Options
sidebar_position: 0
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<FrameworkSpecific framework="JavaScript">
  <DocRef declaration="DockviewComponentOptions" />
</FrameworkSpecific>

<FrameworkSpecific framework="React">
  <DocRef declaration="IDockviewReactProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Vue">
  <DocRef declaration="IDockviewVueProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Angular">
  <DocRef declaration="IDockviewAngularProps" />
</FrameworkSpecific>
```

## File: packages/docs/docs/api/dockview/overview.mdx
```markdown
---
title: API
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes the api object.

<DocRef declaration="DockviewApi" />
```

## File: packages/docs/docs/api/dockview/panelApi.mdx
```markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="DockviewPanelApi" />
```

## File: packages/docs/docs/api/gridview/api.mdx
```markdown
---
description: API
title: "API"
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="GridviewApi" />
```

## File: packages/docs/docs/api/gridview/options.mdx
```markdown
---
title: Options
sidebar_position: 0
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<FrameworkSpecific framework="JavaScript">
  <DocRef declaration="GridviewComponentOptions" />
</FrameworkSpecific>

<FrameworkSpecific framework="React">
  <DocRef declaration="IGridviewReactProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Vue">
  <DocRef declaration="IGridviewVueProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Angular">
  <DocRef declaration="IGridviewAngularProps" />
</FrameworkSpecific>
```

## File: packages/docs/docs/api/gridview/panelApi.mdx
```markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="GridviewPanelApi" />
```

## File: packages/docs/docs/api/paneview/api.mdx
```markdown
---
description: API
title: "API"
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="PaneviewApi" />
```

## File: packages/docs/docs/api/paneview/options.mdx
```markdown
---
title: Options
sidebar_position: 0
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<FrameworkSpecific framework="JavaScript">
  <DocRef declaration="PaneviewComponentOptions" />
</FrameworkSpecific>

<FrameworkSpecific framework="React">
  <DocRef declaration="IPaneviewReactProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Vue">
  <DocRef declaration="IPaneviewVueProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Angular">
  <DocRef declaration="IPaneviewAngularProps" />
</FrameworkSpecific>
```

## File: packages/docs/docs/api/paneview/panelApi.mdx
```markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="PaneviewPanelApi" />
```

## File: packages/docs/docs/api/splitview/api.mdx
```markdown
---
description: API
title: "API"
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="SplitviewApi" />
```

## File: packages/docs/docs/api/splitview/options.mdx
```markdown
---
title: Options
sidebar_position: 0
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<FrameworkSpecific framework="JavaScript">
  <DocRef declaration="SplitviewComponentOptions" />
</FrameworkSpecific>

<FrameworkSpecific framework="React">
  <DocRef declaration="ISplitviewReactProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Vue">
  <DocRef declaration="ISplitviewVueProps" />
</FrameworkSpecific>

<FrameworkSpecific framework="Angular">
  <DocRef declaration="ISplitviewAngularProps" />
</FrameworkSpecific>
```

## File: packages/docs/docs/api/splitview/panelApi.mdx
```markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="SplitviewPanelApi" />
```