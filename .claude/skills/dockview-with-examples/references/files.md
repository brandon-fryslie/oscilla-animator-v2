# Files

## File: packages/dockview/src/dockview/defaultTab.tsx
````typescript
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
````

## File: packages/dockview/src/dockview/dockview.tsx
````typescript
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
````

## File: packages/dockview/src/dockview/headerActionsRenderer.ts
````typescript
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
````

## File: packages/dockview/src/dockview/reactContentPart.ts
````typescript
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
````

## File: packages/dockview/src/dockview/reactHeaderPart.ts
````typescript
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
````

## File: packages/dockview/src/dockview/reactWatermarkPart.ts
````typescript
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
````

## File: packages/dockview/src/gridview/gridview.tsx
````typescript
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
````

## File: packages/dockview/src/gridview/view.ts
````typescript
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
````

## File: packages/dockview/src/paneview/paneview.tsx
````typescript
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
````

## File: packages/dockview/src/paneview/view.ts
````typescript
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
````

## File: packages/dockview/src/splitview/splitview.tsx
````typescript
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
````

## File: packages/dockview/src/splitview/view.ts
````typescript
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
````

## File: packages/dockview/src/index.ts
````typescript
export * from 'dockview-core';

export * from './dockview/dockview';
export * from './dockview/defaultTab';
export * from './splitview/splitview';
export * from './gridview/gridview';
export * from './paneview/paneview';
export * from './types';
export * from './react';
````

## File: packages/dockview/src/react.ts
````typescript
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
````

## File: packages/dockview/src/svg.tsx
````typescript
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
````

## File: packages/dockview/src/types.ts
````typescript
import { Parameters } from 'dockview-core';

export interface PanelParameters<T extends {} = Parameters> {
    params: T;
}
````

## File: packages/dockview/package.json
````json
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
````

## File: packages/dockview-core/src/api/component.api.ts
````typescript
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
````

## File: packages/dockview-core/src/api/dockviewGroupPanelApi.ts
````typescript
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
````

## File: packages/dockview-core/src/api/dockviewPanelApi.ts
````typescript
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
````

## File: packages/dockview-core/src/api/entryPoints.ts
````typescript
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
````

## File: packages/dockview-core/src/api/gridviewPanelApi.ts
````typescript
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
````

## File: packages/dockview-core/src/api/panelApi.ts
````typescript
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
````

## File: packages/dockview-core/src/api/paneviewPanelApi.ts
````typescript
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
````

## File: packages/dockview-core/src/api/splitviewPanelApi.ts
````typescript
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
````

## File: packages/dockview-core/src/dnd/abstractDragHandler.ts
````typescript
import { disableIframePointEvents } from '../dom';
import { addDisposableListener, Emitter } from '../events';
import {
    CompositeDisposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';

export abstract class DragHandler extends CompositeDisposable {
    private readonly dataDisposable = new MutableDisposable();
    private readonly pointerEventsDisposable = new MutableDisposable();

    private readonly _onDragStart = new Emitter<DragEvent>();
    readonly onDragStart = this._onDragStart.event;

    constructor(protected readonly el: HTMLElement, private disabled?: boolean) {
        super();

        this.addDisposables(
            this._onDragStart,
            this.dataDisposable,
            this.pointerEventsDisposable
        );

        this.configure();
    }

    public setDisabled(disabled: boolean): void {
        this.disabled = disabled;
    }

    abstract getData(event: DragEvent): IDisposable;

    protected isCancelled(_event: DragEvent): boolean {
        return false;
    }

    private configure(): void {
        this.addDisposables(
            this._onDragStart,
            addDisposableListener(this.el, 'dragstart', (event) => {
                if (event.defaultPrevented || this.isCancelled(event) || this.disabled) {
                    event.preventDefault();
                    return;
                }

                const iframes = disableIframePointEvents();

                this.pointerEventsDisposable.value = {
                    dispose: () => {
                        iframes.release();
                    },
                };

                this.el.classList.add('dv-dragged');
                setTimeout(() => this.el.classList.remove('dv-dragged'), 0);

                this.dataDisposable.value = this.getData(event);
                this._onDragStart.fire(event);

                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';

                    const hasData = event.dataTransfer.items.length > 0;

                    if (!hasData) {
                        /**
                         * Although this is not used by dockview many third party dnd libraries will check
                         * dataTransfer.types to determine valid drag events.
                         *
                         * For example: in react-dnd if dataTransfer.types is not set then the dragStart event will be cancelled
                         * through .preventDefault(). Since this is applied globally to all drag events this would break dockviews
                         * dnd logic. You can see the code at
                     P    * https://github.com/react-dnd/react-dnd/blob/main/packages/backend-html5/src/HTML5BackendImpl.ts#L542
                         */
                        event.dataTransfer.setData('text/plain', '');
                    }
                }
            }),
            addDisposableListener(this.el, 'dragend', () => {
                this.pointerEventsDisposable.dispose();
                setTimeout(() => {
                    this.dataDisposable.dispose(); // allow the data to be read by other handlers before disposing
                }, 0);
            })
        );
    }
}
````

## File: packages/dockview-core/src/dnd/dataTransfer.ts
````typescript
class TransferObject {
    // intentionally empty class
}

export class PanelTransfer extends TransferObject {
    constructor(
        public readonly viewId: string,
        public readonly groupId: string,
        public readonly panelId: string | null
    ) {
        super();
    }
}

export class PaneTransfer extends TransferObject {
    constructor(
        public readonly viewId: string,
        public readonly paneId: string
    ) {
        super();
    }
}

/**
 * A singleton to store transfer data during drag & drop operations that are only valid within the application.
 */
export class LocalSelectionTransfer<T> {
    private static readonly INSTANCE = new LocalSelectionTransfer();

    private data?: T[];
    private proto?: T;

    private constructor() {
        // protect against external instantiation
    }

    static getInstance<T>(): LocalSelectionTransfer<T> {
        return LocalSelectionTransfer.INSTANCE as LocalSelectionTransfer<T>;
    }

    hasData(proto: T): boolean {
        return proto && proto === this.proto;
    }

    clearData(proto: T): void {
        if (this.hasData(proto)) {
            this.proto = undefined;
            this.data = undefined;
        }
    }

    getData(proto: T): T[] | undefined {
        if (this.hasData(proto)) {
            return this.data;
        }

        return undefined;
    }

    setData(data: T[], proto: T): void {
        if (proto) {
            this.data = data;
            this.proto = proto;
        }
    }
}

export function getPanelData(): PanelTransfer | undefined {
    const panelTransfer = LocalSelectionTransfer.getInstance<PanelTransfer>();
    const isPanelEvent = panelTransfer.hasData(PanelTransfer.prototype);

    if (!isPanelEvent) {
        return undefined;
    }

    return panelTransfer.getData(PanelTransfer.prototype)![0];
}

export function getPaneData(): PaneTransfer | undefined {
    const paneTransfer = LocalSelectionTransfer.getInstance<PaneTransfer>();
    const isPanelEvent = paneTransfer.hasData(PaneTransfer.prototype);

    if (!isPanelEvent) {
        return undefined;
    }

    return paneTransfer.getData(PaneTransfer.prototype)![0];
}
````

## File: packages/dockview-core/src/dnd/dnd.ts
````typescript
import { addDisposableListener } from '../events';
import { CompositeDisposable } from '../lifecycle';

export interface IDragAndDropObserverCallbacks {
    onDragEnter: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
    onDragEnd: (e: DragEvent) => void;
    onDragOver?: (e: DragEvent) => void;
}

export class DragAndDropObserver extends CompositeDisposable {
    private target: EventTarget | null = null;

    constructor(
        private readonly element: HTMLElement,
        private readonly callbacks: IDragAndDropObserverCallbacks
    ) {
        super();

        this.registerListeners();
    }

    onDragEnter(e: DragEvent): void {
        this.target = e.target;
        this.callbacks.onDragEnter(e);
    }

    onDragOver(e: DragEvent): void {
        e.preventDefault(); // needed so that the drop event fires (https://stackoverflow.com/questions/21339924/drop-event-not-firing-in-chrome)

        if (this.callbacks.onDragOver) {
            this.callbacks.onDragOver(e);
        }
    }

    onDragLeave(e: DragEvent): void {
        if (this.target === e.target) {
            this.target = null;

            this.callbacks.onDragLeave(e);
        }
    }

    onDragEnd(e: DragEvent): void {
        this.target = null;
        this.callbacks.onDragEnd(e);
    }

    onDrop(e: DragEvent): void {
        this.callbacks.onDrop(e);
    }

    private registerListeners(): void {
        this.addDisposables(
            addDisposableListener(
                this.element,
                'dragenter',
                (e: DragEvent) => {
                    this.onDragEnter(e);
                },
                true
            )
        );

        this.addDisposables(
            addDisposableListener(
                this.element,
                'dragover',
                (e: DragEvent) => {
                    this.onDragOver(e);
                },
                true
            )
        );

        this.addDisposables(
            addDisposableListener(this.element, 'dragleave', (e: DragEvent) => {
                this.onDragLeave(e);
            })
        );

        this.addDisposables(
            addDisposableListener(this.element, 'dragend', (e: DragEvent) => {
                this.onDragEnd(e);
            })
        );

        this.addDisposables(
            addDisposableListener(this.element, 'drop', (e: DragEvent) => {
                this.onDrop(e);
            })
        );
    }
}

export interface IDraggedCompositeData {
    eventData: DragEvent;
    dragAndDropData: any;
}

export interface ICompositeDragAndDropObserverCallbacks {
    onDragEnter?: (e: IDraggedCompositeData) => void;
    onDragLeave?: (e: IDraggedCompositeData) => void;
    onDrop?: (e: IDraggedCompositeData) => void;
    onDragOver?: (e: IDraggedCompositeData) => void;
    onDragStart?: (e: IDraggedCompositeData) => void;
    onDragEnd?: (e: IDraggedCompositeData) => void;
}
````

## File: packages/dockview-core/src/dnd/droptarget.ts
````typescript
import { toggleClass } from '../dom';
import { DockviewEvent, Emitter, Event } from '../events';
import { CompositeDisposable } from '../lifecycle';
import { DragAndDropObserver } from './dnd';
import { clamp } from '../math';
import { Direction } from '../gridview/baseComponentGridview';

interface DropTargetRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

function setGPUOptimizedBounds(element: HTMLElement, bounds: DropTargetRect): void {
    const { top, left, width, height } = bounds;
    const topPx = `${Math.round(top)}px`;
    const leftPx = `${Math.round(left)}px`;
    const widthPx = `${Math.round(width)}px`;
    const heightPx = `${Math.round(height)}px`;
    
    // Use traditional positioning but maintain GPU layer
    element.style.top = topPx;
    element.style.left = leftPx;
    element.style.width = widthPx;
    element.style.height = heightPx;
    element.style.visibility = 'visible';
    
    // Ensure GPU layer is maintained
    if (!element.style.transform || element.style.transform === '') {
        element.style.transform = 'translate3d(0, 0, 0)';
    }
}

function setGPUOptimizedBoundsFromStrings(element: HTMLElement, bounds: {
    top: string;
    left: string;
    width: string;
    height: string;
}): void {
    const { top, left, width, height } = bounds;
    
    // Use traditional positioning but maintain GPU layer
    element.style.top = top;
    element.style.left = left;
    element.style.width = width;
    element.style.height = height;
    element.style.visibility = 'visible';
    
    // Ensure GPU layer is maintained
    if (!element.style.transform || element.style.transform === '') {
        element.style.transform = 'translate3d(0, 0, 0)';
    }
}

function checkBoundsChanged(element: HTMLElement, bounds: DropTargetRect): boolean {
    const { top, left, width, height } = bounds;
    const topPx = `${Math.round(top)}px`;
    const leftPx = `${Math.round(left)}px`;
    const widthPx = `${Math.round(width)}px`;
    const heightPx = `${Math.round(height)}px`;
    
    // Check if position or size changed (back to traditional method)
    return element.style.top !== topPx ||
           element.style.left !== leftPx ||
           element.style.width !== widthPx || 
           element.style.height !== heightPx;
}

export interface DroptargetEvent {
    readonly position: Position;
    readonly nativeEvent: DragEvent;
}

export class WillShowOverlayEvent
    extends DockviewEvent
    implements DroptargetEvent
{
    get nativeEvent(): DragEvent {
        return this.options.nativeEvent;
    }

    get position(): Position {
        return this.options.position;
    }

    constructor(
        private readonly options: {
            nativeEvent: DragEvent;
            position: Position;
        }
    ) {
        super();
    }
}

export function directionToPosition(direction: Direction): Position {
    switch (direction) {
        case 'above':
            return 'top';
        case 'below':
            return 'bottom';
        case 'left':
            return 'left';
        case 'right':
            return 'right';
        case 'within':
            return 'center';
        default:
            throw new Error(`invalid direction '${direction}'`);
    }
}

export function positionToDirection(position: Position): Direction {
    switch (position) {
        case 'top':
            return 'above';
        case 'bottom':
            return 'below';
        case 'left':
            return 'left';
        case 'right':
            return 'right';
        case 'center':
            return 'within';
        default:
            throw new Error(`invalid position '${position}'`);
    }
}

export type Position = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type CanDisplayOverlay = (
    dragEvent: DragEvent,
    state: Position
) => boolean;

export type MeasuredValue = { value: number; type: 'pixels' | 'percentage' };

export type DroptargetOverlayModel = {
    size?: MeasuredValue;
    activationSize?: MeasuredValue;
};

const DEFAULT_ACTIVATION_SIZE: MeasuredValue = {
    value: 20,
    type: 'percentage',
};

const DEFAULT_SIZE: MeasuredValue = {
    value: 50,
    type: 'percentage',
};

const SMALL_WIDTH_BOUNDARY = 100;
const SMALL_HEIGHT_BOUNDARY = 100;

export interface DropTargetTargetModel {
    getElements(
        event?: DragEvent,
        outline?: HTMLElement
    ): {
        root: HTMLElement;
        overlay: HTMLElement;
        changed: boolean;
    };
    exists(): boolean;
    clear(): void;
}

export interface DroptargetOptions {
    canDisplayOverlay: CanDisplayOverlay;
    acceptedTargetZones: Position[];
    overlayModel?: DroptargetOverlayModel;
    getOverrideTarget?: () => DropTargetTargetModel | undefined;
    className?: string;
    getOverlayOutline?: () => HTMLElement | null;
}

export class Droptarget extends CompositeDisposable {
    private targetElement: HTMLElement | undefined;
    private overlayElement: HTMLElement | undefined;
    private _state: Position | undefined;
    private _acceptedTargetZonesSet: Set<Position>;

    private readonly _onDrop = new Emitter<DroptargetEvent>();
    readonly onDrop: Event<DroptargetEvent> = this._onDrop.event;

    private readonly _onWillShowOverlay = new Emitter<WillShowOverlayEvent>();
    readonly onWillShowOverlay: Event<WillShowOverlayEvent> =
        this._onWillShowOverlay.event;

    readonly dnd: DragAndDropObserver;

    private static USED_EVENT_ID = '__dockview_droptarget_event_is_used__';

    private static ACTUAL_TARGET: Droptarget | undefined;

    private _disabled: boolean;

    get disabled(): boolean {
        return this._disabled;
    }

    set disabled(value: boolean) {
        this._disabled = value;
    }

    get state(): Position | undefined {
        return this._state;
    }

    constructor(
        private readonly element: HTMLElement,
        private readonly options: DroptargetOptions
    ) {
        super();

        this._disabled = false;

        // use a set to take advantage of #<set>.has
        this._acceptedTargetZonesSet = new Set(
            this.options.acceptedTargetZones
        );

        this.dnd = new DragAndDropObserver(this.element, {
            onDragEnter: () => {
                this.options.getOverrideTarget?.()?.getElements();
            },
            onDragOver: (e) => {
                Droptarget.ACTUAL_TARGET = this;

                const overrideTarget = this.options.getOverrideTarget?.();

                if (this._acceptedTargetZonesSet.size === 0) {
                    if (overrideTarget) {
                        return;
                    }
                    this.removeDropTarget();
                    return;
                }

                const target =
                    this.options.getOverlayOutline?.() ?? this.element;

                const width = target.offsetWidth;
                const height = target.offsetHeight;

                if (width === 0 || height === 0) {
                    return; // avoid div!0
                }

                const rect = (
                    e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const x = (e.clientX ?? 0) - rect.left;
                const y = (e.clientY ?? 0) - rect.top;

                const quadrant = this.calculateQuadrant(
                    this._acceptedTargetZonesSet,
                    x,
                    y,
                    width,
                    height
                );

                /**
                 * If the event has already been used by another DropTarget instance
                 * then don't show a second drop target, only one target should be
                 * active at any one time
                 */
                if (this.isAlreadyUsed(e) || quadrant === null) {
                    // no drop target should be displayed
                    this.removeDropTarget();
                    return;
                }

                if (!this.options.canDisplayOverlay(e, quadrant)) {
                    if (overrideTarget) {
                        return;
                    }
                    this.removeDropTarget();
                    return;
                }

                const willShowOverlayEvent = new WillShowOverlayEvent({
                    nativeEvent: e,
                    position: quadrant,
                });

                /**
                 * Provide an opportunity to prevent the overlay appearing and in turn
                 * any dnd behaviours
                 */
                this._onWillShowOverlay.fire(willShowOverlayEvent);

                if (willShowOverlayEvent.defaultPrevented) {
                    this.removeDropTarget();
                    return;
                }

                this.markAsUsed(e);

                if (overrideTarget) {
                    //
                } else if (!this.targetElement) {
                    this.targetElement = document.createElement('div');
                    this.targetElement.className = 'dv-drop-target-dropzone';
                    this.overlayElement = document.createElement('div');
                    this.overlayElement.className = 'dv-drop-target-selection';
                    this._state = 'center';
                    this.targetElement.appendChild(this.overlayElement);

                    target.classList.add('dv-drop-target');
                    target.append(this.targetElement);

                    // this.overlayElement.style.opacity = '0';

                    // requestAnimationFrame(() => {
                    //     if (this.overlayElement) {
                    //         this.overlayElement.style.opacity = '';
                    //     }
                    // });
                }

                this.toggleClasses(quadrant, width, height);

                this._state = quadrant;
            },
            onDragLeave: () => {
                const target = this.options.getOverrideTarget?.();

                if (target) {
                    return;
                }

                this.removeDropTarget();
            },
            onDragEnd: (e) => {
                const target = this.options.getOverrideTarget?.();

                if (target && Droptarget.ACTUAL_TARGET === this) {
                    if (this._state) {
                        // only stop the propagation of the event if we are dealing with it
                        // which is only when the target has state
                        e.stopPropagation();
                        this._onDrop.fire({
                            position: this._state,
                            nativeEvent: e,
                        });
                    }
                }

                this.removeDropTarget();

                target?.clear();
            },
            onDrop: (e) => {
                e.preventDefault();

                const state = this._state;

                this.removeDropTarget();

                this.options.getOverrideTarget?.()?.clear();

                if (state) {
                    // only stop the propagation of the event if we are dealing with it
                    // which is only when the target has state
                    e.stopPropagation();
                    this._onDrop.fire({ position: state, nativeEvent: e });
                }
            },
        });

        this.addDisposables(this._onDrop, this._onWillShowOverlay, this.dnd);
    }

    setTargetZones(acceptedTargetZones: Position[]): void {
        this._acceptedTargetZonesSet = new Set(acceptedTargetZones);
    }

    setOverlayModel(model: DroptargetOverlayModel): void {
        this.options.overlayModel = model;
    }

    dispose(): void {
        this.removeDropTarget();
        super.dispose();
    }

    /**
     * Add a property to the event object for other potential listeners to check
     */
    private markAsUsed(event: DragEvent): void {
        (event as any)[Droptarget.USED_EVENT_ID] = true;
    }

    /**
     * Check is the event has already been used by another instance of DropTarget
     */
    private isAlreadyUsed(event: DragEvent): boolean {
        const value = (event as any)[Droptarget.USED_EVENT_ID];
        return typeof value === 'boolean' && value;
    }

    private toggleClasses(
        quadrant: Position,
        width: number,
        height: number
    ): void {
        const target = this.options.getOverrideTarget?.();

        if (!target && !this.overlayElement) {
            return;
        }

        const isSmallX = width < SMALL_WIDTH_BOUNDARY;
        const isSmallY = height < SMALL_HEIGHT_BOUNDARY;

        const isLeft = quadrant === 'left';
        const isRight = quadrant === 'right';
        const isTop = quadrant === 'top';
        const isBottom = quadrant === 'bottom';

        const rightClass = !isSmallX && isRight;
        const leftClass = !isSmallX && isLeft;
        const topClass = !isSmallY && isTop;
        const bottomClass = !isSmallY && isBottom;

        let size = 1;

        const sizeOptions = this.options.overlayModel?.size ?? DEFAULT_SIZE;

        if (sizeOptions.type === 'percentage') {
            size = clamp(sizeOptions.value, 0, 100) / 100;
        } else {
            if (rightClass || leftClass) {
                size = clamp(0, sizeOptions.value, width) / width;
            }
            if (topClass || bottomClass) {
                size = clamp(0, sizeOptions.value, height) / height;
            }
        }

        if (target) {
            const outlineEl =
                this.options.getOverlayOutline?.() ?? this.element;
            const elBox = outlineEl.getBoundingClientRect();

            const ta = target.getElements(undefined, outlineEl);
            const el = ta.root;
            const overlay = ta.overlay;

            const bigbox = el.getBoundingClientRect();

            const rootTop = elBox.top - bigbox.top;
            const rootLeft = elBox.left - bigbox.left;

            const box = {
                top: rootTop,
                left: rootLeft,
                width: width,
                height: height,
            };

            if (rightClass) {
                box.left = rootLeft + width * (1 - size);
                box.width = width * size;
            } else if (leftClass) {
                box.width = width * size;
            } else if (topClass) {
                box.height = height * size;
            } else if (bottomClass) {
                box.top = rootTop + height * (1 - size);
                box.height = height * size;
            }

            if (isSmallX && isLeft) {
                box.width = 4;
            }
            if (isSmallX && isRight) {
                box.left = rootLeft + width - 4;
                box.width = 4;
            }

            // Use GPU-optimized bounds checking and setting
            if (!checkBoundsChanged(overlay, box)) {
                return;
            }

            setGPUOptimizedBounds(overlay, box);

            overlay.className = `dv-drop-target-anchor${
                this.options.className ? ` ${this.options.className}` : ''
            }`;

            toggleClass(overlay, 'dv-drop-target-left', isLeft);
            toggleClass(overlay, 'dv-drop-target-right', isRight);
            toggleClass(overlay, 'dv-drop-target-top', isTop);
            toggleClass(overlay, 'dv-drop-target-bottom', isBottom);
            toggleClass(
                overlay,
                'dv-drop-target-center',
                quadrant === 'center'
            );

            if (ta.changed) {
                toggleClass(
                    overlay,
                    'dv-drop-target-anchor-container-changed',
                    true
                );
                setTimeout(() => {
                    toggleClass(
                        overlay,
                        'dv-drop-target-anchor-container-changed',
                        false
                    );
                }, 10);
            }

            return;
        }

        if (!this.overlayElement) {
            return;
        }

        const box = { top: '0px', left: '0px', width: '100%', height: '100%' };

        /**
         * You can also achieve the overlay placement using the transform CSS property
         * to translate and scale the element however this has the undesired effect of
         * 'skewing' the element. Comment left here for anybody that ever revisits this.
         *
         * @see https://developer.mozilla.org/en-US/docs/Web/CSS/transform
         *
         * right
         * translateX(${100 * (1 - size) / 2}%) scaleX(${scale})
         *
         * left
         * translateX(-${100 * (1 - size) / 2}%) scaleX(${scale})
         *
         * top
         * translateY(-${100 * (1 - size) / 2}%) scaleY(${scale})
         *
         * bottom
         * translateY(${100 * (1 - size) / 2}%) scaleY(${scale})
         */
        if (rightClass) {
            box.left = `${100 * (1 - size)}%`;
            box.width = `${100 * size}%`;
        } else if (leftClass) {
            box.width = `${100 * size}%`;
        } else if (topClass) {
            box.height = `${100 * size}%`;
        } else if (bottomClass) {
            box.top = `${100 * (1 - size)}%`;
            box.height = `${100 * size}%`;
        }

        setGPUOptimizedBoundsFromStrings(this.overlayElement, box);

        toggleClass(
            this.overlayElement,
            'dv-drop-target-small-vertical',
            isSmallY
        );
        toggleClass(
            this.overlayElement,
            'dv-drop-target-small-horizontal',
            isSmallX
        );
        toggleClass(this.overlayElement, 'dv-drop-target-left', isLeft);
        toggleClass(this.overlayElement, 'dv-drop-target-right', isRight);
        toggleClass(this.overlayElement, 'dv-drop-target-top', isTop);
        toggleClass(this.overlayElement, 'dv-drop-target-bottom', isBottom);
        toggleClass(
            this.overlayElement,
            'dv-drop-target-center',
            quadrant === 'center'
        );
    }

    private calculateQuadrant(
        overlayType: Set<Position>,
        x: number,
        y: number,
        width: number,
        height: number
    ): Position | null {
        const activationSizeOptions =
            this.options.overlayModel?.activationSize ??
            DEFAULT_ACTIVATION_SIZE;

        const isPercentage = activationSizeOptions.type === 'percentage';

        if (isPercentage) {
            return calculateQuadrantAsPercentage(
                overlayType,
                x,
                y,
                width,
                height,
                activationSizeOptions.value
            );
        }

        return calculateQuadrantAsPixels(
            overlayType,
            x,
            y,
            width,
            height,
            activationSizeOptions.value
        );
    }

    private removeDropTarget(): void {
        if (this.targetElement) {
            this._state = undefined;
            this.targetElement.parentElement?.classList.remove(
                'dv-drop-target'
            );
            this.targetElement.remove();
            this.targetElement = undefined;
            this.overlayElement = undefined;
        }
    }
}

export function calculateQuadrantAsPercentage(
    overlayType: Set<Position>,
    x: number,
    y: number,
    width: number,
    height: number,
    threshold: number
): Position | null {
    const xp = (100 * x) / width;
    const yp = (100 * y) / height;

    if (overlayType.has('left') && xp < threshold) {
        return 'left';
    }
    if (overlayType.has('right') && xp > 100 - threshold) {
        return 'right';
    }
    if (overlayType.has('top') && yp < threshold) {
        return 'top';
    }
    if (overlayType.has('bottom') && yp > 100 - threshold) {
        return 'bottom';
    }

    if (!overlayType.has('center')) {
        return null;
    }

    return 'center';
}

export function calculateQuadrantAsPixels(
    overlayType: Set<Position>,
    x: number,
    y: number,
    width: number,
    height: number,
    threshold: number
): Position | null {
    if (overlayType.has('left') && x < threshold) {
        return 'left';
    }
    if (overlayType.has('right') && x > width - threshold) {
        return 'right';
    }
    if (overlayType.has('top') && y < threshold) {
        return 'top';
    }
    if (overlayType.has('bottom') && y > height - threshold) {
        return 'bottom';
    }

    if (!overlayType.has('center')) {
        return null;
    }

    return 'center';
}
````

## File: packages/dockview-core/src/dnd/dropTargetAnchorContainer.ts
````typescript
import { CompositeDisposable, Disposable } from '../lifecycle';
import { DropTargetTargetModel } from './droptarget';

export class DropTargetAnchorContainer extends CompositeDisposable {
    private _model:
        | { root: HTMLElement; overlay: HTMLElement; changed: boolean }
        | undefined;

    private _outline: HTMLElement | undefined;

    private _disabled = false;

    get disabled(): boolean {
        return this._disabled;
    }

    set disabled(value: boolean) {
        if (this.disabled === value) {
            return;
        }

        this._disabled = value;

        if (value) {
            this.model?.clear();
        }
    }

    get model(): DropTargetTargetModel | undefined {
        if (this.disabled) {
            return undefined;
        }

        return {
            clear: () => {
                if (this._model) {
                    this._model.root.parentElement?.removeChild(
                        this._model.root
                    );
                }
                this._model = undefined;
            },
            exists: () => {
                return !!this._model;
            },
            getElements: (event?: DragEvent, outline?: HTMLElement) => {
                const changed = this._outline !== outline;
                this._outline = outline;

                if (this._model) {
                    this._model.changed = changed;
                    return this._model;
                }

                const container = this.createContainer();
                const anchor = this.createAnchor();

                this._model = { root: container, overlay: anchor, changed };

                container.appendChild(anchor);
                this.element.appendChild(container);

                if (event?.target instanceof HTMLElement) {
                    const targetBox = event.target.getBoundingClientRect();
                    const box = this.element.getBoundingClientRect();

                    anchor.style.left = `${targetBox.left - box.left}px`;
                    anchor.style.top = `${targetBox.top - box.top}px`;
                }

                return this._model;
            },
        };
    }

    constructor(readonly element: HTMLElement, options: { disabled: boolean }) {
        super();

        this._disabled = options.disabled;

        this.addDisposables(
            Disposable.from(() => {
                this.model?.clear();
            })
        );
    }

    private createContainer(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'dv-drop-target-container';

        return el;
    }

    private createAnchor(): HTMLElement {
        const el = document.createElement('div');
        el.className = 'dv-drop-target-anchor';
        el.style.visibility = 'hidden';

        return el;
    }
}
````

## File: packages/dockview-core/src/dnd/ghost.ts
````typescript
import { addClasses, removeClasses } from '../dom';

export function addGhostImage(
    dataTransfer: DataTransfer,
    ghostElement: HTMLElement,
    options?: { x?: number; y?: number }
): void {
    // class dockview provides to force ghost image to be drawn on a different layer and prevent weird rendering issues
    addClasses(ghostElement, 'dv-dragged');

    // move the element off-screen initially otherwise it may in some cases be rendered at (0,0) momentarily
    ghostElement.style.top = '-9999px';

    document.body.appendChild(ghostElement);
    dataTransfer.setDragImage(ghostElement, options?.x ?? 0, options?.y ?? 0);

    setTimeout(() => {
        removeClasses(ghostElement, 'dv-dragged');
        ghostElement.remove();
    }, 0);
}
````

## File: packages/dockview-core/src/dnd/groupDragHandler.ts
````typescript
import { DockviewComponent } from '../dockview/dockviewComponent';
import { DockviewGroupPanel } from '../dockview/dockviewGroupPanel';
import { quasiPreventDefault } from '../dom';
import { addDisposableListener } from '../events';
import { IDisposable } from '../lifecycle';
import { DragHandler } from './abstractDragHandler';
import { LocalSelectionTransfer, PanelTransfer } from './dataTransfer';
import { addGhostImage } from './ghost';

export class GroupDragHandler extends DragHandler {
    private readonly panelTransfer =
        LocalSelectionTransfer.getInstance<PanelTransfer>();

    constructor(
        element: HTMLElement,
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanel,
        disabled?: boolean
    ) {
        super(element, disabled);

        this.addDisposables(
            addDisposableListener(
                element,
                'pointerdown',
                (e) => {
                    if (e.shiftKey) {
                        /**
                         * You cannot call e.preventDefault() because that will prevent drag events from firing
                         * but we also need to stop any group overlay drag events from occuring
                         * Use a custom event marker that can be checked by the overlay drag events
                         */
                        quasiPreventDefault(e);
                    }
                },
                true
            )
        );
    }

    override isCancelled(_event: DragEvent): boolean {
        if (this.group.api.location.type === 'floating' && !_event.shiftKey) {
            return true;
        }
        return false;
    }

    getData(dragEvent: DragEvent): IDisposable {
        const dataTransfer = dragEvent.dataTransfer;

        this.panelTransfer.setData(
            [new PanelTransfer(this.accessor.id, this.group.id, null)],
            PanelTransfer.prototype
        );

        const style = window.getComputedStyle(this.el);

        const bgColor = style.getPropertyValue(
            '--dv-activegroup-visiblepanel-tab-background-color'
        );
        const color = style.getPropertyValue(
            '--dv-activegroup-visiblepanel-tab-color'
        );

        if (dataTransfer) {
            const ghostElement = document.createElement('div');

            ghostElement.style.backgroundColor = bgColor;
            ghostElement.style.color = color;
            ghostElement.style.padding = '2px 8px';
            ghostElement.style.height = '24px';
            ghostElement.style.fontSize = '11px';
            ghostElement.style.lineHeight = '20px';
            ghostElement.style.borderRadius = '12px';
            ghostElement.style.position = 'absolute';
            ghostElement.style.pointerEvents = 'none';
            ghostElement.style.top = '-9999px';
            ghostElement.textContent = `Multiple Panels (${this.group.size})`;

            addGhostImage(dataTransfer, ghostElement, { y: -10, x: 30 });
        }

        return {
            dispose: () => {
                this.panelTransfer.clearData(PanelTransfer.prototype);
            },
        };
    }
}
````

## File: packages/dockview-core/src/dockview/components/panel/content.ts
````typescript
import {
    CompositeDisposable,
    IDisposable,
    MutableDisposable,
} from '../../../lifecycle';
import { Emitter, Event } from '../../../events';
import { trackFocus } from '../../../dom';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewComponent } from '../../dockviewComponent';
import { Droptarget } from '../../../dnd/droptarget';
import { DockviewGroupPanelModel } from '../../dockviewGroupPanelModel';
import { getPanelData } from '../../../dnd/dataTransfer';

export interface IContentContainer extends IDisposable {
    readonly dropTarget: Droptarget;
    onDidFocus: Event<void>;
    onDidBlur: Event<void>;
    element: HTMLElement;
    layout(width: number, height: number): void;
    openPanel: (panel: IDockviewPanel) => void;
    closePanel: () => void;
    show(): void;
    hide(): void;
    renderPanel(panel: IDockviewPanel, options: { asActive: boolean }): void;
    refreshFocusState(): void;
}

export class ContentContainer
    extends CompositeDisposable
    implements IContentContainer
{
    private readonly _element: HTMLElement;
    private panel: IDockviewPanel | undefined;
    private readonly disposable = new MutableDisposable();
    private focusTracker: { refreshState?(): void } | undefined;

    private readonly _onDidFocus = new Emitter<void>();
    readonly onDidFocus: Event<void> = this._onDidFocus.event;

    private readonly _onDidBlur = new Emitter<void>();
    readonly onDidBlur: Event<void> = this._onDidBlur.event;

    get element(): HTMLElement {
        return this._element;
    }

    readonly dropTarget: Droptarget;

    constructor(
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanelModel
    ) {
        super();
        this._element = document.createElement('div');
        this._element.className = 'dv-content-container';
        this._element.tabIndex = -1;

        this.addDisposables(this._onDidFocus, this._onDidBlur);

        const target = group.dropTargetContainer;

        this.dropTarget = new Droptarget(this.element, {
            getOverlayOutline: () => {
                return accessor.options.theme?.dndPanelOverlay === 'group'
                    ? this.element.parentElement
                    : null;
            },
            className: 'dv-drop-target-content',
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            canDisplayOverlay: (event, position) => {
                if (
                    this.group.locked === 'no-drop-target' ||
                    (this.group.locked && position === 'center')
                ) {
                    return false;
                }

                const data = getPanelData();

                if (
                    !data &&
                    event.shiftKey &&
                    this.group.location.type !== 'floating'
                ) {
                    return false;
                }

                if (data && data.viewId === this.accessor.id) {
                    return true;
                }

                return this.group.canDisplayOverlay(event, position, 'content');
            },
            getOverrideTarget: target ? () => target.model : undefined,
        });

        this.addDisposables(this.dropTarget);
    }

    show(): void {
        this.element.style.display = '';
    }

    hide(): void {
        this.element.style.display = 'none';
    }

    renderPanel(
        panel: IDockviewPanel,
        options: { asActive: boolean } = { asActive: true }
    ): void {
        const doRender =
            options.asActive ||
            (this.panel && this.group.isPanelActive(this.panel));

        if (
            this.panel &&
            this.panel.view.content.element.parentElement === this._element
        ) {
            /**
             * If the currently attached panel is mounted directly to the content then remove it
             */
            this._element.removeChild(this.panel.view.content.element);
        }

        this.panel = panel;

        let container: HTMLElement;

        switch (panel.api.renderer) {
            case 'onlyWhenVisible':
                this.group.renderContainer.detatch(panel);
                if (this.panel) {
                    if (doRender) {
                        this._element.appendChild(
                            this.panel.view.content.element
                        );
                    }
                }
                container = this._element;
                break;
            case 'always':
                if (
                    panel.view.content.element.parentElement === this._element
                ) {
                    this._element.removeChild(panel.view.content.element);
                }
                container = this.group.renderContainer.attach({
                    panel,
                    referenceContainer: this,
                });
                break;
            default:
                throw new Error(
                    `dockview: invalid renderer type '${panel.api.renderer}'`
                );
        }

        if (doRender) {
            const focusTracker = trackFocus(container);
            this.focusTracker = focusTracker;
            const disposable = new CompositeDisposable();

            disposable.addDisposables(
                focusTracker,
                focusTracker.onDidFocus(() => this._onDidFocus.fire()),
                focusTracker.onDidBlur(() => this._onDidBlur.fire())
            );

            this.disposable.value = disposable;
        }
    }

    public openPanel(panel: IDockviewPanel): void {
        if (this.panel === panel) {
            return;
        }

        this.renderPanel(panel);
    }

    public layout(_width: number, _height: number): void {
        // noop
    }

    public closePanel(): void {
        if (this.panel) {
            if (this.panel.api.renderer === 'onlyWhenVisible') {
                this.panel.view.content.element.parentElement?.removeChild(
                    this.panel.view.content.element
                );
            }
        }
        this.panel = undefined;
    }

    public dispose(): void {
        this.disposable.dispose();
        super.dispose();
    }

    /**
     * Refresh the focus tracker state to handle cases where focus state
     * gets out of sync due to programmatic panel activation
     */
    public refreshFocusState(): void {
        if (this.focusTracker?.refreshState) {
            this.focusTracker.refreshState();
        }
    }
}
````

## File: packages/dockview-core/src/dockview/components/tab/defaultTab.ts
````typescript
import { CompositeDisposable } from '../../../lifecycle';
import { ITabRenderer, GroupPanelPartInitParameters } from '../../types';
import { addDisposableListener } from '../../../events';
import { createCloseButton } from '../../../svg';

export class DefaultTab extends CompositeDisposable implements ITabRenderer {
    private readonly _element: HTMLElement;
    private readonly _content: HTMLElement;
    private readonly action: HTMLElement;
    private _title: string | undefined;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        super();

        this._element = document.createElement('div');
        this._element.className = 'dv-default-tab';

        this._content = document.createElement('div');
        this._content.className = 'dv-default-tab-content';

        this.action = document.createElement('div');
        this.action.className = 'dv-default-tab-action';
        this.action.appendChild(createCloseButton());

        this._element.appendChild(this._content);
        this._element.appendChild(this.action);

        this.render();
    }

    init(params: GroupPanelPartInitParameters): void {
        this._title = params.title;

        this.addDisposables(
            params.api.onDidTitleChange((event) => {
                this._title = event.title;
                this.render();
            }),
            addDisposableListener(this.action, 'pointerdown', (ev) => {
                ev.preventDefault();
            }),
            addDisposableListener(this.action, 'click', (ev) => {
                if (ev.defaultPrevented) {
                    return;
                }

                ev.preventDefault();
                params.api.close();
            })
        );

        this.render();
    }

    private render(): void {
        if (this._content.textContent !== this._title) {
            this._content.textContent = this._title ?? '';
        }
    }
}
````

## File: packages/dockview-core/src/dockview/components/tab/tab.ts
````typescript
import { addDisposableListener, Emitter, Event } from '../../../events';
import { CompositeDisposable, IDisposable } from '../../../lifecycle';
import {
    getPanelData,
    LocalSelectionTransfer,
    PanelTransfer,
} from '../../../dnd/dataTransfer';
import { toggleClass } from '../../../dom';
import { DockviewComponent } from '../../dockviewComponent';
import { ITabRenderer } from '../../types';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import {
    DroptargetEvent,
    Droptarget,
    WillShowOverlayEvent,
} from '../../../dnd/droptarget';
import { DragHandler } from '../../../dnd/abstractDragHandler';
import { IDockviewPanel } from '../../dockviewPanel';
import { addGhostImage } from '../../../dnd/ghost';

class TabDragHandler extends DragHandler {
    private readonly panelTransfer =
        LocalSelectionTransfer.getInstance<PanelTransfer>();

    constructor(
        element: HTMLElement,
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanel,
        private readonly panel: IDockviewPanel,
        disabled?: boolean
    ) {
        super(element, disabled);
    }

    getData(event: DragEvent): IDisposable {
        this.panelTransfer.setData(
            [new PanelTransfer(this.accessor.id, this.group.id, this.panel.id)],
            PanelTransfer.prototype
        );

        return {
            dispose: () => {
                this.panelTransfer.clearData(PanelTransfer.prototype);
            },
        };
    }
}

export class Tab extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly dropTarget: Droptarget;
    private content: ITabRenderer | undefined = undefined;
    private readonly dragHandler: TabDragHandler;

    private readonly _onPointDown = new Emitter<MouseEvent>();
    readonly onPointerDown: Event<MouseEvent> = this._onPointDown.event;

    private readonly _onDropped = new Emitter<DroptargetEvent>();
    readonly onDrop: Event<DroptargetEvent> = this._onDropped.event;

    private readonly _onDragStart = new Emitter<DragEvent>();
    readonly onDragStart = this._onDragStart.event;

    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;

    public get element(): HTMLElement {
        return this._element;
    }

    constructor(
        public readonly panel: IDockviewPanel,
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanel
    ) {
        super();

        this._element = document.createElement('div');
        this._element.className = 'dv-tab';
        this._element.tabIndex = 0;
        this._element.draggable = !this.accessor.options.disableDnd;

        toggleClass(this.element, 'dv-inactive-tab', true);

        this.dragHandler = new TabDragHandler(
            this._element,
            this.accessor,
            this.group,
            this.panel,
            !!this.accessor.options.disableDnd
        );

        this.dropTarget = new Droptarget(this._element, {
            acceptedTargetZones: ['left', 'right'],
            overlayModel: { activationSize: { value: 50, type: 'percentage' } },
            canDisplayOverlay: (event, position) => {
                if (this.group.locked) {
                    return false;
                }

                const data = getPanelData();

                if (data && this.accessor.id === data.viewId) {
                    return true;
                }

                return this.group.model.canDisplayOverlay(
                    event,
                    position,
                    'tab'
                );
            },
            getOverrideTarget: () => group.model.dropTargetContainer?.model,
        });

        this.onWillShowOverlay = this.dropTarget.onWillShowOverlay;

        this.addDisposables(
            this._onPointDown,
            this._onDropped,
            this._onDragStart,
            this.dragHandler.onDragStart((event) => {
                if (event.dataTransfer) {
                    const style = getComputedStyle(this.element);
                    const newNode = this.element.cloneNode(true) as HTMLElement;
                    Array.from(style).forEach((key) =>
                        newNode.style.setProperty(
                            key,
                            style.getPropertyValue(key),
                            style.getPropertyPriority(key)
                        )
                    );
                    newNode.style.position = 'absolute';

                    addGhostImage(event.dataTransfer, newNode, {
                        y: -10,
                        x: 30,
                    });
                }
                this._onDragStart.fire(event);
            }),
            this.dragHandler,
            addDisposableListener(this._element, 'pointerdown', (event) => {
                this._onPointDown.fire(event);
            }),
            this.dropTarget.onDrop((event) => {
                this._onDropped.fire(event);
            }),
            this.dropTarget
        );
    }

    public setActive(isActive: boolean): void {
        toggleClass(this.element, 'dv-active-tab', isActive);
        toggleClass(this.element, 'dv-inactive-tab', !isActive);
    }

    public setContent(part: ITabRenderer): void {
        if (this.content) {
            this._element.removeChild(this.content.element);
        }
        this.content = part;
        this._element.appendChild(this.content.element);
    }

    public updateDragAndDropState(): void {
        this._element.draggable = !this.accessor.options.disableDnd;
        this.dragHandler.setDisabled(!!this.accessor.options.disableDnd);
    }

    public dispose(): void {
        super.dispose();
    }
}
````

## File: packages/dockview-core/src/dockview/components/titlebar/tabOverflowControl.ts
````typescript
import { createChevronRightButton } from '../../../svg';

export type DropdownElement = {
    element: HTMLElement;
    update: (params: { tabs: number }) => void;
    dispose?: () => void;
};

export function createDropdownElementHandle(): DropdownElement {
    const el = document.createElement('div');
    el.className = 'dv-tabs-overflow-dropdown-default';

    const text = document.createElement('span');
    text.textContent = ``;
    const icon = createChevronRightButton();
    el.appendChild(icon);
    el.appendChild(text);

    return {
        element: el,
        update: (params: { tabs: number }) => {
            text.textContent = `${params.tabs}`;
        },
    };
}
````

## File: packages/dockview-core/src/dockview/components/titlebar/tabs.ts
````typescript
import { getPanelData } from '../../../dnd/dataTransfer';
import {
    isChildEntirelyVisibleWithinParent,
    OverflowObserver,
} from '../../../dom';
import { addDisposableListener, Emitter, Event } from '../../../events';
import {
    CompositeDisposable,
    Disposable,
    IValueDisposable,
    MutableDisposable,
} from '../../../lifecycle';
import { Scrollbar } from '../../../scrollbar';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DockviewWillShowOverlayLocationEvent } from '../../events';
import { DockviewPanel, IDockviewPanel } from '../../dockviewPanel';
import { Tab } from '../tab/tab';
import { TabDragEvent, TabDropIndexEvent } from './tabsContainer';

export class Tabs extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly _tabsList: HTMLElement;
    private readonly _observerDisposable = new MutableDisposable();

    private _tabs: IValueDisposable<Tab>[] = [];
    private selectedIndex = -1;
    private _showTabsOverflowControl = false;

    private readonly _onTabDragStart = new Emitter<TabDragEvent>();
    readonly onTabDragStart: Event<TabDragEvent> = this._onTabDragStart.event;

    private readonly _onDrop = new Emitter<TabDropIndexEvent>();
    readonly onDrop: Event<TabDropIndexEvent> = this._onDrop.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    private readonly _onOverflowTabsChange = new Emitter<{
        tabs: string[];
        reset: boolean;
    }>();
    readonly onOverflowTabsChange = this._onOverflowTabsChange.event;

    get showTabsOverflowControl(): boolean {
        return this._showTabsOverflowControl;
    }

    set showTabsOverflowControl(value: boolean) {
        if (this._showTabsOverflowControl == value) {
            return;
        }

        this._showTabsOverflowControl = value;

        if (value) {
            const observer = new OverflowObserver(this._tabsList);

            this._observerDisposable.value = new CompositeDisposable(
                observer,
                observer.onDidChange((event) => {
                    const hasOverflow = event.hasScrollX || event.hasScrollY;
                    this.toggleDropdown({ reset: !hasOverflow });
                }),
                addDisposableListener(this._tabsList, 'scroll', () => {
                    this.toggleDropdown({ reset: false });
                })
            );
        }
    }

    get element(): HTMLElement {
        return this._element;
    }

    get panels(): string[] {
        return this._tabs.map((_) => _.value.panel.id);
    }

    get size(): number {
        return this._tabs.length;
    }

    get tabs(): Tab[] {
        return this._tabs.map((_) => _.value);
    }

    constructor(
        private readonly group: DockviewGroupPanel,
        private readonly accessor: DockviewComponent,
        options: {
            showTabsOverflowControl: boolean;
        }
    ) {
        super();

        this._tabsList = document.createElement('div');
        this._tabsList.className = 'dv-tabs-container dv-horizontal';

        this.showTabsOverflowControl = options.showTabsOverflowControl;

        if (accessor.options.scrollbars === 'native') {
            this._element = this._tabsList;
        } else {
            const scrollbar = new Scrollbar(this._tabsList);
            this._element = scrollbar.element;
            this.addDisposables(scrollbar);
        }

        this.addDisposables(
            this._onOverflowTabsChange,
            this._observerDisposable,
            this._onWillShowOverlay,
            this._onDrop,
            this._onTabDragStart,
            addDisposableListener(this.element, 'pointerdown', (event) => {
                if (event.defaultPrevented) {
                    return;
                }

                const isLeftClick = event.button === 0;

                if (isLeftClick) {
                    this.accessor.doSetGroupActive(this.group);
                }
            }),
            Disposable.from(() => {
                for (const { value, disposable } of this._tabs) {
                    disposable.dispose();
                    value.dispose();
                }

                this._tabs = [];
            })
        );
    }

    indexOf(id: string): number {
        return this._tabs.findIndex((tab) => tab.value.panel.id === id);
    }

    isActive(tab: Tab): boolean {
        return (
            this.selectedIndex > -1 &&
            this._tabs[this.selectedIndex].value === tab
        );
    }

    setActivePanel(panel: IDockviewPanel): void {
        let runningWidth = 0;

        for (const tab of this._tabs) {
            const isActivePanel = panel.id === tab.value.panel.id;
            tab.value.setActive(isActivePanel);

            if (isActivePanel) {
                const element = tab.value.element;
                const parentElement = element.parentElement!;

                if (
                    runningWidth < parentElement.scrollLeft ||
                    runningWidth + element.clientWidth >
                        parentElement.scrollLeft + parentElement.clientWidth
                ) {
                    parentElement.scrollLeft = runningWidth;
                }
            }

            runningWidth += tab.value.element.clientWidth;
        }
    }

    openPanel(panel: IDockviewPanel, index: number = this._tabs.length): void {
        if (this._tabs.find((tab) => tab.value.panel.id === panel.id)) {
            return;
        }
        const tab = new Tab(panel, this.accessor, this.group);
        tab.setContent(panel.view.tab);

        const disposable = new CompositeDisposable(
            tab.onDragStart((event) => {
                this._onTabDragStart.fire({ nativeEvent: event, panel });
            }),
            tab.onPointerDown((event) => {
                if (event.defaultPrevented) {
                    return;
                }

                const isFloatingGroupsEnabled =
                    !this.accessor.options.disableFloatingGroups;

                const isFloatingWithOnePanel =
                    this.group.api.location.type === 'floating' &&
                    this.size === 1;

                if (
                    isFloatingGroupsEnabled &&
                    !isFloatingWithOnePanel &&
                    event.shiftKey
                ) {
                    event.preventDefault();

                    const panel = this.accessor.getGroupPanel(tab.panel.id);

                    const { top, left } = tab.element.getBoundingClientRect();
                    const { top: rootTop, left: rootLeft } =
                        this.accessor.element.getBoundingClientRect();

                    this.accessor.addFloatingGroup(panel as DockviewPanel, {
                        x: left - rootLeft,
                        y: top - rootTop,
                        inDragMode: true,
                    });
                    return;
                }

                switch (event.button) {
                    case 0: // left click or touch
                        if (this.group.activePanel !== panel) {
                            this.group.model.openPanel(panel);
                        }
                        break;
                }
            }),
            tab.onDrop((event) => {
                this._onDrop.fire({
                    event: event.nativeEvent,
                    index: this._tabs.findIndex((x) => x.value === tab),
                });
            }),
            tab.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(
                    new DockviewWillShowOverlayLocationEvent(event, {
                        kind: 'tab',
                        panel: this.group.activePanel,
                        api: this.accessor.api,
                        group: this.group,
                        getData: getPanelData,
                    })
                );
            })
        );

        const value: IValueDisposable<Tab> = { value: tab, disposable };

        this.addTab(value, index);
    }

    delete(id: string): void {
        const index = this.indexOf(id);
        const tabToRemove = this._tabs.splice(index, 1)[0];

        const { value, disposable } = tabToRemove;

        disposable.dispose();
        value.dispose();
        value.element.remove();
    }

    private addTab(
        tab: IValueDisposable<Tab>,
        index: number = this._tabs.length
    ): void {
        if (index < 0 || index > this._tabs.length) {
            throw new Error('invalid location');
        }

        this._tabsList.insertBefore(
            tab.value.element,
            this._tabsList.children[index]
        );

        this._tabs = [
            ...this._tabs.slice(0, index),
            tab,
            ...this._tabs.slice(index),
        ];

        if (this.selectedIndex < 0) {
            this.selectedIndex = index;
        }
    }

    private toggleDropdown(options: { reset: boolean }): void {
        const tabs = options.reset
            ? []
            : this._tabs
                  .filter(
                      (tab) =>
                          !isChildEntirelyVisibleWithinParent(
                              tab.value.element,
                              this._tabsList
                          )
                  )
                  .map((x) => x.value.panel.id);

        this._onOverflowTabsChange.fire({ tabs, reset: options.reset });
    }

    updateDragAndDropState(): void {
        for (const tab of this._tabs) {
            tab.value.updateDragAndDropState();
        }
    }
}
````

## File: packages/dockview-core/src/dockview/components/titlebar/tabsContainer.ts
````typescript
import {
    IDisposable,
    CompositeDisposable,
    Disposable,
    MutableDisposable,
} from '../../../lifecycle';
import { addDisposableListener, Emitter, Event } from '../../../events';
import { Tab } from '../tab/tab';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { VoidContainer } from './voidContainer';
import { findRelativeZIndexParent, toggleClass } from '../../../dom';
import { IDockviewPanel } from '../../dockviewPanel';
import { DockviewComponent } from '../../dockviewComponent';
import { DockviewWillShowOverlayLocationEvent } from '../../events';
import { getPanelData } from '../../../dnd/dataTransfer';
import { Tabs } from './tabs';
import {
    createDropdownElementHandle,
    DropdownElement,
} from './tabOverflowControl';

export interface TabDropIndexEvent {
    readonly event: DragEvent;
    readonly index: number;
}

export interface TabDragEvent {
    readonly nativeEvent: DragEvent;
    readonly panel: IDockviewPanel;
}

export interface GroupDragEvent {
    readonly nativeEvent: DragEvent;
    readonly group: DockviewGroupPanel;
}

export interface ITabsContainer extends IDisposable {
    readonly element: HTMLElement;
    readonly panels: string[];
    readonly size: number;
    readonly onDrop: Event<TabDropIndexEvent>;
    readonly onTabDragStart: Event<TabDragEvent>;
    readonly onGroupDragStart: Event<GroupDragEvent>;
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent>;
    hidden: boolean;
    delete(id: string): void;
    indexOf(id: string): number;
    setActive(isGroupActive: boolean): void;
    setActivePanel(panel: IDockviewPanel): void;
    isActive(tab: Tab): boolean;
    closePanel(panel: IDockviewPanel): void;
    openPanel(panel: IDockviewPanel, index?: number): void;
    setRightActionsElement(element: HTMLElement | undefined): void;
    setLeftActionsElement(element: HTMLElement | undefined): void;
    setPrefixActionsElement(element: HTMLElement | undefined): void;
    show(): void;
    hide(): void;
    updateDragAndDropState(): void;
}

export class TabsContainer
    extends CompositeDisposable
    implements ITabsContainer
{
    private readonly _element: HTMLElement;
    private readonly tabs: Tabs;
    private readonly rightActionsContainer: HTMLElement;
    private readonly leftActionsContainer: HTMLElement;
    private readonly preActionsContainer: HTMLElement;
    private readonly voidContainer: VoidContainer;

    private rightActions: HTMLElement | undefined;
    private leftActions: HTMLElement | undefined;
    private preActions: HTMLElement | undefined;

    private _hidden = false;

    private dropdownPart: DropdownElement | null = null;
    private _overflowTabs: string[] = [];
    private readonly _dropdownDisposable = new MutableDisposable();

    private readonly _onDrop = new Emitter<TabDropIndexEvent>();
    readonly onDrop: Event<TabDropIndexEvent> = this._onDrop.event;

    get onTabDragStart(): Event<TabDragEvent> {
        return this.tabs.onTabDragStart;
    }

    private readonly _onGroupDragStart = new Emitter<GroupDragEvent>();
    readonly onGroupDragStart: Event<GroupDragEvent> =
        this._onGroupDragStart.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    get panels(): string[] {
        return this.tabs.panels;
    }

    get size(): number {
        return this.tabs.size;
    }

    get hidden(): boolean {
        return this._hidden;
    }

    set hidden(value: boolean) {
        this._hidden = value;
        this.element.style.display = value ? 'none' : '';
    }

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanel
    ) {
        super();

        this._element = document.createElement('div');
        this._element.className = 'dv-tabs-and-actions-container';

        toggleClass(
            this._element,
            'dv-full-width-single-tab',
            this.accessor.options.singleTabMode === 'fullwidth'
        );

        this.rightActionsContainer = document.createElement('div');
        this.rightActionsContainer.className = 'dv-right-actions-container';

        this.leftActionsContainer = document.createElement('div');
        this.leftActionsContainer.className = 'dv-left-actions-container';

        this.preActionsContainer = document.createElement('div');
        this.preActionsContainer.className = 'dv-pre-actions-container';

        this.tabs = new Tabs(group, accessor, {
            showTabsOverflowControl: !accessor.options.disableTabsOverflowList,
        });

        this.voidContainer = new VoidContainer(this.accessor, this.group);

        this._element.appendChild(this.preActionsContainer);
        this._element.appendChild(this.tabs.element);
        this._element.appendChild(this.leftActionsContainer);
        this._element.appendChild(this.voidContainer.element);
        this._element.appendChild(this.rightActionsContainer);

        this.addDisposables(
            this.tabs.onDrop((e) => this._onDrop.fire(e)),
            this.tabs.onWillShowOverlay((e) => this._onWillShowOverlay.fire(e)),
            accessor.onDidOptionsChange(() => {
                this.tabs.showTabsOverflowControl =
                    !accessor.options.disableTabsOverflowList;
            }),
            this.tabs.onOverflowTabsChange((event) => {
                this.toggleDropdown(event);
            }),
            this.tabs,
            this._onWillShowOverlay,
            this._onDrop,
            this._onGroupDragStart,
            this.voidContainer,
            this.voidContainer.onDragStart((event) => {
                this._onGroupDragStart.fire({
                    nativeEvent: event,
                    group: this.group,
                });
            }),
            this.voidContainer.onDrop((event) => {
                this._onDrop.fire({
                    event: event.nativeEvent,
                    index: this.tabs.size,
                });
            }),
            this.voidContainer.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(
                    new DockviewWillShowOverlayLocationEvent(event, {
                        kind: 'header_space',
                        panel: this.group.activePanel,
                        api: this.accessor.api,
                        group: this.group,
                        getData: getPanelData,
                    })
                );
            }),
            addDisposableListener(
                this.voidContainer.element,
                'pointerdown',
                (event) => {
                    if (event.defaultPrevented) {
                        return;
                    }

                    const isFloatingGroupsEnabled =
                        !this.accessor.options.disableFloatingGroups;

                    if (
                        isFloatingGroupsEnabled &&
                        event.shiftKey &&
                        this.group.api.location.type !== 'floating'
                    ) {
                        event.preventDefault();

                        const { top, left } =
                            this.element.getBoundingClientRect();
                        const { top: rootTop, left: rootLeft } =
                            this.accessor.element.getBoundingClientRect();

                        this.accessor.addFloatingGroup(this.group, {
                            x: left - rootLeft + 20,
                            y: top - rootTop + 20,
                            inDragMode: true,
                        });
                    }
                }
            )
        );
    }

    show(): void {
        if (!this.hidden) {
            this.element.style.display = '';
        }
    }

    hide(): void {
        this._element.style.display = 'none';
    }

    setRightActionsElement(element: HTMLElement | undefined): void {
        if (this.rightActions === element) {
            return;
        }
        if (this.rightActions) {
            this.rightActions.remove();
            this.rightActions = undefined;
        }
        if (element) {
            this.rightActionsContainer.appendChild(element);
            this.rightActions = element;
        }
    }

    setLeftActionsElement(element: HTMLElement | undefined): void {
        if (this.leftActions === element) {
            return;
        }
        if (this.leftActions) {
            this.leftActions.remove();
            this.leftActions = undefined;
        }
        if (element) {
            this.leftActionsContainer.appendChild(element);
            this.leftActions = element;
        }
    }

    setPrefixActionsElement(element: HTMLElement | undefined): void {
        if (this.preActions === element) {
            return;
        }
        if (this.preActions) {
            this.preActions.remove();
            this.preActions = undefined;
        }
        if (element) {
            this.preActionsContainer.appendChild(element);
            this.preActions = element;
        }
    }

    isActive(tab: Tab): boolean {
        return this.tabs.isActive(tab);
    }

    indexOf(id: string): number {
        return this.tabs.indexOf(id);
    }

    setActive(_isGroupActive: boolean) {
        // noop
    }

    delete(id: string): void {
        this.tabs.delete(id);
        this.updateClassnames();
    }

    setActivePanel(panel: IDockviewPanel): void {
        this.tabs.setActivePanel(panel);
    }

    openPanel(panel: IDockviewPanel, index: number = this.tabs.size): void {
        this.tabs.openPanel(panel, index);
        this.updateClassnames();
    }

    closePanel(panel: IDockviewPanel): void {
        this.delete(panel.id);
    }

    private updateClassnames(): void {
        toggleClass(this._element, 'dv-single-tab', this.size === 1);
    }

    private toggleDropdown(options: { tabs: string[]; reset: boolean }): void {
        const tabs = options.reset ? [] : options.tabs;
        this._overflowTabs = tabs;

        if (this._overflowTabs.length > 0 && this.dropdownPart) {
            this.dropdownPart.update({ tabs: tabs.length });
            return;
        }

        if (this._overflowTabs.length === 0) {
            this._dropdownDisposable.dispose();
            return;
        }

        const root = document.createElement('div');
        root.className = 'dv-tabs-overflow-dropdown-root';

        const part = createDropdownElementHandle();
        part.update({ tabs: tabs.length });

        this.dropdownPart = part;

        root.appendChild(part.element);
        this.rightActionsContainer.prepend(root);

        this._dropdownDisposable.value = new CompositeDisposable(
            Disposable.from(() => {
                root.remove();
                this.dropdownPart?.dispose?.();
                this.dropdownPart = null;
            }),
            addDisposableListener(
                root,
                'pointerdown',
                (event) => {
                    event.preventDefault();
                },
                { capture: true }
            ),
            addDisposableListener(root, 'click', (event) => {
                const el = document.createElement('div');
                el.style.overflow = 'auto';
                el.className = 'dv-tabs-overflow-container';

                for (const tab of this.tabs.tabs.filter((tab) =>
                    this._overflowTabs.includes(tab.panel.id)
                )) {
                    const panelObject = this.group.panels.find(
                        (panel) => panel === tab.panel
                    )!;

                    const tabComponent =
                        panelObject.view.createTabRenderer('headerOverflow');

                    const child = tabComponent.element;

                    const wrapper = document.createElement('div');
                    toggleClass(wrapper, 'dv-tab', true);
                    toggleClass(
                        wrapper,
                        'dv-active-tab',
                        panelObject.api.isActive
                    );
                    toggleClass(
                        wrapper,
                        'dv-inactive-tab',
                        !panelObject.api.isActive
                    );

                    wrapper.addEventListener('click', (event) => {
                        this.accessor.popupService.close();

                        if (event.defaultPrevented) {
                            return;
                        }

                        tab.element.scrollIntoView();
                        tab.panel.api.setActive();
                    });
                    wrapper.appendChild(child);

                    el.appendChild(wrapper);
                }

                const relativeParent = findRelativeZIndexParent(root);

                this.accessor.popupService.openPopover(el, {
                    x: event.clientX,
                    y: event.clientY,
                    zIndex: relativeParent?.style.zIndex
                        ? `calc(${relativeParent.style.zIndex} * 2)`
                        : undefined,
                });
            })
        );
    }

    updateDragAndDropState(): void {
        this.tabs.updateDragAndDropState();
        this.voidContainer.updateDragAndDropState();
    }
}
````

## File: packages/dockview-core/src/dockview/components/titlebar/voidContainer.ts
````typescript
import { getPanelData } from '../../../dnd/dataTransfer';
import {
    Droptarget,
    DroptargetEvent,
    WillShowOverlayEvent,
} from '../../../dnd/droptarget';
import { GroupDragHandler } from '../../../dnd/groupDragHandler';
import { DockviewComponent } from '../../dockviewComponent';
import { addDisposableListener, Emitter, Event } from '../../../events';
import { CompositeDisposable } from '../../../lifecycle';
import { DockviewGroupPanel } from '../../dockviewGroupPanel';
import { DockviewGroupPanelModel } from '../../dockviewGroupPanelModel';
import { toggleClass } from '../../../dom';

export class VoidContainer extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly dropTarget: Droptarget;
    private readonly handler: GroupDragHandler;

    private readonly _onDrop = new Emitter<DroptargetEvent>();
    readonly onDrop: Event<DroptargetEvent> = this._onDrop.event;

    private readonly _onDragStart = new Emitter<DragEvent>();
    readonly onDragStart = this._onDragStart.event;

    readonly onWillShowOverlay: Event<WillShowOverlayEvent>;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(
        private readonly accessor: DockviewComponent,
        private readonly group: DockviewGroupPanel
    ) {
        super();

        this._element = document.createElement('div');

        this._element.className = 'dv-void-container';
        this._element.draggable = !this.accessor.options.disableDnd;
        
        toggleClass(this._element, 'dv-draggable', !this.accessor.options.disableDnd);

        this.addDisposables(
            this._onDrop,
            this._onDragStart,
            addDisposableListener(this._element, 'pointerdown', () => {
                this.accessor.doSetGroupActive(this.group);
            })
        );

        this.handler = new GroupDragHandler(this._element, accessor, group, !!this.accessor.options.disableDnd);

        this.dropTarget = new Droptarget(this._element, {
            acceptedTargetZones: ['center'],
            canDisplayOverlay: (event, position) => {
                const data = getPanelData();

                if (data && this.accessor.id === data.viewId) {
                    return true;
                }

                return group.model.canDisplayOverlay(
                    event,
                    position,
                    'header_space'
                );
            },
            getOverrideTarget: () => group.model.dropTargetContainer?.model,
        });

        this.onWillShowOverlay = this.dropTarget.onWillShowOverlay;

        this.addDisposables(
            this.handler,
            this.handler.onDragStart((event) => {
                this._onDragStart.fire(event);
            }),
            this.dropTarget.onDrop((event) => {
                this._onDrop.fire(event);
            }),
            this.dropTarget
        );
    }

    updateDragAndDropState(): void {
        this._element.draggable = !this.accessor.options.disableDnd;
        toggleClass(this._element, 'dv-draggable', !this.accessor.options.disableDnd);
        this.handler.setDisabled(!!this.accessor.options.disableDnd);
    }
}
````

## File: packages/dockview-core/src/dockview/components/watermark/watermark.ts
````typescript
import {
    IWatermarkRenderer,
    WatermarkRendererInitParameters,
} from '../../types';
import { CompositeDisposable } from '../../../lifecycle';

export class Watermark
    extends CompositeDisposable
    implements IWatermarkRenderer
{
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        super();
        this._element = document.createElement('div');
        this._element.className = 'dv-watermark';
    }

    init(_params: WatermarkRendererInitParameters): void {
        // noop
    }
}
````

## File: packages/dockview-core/src/dockview/components/popupService.ts
````typescript
import { shiftAbsoluteElementIntoView } from '../../dom';
import { addDisposableListener } from '../../events';
import {
    CompositeDisposable,
    Disposable,
    MutableDisposable,
} from '../../lifecycle';

export class PopupService extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private _active: HTMLElement | null = null;
    private readonly _activeDisposable = new MutableDisposable();

    constructor(private readonly root: HTMLElement) {
        super();

        this._element = document.createElement('div');
        this._element.className = 'dv-popover-anchor';
        this._element.style.position = 'relative';

        this.root.prepend(this._element);

        this.addDisposables(
            Disposable.from(() => {
                this.close();
            }),
            this._activeDisposable
        );
    }

    openPopover(
        element: HTMLElement,
        position: { x: number; y: number; zIndex?: string }
    ): void {
        this.close();

        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.zIndex = position.zIndex ?? 'var(--dv-overlay-z-index)';
        wrapper.appendChild(element);

        const anchorBox = this._element.getBoundingClientRect();
        const offsetX = anchorBox.left;
        const offsetY = anchorBox.top;

        wrapper.style.top = `${position.y - offsetY}px`;
        wrapper.style.left = `${position.x - offsetX}px`;

        this._element.appendChild(wrapper);

        this._active = wrapper;

        this._activeDisposable.value = new CompositeDisposable(
            addDisposableListener(window, 'pointerdown', (event) => {
                const target = event.target;

                if (!(target instanceof HTMLElement)) {
                    return;
                }

                let el: HTMLElement | null = target;

                while (el && el !== wrapper) {
                    el = el?.parentElement ?? null;
                }

                if (el) {
                    return; // clicked within popover
                }

                this.close();
            }),
            addDisposableListener(window, 'resize', () => {
                this.close();
            })
        );

        requestAnimationFrame(() => {
            shiftAbsoluteElementIntoView(wrapper, this.root);
        });
    }

    close(): void {
        if (this._active) {
            this._active.remove();
            this._activeDisposable.dispose();
            this._active = null;
        }
    }
}
````

## File: packages/dockview-core/src/dockview/deserializer.ts
````typescript
import { GroupviewPanelState } from './types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewPanel, IDockviewPanel } from './dockviewPanel';
import { DockviewComponent } from './dockviewComponent';
import { DockviewPanelModel } from './dockviewPanelModel';
import { DockviewApi } from '../api/component.api';

export interface IPanelDeserializer {
    fromJSON(
        panelData: GroupviewPanelState,
        group: DockviewGroupPanel
    ): IDockviewPanel;
}

// @deprecated
interface LegacyState extends GroupviewPanelState {
    view?: {
        tab?: { id: string };
        content: { id: string };
    };
}

export class DefaultDockviewDeserialzier implements IPanelDeserializer {
    constructor(private readonly accessor: DockviewComponent) {}

    public fromJSON(
        panelData: GroupviewPanelState,
        group: DockviewGroupPanel
    ): IDockviewPanel {
        const panelId = panelData.id;
        const params = panelData.params;
        const title = panelData.title;

        const viewData = (panelData as LegacyState).view!;

        const contentComponent = viewData
            ? viewData.content.id
            : panelData.contentComponent ?? 'unknown';
        const tabComponent = viewData
            ? viewData.tab?.id
            : panelData.tabComponent;

        const view = new DockviewPanelModel(
            this.accessor,
            panelId,
            contentComponent,
            tabComponent
        );

        const panel = new DockviewPanel(
            panelId,
            contentComponent,
            tabComponent,
            this.accessor,
            new DockviewApi(this.accessor),
            group,
            view,
            {
                renderer: panelData.renderer,
                minimumWidth: panelData.minimumWidth,
                minimumHeight: panelData.minimumHeight,
                maximumWidth: panelData.maximumWidth,
                maximumHeight: panelData.maximumHeight,
            }
        );

        panel.init({
            title: title ?? panelId,
            params: params ?? {},
        });

        return panel;
    }
}
````

## File: packages/dockview-core/src/dockview/dockviewComponent.ts
````typescript
import {
    getRelativeLocation,
    SerializedGridObject,
    getGridLocation,
    ISerializedLeafNode,
    orthogonal,
} from '../gridview/gridview';
import {
    directionToPosition,
    Droptarget,
    DroptargetOverlayModel,
    Position,
} from '../dnd/droptarget';
import { tail, sequenceEquals, remove } from '../array';
import { DockviewPanel, IDockviewPanel } from './dockviewPanel';
import { CompositeDisposable, Disposable } from '../lifecycle';
import { Event, Emitter, addDisposableListener } from '../events';
import { Watermark } from './components/watermark/watermark';
import { IWatermarkRenderer, GroupviewPanelState } from './types';
import { sequentialNumberGenerator } from '../math';
import { DefaultDockviewDeserialzier } from './deserializer';
import {
    AddGroupOptions,
    AddPanelOptions,
    DockviewComponentOptions,
    DockviewDndOverlayEvent,
    DockviewOptions,
    DockviewUnhandledDragOverEvent,
    isGroupOptionsWithGroup,
    isGroupOptionsWithPanel,
    isPanelOptionsWithGroup,
    isPanelOptionsWithPanel,
    MovementOptions,
} from './options';
import {
    BaseGrid,
    Direction,
    IBaseGrid,
    toTarget,
} from '../gridview/baseComponentGridview';
import { DockviewApi } from '../api/component.api';
import { Orientation } from '../splitview/splitview';
import {
    GroupOptions,
    GroupPanelViewState,
    DockviewDidDropEvent,
    DockviewWillDropEvent,
} from './dockviewGroupPanelModel';
import { DockviewWillShowOverlayLocationEvent } from './events';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { DockviewPanelModel } from './dockviewPanelModel';
import { getPanelData } from '../dnd/dataTransfer';
import { Parameters } from '../panel/types';
import { Overlay } from '../overlay/overlay';
import {
    addTestId,
    Classnames,
    getDockviewTheme,
    onDidWindowResizeEnd,
    onDidWindowMoveEnd,
    toggleClass,
    watchElementResize,
} from '../dom';
import { DockviewFloatingGroupPanel } from './dockviewFloatingGroupPanel';
import {
    GroupDragEvent,
    TabDragEvent,
} from './components/titlebar/tabsContainer';
import { AnchoredBox, AnchorPosition, Box } from '../types';
import {
    DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE,
    DEFAULT_FLOATING_GROUP_POSITION,
    DESERIALIZATION_POPOUT_DELAY_MS,
} from '../constants';
import {
    DockviewPanelRenderer,
    OverlayRenderContainer,
} from '../overlay/overlayRenderContainer';
import { PopoutWindow } from '../popoutWindow';
import { StrictEventsSequencing } from './strictEventsSequencing';
import { PopupService } from './components/popupService';
import { DropTargetAnchorContainer } from '../dnd/dropTargetAnchorContainer';
import { themeAbyss } from './theme';

const DEFAULT_ROOT_OVERLAY_MODEL: DroptargetOverlayModel = {
    activationSize: { type: 'pixels', value: 10 },
    size: { type: 'pixels', value: 20 },
};

function moveGroupWithoutDestroying(options: {
    from: DockviewGroupPanel;
    to: DockviewGroupPanel;
}) {
    const activePanel = options.from.activePanel;
    const panels = [...options.from.panels].map((panel) => {
        const removedPanel = options.from.model.removePanel(panel);
        options.from.model.renderContainer.detatch(panel);
        return removedPanel;
    });

    panels.forEach((panel) => {
        options.to.model.openPanel(panel, {
            skipSetActive: activePanel !== panel,
            skipSetGroupActive: true,
        });
    });
}

export interface DockviewPopoutGroupOptions {
    /**
     * The position of the popout group
     */
    position?: Box;
    /**
     * The same-origin path at which the popout window will be created
     *
     * Defaults to `/popout.html` if not provided
     */
    popoutUrl?: string;
    referenceGroup?: DockviewGroupPanel;
    onDidOpen?: (event: { id: string; window: Window }) => void;
    onWillClose?: (event: { id: string; window: Window }) => void;
    overridePopoutGroup?: DockviewGroupPanel;
}

export interface PanelReference {
    update: (event: { params: { [key: string]: any } }) => void;
    remove: () => void;
}

export interface SerializedFloatingGroup {
    data: GroupPanelViewState;
    position: AnchoredBox;
}

export interface SerializedPopoutGroup {
    data: GroupPanelViewState;
    url?: string;
    gridReferenceGroup?: string;
    position: Box | null;
}

export interface SerializedDockview {
    grid: {
        root: SerializedGridObject<GroupPanelViewState>;
        height: number;
        width: number;
        orientation: Orientation;
    };
    panels: Record<string, GroupviewPanelState>;
    activeGroup?: string;
    floatingGroups?: SerializedFloatingGroup[];
    popoutGroups?: SerializedPopoutGroup[];
}

export interface MovePanelEvent {
    panel: IDockviewPanel;
    from: DockviewGroupPanel;
}

type MoveGroupOptions = {
    from: { group: DockviewGroupPanel };
    to: { group: DockviewGroupPanel; position: Position };
    skipSetActive?: boolean;
};

type MoveGroupOrPanelOptions = {
    from: {
        groupId: string;
        panelId?: string;
    };
    to: {
        group: DockviewGroupPanel;
        position: Position;
        index?: number;
    };
    skipSetActive?: boolean;
    keepEmptyGroups?: boolean;
};

export interface FloatingGroupOptions {
    x?: number;
    y?: number;
    height?: number;
    width?: number;
    position?: AnchorPosition;
}

export interface FloatingGroupOptionsInternal extends FloatingGroupOptions {
    skipRemoveGroup?: boolean;
    inDragMode?: boolean;
    skipActiveGroup?: boolean;
}

export interface DockviewMaximizedGroupChanged {
    group: DockviewGroupPanel;
    isMaximized: boolean;
}

export interface PopoutGroupChangeSizeEvent {
    width: number;
    height: number;
    group: DockviewGroupPanel;
}

export interface PopoutGroupChangePositionEvent {
    screenX: number;
    screenY: number;
    group: DockviewGroupPanel;
}

export interface IDockviewComponent extends IBaseGrid<DockviewGroupPanel> {
    readonly activePanel: IDockviewPanel | undefined;
    readonly totalPanels: number;
    readonly panels: IDockviewPanel[];
    readonly orientation: Orientation;
    readonly onDidDrop: Event<DockviewDidDropEvent>;
    readonly onWillDrop: Event<DockviewWillDropEvent>;
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent>;
    readonly onDidRemovePanel: Event<IDockviewPanel>;
    readonly onDidAddPanel: Event<IDockviewPanel>;
    readonly onDidLayoutFromJSON: Event<void>;
    readonly onDidActivePanelChange: Event<IDockviewPanel | undefined>;
    readonly onWillDragPanel: Event<TabDragEvent>;
    readonly onWillDragGroup: Event<GroupDragEvent>;
    readonly onDidRemoveGroup: Event<DockviewGroupPanel>;
    readonly onDidAddGroup: Event<DockviewGroupPanel>;
    readonly onDidActiveGroupChange: Event<DockviewGroupPanel | undefined>;
    readonly onUnhandledDragOverEvent: Event<DockviewDndOverlayEvent>;
    readonly onDidMovePanel: Event<MovePanelEvent>;
    readonly onDidMaximizedGroupChange: Event<DockviewMaximizedGroupChanged>;
    readonly onDidPopoutGroupSizeChange: Event<PopoutGroupChangeSizeEvent>;
    readonly onDidPopoutGroupPositionChange: Event<PopoutGroupChangePositionEvent>;
    readonly onDidOpenPopoutWindowFail: Event<void>;
    readonly options: DockviewComponentOptions;
    updateOptions(options: DockviewOptions): void;
    moveGroupOrPanel(options: MoveGroupOrPanelOptions): void;
    moveGroup(options: MoveGroupOptions): void;
    doSetGroupActive: (group: DockviewGroupPanel, skipFocus?: boolean) => void;
    removeGroup: (group: DockviewGroupPanel) => void;
    addPanel<T extends object = Parameters>(
        options: AddPanelOptions<T>
    ): IDockviewPanel;
    removePanel(panel: IDockviewPanel): void;
    getGroupPanel: (id: string) => IDockviewPanel | undefined;
    createWatermarkComponent(): IWatermarkRenderer;
    // lifecycle
    addGroup(options?: AddGroupOptions): DockviewGroupPanel;
    closeAllGroups(): void;
    // events
    moveToNext(options?: MovementOptions): void;
    moveToPrevious(options?: MovementOptions): void;
    setActivePanel(panel: IDockviewPanel): void;
    focus(): void;
    toJSON(): SerializedDockview;
    fromJSON(data: SerializedDockview): void;
    //
    addFloatingGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: FloatingGroupOptions
    ): void;
    addPopoutGroup(
        item: IDockviewPanel | DockviewGroupPanel,
        options?: {
            position?: Box;
            popoutUrl?: string;
            onDidOpen?: (event: { id: string; window: Window }) => void;
            onWillClose?: (event: { id: string; window: Window }) => void;
        }
    ): Promise<boolean>;
    fromJSON(data: any, options?: { reuseExistingPanels: boolean }): void;
}

export class DockviewComponent
    extends BaseGrid<DockviewGroupPanel>
    implements IDockviewComponent
{
    private readonly nextGroupId = sequentialNumberGenerator();
    private readonly _deserializer = new DefaultDockviewDeserialzier(this);
    private readonly _api: DockviewApi;
    private _options: Exclude<DockviewComponentOptions, 'orientation'>;
    private _watermark: IWatermarkRenderer | null = null;
    private readonly _themeClassnames: Classnames;

    readonly overlayRenderContainer: OverlayRenderContainer;
    readonly popupService: PopupService;
    readonly rootDropTargetContainer: DropTargetAnchorContainer;

    private readonly _onWillDragPanel = new Emitter<TabDragEvent>();
    readonly onWillDragPanel: Event<TabDragEvent> = this._onWillDragPanel.event;

    private readonly _onWillDragGroup = new Emitter<GroupDragEvent>();
    readonly onWillDragGroup: Event<GroupDragEvent> =
        this._onWillDragGroup.event;

    private readonly _onDidDrop = new Emitter<DockviewDidDropEvent>();
    readonly onDidDrop: Event<DockviewDidDropEvent> = this._onDidDrop.event;

    private readonly _onWillDrop = new Emitter<DockviewWillDropEvent>();
    readonly onWillDrop: Event<DockviewWillDropEvent> = this._onWillDrop.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    private readonly _onUnhandledDragOverEvent =
        new Emitter<DockviewDndOverlayEvent>();
    readonly onUnhandledDragOverEvent: Event<DockviewDndOverlayEvent> =
        this._onUnhandledDragOverEvent.event;

    private readonly _onDidRemovePanel = new Emitter<IDockviewPanel>();
    readonly onDidRemovePanel: Event<IDockviewPanel> =
        this._onDidRemovePanel.event;

    private readonly _onDidAddPanel = new Emitter<IDockviewPanel>();
    readonly onDidAddPanel: Event<IDockviewPanel> = this._onDidAddPanel.event;

    private readonly _onDidPopoutGroupSizeChange =
        new Emitter<PopoutGroupChangeSizeEvent>();
    readonly onDidPopoutGroupSizeChange: Event<PopoutGroupChangeSizeEvent> =
        this._onDidPopoutGroupSizeChange.event;

    private readonly _onDidPopoutGroupPositionChange =
        new Emitter<PopoutGroupChangePositionEvent>();
    readonly onDidPopoutGroupPositionChange: Event<PopoutGroupChangePositionEvent> =
        this._onDidPopoutGroupPositionChange.event;

    private readonly _onDidOpenPopoutWindowFail = new Emitter<void>();
    readonly onDidOpenPopoutWindowFail: Event<void> =
        this._onDidOpenPopoutWindowFail.event;

    private readonly _onDidLayoutFromJSON = new Emitter<void>();
    readonly onDidLayoutFromJSON: Event<void> = this._onDidLayoutFromJSON.event;

    private readonly _onDidActivePanelChange = new Emitter<
        IDockviewPanel | undefined
    >({ replay: true });
    readonly onDidActivePanelChange: Event<IDockviewPanel | undefined> =
        this._onDidActivePanelChange.event;

    private readonly _onDidMovePanel = new Emitter<MovePanelEvent>();
    readonly onDidMovePanel = this._onDidMovePanel.event;

    private readonly _onDidMaximizedGroupChange =
        new Emitter<DockviewMaximizedGroupChanged>();
    readonly onDidMaximizedGroupChange = this._onDidMaximizedGroupChange.event;

    private readonly _floatingGroups: DockviewFloatingGroupPanel[] = [];
    private readonly _popoutGroups: {
        window: PopoutWindow;
        popoutGroup: DockviewGroupPanel;
        referenceGroup?: string;
        disposable: { dispose: () => DockviewGroupPanel | undefined };
    }[] = [];
    private readonly _rootDropTarget: Droptarget;
    private _popoutRestorationPromise: Promise<void> = Promise.resolve();

    private readonly _onDidRemoveGroup = new Emitter<DockviewGroupPanel>();
    readonly onDidRemoveGroup: Event<DockviewGroupPanel> =
        this._onDidRemoveGroup.event;

    protected readonly _onDidAddGroup = new Emitter<DockviewGroupPanel>();
    readonly onDidAddGroup: Event<DockviewGroupPanel> =
        this._onDidAddGroup.event;

    private readonly _onDidOptionsChange = new Emitter<void>();
    readonly onDidOptionsChange: Event<void> = this._onDidOptionsChange.event;

    private readonly _onDidActiveGroupChange = new Emitter<
        DockviewGroupPanel | undefined
    >();
    readonly onDidActiveGroupChange: Event<DockviewGroupPanel | undefined> =
        this._onDidActiveGroupChange.event;

    get orientation(): Orientation {
        return this.gridview.orientation;
    }

    get totalPanels(): number {
        return this.panels.length;
    }

    get panels(): IDockviewPanel[] {
        return this.groups.flatMap((group) => group.panels);
    }

    get options(): DockviewComponentOptions {
        return this._options;
    }

    get activePanel(): IDockviewPanel | undefined {
        const activeGroup = this.activeGroup;

        if (!activeGroup) {
            return undefined;
        }

        return activeGroup.activePanel;
    }

    get renderer(): DockviewPanelRenderer {
        return this.options.defaultRenderer ?? 'onlyWhenVisible';
    }

    get api(): DockviewApi {
        return this._api;
    }

    get floatingGroups(): DockviewFloatingGroupPanel[] {
        return this._floatingGroups;
    }

    /**
     * Promise that resolves when all popout groups from the last fromJSON call are restored.
     * Useful for tests that need to wait for delayed popout creation.
     */
    get popoutRestorationPromise(): Promise<void> {
        return this._popoutRestorationPromise;
    }

    constructor(container: HTMLElement, options: DockviewComponentOptions) {
        super(container, {
            proportionalLayout: true,
            orientation: Orientation.HORIZONTAL,
            styles: options.hideBorders
                ? { separatorBorder: 'transparent' }
                : undefined,
            disableAutoResizing: options.disableAutoResizing,
            locked: options.locked,
            margin: options.theme?.gap ?? 0,
            className: options.className,
        });

        this._options = options;

        this.popupService = new PopupService(this.element);
        this._themeClassnames = new Classnames(this.element);
        this._api = new DockviewApi(this);

        this.rootDropTargetContainer = new DropTargetAnchorContainer(
            this.element,
            { disabled: true }
        );
        this.overlayRenderContainer = new OverlayRenderContainer(
            this.gridview.element,
            this
        );

        this._rootDropTarget = new Droptarget(this.element, {
            className: 'dv-drop-target-edge',
            canDisplayOverlay: (event, position) => {
                const data = getPanelData();

                if (data) {
                    if (data.viewId !== this.id) {
                        return false;
                    }

                    if (position === 'center') {
                        // center drop target is only allowed if there are no panels in the grid
                        // floating panels are allowed
                        return this.gridview.length === 0;
                    }

                    return true;
                }

                if (position === 'center' && this.gridview.length !== 0) {
                    /**
                     * for external events only show the four-corner drag overlays, disable
                     * the center position so that external drag events can fall through to the group
                     * and panel drop target handlers
                     */
                    return false;
                }

                const firedEvent = new DockviewUnhandledDragOverEvent(
                    event,
                    'edge',
                    position,
                    getPanelData
                );

                this._onUnhandledDragOverEvent.fire(firedEvent);

                return firedEvent.isAccepted;
            },
            acceptedTargetZones: ['top', 'bottom', 'left', 'right', 'center'],
            overlayModel:
                options.rootOverlayModel ?? DEFAULT_ROOT_OVERLAY_MODEL,
            getOverrideTarget: () => this.rootDropTargetContainer?.model,
        });

        this.updateDropTargetModel(options);

        toggleClass(this.gridview.element, 'dv-dockview', true);
        toggleClass(this.element, 'dv-debug', !!options.debug);

        this.updateTheme();
        this.updateWatermark();

        if (options.debug) {
            this.addDisposables(new StrictEventsSequencing(this));
        }

        this.addDisposables(
            this.rootDropTargetContainer,
            this.overlayRenderContainer,
            this._onWillDragPanel,
            this._onWillDragGroup,
            this._onWillShowOverlay,
            this._onDidActivePanelChange,
            this._onDidAddPanel,
            this._onDidRemovePanel,
            this._onDidLayoutFromJSON,
            this._onDidDrop,
            this._onWillDrop,
            this._onDidMovePanel,
            this._onDidMovePanel.event(() => {
                /**
                 * Update overlay positions after DOM layout completes to prevent 0×0 dimensions.
                 * With defaultRenderer="always" this results in panel content not showing after move operations.
                 * Debounced to avoid multiple calls when moving groups with multiple panels.
                 */
                this.debouncedUpdateAllPositions();
            }),
            this._onDidAddGroup,
            this._onDidRemoveGroup,
            this._onDidActiveGroupChange,
            this._onUnhandledDragOverEvent,
            this._onDidMaximizedGroupChange,
            this._onDidOptionsChange,
            this._onDidPopoutGroupSizeChange,
            this._onDidPopoutGroupPositionChange,
            this._onDidOpenPopoutWindowFail,
            this.onDidViewVisibilityChangeMicroTaskQueue(() => {
                this.updateWatermark();
            }),
            this.onDidAdd((event) => {
                if (!this._moving) {
                    this._onDidAddGroup.fire(event);
                }
            }),
            this.onDidRemove((event) => {
                if (!this._moving) {
                    this._onDidRemoveGroup.fire(event);
                }
            }),
            this.onDidActiveChange((event) => {
                if (!this._moving) {
                    this._onDidActiveGroupChange.fire(event);
                }
            }),
            this.onDidMaximizedChange((event) => {
                this._onDidMaximizedGroupChange.fire({
                    group: event.panel,
                    isMaximized: event.isMaximized,
                });
            }),
            Event.any(
                this.onDidAdd,
                this.onDidRemove
            )(() => {
                this.updateWatermark();
            }),
            Event.any<unknown>(
                this.onDidAddPanel,
                this.onDidRemovePanel,
                this.onDidAddGroup,
                this.onDidRemove,
                this.onDidMovePanel,
                this.onDidActivePanelChange,
                this.onDidPopoutGroupPositionChange,
                this.onDidPopoutGroupSizeChange
            )(() => {
                this._bufferOnDidLayoutChange.fire();
            }),
            Disposable.from(() => {
                // iterate over a copy of the array since .dispose() mutates the original array
                for (const group of [...this._floatingGroups]) {
                    group.dispose();
                }

                // iterate over a copy of the array since .dispose() mutates the original array
                for (const group of [...this._popoutGroups]) {
                    group.disposable.dispose();
                }
            }),
            this._rootDropTarget,
            this._rootDropTarget.onWillShowOverlay((event) => {
                if (this.gridview.length > 0 && event.position === 'center') {
                    // option only available when no panels in primary grid
                    return;
                }

                this._onWillShowOverlay.fire(
                    new DockviewWillShowOverlayLocationEvent(event, {
                        kind: 'edge',
                        panel: undefined,
                        api: this._api,
                        group: undefined,
                        getData: getPanelData,
                    })
                );
            }),
            this._rootDropTarget.onDrop((event) => {
                const willDropEvent = new DockviewWillDropEvent({
                    nativeEvent: event.nativeEvent,
                    position: event.position,
                    panel: undefined,
                    api: this._api,
                    group: undefined,
                    getData: getPanelData,
                    kind: 'edge',
                });

                this._onWillDrop.fire(willDropEvent);

                if (willDropEvent.defaultPrevented) {
                    return;
                }

                const data = getPanelData();

                if (data) {
                    this.moveGroupOrPanel({
                        from: {
                            groupId: data.groupId,
                            panelId: data.panelId ?? undefined,
                        },
                        to: {
                            group: this.orthogonalize(event.position),
                            position: 'center',
                        },
                    });
                } else {
                    this._onDidDrop.fire(
                        new DockviewDidDropEvent({
                            nativeEvent: event.nativeEvent,
                            position: event.position,
                            panel: undefined,
                            api: this._api,
                            group: undefined,
                            getData: getPanelData,
                        })
                    );
                }
            }),
            this._rootDropTarget
        );
    }

    override setVisible(panel: DockviewGroupPanel, visible: boolean): void {
        switch (panel.api.location.type) {
            case 'grid':
                super.setVisible(panel, visible);
                break;
            case 'floating': {
                const item = this.floatingGroups.find(
                    (floatingGroup) => floatingGroup.group === panel
                );

                if (item) {
                    item.overlay.setVisible(visible);
                    panel.api._onDidVisibilityChange.fire({
                        isVisible: visible,
                    });
                }
                break;
            }
            case 'popout':
                console.warn(
                    'dockview: You cannot hide a group that is in a popout window'
                );
                break;
        }
    }

    addPopoutGroup(
        itemToPopout: DockviewPanel | DockviewGroupPanel,
        options?: DockviewPopoutGroupOptions
    ): Promise<boolean> {
        if (
            itemToPopout instanceof DockviewPanel &&
            itemToPopout.group.size === 1
        ) {
            return this.addPopoutGroup(itemToPopout.group, options);
        }

        const theme = getDockviewTheme(this.gridview.element);
        const element = this.element;

        function getBox(): Box {
            if (options?.position) {
                return options.position;
            }

            if (itemToPopout instanceof DockviewGroupPanel) {
                return itemToPopout.element.getBoundingClientRect();
            }

            if (itemToPopout.group) {
                return itemToPopout.group.element.getBoundingClientRect();
            }
            return element.getBoundingClientRect();
        }

        const box: Box = getBox();

        const groupId =
            options?.overridePopoutGroup?.id ?? this.getNextGroupId();

        const _window = new PopoutWindow(
            `${this.id}-${groupId}`, // unique id
            theme ?? '',
            {
                url:
                    options?.popoutUrl ??
                    this.options?.popoutUrl ??
                    '/popout.html',
                left: window.screenX + box.left,
                top: window.screenY + box.top,
                width: box.width,
                height: box.height,
                onDidOpen: options?.onDidOpen,
                onWillClose: options?.onWillClose,
            }
        );

        const popoutWindowDisposable = new CompositeDisposable(
            _window,
            _window.onDidClose(() => {
                popoutWindowDisposable.dispose();
            })
        );

        return _window
            .open()
            .then((popoutContainer) => {
                if (_window.isDisposed) {
                    return false;
                }

                const referenceGroup = options?.referenceGroup
                    ? options.referenceGroup
                    : itemToPopout instanceof DockviewPanel
                    ? itemToPopout.group
                    : itemToPopout;

                const referenceLocation = itemToPopout.api.location.type;

                /**
                 * The group that is being added doesn't already exist within the DOM, the most likely occurrence
                 * of this case is when being called from the `fromJSON(...)` method
                 */
                const isGroupAddedToDom =
                    referenceGroup.element.parentElement !== null;

                let group: DockviewGroupPanel;

                if (!isGroupAddedToDom) {
                    group = referenceGroup;
                } else if (options?.overridePopoutGroup) {
                    group = options.overridePopoutGroup;
                } else {
                    group = this.createGroup({ id: groupId });

                    if (popoutContainer) {
                        this._onDidAddGroup.fire(group);
                    }
                }

                if (popoutContainer === null) {
                    console.error(
                        'dockview: failed to create popout. perhaps you need to allow pop-ups for this website'
                    );

                    popoutWindowDisposable.dispose();
                    this._onDidOpenPopoutWindowFail.fire();

                    // if the popout window was blocked, we need to move the group back to the reference group
                    // and set it to visible
                    this.movingLock(() =>
                        moveGroupWithoutDestroying({
                            from: group,
                            to: referenceGroup,
                        })
                    );

                    if (!referenceGroup.api.isVisible) {
                        referenceGroup.api.setVisible(true);
                    }

                    return false;
                }

                const gready = document.createElement('div');
                gready.className = 'dv-overlay-render-container';

                const overlayRenderContainer = new OverlayRenderContainer(
                    gready,
                    this
                );

                group.model.renderContainer = overlayRenderContainer;
                group.layout(
                    _window.window!.innerWidth,
                    _window.window!.innerHeight
                );

                let floatingBox: AnchoredBox | undefined;

                if (!options?.overridePopoutGroup && isGroupAddedToDom) {
                    if (itemToPopout instanceof DockviewPanel) {
                        this.movingLock(() => {
                            const panel =
                                referenceGroup.model.removePanel(itemToPopout);
                            group.model.openPanel(panel);
                        });
                    } else {
                        this.movingLock(() =>
                            moveGroupWithoutDestroying({
                                from: referenceGroup,
                                to: group,
                            })
                        );

                        switch (referenceLocation) {
                            case 'grid':
                                referenceGroup.api.setVisible(false);
                                break;
                            case 'floating':
                            case 'popout':
                                floatingBox = this._floatingGroups
                                    .find(
                                        (value) =>
                                            value.group.api.id ===
                                            itemToPopout.api.id
                                    )
                                    ?.overlay.toJSON();

                                this.removeGroup(referenceGroup);

                                break;
                        }
                    }
                }

                popoutContainer.classList.add('dv-dockview');
                popoutContainer.style.overflow = 'hidden';
                popoutContainer.appendChild(gready);

                popoutContainer.appendChild(group.element);

                const anchor = document.createElement('div');
                const dropTargetContainer = new DropTargetAnchorContainer(
                    anchor,
                    { disabled: this.rootDropTargetContainer.disabled }
                );
                popoutContainer.appendChild(anchor);

                group.model.dropTargetContainer = dropTargetContainer;

                group.model.location = {
                    type: 'popout',
                    getWindow: () => _window.window!,
                    popoutUrl: options?.popoutUrl,
                };

                if (
                    isGroupAddedToDom &&
                    itemToPopout.api.location.type === 'grid'
                ) {
                    itemToPopout.api.setVisible(false);
                }

                this.doSetGroupAndPanelActive(group);

                popoutWindowDisposable.addDisposables(
                    group.api.onDidActiveChange((event) => {
                        if (event.isActive) {
                            _window.window?.focus();
                        }
                    }),
                    group.api.onWillFocus(() => {
                        _window.window?.focus();
                    })
                );

                let returnedGroup: DockviewGroupPanel | undefined;

                const isValidReferenceGroup =
                    isGroupAddedToDom &&
                    referenceGroup &&
                    this.getPanel(referenceGroup.id);

                const value = {
                    window: _window,
                    popoutGroup: group,
                    referenceGroup: isValidReferenceGroup
                        ? referenceGroup.id
                        : undefined,
                    disposable: {
                        dispose: () => {
                            popoutWindowDisposable.dispose();
                            return returnedGroup;
                        },
                    },
                };

                const _onDidWindowPositionChange = onDidWindowMoveEnd(
                    _window.window!
                );

                popoutWindowDisposable.addDisposables(
                    _onDidWindowPositionChange,
                    onDidWindowResizeEnd(_window.window!, () => {
                        this._onDidPopoutGroupSizeChange.fire({
                            width: _window.window!.innerWidth,
                            height: _window.window!.innerHeight,
                            group,
                        });
                    }),
                    _onDidWindowPositionChange.event(() => {
                        this._onDidPopoutGroupPositionChange.fire({
                            screenX: _window.window!.screenX,
                            screenY: _window.window!.screenX,
                            group,
                        });
                    }),
                    /**
                     * ResizeObserver seems slow here, I do not know why but we don't need it
                     * since we can reply on the window resize event as we will occupy the full
                     * window dimensions
                     */
                    addDisposableListener(_window.window!, 'resize', () => {
                        group.layout(
                            _window.window!.innerWidth,
                            _window.window!.innerHeight
                        );
                    }),
                    overlayRenderContainer,
                    Disposable.from(() => {
                        if (this.isDisposed) {
                            return; // cleanup may run after instance is disposed
                        }

                        if (
                            isGroupAddedToDom &&
                            this.getPanel(referenceGroup.id)
                        ) {
                            this.movingLock(() =>
                                moveGroupWithoutDestroying({
                                    from: group,
                                    to: referenceGroup,
                                })
                            );

                            if (!referenceGroup.api.isVisible) {
                                referenceGroup.api.setVisible(true);
                            }

                            if (this.getPanel(group.id)) {
                                this.doRemoveGroup(group, {
                                    skipPopoutAssociated: true,
                                });
                            }
                        } else if (this.getPanel(group.id)) {
                            group.model.renderContainer =
                                this.overlayRenderContainer;
                            group.model.dropTargetContainer =
                                this.rootDropTargetContainer;
                            returnedGroup = group;

                            const alreadyRemoved = !this._popoutGroups.find(
                                (p) => p.popoutGroup === group
                            );

                            if (alreadyRemoved) {
                                /**
                                 * If this popout group was explicitly removed then we shouldn't run the additional
                                 * steps. To tell if the running of this disposable is the result of this popout group
                                 * being explicitly removed we can check if this popout group is still referenced in
                                 * the `this._popoutGroups` list.
                                 */
                                return;
                            }

                            if (floatingBox) {
                                this.addFloatingGroup(group, {
                                    height: floatingBox.height,
                                    width: floatingBox.width,
                                    position: floatingBox,
                                });
                            } else {
                                this.doRemoveGroup(group, {
                                    skipDispose: true,
                                    skipActive: true,
                                    skipPopoutReturn: true,
                                });

                                group.model.location = { type: 'grid' };

                                this.movingLock(() => {
                                    // suppress group add events since the group already exists
                                    this.doAddGroup(group, [0]);
                                });
                            }
                            this.doSetGroupAndPanelActive(group);
                        }
                    })
                );

                this._popoutGroups.push(value);
                this.updateWatermark();

                return true;
            })
            .catch((err) => {
                console.error('dockview: failed to create popout.', err);
                return false;
            });
    }

    addFloatingGroup(
        item: DockviewPanel | DockviewGroupPanel,
        options?: FloatingGroupOptionsInternal
    ): void {
        let group: DockviewGroupPanel;

        if (item instanceof DockviewPanel) {
            group = this.createGroup();
            this._onDidAddGroup.fire(group);

            this.movingLock(() =>
                this.removePanel(item, {
                    removeEmptyGroup: true,
                    skipDispose: true,
                    skipSetActiveGroup: true,
                })
            );

            this.movingLock(() =>
                group.model.openPanel(item, { skipSetGroupActive: true })
            );
        } else {
            group = item;

            const popoutReferenceGroupId = this._popoutGroups.find(
                (_) => _.popoutGroup === group
            )?.referenceGroup;
            const popoutReferenceGroup = popoutReferenceGroupId
                ? this.getPanel(popoutReferenceGroupId)
                : undefined;

            const skip =
                typeof options?.skipRemoveGroup === 'boolean' &&
                options.skipRemoveGroup;

            if (!skip) {
                if (popoutReferenceGroup) {
                    this.movingLock(() =>
                        moveGroupWithoutDestroying({
                            from: item,
                            to: popoutReferenceGroup,
                        })
                    );
                    this.doRemoveGroup(item, {
                        skipPopoutReturn: true,
                        skipPopoutAssociated: true,
                    });
                    this.doRemoveGroup(popoutReferenceGroup, {
                        skipDispose: true,
                    });
                    group = popoutReferenceGroup;
                } else {
                    this.doRemoveGroup(item, {
                        skipDispose: true,
                        skipPopoutReturn: true,
                        skipPopoutAssociated: false,
                    });
                }
            }
        }

        function getAnchoredBox(): AnchoredBox {
            if (options?.position) {
                const result: any = {};

                if ('left' in options.position) {
                    result.left = Math.max(options.position.left, 0);
                } else if ('right' in options.position) {
                    result.right = Math.max(options.position.right, 0);
                } else {
                    result.left = DEFAULT_FLOATING_GROUP_POSITION.left;
                }
                if ('top' in options.position) {
                    result.top = Math.max(options.position.top, 0);
                } else if ('bottom' in options.position) {
                    result.bottom = Math.max(options.position.bottom, 0);
                } else {
                    result.top = DEFAULT_FLOATING_GROUP_POSITION.top;
                }
                if (typeof options.width === 'number') {
                    result.width = Math.max(options.width, 0);
                } else {
                    result.width = DEFAULT_FLOATING_GROUP_POSITION.width;
                }
                if (typeof options.height === 'number') {
                    result.height = Math.max(options.height, 0);
                } else {
                    result.height = DEFAULT_FLOATING_GROUP_POSITION.height;
                }
                return result as AnchoredBox;
            }

            return {
                left:
                    typeof options?.x === 'number'
                        ? Math.max(options.x, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.left,
                top:
                    typeof options?.y === 'number'
                        ? Math.max(options.y, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.top,
                width:
                    typeof options?.width === 'number'
                        ? Math.max(options.width, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.width,
                height:
                    typeof options?.height === 'number'
                        ? Math.max(options.height, 0)
                        : DEFAULT_FLOATING_GROUP_POSITION.height,
            };
        }

        const anchoredBox = getAnchoredBox();

        const overlay = new Overlay({
            container: this.gridview.element,
            content: group.element,
            ...anchoredBox,
            minimumInViewportWidth:
                this.options.floatingGroupBounds === 'boundedWithinViewport'
                    ? undefined
                    : this.options.floatingGroupBounds
                          ?.minimumWidthWithinViewport ??
                      DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE,
            minimumInViewportHeight:
                this.options.floatingGroupBounds === 'boundedWithinViewport'
                    ? undefined
                    : this.options.floatingGroupBounds
                          ?.minimumHeightWithinViewport ??
                      DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE,
        });

        const el = group.element.querySelector('.dv-void-container');

        if (!el) {
            throw new Error('dockview: failed to find drag handle');
        }

        overlay.setupDrag(<HTMLElement>el, {
            inDragMode:
                typeof options?.inDragMode === 'boolean'
                    ? options.inDragMode
                    : false,
        });

        const floatingGroupPanel = new DockviewFloatingGroupPanel(
            group,
            overlay
        );

        const disposable = new CompositeDisposable(
            group.api.onDidActiveChange((event) => {
                if (event.isActive) {
                    overlay.bringToFront();
                }
            }),
            watchElementResize(group.element, (entry) => {
                const { width, height } = entry.contentRect;
                group.layout(width, height); // let the group know it's size is changing so it can fire events to the panel
            })
        );

        floatingGroupPanel.addDisposables(
            overlay.onDidChange(() => {
                // this is either a resize or a move
                // to inform the panels .layout(...) the group with it's current size
                // don't care about resize since the above watcher handles that
                group.layout(group.width, group.height);
            }),
            overlay.onDidChangeEnd(() => {
                this._bufferOnDidLayoutChange.fire();
            }),
            group.onDidChange((event) => {
                overlay.setBounds({
                    height: event?.height,
                    width: event?.width,
                });
            }),
            {
                dispose: () => {
                    disposable.dispose();

                    remove(this._floatingGroups, floatingGroupPanel);
                    group.model.location = { type: 'grid' };
                    this.updateWatermark();
                },
            }
        );

        this._floatingGroups.push(floatingGroupPanel);

        group.model.location = { type: 'floating' };

        if (!options?.skipActiveGroup) {
            this.doSetGroupAndPanelActive(group);
        }

        this.updateWatermark();
    }

    private orthogonalize(
        position: Position,
        options?: GroupOptions
    ): DockviewGroupPanel {
        this.gridview.normalize();

        switch (position) {
            case 'top':
            case 'bottom':
                if (this.gridview.orientation === Orientation.HORIZONTAL) {
                    // we need to add to a vertical splitview but the current root is a horizontal splitview.
                    // insert a vertical splitview at the root level and add the existing view as a child
                    this.gridview.insertOrthogonalSplitviewAtRoot();
                }
                break;
            case 'left':
            case 'right':
                if (this.gridview.orientation === Orientation.VERTICAL) {
                    // we need to add to a horizontal splitview but the current root is a vertical splitview.
                    // insert a horiziontal splitview at the root level and add the existing view as a child
                    this.gridview.insertOrthogonalSplitviewAtRoot();
                }
                break;
            default:
                break;
        }

        switch (position) {
            case 'top':
            case 'left':
            case 'center':
                return this.createGroupAtLocation([0], undefined, options); // insert into first position
            case 'bottom':
            case 'right':
                return this.createGroupAtLocation(
                    [this.gridview.length],
                    undefined,
                    options
                ); // insert into last position
            default:
                throw new Error(`dockview: unsupported position ${position}`);
        }
    }

    override updateOptions(options: Partial<DockviewComponentOptions>): void {
        super.updateOptions(options);

        if ('floatingGroupBounds' in options) {
            for (const group of this._floatingGroups) {
                switch (options.floatingGroupBounds) {
                    case 'boundedWithinViewport':
                        group.overlay.minimumInViewportHeight = undefined;
                        group.overlay.minimumInViewportWidth = undefined;
                        break;
                    case undefined:
                        group.overlay.minimumInViewportHeight =
                            DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE;
                        group.overlay.minimumInViewportWidth =
                            DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE;
                        break;
                    default:
                        group.overlay.minimumInViewportHeight =
                            options.floatingGroupBounds?.minimumHeightWithinViewport;
                        group.overlay.minimumInViewportWidth =
                            options.floatingGroupBounds?.minimumWidthWithinViewport;
                }

                group.overlay.setBounds();
            }
        }

        this.updateDropTargetModel(options);

        const oldDisableDnd = this.options.disableDnd;
        this._options = { ...this.options, ...options };
        const newDisableDnd = this.options.disableDnd;

        if (oldDisableDnd !== newDisableDnd) {
            this.updateDragAndDropState();
        }

        if ('theme' in options) {
            this.updateTheme();
        }

        this.layout(this.gridview.width, this.gridview.height, true);
    }

    override layout(
        width: number,
        height: number,
        forceResize?: boolean | undefined
    ): void {
        super.layout(width, height, forceResize);

        if (this._floatingGroups) {
            for (const floating of this._floatingGroups) {
                // ensure floting groups stay within visible boundaries
                floating.overlay.setBounds();
            }
        }
    }

    private updateDragAndDropState(): void {
        // Update draggable state for all tabs and void containers
        for (const group of this.groups) {
            group.model.updateDragAndDropState();
        }
    }

    focus(): void {
        this.activeGroup?.focus();
    }

    getGroupPanel(id: string): IDockviewPanel | undefined {
        return this.panels.find((panel) => panel.id === id);
    }

    setActivePanel(panel: IDockviewPanel): void {
        panel.group.model.openPanel(panel);
        this.doSetGroupAndPanelActive(panel.group);
    }

    moveToNext(options: MovementOptions = {}): void {
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        if (options.includePanel && options.group) {
            if (
                options.group.activePanel !==
                options.group.panels[options.group.panels.length - 1]
            ) {
                options.group.model.moveToNext({ suppressRoll: true });
                return;
            }
        }

        const location = getGridLocation(options.group.element);
        const next = <DockviewGroupPanel>this.gridview.next(location)?.view;
        this.doSetGroupAndPanelActive(next);
    }

    moveToPrevious(options: MovementOptions = {}): void {
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        if (options.includePanel && options.group) {
            if (options.group.activePanel !== options.group.panels[0]) {
                options.group.model.moveToPrevious({ suppressRoll: true });
                return;
            }
        }

        const location = getGridLocation(options.group.element);
        const next = this.gridview.previous(location)?.view;
        if (next) {
            this.doSetGroupAndPanelActive(next as DockviewGroupPanel);
        }
    }

    /**
     * Serialize the current state of the layout
     *
     * @returns A JSON respresentation of the layout
     */
    toJSON(): SerializedDockview {
        const data = this.gridview.serialize();

        const panels = this.panels.reduce((collection, panel) => {
            collection[panel.id] = panel.toJSON();
            return collection;
        }, {} as { [key: string]: GroupviewPanelState });

        const floats: SerializedFloatingGroup[] = this._floatingGroups.map(
            (group) => {
                return {
                    data: group.group.toJSON() as GroupPanelViewState,
                    position: group.overlay.toJSON(),
                };
            }
        );

        const popoutGroups: SerializedPopoutGroup[] = this._popoutGroups.map(
            (group) => {
                return {
                    data: group.popoutGroup.toJSON() as GroupPanelViewState,
                    gridReferenceGroup: group.referenceGroup,
                    position: group.window.dimensions(),
                    url:
                        group.popoutGroup.api.location.type === 'popout'
                            ? group.popoutGroup.api.location.popoutUrl
                            : undefined,
                };
            }
        );

        const result: SerializedDockview = {
            grid: data,
            panels,
            activeGroup: this.activeGroup?.id,
        };

        if (floats.length > 0) {
            result.floatingGroups = floats;
        }

        if (popoutGroups.length > 0) {
            result.popoutGroups = popoutGroups;
        }

        return result;
    }

    fromJSON(
        data: SerializedDockview,
        options?: { reuseExistingPanels: boolean }
    ): void {
        const existingPanels = new Map<string, IDockviewPanel>();

        let tempGroup: DockviewGroupPanel | undefined;

        if (options?.reuseExistingPanels) {
            /**
             * What are we doing here?
             *
             * 1. Create a temporary group to hold any panels that currently exist and that also exist in the new layout
             * 2. Remove that temporary group from the group mapping so that it doesn't get cleared when we clear the layout
             */

            tempGroup = this.createGroup();
            this._groups.delete(tempGroup.api.id);

            const newPanels = Object.keys(data.panels);

            for (const panel of this.panels) {
                if (newPanels.includes(panel.api.id)) {
                    existingPanels.set(panel.api.id, panel);
                }
            }

            this.movingLock(() => {
                Array.from(existingPanels.values()).forEach((panel) => {
                    this.moveGroupOrPanel({
                        from: {
                            groupId: panel.api.group.api.id,
                            panelId: panel.api.id,
                        },
                        to: {
                            group: tempGroup!,
                            position: 'center',
                        },
                        keepEmptyGroups: true,
                    });
                });
            });
        }

        this.clear();

        if (typeof data !== 'object' || data === null) {
            throw new Error(
                'dockview: serialized layout must be a non-null object'
            );
        }

        const { grid, panels, activeGroup } = data;

        if (grid.root.type !== 'branch' || !Array.isArray(grid.root.data)) {
            throw new Error('dockview: root must be of type branch');
        }

        try {
            // take note of the existing dimensions
            const width = this.width;
            const height = this.height;

            const createGroupFromSerializedState = (
                data: GroupPanelViewState
            ) => {
                const { id, locked, hideHeader, views, activeView } = data;

                if (typeof id !== 'string') {
                    throw new Error(
                        'dockview: group id must be of type string'
                    );
                }

                const group = this.createGroup({
                    id,
                    locked: !!locked,
                    hideHeader: !!hideHeader,
                });
                this._onDidAddGroup.fire(group);

                const createdPanels: IDockviewPanel[] = [];

                for (const child of views) {
                    /**
                     * Run the deserializer step seperately since this may fail to due corrupted external state.
                     * In running this section first we avoid firing lots of 'add' events in the event of a failure
                     * due to a corruption of input data.
                     */

                    const existingPanel = existingPanels.get(child);

                    if (tempGroup && existingPanel) {
                        this.movingLock(() => {
                            tempGroup!.model.removePanel(existingPanel);
                        });

                        createdPanels.push(existingPanel);
                        existingPanel.updateFromStateModel(panels[child]);
                    } else {
                        const panel = this._deserializer.fromJSON(
                            panels[child],
                            group
                        );
                        createdPanels.push(panel);
                    }
                }

                for (let i = 0; i < views.length; i++) {
                    const panel = createdPanels[i];

                    const isActive =
                        typeof activeView === 'string' &&
                        activeView === panel.id;

                    const hasExisting = existingPanels.has(panel.api.id);

                    if (hasExisting) {
                        this.movingLock(() => {
                            group.model.openPanel(panel, {
                                skipSetActive: !isActive,
                                skipSetGroupActive: true,
                            });
                        });
                    } else {
                        group.model.openPanel(panel, {
                            skipSetActive: !isActive,
                            skipSetGroupActive: true,
                        });
                    }
                }

                if (!group.activePanel && group.panels.length > 0) {
                    group.model.openPanel(
                        group.panels[group.panels.length - 1],
                        {
                            skipSetGroupActive: true,
                        }
                    );
                }

                return group;
            };

            this.gridview.deserialize(grid, {
                fromJSON: (node: ISerializedLeafNode<GroupPanelViewState>) => {
                    return createGroupFromSerializedState(node.data);
                },
            });

            this.layout(width, height, true);

            const serializedFloatingGroups = data.floatingGroups ?? [];

            for (const serializedFloatingGroup of serializedFloatingGroups) {
                const { data, position } = serializedFloatingGroup;

                const group = createGroupFromSerializedState(data);

                this.addFloatingGroup(group, {
                    position: position,
                    width: position.width,
                    height: position.height,
                    skipRemoveGroup: true,
                    inDragMode: false,
                });
            }

            const serializedPopoutGroups = data.popoutGroups ?? [];

            // Create a promise that resolves when all popout groups are created
            const popoutPromises: Promise<void>[] = [];

            // Queue popup group creation with delays to avoid browser blocking
            serializedPopoutGroups.forEach((serializedPopoutGroup, index) => {
                const { data, position, gridReferenceGroup, url } =
                    serializedPopoutGroup;

                const group = createGroupFromSerializedState(data);

                // Add a small delay for each popup after the first to avoid browser popup blocking
                const popoutPromise = new Promise<void>((resolve) => {
                    setTimeout(() => {
                        this.addPopoutGroup(group, {
                            position: position ?? undefined,
                            overridePopoutGroup: gridReferenceGroup
                                ? group
                                : undefined,
                            referenceGroup: gridReferenceGroup
                                ? this.getPanel(gridReferenceGroup)
                                : undefined,
                            popoutUrl: url,
                        });
                        resolve();
                    }, index * DESERIALIZATION_POPOUT_DELAY_MS); // 100ms delay between each popup
                });

                popoutPromises.push(popoutPromise);
            });

            // Store the promise for tests to wait on
            this._popoutRestorationPromise = Promise.all(popoutPromises).then(
                () => void 0
            );

            for (const floatingGroup of this._floatingGroups) {
                floatingGroup.overlay.setBounds();
            }

            if (typeof activeGroup === 'string') {
                const panel = this.getPanel(activeGroup);
                if (panel) {
                    this.doSetGroupAndPanelActive(panel);
                }
            }
        } catch (err) {
            console.error(
                'dockview: failed to deserialize layout. Reverting changes',
                err
            );

            /**
             * Takes all the successfully created groups and remove all of their panels.
             */
            for (const group of this.groups) {
                for (const panel of group.panels) {
                    this.removePanel(panel, {
                        removeEmptyGroup: false,
                        skipDispose: false,
                    });
                }
            }

            /**
             * To remove a group we cannot call this.removeGroup(...) since this makes assumptions about
             * the underlying HTMLElement existing in the Gridview.
             */
            for (const group of this.groups) {
                group.dispose();
                this._groups.delete(group.id);
                this._onDidRemoveGroup.fire(group);
            }

            // iterate over a reassigned array since original array will be modified
            for (const floatingGroup of [...this._floatingGroups]) {
                floatingGroup.dispose();
            }

            // fires clean-up events and clears the underlying HTML gridview.
            this.clear();

            /**
             * even though we have cleaned-up we still want to inform the caller of their error
             * and we'll do this through re-throwing the original error since afterall you would
             * expect trying to load a corrupted layout to result in an error and not silently fail...
             */
            throw err;
        }

        this.updateWatermark();

        // Force position updates for always visible panels after DOM layout is complete
        this.debouncedUpdateAllPositions();

        this._onDidLayoutFromJSON.fire();
    }

    clear(): void {
        const groups = Array.from(this._groups.values()).map((_) => _.value);

        const hasActiveGroup = !!this.activeGroup;

        for (const group of groups) {
            // remove the group will automatically remove the panels
            this.removeGroup(group, { skipActive: true });
        }

        if (hasActiveGroup) {
            this.doSetGroupAndPanelActive(undefined);
        }

        this.gridview.clear();
    }

    closeAllGroups(): void {
        for (const entry of this._groups.entries()) {
            const [_, group] = entry;

            group.value.model.closeAllPanels();
        }
    }

    addPanel<T extends object = Parameters>(
        options: AddPanelOptions<T>
    ): DockviewPanel {
        if (this.panels.find((_) => _.id === options.id)) {
            throw new Error(
                `dockview: panel with id ${options.id} already exists`
            );
        }

        let referenceGroup: DockviewGroupPanel | undefined;

        if (options.position && options.floating) {
            throw new Error(
                'dockview: you can only provide one of: position, floating as arguments to .addPanel(...)'
            );
        }

        const initial = {
            width: options.initialWidth,
            height: options.initialHeight,
        };

        let index: number | undefined;

        if (options.position) {
            if (isPanelOptionsWithPanel(options.position)) {
                const referencePanel =
                    typeof options.position.referencePanel === 'string'
                        ? this.getGroupPanel(options.position.referencePanel)
                        : options.position.referencePanel;
                index = options.position.index;

                if (!referencePanel) {
                    throw new Error(
                        `dockview: referencePanel '${options.position.referencePanel}' does not exist`
                    );
                }

                referenceGroup = this.findGroup(referencePanel);
            } else if (isPanelOptionsWithGroup(options.position)) {
                referenceGroup =
                    typeof options.position.referenceGroup === 'string'
                        ? this._groups.get(options.position.referenceGroup)
                              ?.value
                        : options.position.referenceGroup;
                index = options.position.index;

                if (!referenceGroup) {
                    throw new Error(
                        `dockview: referenceGroup '${options.position.referenceGroup}' does not exist`
                    );
                }
            } else {
                const group = this.orthogonalize(
                    directionToPosition(<Direction>options.position.direction)
                );

                const panel = this.createPanel(options, group);
                group.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });

                if (!options.inactive) {
                    this.doSetGroupAndPanelActive(group);
                }

                group.api.setSize({
                    height: initial?.height,
                    width: initial?.width,
                });

                return panel;
            }
        } else {
            referenceGroup = this.activeGroup;
        }

        let panel: DockviewPanel;

        if (referenceGroup) {
            const target = toTarget(
                <Direction>options.position?.direction || 'within'
            );

            if (options.floating) {
                const group = this.createGroup();
                this._onDidAddGroup.fire(group);

                const floatingGroupOptions =
                    typeof options.floating === 'object' &&
                    options.floating !== null
                        ? options.floating
                        : {};

                this.addFloatingGroup(group, {
                    ...floatingGroupOptions,
                    inDragMode: false,
                    skipRemoveGroup: true,
                    skipActiveGroup: true,
                });

                panel = this.createPanel(options, group);

                group.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });
            } else if (
                referenceGroup.api.location.type === 'floating' ||
                target === 'center'
            ) {
                panel = this.createPanel(options, referenceGroup);
                referenceGroup.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });

                referenceGroup.api.setSize({
                    width: initial?.width,
                    height: initial?.height,
                });

                if (!options.inactive) {
                    this.doSetGroupAndPanelActive(referenceGroup);
                }
            } else {
                const location = getGridLocation(referenceGroup.element);
                const relativeLocation = getRelativeLocation(
                    this.gridview.orientation,
                    location,
                    target
                );
                const group = this.createGroupAtLocation(
                    relativeLocation,
                    this.orientationAtLocation(relativeLocation) ===
                        Orientation.VERTICAL
                        ? initial?.height
                        : initial?.width
                );
                panel = this.createPanel(options, group);
                group.model.openPanel(panel, {
                    skipSetActive: options.inactive,
                    skipSetGroupActive: options.inactive,
                    index,
                });

                if (!options.inactive) {
                    this.doSetGroupAndPanelActive(group);
                }
            }
        } else if (options.floating) {
            const group = this.createGroup();
            this._onDidAddGroup.fire(group);

            const coordinates =
                typeof options.floating === 'object' &&
                options.floating !== null
                    ? options.floating
                    : {};

            this.addFloatingGroup(group, {
                ...coordinates,
                inDragMode: false,
                skipRemoveGroup: true,
                skipActiveGroup: true,
            });

            panel = this.createPanel(options, group);
            group.model.openPanel(panel, {
                skipSetActive: options.inactive,
                skipSetGroupActive: options.inactive,
                index,
            });
        } else {
            const group = this.createGroupAtLocation(
                [0],
                this.gridview.orientation === Orientation.VERTICAL
                    ? initial?.height
                    : initial?.width
            );
            panel = this.createPanel(options, group);
            group.model.openPanel(panel, {
                skipSetActive: options.inactive,
                skipSetGroupActive: options.inactive,
                index,
            });

            if (!options.inactive) {
                this.doSetGroupAndPanelActive(group);
            }
        }

        return panel;
    }

    removePanel(
        panel: IDockviewPanel,
        options: {
            removeEmptyGroup: boolean;
            skipDispose?: boolean;
            skipSetActiveGroup?: boolean;
        } = {
            removeEmptyGroup: true,
        }
    ): void {
        const group = panel.group;

        if (!group) {
            throw new Error(
                `dockview: cannot remove panel ${panel.id}. it's missing a group.`
            );
        }

        group.model.removePanel(panel, {
            skipSetActiveGroup: options.skipSetActiveGroup,
        });

        if (!options.skipDispose) {
            panel.group.model.renderContainer.detatch(panel);
            panel.dispose();
        }

        if (group.size === 0 && options.removeEmptyGroup) {
            this.removeGroup(group, { skipActive: options.skipSetActiveGroup });
        }
    }

    createWatermarkComponent(): IWatermarkRenderer {
        if (this.options.createWatermarkComponent) {
            return this.options.createWatermarkComponent();
        }
        return new Watermark();
    }

    private updateWatermark(): void {
        if (
            this.groups.filter(
                (x) => x.api.location.type === 'grid' && x.api.isVisible
            ).length === 0
        ) {
            if (!this._watermark) {
                this._watermark = this.createWatermarkComponent();

                this._watermark.init({
                    containerApi: new DockviewApi(this),
                });

                const watermarkContainer = document.createElement('div');
                watermarkContainer.className = 'dv-watermark-container';
                addTestId(watermarkContainer, 'watermark-component');
                watermarkContainer.appendChild(this._watermark.element);

                this.gridview.element.appendChild(watermarkContainer);
            }
        } else if (this._watermark) {
            this._watermark.element.parentElement!.remove();
            this._watermark.dispose?.();
            this._watermark = null;
        }
    }

    addGroup(options?: AddGroupOptions): DockviewGroupPanel {
        if (options) {
            let referenceGroup: DockviewGroupPanel | undefined;

            if (isGroupOptionsWithPanel(options)) {
                const referencePanel =
                    typeof options.referencePanel === 'string'
                        ? this.panels.find(
                              (panel) => panel.id === options.referencePanel
                          )
                        : options.referencePanel;

                if (!referencePanel) {
                    throw new Error(
                        `dockview: reference panel ${options.referencePanel} does not exist`
                    );
                }

                referenceGroup = this.findGroup(referencePanel);

                if (!referenceGroup) {
                    throw new Error(
                        `dockview: reference group for reference panel ${options.referencePanel} does not exist`
                    );
                }
            } else if (isGroupOptionsWithGroup(options)) {
                referenceGroup =
                    typeof options.referenceGroup === 'string'
                        ? this._groups.get(options.referenceGroup)?.value
                        : options.referenceGroup;

                if (!referenceGroup) {
                    throw new Error(
                        `dockview: reference group ${options.referenceGroup} does not exist`
                    );
                }
            } else {
                const group = this.orthogonalize(
                    directionToPosition(<Direction>options.direction),
                    options
                );
                if (!options.skipSetActive) {
                    this.doSetGroupAndPanelActive(group);
                }
                return group;
            }

            const target = toTarget(<Direction>options.direction || 'within');

            const location = getGridLocation(referenceGroup.element);
            const relativeLocation = getRelativeLocation(
                this.gridview.orientation,
                location,
                target
            );

            const group = this.createGroup(options);
            const size =
                this.getLocationOrientation(relativeLocation) ===
                Orientation.VERTICAL
                    ? options.initialHeight
                    : options.initialWidth;
            this.doAddGroup(group, relativeLocation, size);
            if (!options.skipSetActive) {
                this.doSetGroupAndPanelActive(group);
            }
            return group;
        } else {
            const group = this.createGroup(options);

            this.doAddGroup(group);
            this.doSetGroupAndPanelActive(group);
            return group;
        }
    }

    private getLocationOrientation(location: number[]) {
        return location.length % 2 == 0 &&
            this.gridview.orientation === Orientation.HORIZONTAL
            ? Orientation.HORIZONTAL
            : Orientation.VERTICAL;
    }

    removeGroup(
        group: DockviewGroupPanel,
        options?:
            | {
                  skipActive?: boolean;
                  skipDispose?: boolean;
                  skipPopoutAssociated?: boolean;
                  skipPopoutReturn?: boolean;
              }
            | undefined
    ): void {
        this.doRemoveGroup(group, options);
    }

    protected override doRemoveGroup(
        group: DockviewGroupPanel,
        options?:
            | {
                  skipActive?: boolean;
                  skipDispose?: boolean;
                  skipPopoutAssociated?: boolean;
                  skipPopoutReturn?: boolean;
              }
            | undefined
    ): DockviewGroupPanel {
        const panels = [...group.panels]; // reassign since group panels will mutate

        if (!options?.skipDispose) {
            for (const panel of panels) {
                this.removePanel(panel, {
                    removeEmptyGroup: false,
                    skipDispose: options?.skipDispose ?? false,
                });
            }
        }

        const activePanel = this.activePanel;

        if (group.api.location.type === 'floating') {
            const floatingGroup = this._floatingGroups.find(
                (_) => _.group === group
            );

            if (floatingGroup) {
                if (!options?.skipDispose) {
                    floatingGroup.group.dispose();
                    this._groups.delete(group.id);
                    this._onDidRemoveGroup.fire(group);
                }

                remove(this._floatingGroups, floatingGroup);
                floatingGroup.dispose();

                if (!options?.skipActive && this._activeGroup === group) {
                    const groups = Array.from(this._groups.values());

                    this.doSetGroupAndPanelActive(
                        groups.length > 0 ? groups[0].value : undefined
                    );
                }

                return floatingGroup.group;
            }

            throw new Error('dockview: failed to find floating group');
        }

        if (group.api.location.type === 'popout') {
            const selectedGroup = this._popoutGroups.find(
                (_) => _.popoutGroup === group
            );

            if (selectedGroup) {
                if (!options?.skipDispose) {
                    if (!options?.skipPopoutAssociated) {
                        const refGroup = selectedGroup.referenceGroup
                            ? this.getPanel(selectedGroup.referenceGroup)
                            : undefined;
                        if (refGroup && refGroup.panels.length === 0) {
                            this.removeGroup(refGroup);
                        }
                    }

                    selectedGroup.popoutGroup.dispose();

                    this._groups.delete(group.id);
                    this._onDidRemoveGroup.fire(group);
                }

                remove(this._popoutGroups, selectedGroup);

                const removedGroup = selectedGroup.disposable.dispose();

                if (!options?.skipPopoutReturn && removedGroup) {
                    this.doAddGroup(removedGroup, [0]);
                    this.doSetGroupAndPanelActive(removedGroup);
                }

                if (!options?.skipActive && this._activeGroup === group) {
                    const groups = Array.from(this._groups.values());

                    this.doSetGroupAndPanelActive(
                        groups.length > 0 ? groups[0].value : undefined
                    );
                }

                this.updateWatermark();
                return selectedGroup.popoutGroup;
            }

            throw new Error('dockview: failed to find popout group');
        }

        const re = super.doRemoveGroup(group, options);

        if (!options?.skipActive) {
            if (this.activePanel !== activePanel) {
                this._onDidActivePanelChange.fire(this.activePanel);
            }
        }

        return re;
    }

    private _moving = false;
    private _updatePositionsFrameId: number | undefined;

    private debouncedUpdateAllPositions(): void {
        if (this._updatePositionsFrameId !== undefined) {
            cancelAnimationFrame(this._updatePositionsFrameId);
        }
        this._updatePositionsFrameId = requestAnimationFrame(() => {
            this._updatePositionsFrameId = undefined;

            this.overlayRenderContainer.updateAllPositions();
        });
    }

    movingLock<T>(func: () => T): T {
        const isMoving = this._moving;

        try {
            this._moving = true;
            return func();
        } finally {
            this._moving = isMoving;
        }
    }

    moveGroupOrPanel(options: MoveGroupOrPanelOptions): void {
        const destinationGroup = options.to.group;
        const sourceGroupId = options.from.groupId;
        const sourceItemId = options.from.panelId;
        const destinationTarget = options.to.position;
        const destinationIndex = options.to.index;

        const sourceGroup = sourceGroupId
            ? this._groups.get(sourceGroupId)?.value
            : undefined;

        if (!sourceGroup) {
            throw new Error(
                `dockview: Failed to find group id ${sourceGroupId}`
            );
        }

        if (sourceItemId === undefined) {
            /**
             * Moving an entire group into another group
             */

            this.moveGroup({
                from: { group: sourceGroup },
                to: {
                    group: destinationGroup,
                    position: destinationTarget,
                },
                skipSetActive: options.skipSetActive,
            });
            return;
        }

        if (!destinationTarget || destinationTarget === 'center') {
            /**
             * Dropping a panel within another group
             */

            const removedPanel: IDockviewPanel | undefined = this.movingLock(
                () =>
                    sourceGroup.model.removePanel(sourceItemId, {
                        skipSetActive: false,
                        skipSetActiveGroup: true,
                    })
            );

            if (!removedPanel) {
                throw new Error(`dockview: No panel with id ${sourceItemId}`);
            }

            if (!options.keepEmptyGroups && sourceGroup.model.size === 0) {
                // remove the group and do not set a new group as active
                this.doRemoveGroup(sourceGroup, { skipActive: true });
            }

            // Check if destination group is empty - if so, force render the component
            const isDestinationGroupEmpty = destinationGroup.model.size === 0;

            this.movingLock(() =>
                destinationGroup.model.openPanel(removedPanel, {
                    index: destinationIndex,
                    skipSetActive:
                        (options.skipSetActive ?? false) &&
                        !isDestinationGroupEmpty,
                    skipSetGroupActive: true,
                })
            );
            if (!options.skipSetActive) {
                this.doSetGroupAndPanelActive(destinationGroup);
            }

            this._onDidMovePanel.fire({
                panel: removedPanel,
                from: sourceGroup,
            });
        } else {
            /**
             * Dropping a panel to the extremities of a group which will place that panel
             * into an adjacent group
             */

            const referenceLocation = getGridLocation(destinationGroup.element);
            const targetLocation = getRelativeLocation(
                this.gridview.orientation,
                referenceLocation,
                destinationTarget
            );

            if (sourceGroup.size < 2) {
                /**
                 * If we are moving from a group which only has one panel left we will consider
                 * moving the group itself rather than moving the panel into a newly created group
                 */

                const [targetParentLocation, to] = tail(targetLocation);

                if (sourceGroup.api.location.type === 'grid') {
                    const sourceLocation = getGridLocation(sourceGroup.element);
                    const [sourceParentLocation, from] = tail(sourceLocation);

                    if (
                        sequenceEquals(
                            sourceParentLocation,
                            targetParentLocation
                        )
                    ) {
                        // special case when 'swapping' two views within same grid location
                        // if a group has one tab - we are essentially moving the 'group'
                        // which is equivalent to swapping two views in this case
                        this.gridview.moveView(sourceParentLocation, from, to);

                        this._onDidMovePanel.fire({
                            panel: this.getGroupPanel(sourceItemId)!,
                            from: sourceGroup,
                        });

                        return;
                    }
                }

                if (sourceGroup.api.location.type === 'popout') {
                    /**
                     * the source group is a popout group with a single panel
                     *
                     * 1. remove the panel from the group without triggering any events
                     * 2. remove the popout group
                     * 3. create a new group at the requested location and add that panel
                     */

                    const popoutGroup = this._popoutGroups.find(
                        (group) => group.popoutGroup === sourceGroup
                    )!;

                    const removedPanel: IDockviewPanel | undefined =
                        this.movingLock(() =>
                            popoutGroup.popoutGroup.model.removePanel(
                                popoutGroup.popoutGroup.panels[0],
                                {
                                    skipSetActive: true,
                                    skipSetActiveGroup: true,
                                }
                            )
                        );

                    this.doRemoveGroup(sourceGroup, { skipActive: true });

                    const newGroup = this.createGroupAtLocation(targetLocation);
                    this.movingLock(() =>
                        newGroup.model.openPanel(removedPanel, {
                            skipSetActive: true,
                        })
                    );
                    this.doSetGroupAndPanelActive(newGroup);

                    this._onDidMovePanel.fire({
                        panel: this.getGroupPanel(sourceItemId)!,
                        from: sourceGroup,
                    });
                    return;
                }

                // source group will become empty so delete the group
                const targetGroup = this.movingLock(() =>
                    this.doRemoveGroup(sourceGroup, {
                        skipActive: true,
                        skipDispose: true,
                    })
                );

                // after deleting the group we need to re-evaulate the ref location
                const updatedReferenceLocation = getGridLocation(
                    destinationGroup.element
                );

                const location = getRelativeLocation(
                    this.gridview.orientation,
                    updatedReferenceLocation,
                    destinationTarget
                );
                this.movingLock(() => this.doAddGroup(targetGroup, location));
                this.doSetGroupAndPanelActive(targetGroup);

                this._onDidMovePanel.fire({
                    panel: this.getGroupPanel(sourceItemId)!,
                    from: sourceGroup,
                });
            } else {
                /**
                 * The group we are removing from has many panels, we need to remove the panels we are moving,
                 * create a new group, add the panels to that new group and add the new group in an appropiate position
                 */
                const removedPanel: IDockviewPanel | undefined =
                    this.movingLock(() =>
                        sourceGroup.model.removePanel(sourceItemId, {
                            skipSetActive: false,
                            skipSetActiveGroup: true,
                        })
                    );

                if (!removedPanel) {
                    throw new Error(
                        `dockview: No panel with id ${sourceItemId}`
                    );
                }

                const dropLocation = getRelativeLocation(
                    this.gridview.orientation,
                    referenceLocation,
                    destinationTarget
                );

                const group = this.createGroupAtLocation(dropLocation);
                this.movingLock(() =>
                    group.model.openPanel(removedPanel, {
                        skipSetGroupActive: true,
                    })
                );
                this.doSetGroupAndPanelActive(group);

                this._onDidMovePanel.fire({
                    panel: removedPanel,
                    from: sourceGroup,
                });
            }
        }
    }

    moveGroup(options: MoveGroupOptions): void {
        const from = options.from.group;
        const to = options.to.group;
        const target = options.to.position;

        if (target === 'center') {
            const activePanel = from.activePanel;

            const panels = this.movingLock(() =>
                [...from.panels].map((p) =>
                    from.model.removePanel(p.id, {
                        skipSetActive: true,
                    })
                )
            );

            if (from?.model.size === 0) {
                this.doRemoveGroup(from, { skipActive: true });
            }

            this.movingLock(() => {
                for (const panel of panels) {
                    to.model.openPanel(panel, {
                        skipSetActive: panel !== activePanel,
                        skipSetGroupActive: true,
                    });
                }
            });

            // Ensure group becomes active after move
            if (options.skipSetActive !== true) {
                // For center moves (merges), we need to ensure the target group is active
                // unless explicitly told not to (skipSetActive: true)
                this.doSetGroupAndPanelActive(to);
            } else if (!this.activePanel) {
                // Even with skipSetActive: true, ensure there's an active panel if none exists
                // This maintains basic functionality while respecting skipSetActive
                this.doSetGroupAndPanelActive(to);
            }
        } else {
            switch (from.api.location.type) {
                case 'grid':
                    this.gridview.removeView(getGridLocation(from.element));
                    break;
                case 'floating': {
                    const selectedFloatingGroup = this._floatingGroups.find(
                        (x) => x.group === from
                    );
                    if (!selectedFloatingGroup) {
                        throw new Error(
                            'dockview: failed to find floating group'
                        );
                    }
                    selectedFloatingGroup.dispose();
                    break;
                }
                case 'popout': {
                    const selectedPopoutGroup = this._popoutGroups.find(
                        (x) => x.popoutGroup === from
                    );
                    if (!selectedPopoutGroup) {
                        throw new Error(
                            'dockview: failed to find popout group'
                        );
                    }

                    // Remove from popout groups list to prevent automatic restoration
                    const index =
                        this._popoutGroups.indexOf(selectedPopoutGroup);
                    if (index >= 0) {
                        this._popoutGroups.splice(index, 1);
                    }

                    // Clean up the reference group (ghost) if it exists and is hidden
                    if (selectedPopoutGroup.referenceGroup) {
                        const referenceGroup = this.getPanel(
                            selectedPopoutGroup.referenceGroup
                        );
                        if (referenceGroup && !referenceGroup.api.isVisible) {
                            this.doRemoveGroup(referenceGroup, {
                                skipActive: true,
                            });
                        }
                    }

                    // Manually dispose the window without triggering restoration
                    selectedPopoutGroup.window.dispose();

                    // Update group's location and containers for target
                    if (to.api.location.type === 'grid') {
                        from.model.renderContainer =
                            this.overlayRenderContainer;
                        from.model.dropTargetContainer =
                            this.rootDropTargetContainer;
                        from.model.location = { type: 'grid' };
                    } else if (to.api.location.type === 'floating') {
                        from.model.renderContainer =
                            this.overlayRenderContainer;
                        from.model.dropTargetContainer =
                            this.rootDropTargetContainer;
                        from.model.location = { type: 'floating' };
                    }

                    break;
                }
            }

            // For moves to grid locations
            if (to.api.location.type === 'grid') {
                const referenceLocation = getGridLocation(to.element);
                const dropLocation = getRelativeLocation(
                    this.gridview.orientation,
                    referenceLocation,
                    target
                );

                // Add to grid for all moves targeting grid location

                let size: number;

                switch (this.gridview.orientation) {
                    case Orientation.VERTICAL:
                        size =
                            referenceLocation.length % 2 == 0
                                ? from.api.width
                                : from.api.height;
                        break;
                    case Orientation.HORIZONTAL:
                        size =
                            referenceLocation.length % 2 == 0
                                ? from.api.height
                                : from.api.width;
                        break;
                }

                this.gridview.addView(from, size, dropLocation);
            } else if (to.api.location.type === 'floating') {
                // For moves to floating locations, add as floating group
                // Get the position/size from the target floating group
                const targetFloatingGroup = this._floatingGroups.find(
                    (x) => x.group === to
                );
                if (targetFloatingGroup) {
                    const box = targetFloatingGroup.overlay.toJSON();

                    // Calculate position based on available properties
                    let left: number, top: number;
                    if ('left' in box) {
                        left = box.left + 50;
                    } else if ('right' in box) {
                        left = Math.max(0, box.right - box.width - 50);
                    } else {
                        left = 50; // Default fallback
                    }

                    if ('top' in box) {
                        top = box.top + 50;
                    } else if ('bottom' in box) {
                        top = Math.max(0, box.bottom - box.height - 50);
                    } else {
                        top = 50; // Default fallback
                    }

                    this.addFloatingGroup(from, {
                        height: box.height,
                        width: box.width,
                        position: {
                            left,
                            top,
                        },
                    });
                }
            }
        }

        from.panels.forEach((panel) => {
            this._onDidMovePanel.fire({ panel, from });
        });

        this.debouncedUpdateAllPositions();

        // Ensure group becomes active after move
        if (options.skipSetActive === false) {
            // Only activate when explicitly requested (skipSetActive: false)
            // Use 'to' group for non-center moves since 'from' may have been destroyed
            const targetGroup = to ?? from;
            this.doSetGroupAndPanelActive(targetGroup);
        }
    }

    override doSetGroupActive(group: DockviewGroupPanel | undefined): void {
        super.doSetGroupActive(group);

        const activePanel = this.activePanel;

        if (
            !this._moving &&
            activePanel !== this._onDidActivePanelChange.value
        ) {
            this._onDidActivePanelChange.fire(activePanel);
        }
    }

    doSetGroupAndPanelActive(group: DockviewGroupPanel | undefined): void {
        super.doSetGroupActive(group);

        const activePanel = this.activePanel;

        if (
            group &&
            this.hasMaximizedGroup() &&
            !this.isMaximizedGroup(group)
        ) {
            this.exitMaximizedGroup();
        }

        if (
            !this._moving &&
            activePanel !== this._onDidActivePanelChange.value
        ) {
            this._onDidActivePanelChange.fire(activePanel);
        }
    }

    private getNextGroupId(): string {
        let id = this.nextGroupId.next();
        while (this._groups.has(id)) {
            id = this.nextGroupId.next();
        }

        return id;
    }

    createGroup(options?: GroupOptions): DockviewGroupPanel {
        if (!options) {
            options = {};
        }

        let id = options?.id;

        if (id && this._groups.has(options.id!)) {
            console.warn(
                `dockview: Duplicate group id ${options?.id}. reassigning group id to avoid errors`
            );
            id = undefined;
        }

        if (!id) {
            id = this.nextGroupId.next();
            while (this._groups.has(id)) {
                id = this.nextGroupId.next();
            }
        }

        const view = new DockviewGroupPanel(this, id, options);
        view.init({ params: {}, accessor: this });

        if (!this._groups.has(view.id)) {
            const disposable = new CompositeDisposable(
                view.model.onTabDragStart((event) => {
                    this._onWillDragPanel.fire(event);
                }),
                view.model.onGroupDragStart((event) => {
                    this._onWillDragGroup.fire(event);
                }),
                view.model.onMove((event) => {
                    const { groupId, itemId, target, index } = event;
                    this.moveGroupOrPanel({
                        from: { groupId: groupId, panelId: itemId },
                        to: {
                            group: view,
                            position: target,
                            index,
                        },
                    });
                }),
                view.model.onDidDrop((event) => {
                    this._onDidDrop.fire(event);
                }),
                view.model.onWillDrop((event) => {
                    this._onWillDrop.fire(event);
                }),
                view.model.onWillShowOverlay((event) => {
                    if (this.options.disableDnd) {
                        event.preventDefault();
                        return;
                    }

                    this._onWillShowOverlay.fire(event);
                }),
                view.model.onUnhandledDragOverEvent((event) => {
                    this._onUnhandledDragOverEvent.fire(event);
                }),
                view.model.onDidAddPanel((event) => {
                    if (this._moving) {
                        return;
                    }
                    this._onDidAddPanel.fire(event.panel);
                }),
                view.model.onDidRemovePanel((event) => {
                    if (this._moving) {
                        return;
                    }
                    this._onDidRemovePanel.fire(event.panel);
                }),
                view.model.onDidActivePanelChange((event) => {
                    if (this._moving) {
                        return;
                    }

                    if (event.panel !== this.activePanel) {
                        return;
                    }

                    if (this._onDidActivePanelChange.value !== event.panel) {
                        this._onDidActivePanelChange.fire(event.panel);
                    }
                }),
                Event.any(
                    view.model.onDidPanelTitleChange,
                    view.model.onDidPanelParametersChange
                )(() => {
                    this._bufferOnDidLayoutChange.fire();
                })
            );

            this._groups.set(view.id, { value: view, disposable });
        }

        // TODO: must be called after the above listeners have been setup, not an ideal pattern
        view.initialize();

        return view;
    }

    private createPanel(
        options: AddPanelOptions,
        group: DockviewGroupPanel
    ): DockviewPanel {
        const contentComponent = options.component;
        const tabComponent =
            options.tabComponent ?? this.options.defaultTabComponent;

        const view = new DockviewPanelModel(
            this,
            options.id,
            contentComponent,
            tabComponent
        );

        const panel = new DockviewPanel(
            options.id,
            contentComponent,
            tabComponent,
            this,
            this._api,
            group,
            view,
            {
                renderer: options.renderer,
                minimumWidth: options.minimumWidth,
                minimumHeight: options.minimumHeight,
                maximumWidth: options.maximumWidth,
                maximumHeight: options.maximumHeight,
            }
        );

        panel.init({
            title: options.title ?? options.id,
            params: options?.params ?? {},
        });

        return panel;
    }

    private createGroupAtLocation(
        location: number[],
        size?: number,
        options?: GroupOptions
    ): DockviewGroupPanel {
        const group = this.createGroup(options);
        this.doAddGroup(group, location, size);
        return group;
    }

    private findGroup(panel: IDockviewPanel): DockviewGroupPanel | undefined {
        return Array.from(this._groups.values()).find((group) =>
            group.value.model.containsPanel(panel)
        )?.value;
    }

    private orientationAtLocation(location: number[]) {
        const rootOrientation = this.gridview.orientation;
        return location.length % 2 == 1
            ? rootOrientation
            : orthogonal(rootOrientation);
    }

    private updateDropTargetModel(options: Partial<DockviewComponentOptions>) {
        if ('dndEdges' in options) {
            this._rootDropTarget.disabled =
                typeof options.dndEdges === 'boolean' &&
                options.dndEdges === false;

            if (
                typeof options.dndEdges === 'object' &&
                options.dndEdges !== null
            ) {
                this._rootDropTarget.setOverlayModel(options.dndEdges);
            } else {
                this._rootDropTarget.setOverlayModel(
                    DEFAULT_ROOT_OVERLAY_MODEL
                );
            }
        }

        if ('rootOverlayModel' in options) {
            this.updateDropTargetModel({ dndEdges: options.dndEdges });
        }
    }

    private updateTheme(): void {
        const theme = this._options.theme ?? themeAbyss;
        this._themeClassnames.setClassNames(theme.className);

        this.gridview.margin = theme.gap ?? 0;

        switch (theme.dndOverlayMounting) {
            case 'absolute':
                this.rootDropTargetContainer.disabled = false;
                break;
            case 'relative':
            default:
                this.rootDropTargetContainer.disabled = true;
                break;
        }
    }
}
````

## File: packages/dockview-core/src/dockview/dockviewFloatingGroupPanel.ts
````typescript
import { Overlay } from '../overlay/overlay';
import { CompositeDisposable } from '../lifecycle';
import { AnchoredBox } from '../types';
import { DockviewGroupPanel, IDockviewGroupPanel } from './dockviewGroupPanel';

export interface IDockviewFloatingGroupPanel {
    readonly group: IDockviewGroupPanel;
    position(bounds: Partial<AnchoredBox>): void;
}

export class DockviewFloatingGroupPanel
    extends CompositeDisposable
    implements IDockviewFloatingGroupPanel
{
    constructor(readonly group: DockviewGroupPanel, readonly overlay: Overlay) {
        super();
        this.addDisposables(overlay);
    }

    position(bounds: Partial<AnchoredBox>): void {
        this.overlay.setBounds(bounds);
    }
}
````

## File: packages/dockview-core/src/dockview/dockviewGroupPanel.ts
````typescript
import { IFrameworkPart } from '../panel/types';
import { DockviewComponent } from '../dockview/dockviewComponent';
import {
    DockviewGroupPanelModel,
    GroupOptions,
    IDockviewGroupPanelModel,
    IHeader,
    DockviewGroupPanelLocked,
} from './dockviewGroupPanelModel';
import { GridviewPanel, IGridviewPanel, Contraints } from '../gridview/gridviewPanel';
import { IDockviewPanel } from '../dockview/dockviewPanel';
import {
    DockviewGroupPanelApi,
    DockviewGroupPanelApiImpl,
} from '../api/dockviewGroupPanelApi';
// GridConstraintChangeEvent2 is not exported, so we'll type it manually

const MINIMUM_DOCKVIEW_GROUP_PANEL_WIDTH = 100;
const MINIMUM_DOCKVIEW_GROUP_PANEL_HEIGHT = 100;

export interface IDockviewGroupPanel
    extends IGridviewPanel<DockviewGroupPanelApi> {
    model: IDockviewGroupPanelModel;
    locked: DockviewGroupPanelLocked;
    readonly size: number;
    readonly panels: IDockviewPanel[];
    readonly activePanel: IDockviewPanel | undefined;
}

export type IDockviewGroupPanelPublic = IDockviewGroupPanel;

export class DockviewGroupPanel
    extends GridviewPanel<DockviewGroupPanelApiImpl>
    implements IDockviewGroupPanel
{
    private readonly _model: DockviewGroupPanelModel;
    
    // Track explicitly set constraints to override panel constraints
    private _explicitConstraints: Partial<Contraints> = {};

    override get minimumWidth(): number {
        // Check for explicitly set group constraint first
        if (typeof this._explicitConstraints.minimumWidth === 'number') {
            return this._explicitConstraints.minimumWidth;
        }
        
        const activePanelMinimumWidth = this.activePanel?.minimumWidth;
        if (typeof activePanelMinimumWidth === 'number') {
            return activePanelMinimumWidth;
        }
        return super.__minimumWidth();
    }

    override get minimumHeight(): number {
        // Check for explicitly set group constraint first
        if (typeof this._explicitConstraints.minimumHeight === 'number') {
            return this._explicitConstraints.minimumHeight;
        }
        
        const activePanelMinimumHeight = this.activePanel?.minimumHeight;
        if (typeof activePanelMinimumHeight === 'number') {
            return activePanelMinimumHeight;
        }
        return super.__minimumHeight();
    }

    override get maximumWidth(): number {
        // Check for explicitly set group constraint first
        if (typeof this._explicitConstraints.maximumWidth === 'number') {
            return this._explicitConstraints.maximumWidth;
        }
        
        const activePanelMaximumWidth = this.activePanel?.maximumWidth;
        if (typeof activePanelMaximumWidth === 'number') {
            return activePanelMaximumWidth;
        }
        return super.__maximumWidth();
    }

    override get maximumHeight(): number {
        // Check for explicitly set group constraint first
        if (typeof this._explicitConstraints.maximumHeight === 'number') {
            return this._explicitConstraints.maximumHeight;
        }
        
        const activePanelMaximumHeight = this.activePanel?.maximumHeight;
        if (typeof activePanelMaximumHeight === 'number') {
            return activePanelMaximumHeight;
        }
        return super.__maximumHeight();
    }

    get panels(): IDockviewPanel[] {
        return this._model.panels;
    }

    get activePanel(): IDockviewPanel | undefined {
        return this._model.activePanel;
    }

    get size(): number {
        return this._model.size;
    }

    get model(): DockviewGroupPanelModel {
        return this._model;
    }

    get locked(): DockviewGroupPanelLocked {
        return this._model.locked;
    }

    set locked(value: DockviewGroupPanelLocked) {
        this._model.locked = value;
    }

    get header(): IHeader {
        return this._model.header;
    }

    constructor(
        accessor: DockviewComponent,
        id: string,
        options: GroupOptions
    ) {
        super(
            id,
            'groupview_default',
            {
                minimumHeight:
                    options.constraints?.minimumHeight ??
                    MINIMUM_DOCKVIEW_GROUP_PANEL_HEIGHT,
                minimumWidth:
                    options.constraints?.minimumWidth ??
                    MINIMUM_DOCKVIEW_GROUP_PANEL_WIDTH,
                maximumHeight: options.constraints?.maximumHeight,
                maximumWidth: options.constraints?.maximumWidth,
            },
            new DockviewGroupPanelApiImpl(id, accessor)
        );

        this.api.initialize(this); // cannot use 'this' after after 'super' call

        this._model = new DockviewGroupPanelModel(
            this.element,
            accessor,
            id,
            options,
            this
        );

        this.addDisposables(
            this.model.onDidActivePanelChange((event) => {
                this.api._onDidActivePanelChange.fire(event);
            }),
            this.api.onDidConstraintsChangeInternal((event: any) => {
                // Track explicitly set constraints to override panel constraints
                // Extract numeric values from functions or values
                if (event.minimumWidth !== undefined) {
                    this._explicitConstraints.minimumWidth = typeof event.minimumWidth === 'function' 
                        ? event.minimumWidth() 
                        : event.minimumWidth;
                }
                if (event.minimumHeight !== undefined) {
                    this._explicitConstraints.minimumHeight = typeof event.minimumHeight === 'function' 
                        ? event.minimumHeight() 
                        : event.minimumHeight;
                }
                if (event.maximumWidth !== undefined) {
                    this._explicitConstraints.maximumWidth = typeof event.maximumWidth === 'function' 
                        ? event.maximumWidth() 
                        : event.maximumWidth;
                }
                if (event.maximumHeight !== undefined) {
                    this._explicitConstraints.maximumHeight = typeof event.maximumHeight === 'function' 
                        ? event.maximumHeight() 
                        : event.maximumHeight;
                }
            })
        );
    }

    override focus(): void {
        if (!this.api.isActive) {
            this.api.setActive();
        }
        super.focus();
    }

    initialize(): void {
        this._model.initialize();
    }

    setActive(isActive: boolean): void {
        super.setActive(isActive);
        this.model.setActive(isActive);
    }

    layout(width: number, height: number) {
        super.layout(width, height);
        this.model.layout(width, height);
    }

    getComponent(): IFrameworkPart {
        return this._model;
    }

    toJSON(): any {
        return this.model.toJSON();
    }
}
````

## File: packages/dockview-core/src/dockview/dockviewGroupPanelModel.ts
````typescript
import { DockviewApi } from '../api/component.api';
import { getPanelData, PanelTransfer } from '../dnd/dataTransfer';
import { Position } from '../dnd/droptarget';
import { DockviewComponent } from './dockviewComponent';
import { isAncestor, toggleClass } from '../dom';
import {
    addDisposableListener,
    DockviewEvent,
    Emitter,
    Event,
    IDockviewEvent,
} from '../events';
import { DockviewGroupDropLocation, DockviewWillShowOverlayLocationEvent, DockviewWillShowOverlayLocationEventOptions } from './events';
import { IViewSize } from '../gridview/gridview';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import {
    IPanel,
    PanelInitParameters,
    PanelUpdateEvent,
    Parameters,
} from '../panel/types';
import {
    ContentContainer,
    IContentContainer,
} from './components/panel/content';
import {
    GroupDragEvent,
    ITabsContainer,
    TabDragEvent,
    TabsContainer,
} from './components/titlebar/tabsContainer';
import { IWatermarkRenderer } from './types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { IDockviewPanel } from './dockviewPanel';
import {
    DockviewDndOverlayEvent,
    DockviewUnhandledDragOverEvent,
    IHeaderActionsRenderer,
} from './options';
import { OverlayRenderContainer } from '../overlay/overlayRenderContainer';
import { TitleEvent } from '../api/dockviewPanelApi';
import { Contraints } from '../gridview/gridviewPanel';
import { DropTargetAnchorContainer } from '../dnd/dropTargetAnchorContainer';

interface GroupMoveEvent {
    groupId: string;
    itemId?: string;
    target: Position;
    index?: number;
}

interface CoreGroupOptions {
    locked?: DockviewGroupPanelLocked;
    hideHeader?: boolean;
    skipSetActive?: boolean;
    constraints?: Partial<Contraints>;
    initialWidth?: number;
    initialHeight?: number;
}

export interface GroupOptions extends CoreGroupOptions {
    readonly panels?: IDockviewPanel[];
    readonly activePanel?: IDockviewPanel;
    readonly id?: string;
}

export interface GroupPanelViewState extends CoreGroupOptions {
    views: string[];
    activeView?: string;
    id: string;
}

export interface DockviewGroupChangeEvent {
    readonly panel: IDockviewPanel;
}

export class DockviewDidDropEvent extends DockviewEvent {
    get nativeEvent(): DragEvent {
        return this.options.nativeEvent;
    }

    get position(): Position {
        return this.options.position;
    }

    get panel(): IDockviewPanel | undefined {
        return this.options.panel;
    }

    get group(): DockviewGroupPanel | undefined {
        return this.options.group;
    }

    get api(): DockviewApi {
        return this.options.api;
    }

    constructor(
        private readonly options: {
            readonly nativeEvent: DragEvent;
            readonly position: Position;
            readonly panel?: IDockviewPanel;
            getData(): PanelTransfer | undefined;
            group?: DockviewGroupPanel;
            api: DockviewApi;
        }
    ) {
        super();
    }

    getData(): PanelTransfer | undefined {
        return this.options.getData();
    }
}

export class DockviewWillDropEvent extends DockviewDidDropEvent {
    private readonly _kind: DockviewGroupDropLocation;

    get kind(): DockviewGroupDropLocation {
        return this._kind;
    }

    constructor(options: {
        readonly nativeEvent: DragEvent;
        readonly position: Position;
        readonly panel?: IDockviewPanel;
        getData(): PanelTransfer | undefined;
        kind: DockviewGroupDropLocation;
        group?: DockviewGroupPanel;
        api: DockviewApi;
    }) {
        super(options);

        this._kind = options.kind;
    }
}

export interface IHeader {
    hidden: boolean;
}

export type DockviewGroupPanelLocked = boolean | 'no-drop-target';


export interface IDockviewGroupPanelModel extends IPanel {
    readonly isActive: boolean;
    readonly size: number;
    readonly panels: IDockviewPanel[];
    readonly activePanel: IDockviewPanel | undefined;
    readonly header: IHeader;
    readonly isContentFocused: boolean;
    readonly onDidDrop: Event<DockviewDidDropEvent>;
    readonly onWillDrop: Event<DockviewWillDropEvent>;
    readonly onDidAddPanel: Event<DockviewGroupChangeEvent>;
    readonly onDidRemovePanel: Event<DockviewGroupChangeEvent>;
    readonly onDidActivePanelChange: Event<DockviewGroupChangeEvent>;
    readonly onMove: Event<GroupMoveEvent>;
    locked: DockviewGroupPanelLocked;
    setActive(isActive: boolean): void;
    initialize(): void;
    // state
    isPanelActive: (panel: IDockviewPanel) => boolean;
    indexOf(panel: IDockviewPanel): number;
    // panel lifecycle
    openPanel(
        panel: IDockviewPanel,
        options?: {
            index?: number;
            skipFocus?: boolean;
            skipSetPanelActive?: boolean;
            skipSetGroupActive?: boolean;
        }
    ): void;
    closePanel(panel: IDockviewPanel): void;
    closeAllPanels(): void;
    containsPanel(panel: IDockviewPanel): boolean;
    removePanel: (panelOrId: IDockviewPanel | string) => IDockviewPanel;
    moveToNext(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void;
    moveToPrevious(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void;
    canDisplayOverlay(
        event: DragEvent,
        position: Position,
        target: DockviewGroupDropLocation
    ): boolean;
}

export type DockviewGroupLocation =
    | { type: 'grid' }
    | { type: 'floating' }
    | { type: 'popout'; getWindow: () => Window; popoutUrl?: string };


export class DockviewGroupPanelModel
    extends CompositeDisposable
    implements IDockviewGroupPanelModel
{
    private readonly tabsContainer: ITabsContainer;
    private readonly contentContainer: IContentContainer;
    private _activePanel: IDockviewPanel | undefined;
    private watermark?: IWatermarkRenderer;
    private _isGroupActive = false;
    private _locked: DockviewGroupPanelLocked = false;
    private _rightHeaderActions: IHeaderActionsRenderer | undefined;
    private _leftHeaderActions: IHeaderActionsRenderer | undefined;
    private _prefixHeaderActions: IHeaderActionsRenderer | undefined;

    private _location: DockviewGroupLocation = { type: 'grid' };

    private mostRecentlyUsed: IDockviewPanel[] = [];
    private _overwriteRenderContainer: OverlayRenderContainer | null = null;
    private _overwriteDropTargetContainer: DropTargetAnchorContainer | null =
        null;

    private readonly _onDidChange = new Emitter<IViewSize | undefined>();
    readonly onDidChange: Event<IViewSize | undefined> =
        this._onDidChange.event;

    private _width = 0;
    private _height = 0;

    private readonly _panels: IDockviewPanel[] = [];
    private readonly _panelDisposables = new Map<string, IDisposable>();

    private readonly _onMove = new Emitter<GroupMoveEvent>();
    readonly onMove: Event<GroupMoveEvent> = this._onMove.event;

    private readonly _onDidDrop = new Emitter<DockviewDidDropEvent>();
    readonly onDidDrop: Event<DockviewDidDropEvent> = this._onDidDrop.event;

    private readonly _onWillDrop = new Emitter<DockviewWillDropEvent>();
    readonly onWillDrop: Event<DockviewWillDropEvent> = this._onWillDrop.event;

    private readonly _onWillShowOverlay =
        new Emitter<DockviewWillShowOverlayLocationEvent>();
    readonly onWillShowOverlay: Event<DockviewWillShowOverlayLocationEvent> =
        this._onWillShowOverlay.event;

    private readonly _onTabDragStart = new Emitter<TabDragEvent>();
    readonly onTabDragStart: Event<TabDragEvent> = this._onTabDragStart.event;

    private readonly _onGroupDragStart = new Emitter<GroupDragEvent>();
    readonly onGroupDragStart: Event<GroupDragEvent> =
        this._onGroupDragStart.event;

    private readonly _onDidAddPanel = new Emitter<DockviewGroupChangeEvent>();
    readonly onDidAddPanel: Event<DockviewGroupChangeEvent> =
        this._onDidAddPanel.event;

    private readonly _onDidPanelTitleChange = new Emitter<TitleEvent>();
    readonly onDidPanelTitleChange: Event<TitleEvent> =
        this._onDidPanelTitleChange.event;

    private readonly _onDidPanelParametersChange = new Emitter<Parameters>();
    readonly onDidPanelParametersChange: Event<Parameters> =
        this._onDidPanelParametersChange.event;

    private readonly _onDidRemovePanel =
        new Emitter<DockviewGroupChangeEvent>();
    readonly onDidRemovePanel: Event<DockviewGroupChangeEvent> =
        this._onDidRemovePanel.event;

    private readonly _onDidActivePanelChange =
        new Emitter<DockviewGroupChangeEvent>();
    readonly onDidActivePanelChange: Event<DockviewGroupChangeEvent> =
        this._onDidActivePanelChange.event;

    private readonly _onUnhandledDragOverEvent =
        new Emitter<DockviewDndOverlayEvent>();
    readonly onUnhandledDragOverEvent: Event<DockviewDndOverlayEvent> =
        this._onUnhandledDragOverEvent.event;

    private readonly _api: DockviewApi;

    get element(): HTMLElement {
        throw new Error('dockview: not supported');
    }

    get activePanel(): IDockviewPanel | undefined {
        return this._activePanel;
    }

    get locked(): DockviewGroupPanelLocked {
        return this._locked;
    }

    set locked(value: DockviewGroupPanelLocked) {
        this._locked = value;

        toggleClass(
            this.container,
            'dv-locked-groupview',
            value === 'no-drop-target' || value
        );
    }

    get isActive(): boolean {
        return this._isGroupActive;
    }

    get panels(): IDockviewPanel[] {
        return this._panels;
    }

    get size(): number {
        return this._panels.length;
    }

    get isEmpty(): boolean {
        return this._panels.length === 0;
    }

    get hasWatermark(): boolean {
        return !!(
            this.watermark && this.container.contains(this.watermark.element)
        );
    }

    get header(): IHeader {
        return this.tabsContainer;
    }

    get isContentFocused(): boolean {
        if (!document.activeElement) {
            return false;
        }
        return isAncestor(
            document.activeElement,
            this.contentContainer.element
        );
    }

    get location(): DockviewGroupLocation {
        return this._location;
    }

    set location(value: DockviewGroupLocation) {
        this._location = value;

        toggleClass(this.container, 'dv-groupview-floating', false);
        toggleClass(this.container, 'dv-groupview-popout', false);

        switch (value.type) {
            case 'grid':
                this.contentContainer.dropTarget.setTargetZones([
                    'top',
                    'bottom',
                    'left',
                    'right',
                    'center',
                ]);
                break;
            case 'floating':
                this.contentContainer.dropTarget.setTargetZones(['center']);
                this.contentContainer.dropTarget.setTargetZones(
                    value
                        ? ['center']
                        : ['top', 'bottom', 'left', 'right', 'center']
                );

                toggleClass(this.container, 'dv-groupview-floating', true);

                break;
            case 'popout':
                this.contentContainer.dropTarget.setTargetZones(['center']);

                toggleClass(this.container, 'dv-groupview-popout', true);

                break;
        }

        this.groupPanel.api._onDidLocationChange.fire({
            location: this.location,
        });
    }

    constructor(
        private readonly container: HTMLElement,
        private readonly accessor: DockviewComponent,
        public id: string,
        private readonly options: GroupOptions,
        private readonly groupPanel: DockviewGroupPanel
    ) {
        super();

        toggleClass(this.container, 'dv-groupview', true);

        this._api = new DockviewApi(this.accessor);

        this.tabsContainer = new TabsContainer(this.accessor, this.groupPanel);

        this.contentContainer = new ContentContainer(this.accessor, this);

        container.append(
            this.tabsContainer.element,
            this.contentContainer.element
        );

        this.header.hidden = !!options.hideHeader;
        this.locked = options.locked ?? false;

        this.addDisposables(
            this._onTabDragStart,
            this._onGroupDragStart,
            this._onWillShowOverlay,
            this.tabsContainer.onTabDragStart((event) => {
                this._onTabDragStart.fire(event);
            }),
            this.tabsContainer.onGroupDragStart((event) => {
                this._onGroupDragStart.fire(event);
            }),
            this.tabsContainer.onDrop((event) => {
                this.handleDropEvent(
                    'header',
                    event.event,
                    'center',
                    event.index
                );
            }),

            this.contentContainer.onDidFocus(() => {
                this.accessor.doSetGroupActive(this.groupPanel);
            }),
            this.contentContainer.onDidBlur(() => {
                // noop
            }),
            this.contentContainer.dropTarget.onDrop((event) => {
                this.handleDropEvent(
                    'content',
                    event.nativeEvent,
                    event.position
                );
            }),
            this.tabsContainer.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(event);
            }),
            this.contentContainer.dropTarget.onWillShowOverlay((event) => {
                this._onWillShowOverlay.fire(
                    new DockviewWillShowOverlayLocationEvent(event, {
                        kind: 'content',
                        panel: this.activePanel,
                        api: this._api,
                        group: this.groupPanel,
                        getData: getPanelData,
                    })
                );
            }),
            this._onMove,
            this._onDidChange,
            this._onDidDrop,
            this._onWillDrop,
            this._onDidAddPanel,
            this._onDidRemovePanel,
            this._onDidActivePanelChange,
            this._onUnhandledDragOverEvent,
            this._onDidPanelTitleChange,
            this._onDidPanelParametersChange
        );
    }

    focusContent(): void {
        this.contentContainer.element.focus();
    }

    set renderContainer(value: OverlayRenderContainer | null) {
        this.panels.forEach((panel) => {
            this.renderContainer.detatch(panel);
        });

        this._overwriteRenderContainer = value;

        this.panels.forEach((panel) => {
            this.rerender(panel);
        });
    }

    get renderContainer(): OverlayRenderContainer {
        return (
            this._overwriteRenderContainer ??
            this.accessor.overlayRenderContainer
        );
    }

    set dropTargetContainer(value: DropTargetAnchorContainer | null) {
        this._overwriteDropTargetContainer = value;
    }

    get dropTargetContainer(): DropTargetAnchorContainer | null {
        return (
            this._overwriteDropTargetContainer ??
            this.accessor.rootDropTargetContainer
        );
    }

    initialize(): void {
        if (this.options.panels) {
            this.options.panels.forEach((panel) => {
                this.doAddPanel(panel);
            });
        }

        if (this.options.activePanel) {
            this.openPanel(this.options.activePanel);
        }

        // must be run after the constructor otherwise this.parent may not be
        // correctly initialized
        this.setActive(this.isActive, true);
        this.updateContainer();

        if (this.accessor.options.createRightHeaderActionComponent) {
            this._rightHeaderActions =
                this.accessor.options.createRightHeaderActionComponent(
                    this.groupPanel
                );
            this.addDisposables(this._rightHeaderActions);
            this._rightHeaderActions.init({
                containerApi: this._api,
                api: this.groupPanel.api,
                group: this.groupPanel,
            });
            this.tabsContainer.setRightActionsElement(
                this._rightHeaderActions.element
            );
        }

        if (this.accessor.options.createLeftHeaderActionComponent) {
            this._leftHeaderActions =
                this.accessor.options.createLeftHeaderActionComponent(
                    this.groupPanel
                );
            this.addDisposables(this._leftHeaderActions);
            this._leftHeaderActions.init({
                containerApi: this._api,
                api: this.groupPanel.api,
                group: this.groupPanel,
            });
            this.tabsContainer.setLeftActionsElement(
                this._leftHeaderActions.element
            );
        }

        if (this.accessor.options.createPrefixHeaderActionComponent) {
            this._prefixHeaderActions =
                this.accessor.options.createPrefixHeaderActionComponent(
                    this.groupPanel
                );
            this.addDisposables(this._prefixHeaderActions);
            this._prefixHeaderActions.init({
                containerApi: this._api,
                api: this.groupPanel.api,
                group: this.groupPanel,
            });
            this.tabsContainer.setPrefixActionsElement(
                this._prefixHeaderActions.element
            );
        }
    }

    rerender(panel: IDockviewPanel): void {
        this.contentContainer.renderPanel(panel, { asActive: false });
    }

    public indexOf(panel: IDockviewPanel): number {
        return this.tabsContainer.indexOf(panel.id);
    }

    public toJSON(): GroupPanelViewState {
        const result: GroupPanelViewState = {
            views: this.tabsContainer.panels,
            activeView: this._activePanel?.id,
            id: this.id,
        };

        if (this.locked !== false) {
            result.locked = this.locked;
        }

        if (this.header.hidden) {
            result.hideHeader = true;
        }

        return result;
    }

    public moveToNext(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void {
        if (!options) {
            options = {};
        }
        if (!options.panel) {
            options.panel = this.activePanel;
        }

        const index = options.panel ? this.panels.indexOf(options.panel) : -1;

        let normalizedIndex: number;

        if (index < this.panels.length - 1) {
            normalizedIndex = index + 1;
        } else if (!options.suppressRoll) {
            normalizedIndex = 0;
        } else {
            return;
        }

        this.openPanel(this.panels[normalizedIndex]);
    }

    public moveToPrevious(options?: {
        panel?: IDockviewPanel;
        suppressRoll?: boolean;
    }): void {
        if (!options) {
            options = {};
        }
        if (!options.panel) {
            options.panel = this.activePanel;
        }

        if (!options.panel) {
            return;
        }

        const index = this.panels.indexOf(options.panel);

        let normalizedIndex: number;

        if (index > 0) {
            normalizedIndex = index - 1;
        } else if (!options.suppressRoll) {
            normalizedIndex = this.panels.length - 1;
        } else {
            return;
        }

        this.openPanel(this.panels[normalizedIndex]);
    }

    public containsPanel(panel: IDockviewPanel): boolean {
        return this.panels.includes(panel);
    }

    init(_params: PanelInitParameters): void {
        //noop
    }

    update(_params: PanelUpdateEvent): void {
        //noop
    }

    focus(): void {
        this._activePanel?.focus();
    }

    public openPanel(
        panel: IDockviewPanel,
        options: {
            index?: number;
            skipSetActive?: boolean;
            skipSetGroupActive?: boolean;
        } = {}
    ): void {
        /**
         * set the panel group
         * add the panel
         * check if group active
         * check if panel active
         */

        if (
            typeof options.index !== 'number' ||
            options.index > this.panels.length
        ) {
            options.index = this.panels.length;
        }

        const skipSetActive = !!options.skipSetActive;

        // ensure the group is updated before we fire any events
        panel.updateParentGroup(this.groupPanel, {
            skipSetActive: options.skipSetActive,
        });

        this.doAddPanel(panel, options.index, {
            skipSetActive: skipSetActive,
        });

        if (this._activePanel === panel) {
            this.contentContainer.renderPanel(panel, { asActive: true });
            return;
        }

        if (!skipSetActive) {
            this.doSetActivePanel(panel);
        }

        if (!options.skipSetGroupActive) {
            this.accessor.doSetGroupActive(this.groupPanel);
        }

        if (!options.skipSetActive) {
            this.updateContainer();
        }
    }

    public removePanel(
        groupItemOrId: IDockviewPanel | string,
        options: {
            skipSetActive?: boolean;
            skipSetActiveGroup?: boolean;
        } = {
            skipSetActive: false,
        }
    ): IDockviewPanel {
        const id =
            typeof groupItemOrId === 'string'
                ? groupItemOrId
                : groupItemOrId.id;

        const panelToRemove = this._panels.find((panel) => panel.id === id);

        if (!panelToRemove) {
            throw new Error('invalid operation');
        }

        return this._removePanel(panelToRemove, options);
    }

    public closeAllPanels(): void {
        if (this.panels.length > 0) {
            // take a copy since we will be edting the array as we iterate through
            const arrPanelCpy = [...this.panels];
            for (const panel of arrPanelCpy) {
                this.doClose(panel);
            }
        } else {
            this.accessor.removeGroup(this.groupPanel);
        }
    }

    public closePanel(panel: IDockviewPanel): void {
        this.doClose(panel);
    }

    private doClose(panel: IDockviewPanel): void {
        const isLast =
            this.panels.length === 1 && this.accessor.groups.length === 1;

        this.accessor.removePanel(
            panel,
            isLast && this.accessor.options.noPanelsOverlay === 'emptyGroup'
                ? { removeEmptyGroup: false }
                : undefined
        );
    }

    public isPanelActive(panel: IDockviewPanel): boolean {
        return this._activePanel === panel;
    }

    updateActions(element: HTMLElement | undefined): void {
        this.tabsContainer.setRightActionsElement(element);
    }

    public setActive(isGroupActive: boolean, force = false): void {
        if (!force && this.isActive === isGroupActive) {
            return;
        }

        this._isGroupActive = isGroupActive;

        toggleClass(this.container, 'dv-active-group', isGroupActive);
        toggleClass(this.container, 'dv-inactive-group', !isGroupActive);

        this.tabsContainer.setActive(this.isActive);

        if (!this._activePanel && this.panels.length > 0) {
            this.doSetActivePanel(this.panels[0]);
        }

        this.updateContainer();
    }

    public layout(width: number, height: number): void {
        this._width = width;
        this._height = height;

        this.contentContainer.layout(this._width, this._height);

        if (this._activePanel?.layout) {
            this._activePanel.layout(this._width, this._height);
        }
    }

    private _removePanel(
        panel: IDockviewPanel,
        options: {
            skipSetActive?: boolean;
            skipSetActiveGroup?: boolean;
        }
    ): IDockviewPanel {
        const isActivePanel = this._activePanel === panel;

        this.doRemovePanel(panel);

        if (isActivePanel && this.panels.length > 0) {
            const nextPanel = this.mostRecentlyUsed[0];
            this.openPanel(nextPanel, {
                skipSetActive: options.skipSetActive,
                skipSetGroupActive: options.skipSetActiveGroup,
            });
        }

        if (this._activePanel && this.panels.length === 0) {
            this.doSetActivePanel(undefined);
        }

        if (!options.skipSetActive) {
            this.updateContainer();
        }

        return panel;
    }

    private doRemovePanel(panel: IDockviewPanel): void {
        const index = this.panels.indexOf(panel);

        if (this._activePanel === panel) {
            this.contentContainer.closePanel();
        }

        this.tabsContainer.delete(panel.id);
        this._panels.splice(index, 1);

        if (this.mostRecentlyUsed.includes(panel)) {
            const index = this.mostRecentlyUsed.indexOf(panel);
            this.mostRecentlyUsed.splice(index, 1);
        }

        const disposable = this._panelDisposables.get(panel.id);
        if (disposable) {
            disposable.dispose();
            this._panelDisposables.delete(panel.id);
        }

        this._onDidRemovePanel.fire({ panel });
    }

    private doAddPanel(
        panel: IDockviewPanel,
        index: number = this.panels.length,
        options: {
            skipSetActive: boolean;
        } = { skipSetActive: false }
    ): void {
        const existingPanel = this._panels.indexOf(panel);
        const hasExistingPanel = existingPanel > -1;

        this.tabsContainer.show();
        this.contentContainer.show();

        this.tabsContainer.openPanel(panel, index);

        if (!options.skipSetActive) {
            this.contentContainer.openPanel(panel);
        }

        if (hasExistingPanel) {
            // TODO - need to ensure ordering hasn't changed and if it has need to re-order this.panels
            return;
        }

        this.updateMru(panel);
        this.panels.splice(index, 0, panel);

        this._panelDisposables.set(
            panel.id,
            new CompositeDisposable(
                panel.api.onDidTitleChange((event) =>
                    this._onDidPanelTitleChange.fire(event)
                ),
                panel.api.onDidParametersChange((event) =>
                    this._onDidPanelParametersChange.fire(event)
                )
            )
        );

        this._onDidAddPanel.fire({ panel });
    }

    private doSetActivePanel(panel: IDockviewPanel | undefined): void {
        if (this._activePanel === panel) {
            return;
        }

        this._activePanel = panel;

        if (panel) {
            this.tabsContainer.setActivePanel(panel);

            this.contentContainer.openPanel(panel);

            panel.layout(this._width, this._height);

            this.updateMru(panel);

            // Refresh focus state to handle programmatic activation without DOM focus change
            this.contentContainer.refreshFocusState();

            this._onDidActivePanelChange.fire({
                panel,
            });
        }
    }

    private updateMru(panel: IDockviewPanel): void {
        if (this.mostRecentlyUsed.includes(panel)) {
            this.mostRecentlyUsed.splice(
                this.mostRecentlyUsed.indexOf(panel),
                1
            );
        }
        this.mostRecentlyUsed = [panel, ...this.mostRecentlyUsed];
    }

    private updateContainer(): void {
        this.panels.forEach((panel) => panel.runEvents());

        if (this.isEmpty && !this.watermark) {
            const watermark = this.accessor.createWatermarkComponent();
            watermark.init({
                containerApi: this._api,
                group: this.groupPanel,
            });
            this.watermark = watermark;

            addDisposableListener(this.watermark.element, 'pointerdown', () => {
                if (!this.isActive) {
                    this.accessor.doSetGroupActive(this.groupPanel);
                }
            });

            this.contentContainer.element.appendChild(this.watermark.element);
        }
        if (!this.isEmpty && this.watermark) {
            this.watermark.element.remove();
            this.watermark.dispose?.();
            this.watermark = undefined;
        }
    }

    canDisplayOverlay(
        event: DragEvent,
        position: Position,
        target: DockviewGroupDropLocation
    ): boolean {
        const firedEvent = new DockviewUnhandledDragOverEvent(
            event,
            target,
            position,
            getPanelData,
            this.accessor.getPanel(this.id)
        );

        this._onUnhandledDragOverEvent.fire(firedEvent);

        return firedEvent.isAccepted;
    }

    private handleDropEvent(
        type: 'header' | 'content',
        event: DragEvent,
        position: Position,
        index?: number
    ): void {
        if (this.locked === 'no-drop-target') {
            return;
        }

        function getKind(): DockviewGroupDropLocation {
            switch (type) {
                case 'header':
                    return typeof index === 'number' ? 'tab' : 'header_space';
                case 'content':
                    return 'content';
            }
        }

        const panel =
            typeof index === 'number' ? this.panels[index] : undefined;

        const willDropEvent = new DockviewWillDropEvent({
            nativeEvent: event,
            position,
            panel,
            getData: () => getPanelData(),
            kind: getKind(),
            group: this.groupPanel,
            api: this._api,
        });

        this._onWillDrop.fire(willDropEvent);

        if (willDropEvent.defaultPrevented) {
            return;
        }

        const data = getPanelData();

        if (data && data.viewId === this.accessor.id) {
            if (type === 'content') {
                if (data.groupId === this.id) {
                    // don't allow to drop on self for center position

                    if (position === 'center') {
                        return;
                    }

                    if (data.panelId === null) {
                        // don't allow group move to drop anywhere on self
                        return;
                    }
                }
            }

            if (type === 'header') {
                if (data.groupId === this.id) {
                    if (data.panelId === null) {
                        return;
                    }
                }
            }

            if (data.panelId === null) {
                // this is a group move dnd event
                const { groupId } = data;

                this._onMove.fire({
                    target: position,
                    groupId: groupId,
                    index,
                });
                return;
            }

            const fromSameGroup =
                this.tabsContainer.indexOf(data.panelId) !== -1;

            if (fromSameGroup && this.tabsContainer.size === 1) {
                return;
            }

            const { groupId, panelId } = data;
            const isSameGroup = this.id === groupId;
            if (isSameGroup && !position) {
                const oldIndex = this.tabsContainer.indexOf(panelId);
                if (oldIndex === index) {
                    return;
                }
            }

            this._onMove.fire({
                target: position,
                groupId: data.groupId,
                itemId: data.panelId,
                index,
            });
        } else {
            this._onDidDrop.fire(
                new DockviewDidDropEvent({
                    nativeEvent: event,
                    position,
                    panel,
                    getData: () => getPanelData(),
                    group: this.groupPanel,
                    api: this._api,
                })
            );
        }
    }

    updateDragAndDropState(): void {
        this.tabsContainer.updateDragAndDropState();
    }

    public dispose(): void {
        super.dispose();

        this.watermark?.element.remove();
        this.watermark?.dispose?.();
        this.watermark = undefined;

        for (const panel of this.panels) {
            panel.dispose();
        }

        this.tabsContainer.dispose();
        this.contentContainer.dispose();
    }
}
````

## File: packages/dockview-core/src/dockview/dockviewPanel.ts
````typescript
import { DockviewApi } from '../api/component.api';
import {
    DockviewPanelApi,
    DockviewPanelApiImpl,
} from '../api/dockviewPanelApi';
import { GroupviewPanelState, IGroupPanelInitParameters } from './types';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import { IPanel, PanelUpdateEvent, Parameters } from '../panel/types';
import { IDockviewPanelModel } from './dockviewPanelModel';
import { DockviewComponent } from './dockviewComponent';
import { DockviewPanelRenderer } from '../overlay/overlayRenderContainer';
import { WillFocusEvent } from '../api/panelApi';
import { Contraints } from '../gridview/gridviewPanel';

export interface IDockviewPanel extends IDisposable, IPanel {
    readonly view: IDockviewPanelModel;
    readonly group: DockviewGroupPanel;
    readonly api: DockviewPanelApi;
    readonly title: string | undefined;
    readonly params: Parameters | undefined;
    readonly minimumWidth?: number;
    readonly minimumHeight?: number;
    readonly maximumWidth?: number;
    readonly maximumHeight?: number;
    updateParentGroup(
        group: DockviewGroupPanel,
        options?: { skipSetActive?: boolean }
    ): void;
    updateFromStateModel(state: GroupviewPanelState): void;
    init(params: IGroupPanelInitParameters): void;
    toJSON(): GroupviewPanelState;
    setTitle(title: string): void;
    update(event: PanelUpdateEvent): void;
    runEvents(): void;
}

export class DockviewPanel
    extends CompositeDisposable
    implements IDockviewPanel
{
    readonly api: DockviewPanelApiImpl;

    private _group: DockviewGroupPanel;
    private _params?: Parameters;
    private _title: string | undefined;
    private _renderer: DockviewPanelRenderer | undefined;

    private _minimumWidth: number | undefined;
    private _minimumHeight: number | undefined;
    private _maximumWidth: number | undefined;
    private _maximumHeight: number | undefined;

    get params(): Parameters | undefined {
        return this._params;
    }

    get title(): string | undefined {
        return this._title;
    }

    get group(): DockviewGroupPanel {
        return this._group;
    }

    get renderer(): DockviewPanelRenderer {
        return this._renderer ?? this.accessor.renderer;
    }

    get minimumWidth(): number | undefined {
        return this._minimumWidth;
    }

    get minimumHeight(): number | undefined {
        return this._minimumHeight;
    }

    get maximumWidth(): number | undefined {
        return this._maximumWidth;
    }

    get maximumHeight(): number | undefined {
        return this._maximumHeight;
    }

    constructor(
        public readonly id: string,
        component: string,
        tabComponent: string | undefined,
        private readonly accessor: DockviewComponent,
        private readonly containerApi: DockviewApi,
        group: DockviewGroupPanel,
        readonly view: IDockviewPanelModel,
        options: { renderer?: DockviewPanelRenderer } & Partial<Contraints>
    ) {
        super();
        this._renderer = options.renderer;
        this._group = group;
        this._minimumWidth = options.minimumWidth;
        this._minimumHeight = options.minimumHeight;
        this._maximumWidth = options.maximumWidth;
        this._maximumHeight = options.maximumHeight;

        this.api = new DockviewPanelApiImpl(
            this,
            this._group,
            accessor,
            component,
            tabComponent
        );

        this.addDisposables(
            this.api.onActiveChange(() => {
                accessor.setActivePanel(this);
            }),
            this.api.onDidSizeChange((event) => {
                // forward the resize event to the group since if you want to resize a panel
                // you are actually just resizing the panels parent which is the group
                this.group.api.setSize(event);
            }),
            this.api.onDidRendererChange(() => {
                this.group.model.rerender(this);
            })
        );
    }

    public init(params: IGroupPanelInitParameters): void {
        this._params = params.params;

        this.view.init({
            ...params,
            api: this.api,
            containerApi: this.containerApi,
        });

        this.setTitle(params.title);
    }

    focus(): void {
        const event = new WillFocusEvent();
        this.api._onWillFocus.fire(event);

        if (event.defaultPrevented) {
            return;
        }

        if (!this.api.isActive) {
            this.api.setActive();
        }
    }

    public toJSON(): GroupviewPanelState {
        return <GroupviewPanelState>{
            id: this.id,
            contentComponent: this.view.contentComponent,
            tabComponent: this.view.tabComponent,
            params:
                Object.keys(this._params || {}).length > 0
                    ? this._params
                    : undefined,
            title: this.title,
            renderer: this._renderer,
            minimumHeight: this._minimumHeight,
            maximumHeight: this._maximumHeight,
            minimumWidth: this._minimumWidth,
            maximumWidth: this._maximumWidth,
        };
    }

    setTitle(title: string): void {
        const didTitleChange = title !== this.title;

        if (didTitleChange) {
            this._title = title;
            this.api._onDidTitleChange.fire({ title });
        }
    }

    setRenderer(renderer: DockviewPanelRenderer): void {
        const didChange = renderer !== this.renderer;

        if (didChange) {
            this._renderer = renderer;
            this.api._onDidRendererChange.fire({
                renderer: renderer,
            });
        }
    }

    public update(event: PanelUpdateEvent): void {
        // merge the new parameters with the existing parameters
        this._params = {
            ...(this._params ?? {}),
            ...event.params,
        };

        /**
         * delete new keys that have a value of undefined,
         * allow values of null
         */
        for (const key of Object.keys(event.params)) {
            if (event.params[key] === undefined) {
                delete this._params[key];
            }
        }

        // update the view with the updated props
        this.view.update({
            params: this._params,
        });
    }

    updateFromStateModel(state: GroupviewPanelState): void {
        this._maximumHeight = state.maximumHeight;
        this._minimumHeight = state.minimumHeight;
        this._maximumWidth = state.maximumWidth;
        this._minimumWidth = state.minimumWidth;

        this.update({ params: state.params ?? {} });
        this.setTitle(state.title ?? this.id);
        this.setRenderer(state.renderer ?? this.accessor.renderer);

        // state.contentComponent;
        // state.tabComponent;
    }

    public updateParentGroup(
        group: DockviewGroupPanel,
        options?: { skipSetActive?: boolean }
    ): void {
        this._group = group;
        this.api.group = this._group;

        const isPanelVisible = this._group.model.isPanelActive(this);
        const isActive = this.group.api.isActive && isPanelVisible;

        if (!options?.skipSetActive) {
            if (this.api.isActive !== isActive) {
                this.api._onDidActiveChange.fire({
                    isActive: this.group.api.isActive && isPanelVisible,
                });
            }
        }

        if (this.api.isVisible !== isPanelVisible) {
            this.api._onDidVisibilityChange.fire({
                isVisible: isPanelVisible,
            });
        }
    }

    runEvents(): void {
        const isPanelVisible = this._group.model.isPanelActive(this);

        const isActive = this.group.api.isActive && isPanelVisible;

        if (this.api.isActive !== isActive) {
            this.api._onDidActiveChange.fire({
                isActive: this.group.api.isActive && isPanelVisible,
            });
        }

        if (this.api.isVisible !== isPanelVisible) {
            this.api._onDidVisibilityChange.fire({
                isVisible: isPanelVisible,
            });
        }
    }

    public layout(width: number, height: number): void {
        // TODO: Can we somehow do height without header height or indicate what the header height is?
        this.api._onDidDimensionChange.fire({
            width,
            height: height,
        });

        this.view.layout(width, height);
    }

    public dispose(): void {
        this.api.dispose();
        this.view.dispose();
    }
}
````

## File: packages/dockview-core/src/dockview/dockviewPanelModel.ts
````typescript
import { DefaultTab } from './components/tab/defaultTab';
import {
    GroupPanelPartInitParameters,
    IContentRenderer,
    ITabRenderer,
} from './types';
import { IDisposable } from '../lifecycle';
import { IDockviewComponent } from './dockviewComponent';
import { PanelUpdateEvent } from '../panel/types';
import { TabLocation } from './framework';

export interface IDockviewPanelModel extends IDisposable {
    readonly contentComponent: string;
    readonly tabComponent?: string;
    readonly content: IContentRenderer;
    readonly tab: ITabRenderer;
    update(event: PanelUpdateEvent): void;
    layout(width: number, height: number): void;
    init(params: GroupPanelPartInitParameters): void;
    createTabRenderer(tabLocation: TabLocation): ITabRenderer;
}

export class DockviewPanelModel implements IDockviewPanelModel {
    private readonly _content: IContentRenderer;
    private readonly _tab: ITabRenderer;

    private _params: GroupPanelPartInitParameters | undefined;
    private _updateEvent: PanelUpdateEvent | undefined;

    get content(): IContentRenderer {
        return this._content;
    }

    get tab(): ITabRenderer {
        return this._tab;
    }

    constructor(
        private readonly accessor: IDockviewComponent,
        private readonly id: string,
        readonly contentComponent: string,
        readonly tabComponent?: string
    ) {
        this._content = this.createContentComponent(this.id, contentComponent);
        this._tab = this.createTabComponent(this.id, tabComponent);
    }

    createTabRenderer(tabLocation: TabLocation): ITabRenderer {
        const cmp = this.createTabComponent(this.id, this.tabComponent);
        if (this._params) {
            cmp.init({ ...this._params, tabLocation });
        }
        if (this._updateEvent) {
            cmp.update?.(this._updateEvent);
        }

        return cmp;
    }

    init(params: GroupPanelPartInitParameters): void {
        this._params = params;

        this.content.init(params);
        this.tab.init({ ...params, tabLocation: 'header' });
    }

    layout(width: number, height: number): void {
        this.content.layout?.(width, height);
    }

    update(event: PanelUpdateEvent): void {
        this._updateEvent = event;

        this.content.update?.(event);
        this.tab.update?.(event);
    }

    dispose(): void {
        this.content.dispose?.();
        this.tab.dispose?.();
    }

    private createContentComponent(
        id: string,
        componentName: string
    ): IContentRenderer {
        return this.accessor.options.createComponent({
            id,
            name: componentName,
        });
    }

    private createTabComponent(
        id: string,
        componentName?: string
    ): ITabRenderer {
        const name = componentName ?? this.accessor.options.defaultTabComponent;

        if (name) {
            if (this.accessor.options.createTabComponent) {
                const component = this.accessor.options.createTabComponent({
                    id,
                    name,
                });

                if (component) {
                    return component;
                } else {
                    return new DefaultTab();
                }
            }

            console.warn(
                `dockview: tabComponent '${componentName}' was not found. falling back to the default tab.`
            );
        }

        return new DefaultTab();
    }
}
````

## File: packages/dockview-core/src/dockview/events.ts
````typescript
import { Position, WillShowOverlayEvent } from '../dnd/droptarget';
import { PanelTransfer } from '../dnd/dataTransfer';
import { DockviewApi } from '../api/component.api';
import { IDockviewPanel } from './dockviewPanel';
import { DockviewGroupPanel } from './dockviewGroupPanel';
import { IDockviewEvent } from '../events';

export type DockviewGroupDropLocation =
    | 'tab'
    | 'header_space'
    | 'content'
    | 'edge';

export interface DockviewWillShowOverlayLocationEventOptions {
    readonly kind: DockviewGroupDropLocation;
    readonly panel: IDockviewPanel | undefined;
    readonly api: DockviewApi;
    readonly group: DockviewGroupPanel | undefined;
    getData: () => PanelTransfer | undefined;
}

export class DockviewWillShowOverlayLocationEvent implements IDockviewEvent {
    get kind(): DockviewGroupDropLocation {
        return this.options.kind;
    }

    get nativeEvent(): DragEvent {
        return this.event.nativeEvent;
    }

    get position(): Position {
        return this.event.position;
    }

    get defaultPrevented(): boolean {
        return this.event.defaultPrevented;
    }

    get panel(): IDockviewPanel | undefined {
        return this.options.panel;
    }

    get api(): DockviewApi {
        return this.options.api;
    }

    get group(): DockviewGroupPanel | undefined {
        return this.options.group;
    }

    preventDefault(): void {
        this.event.preventDefault();
    }

    getData(): PanelTransfer | undefined {
        return this.options.getData();
    }

    constructor(
        private readonly event: WillShowOverlayEvent,
        readonly options: DockviewWillShowOverlayLocationEventOptions
    ) {}
}
````

## File: packages/dockview-core/src/dockview/framework.ts
````typescript
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
````

## File: packages/dockview-core/src/dockview/options.ts
````typescript
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
````

## File: packages/dockview-core/src/dockview/strictEventsSequencing.ts
````typescript
import { CompositeDisposable } from '../lifecycle';
import { DockviewComponent } from './dockviewComponent';

export class StrictEventsSequencing extends CompositeDisposable {
    constructor(private readonly accessor: DockviewComponent) {
        super();

        this.init();
    }

    private init(): void {
        const panels = new Set<string>();
        const groups = new Set<string>();

        this.addDisposables(
            this.accessor.onDidAddPanel((panel) => {
                if (panels.has(panel.api.id)) {
                    throw new Error(
                        `dockview: Invalid event sequence. [onDidAddPanel] called for panel ${panel.api.id} but panel already exists`
                    );
                } else {
                    panels.add(panel.api.id);
                }
            }),
            this.accessor.onDidRemovePanel((panel) => {
                if (!panels.has(panel.api.id)) {
                    throw new Error(
                        `dockview: Invalid event sequence. [onDidRemovePanel] called for panel ${panel.api.id} but panel does not exists`
                    );
                } else {
                    panels.delete(panel.api.id);
                }
            }),
            this.accessor.onDidAddGroup((group) => {
                if (groups.has(group.api.id)) {
                    throw new Error(
                        `dockview: Invalid event sequence. [onDidAddGroup] called for group ${group.api.id} but group already exists`
                    );
                } else {
                    groups.add(group.api.id);
                }
            }),
            this.accessor.onDidRemoveGroup((group) => {
                if (!groups.has(group.api.id)) {
                    throw new Error(
                        `dockview: Invalid event sequence. [onDidRemoveGroup] called for group ${group.api.id} but group does not exists`
                    );
                } else {
                    groups.delete(group.api.id);
                }
            })
        );
    }
}
````

## File: packages/dockview-core/src/dockview/theme.ts
````typescript
export interface DockviewTheme {
    /**
     *  The name of the theme
     */
    name: string;
    /**
     * The class name to apply to the theme containing the CSS variables settings.
     */
    className: string;
    /**
     * The gap between the groups
     */
    gap?: number;
    /**
     * The mouting position of the overlay shown when dragging a panel. `absolute`
     * will mount the overlay to root of the dockview component whereas `relative` will mount the overlay to the group container.
     */
    dndOverlayMounting?: 'absolute' | 'relative';
    /**
     * When dragging a panel, the overlay can either encompass the panel contents or the entire group including the tab header space.
     */
    dndPanelOverlay?: 'content' | 'group';
}

export const themeDark: DockviewTheme = {
    name: 'dark',
    className: 'dockview-theme-dark',
};

export const themeLight: DockviewTheme = {
    name: 'light',
    className: 'dockview-theme-light',
};

export const themeVisualStudio: DockviewTheme = {
    name: 'visualStudio',
    className: 'dockview-theme-vs',
};

export const themeAbyss: DockviewTheme = {
    name: 'abyss',
    className: 'dockview-theme-abyss',
};

export const themeDracula: DockviewTheme = {
    name: 'dracula',
    className: 'dockview-theme-dracula',
};

export const themeReplit: DockviewTheme = {
    name: 'replit',
    className: 'dockview-theme-replit',
    gap: 10,
};

export const themeAbyssSpaced: DockviewTheme = {
    name: 'abyssSpaced',
    className: 'dockview-theme-abyss-spaced',
    gap: 10,
    dndOverlayMounting: 'absolute',
    dndPanelOverlay: 'group',
};

export const themeLightSpaced: DockviewTheme = {
    name: 'lightSpaced',
    className: 'dockview-theme-light-spaced',
    gap: 10,
    dndOverlayMounting: 'absolute',
    dndPanelOverlay: 'group',
};
````

## File: packages/dockview-core/src/dockview/types.ts
````typescript
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
````

## File: packages/dockview-core/src/dockview/validate.ts
````typescript
// import { SerializedGridObject } from '../gridview/gridview';
// import { Orientation } from '../splitview/splitview';
// import { SerializedDockview } from './dockviewComponent';
// import { GroupPanelViewState } from './dockviewGroupPanelModel';

// function typeValidate3(data: GroupPanelViewState, path: string): void {
//     if (typeof data.id !== 'string') {
//         throw new Error(`${path}.id must be a string`);
//     }

//     if (
//         typeof data.activeView !== 'string' ||
//         typeof data.activeView !== 'undefined'
//     ) {
//         throw new Error(`${path}.activeView must be a string of undefined`);
//     }
// }

// function typeValidate2(
//     data: SerializedGridObject<GroupPanelViewState>,
//     path: string
// ): void {
//     if (typeof data.size !== 'number' && typeof data.size !== 'undefined') {
//         throw new Error(`${path}.size must be a number or undefined`);
//     }

//     if (
//         typeof data.visible !== 'boolean' &&
//         typeof data.visible !== 'undefined'
//     ) {
//         throw new Error(`${path}.visible must be a boolean or undefined`);
//     }

//     if (data.type === 'leaf') {
//         if (
//             typeof data.data !== 'object' ||
//             data.data === null ||
//             Array.isArray(data.data)
//         ) {
//             throw new Error('object must be a non-null object');
//         }

//         typeValidate3(data.data, `${path}.data`);
//     } else if (data.type === 'branch') {
//         if (!Array.isArray(data.data)) {
//             throw new Error(`${path}.data must be an array`);
//         }
//     } else {
//         throw new Error(`${path}.type must be onew of {'branch', 'leaf'}`);
//     }
// }

// function typeValidate(data: SerializedDockview): void {
//     if (typeof data !== 'object' || data === null) {
//         throw new Error('object must be a non-null object');
//     }

//     const { grid, panels, activeGroup, floatingGroups } = data;

//     if (typeof grid !== 'object' || grid === null) {
//         throw new Error("'.grid' must be a non-null object");
//     }

//     if (typeof grid.height !== 'number') {
//         throw new Error("'.grid.height' must be a number");
//     }

//     if (typeof grid.width !== 'number') {
//         throw new Error("'.grid.width' must be a number");
//     }

//     if (typeof grid.root !== 'object' || grid.root === null) {
//         throw new Error("'.grid.root' must be a non-null object");
//     }

//     if (grid.root.type !== 'branch') {
//         throw new Error(".grid.root.type must be of type 'branch'");
//     }

//     if (
//         grid.orientation !== Orientation.HORIZONTAL &&
//         grid.orientation !== Orientation.VERTICAL
//     ) {
//         throw new Error(
//             `'.grid.width' must be one of {${Orientation.HORIZONTAL}, ${Orientation.VERTICAL}}`
//         );
//     }

//     typeValidate2(grid.root, '.grid.root');
// }
````

## File: packages/dockview-core/src/gridview/baseComponentGridview.ts
````typescript
import { Emitter, Event, AsapEvent } from '../events';
import { getGridLocation, Gridview, IGridView } from './gridview';
import { Position } from '../dnd/droptarget';
import { Disposable, IDisposable, IValueDisposable } from '../lifecycle';
import { sequentialNumberGenerator } from '../math';
import { ISplitviewStyles, Orientation, Sizing } from '../splitview/splitview';
import { IPanel } from '../panel/types';
import { MovementOptions2 } from '../dockview/options';
import { Resizable } from '../resizable';
import { Classnames } from '../dom';

const nextLayoutId = sequentialNumberGenerator();

/**
 * A direction in which a panel can be moved or placed relative to another panel.
 */
export type Direction = 'left' | 'right' | 'above' | 'below' | 'within';

export function toTarget(direction: Direction): Position {
    switch (direction) {
        case 'left':
            return 'left';
        case 'right':
            return 'right';
        case 'above':
            return 'top';
        case 'below':
            return 'bottom';
        case 'within':
        default:
            return 'center';
    }
}

export interface MaximizedChanged<T extends IGridPanelView> {
    panel: T;
    isMaximized: boolean;
}

export interface BaseGridOptions {
    readonly proportionalLayout: boolean;
    readonly orientation: Orientation;
    readonly styles?: ISplitviewStyles;
    readonly disableAutoResizing?: boolean;
    readonly locked?: boolean;
    readonly margin?: number;
    readonly className?: string;
}

export interface IGridPanelView extends IGridView, IPanel {
    setActive(isActive: boolean): void;
    readonly isActive: boolean;
}

export interface IBaseGrid<T extends IGridPanelView> extends IDisposable {
    readonly element: HTMLElement;
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly minimumHeight: number;
    readonly maximumHeight: number;
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly activeGroup: T | undefined;
    readonly size: number;
    readonly groups: T[];
    readonly onDidMaximizedChange: Event<MaximizedChanged<T>>;
    readonly onDidLayoutChange: Event<void>;
    getPanel(id: string): T | undefined;
    toJSON(): object;
    fromJSON(data: any): void;
    clear(): void;
    layout(width: number, height: number, force?: boolean): void;
    setVisible(panel: T, visible: boolean): void;
    isVisible(panel: T): boolean;
    maximizeGroup(panel: T): void;
    isMaximizedGroup(panel: T): boolean;
    exitMaximizedGroup(): void;
    hasMaximizedGroup(): boolean;
}

export abstract class BaseGrid<T extends IGridPanelView>
    extends Resizable
    implements IBaseGrid<T>
{
    private readonly _id = nextLayoutId.next();
    protected readonly _groups = new Map<string, IValueDisposable<T>>();
    protected readonly gridview: Gridview;

    protected _activeGroup: T | undefined;

    private readonly _onDidRemove = new Emitter<T>();
    readonly onDidRemove: Event<T> = this._onDidRemove.event;

    private readonly _onDidAdd = new Emitter<T>();
    readonly onDidAdd: Event<T> = this._onDidAdd.event;

    private readonly _onDidMaximizedChange = new Emitter<MaximizedChanged<T>>();
    readonly onDidMaximizedChange: Event<MaximizedChanged<T>> =
        this._onDidMaximizedChange.event;

    private readonly _onDidActiveChange = new Emitter<T | undefined>();
    readonly onDidActiveChange: Event<T | undefined> =
        this._onDidActiveChange.event;

    protected readonly _bufferOnDidLayoutChange = new AsapEvent();
    readonly onDidLayoutChange: Event<void> =
        this._bufferOnDidLayoutChange.onEvent;

    private readonly _onDidViewVisibilityChangeMicroTaskQueue = new AsapEvent();
    readonly onDidViewVisibilityChangeMicroTaskQueue =
        this._onDidViewVisibilityChangeMicroTaskQueue.onEvent;

    private readonly _classNames: Classnames;

    get id(): string {
        return this._id;
    }

    get size(): number {
        return this._groups.size;
    }

    get groups(): T[] {
        return Array.from(this._groups.values()).map((_) => _.value);
    }

    get width(): number {
        return this.gridview.width;
    }

    get height(): number {
        return this.gridview.height;
    }

    get minimumHeight(): number {
        return this.gridview.minimumHeight;
    }
    get maximumHeight(): number {
        return this.gridview.maximumHeight;
    }
    get minimumWidth(): number {
        return this.gridview.minimumWidth;
    }
    get maximumWidth(): number {
        return this.gridview.maximumWidth;
    }

    get activeGroup(): T | undefined {
        return this._activeGroup;
    }

    get locked(): boolean {
        return this.gridview.locked;
    }

    set locked(value: boolean) {
        this.gridview.locked = value;
    }

    constructor(container: HTMLElement, options: BaseGridOptions) {
        super(document.createElement('div'), options.disableAutoResizing);
        this.element.style.height = '100%';
        this.element.style.width = '100%';

        this._classNames = new Classnames(this.element);
        this._classNames.setClassNames(options.className ?? '');

        // the container is owned by the third-party, do not modify/delete it
        container.appendChild(this.element);

        this.gridview = new Gridview(
            !!options.proportionalLayout,
            options.styles,
            options.orientation,
            options.locked,
            options.margin
        );

        this.gridview.locked = !!options.locked;

        this.element.appendChild(this.gridview.element);

        this.layout(0, 0, true); // set some elements height/widths

        this.addDisposables(
            this.gridview.onDidMaximizedNodeChange((event) => {
                this._onDidMaximizedChange.fire({
                    panel: event.view as T,
                    isMaximized: event.isMaximized,
                });
            }),
            this.gridview.onDidViewVisibilityChange(() =>
                this._onDidViewVisibilityChangeMicroTaskQueue.fire()
            ),
            this.onDidViewVisibilityChangeMicroTaskQueue(() => {
                this.layout(this.width, this.height, true);
            }),
            Disposable.from(() => {
                this.element.parentElement?.removeChild(this.element);
            }),
            this.gridview.onDidChange(() => {
                this._bufferOnDidLayoutChange.fire();
            }),
            Event.any(
                this.onDidAdd,
                this.onDidRemove,
                this.onDidActiveChange
            )(() => {
                this._bufferOnDidLayoutChange.fire();
            }),
            this._onDidMaximizedChange,
            this._onDidViewVisibilityChangeMicroTaskQueue,
            this._bufferOnDidLayoutChange
        );
    }

    public abstract toJSON(): object;

    public abstract fromJSON(data: any): void;

    public abstract clear(): void;

    public setVisible(panel: T, visible: boolean): void {
        this.gridview.setViewVisible(getGridLocation(panel.element), visible);
        this._bufferOnDidLayoutChange.fire();
    }

    public isVisible(panel: T): boolean {
        return this.gridview.isViewVisible(getGridLocation(panel.element));
    }

    updateOptions(options: Partial<BaseGridOptions>) {
        if (typeof options.proportionalLayout === 'boolean') {
            // this.gridview.proportionalLayout = options.proportionalLayout; // not supported
        }
        if (options.orientation) {
            this.gridview.orientation = options.orientation;
        }
        if ('styles' in options) {
            // this.gridview.styles = options.styles; // not supported
        }
        if ('disableResizing' in options) {
            this.disableResizing = options.disableAutoResizing ?? false;
        }
        if ('locked' in options) {
            this.locked = options.locked ?? false;
        }
        if ('margin' in options) {
            this.gridview.margin = options.margin ?? 0;
        }
        if ('className' in options) {
            this._classNames.setClassNames(options.className ?? '');
        }
    }

    maximizeGroup(panel: T): void {
        this.gridview.maximizeView(panel);
        this.doSetGroupActive(panel);
    }

    isMaximizedGroup(panel: T): boolean {
        return this.gridview.maximizedView() === panel;
    }

    exitMaximizedGroup(): void {
        this.gridview.exitMaximizedView();
    }

    hasMaximizedGroup(): boolean {
        return this.gridview.hasMaximizedView();
    }

    protected doAddGroup(
        group: T,
        location: number[] = [0],
        size?: number
    ): void {
        this.gridview.addView(group, size ?? Sizing.Distribute, location);

        this._onDidAdd.fire(group);
    }

    protected doRemoveGroup(
        group: T,
        options?: { skipActive?: boolean; skipDispose?: boolean }
    ): T {
        if (!this._groups.has(group.id)) {
            throw new Error('invalid operation');
        }

        const item = this._groups.get(group.id);

        const view = this.gridview.remove(group, Sizing.Distribute);

        if (item && !options?.skipDispose) {
            item.disposable.dispose();
            item.value.dispose();
            this._groups.delete(group.id);
            this._onDidRemove.fire(group);
        }

        if (!options?.skipActive && this._activeGroup === group) {
            const groups = Array.from(this._groups.values());

            this.doSetGroupActive(
                groups.length > 0 ? groups[0].value : undefined
            );
        }

        return view as T;
    }

    public getPanel(id: string): T | undefined {
        return this._groups.get(id)?.value;
    }

    public doSetGroupActive(group: T | undefined): void {
        if (this._activeGroup === group) {
            return;
        }
        if (this._activeGroup) {
            this._activeGroup.setActive(false);
        }

        if (group) {
            group.setActive(true);
        }

        this._activeGroup = group;

        this._onDidActiveChange.fire(group);
    }

    public removeGroup(group: T): void {
        this.doRemoveGroup(group);
    }

    public moveToNext(options?: MovementOptions2): void {
        if (!options) {
            options = {};
        }
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        const location = getGridLocation(options.group.element);
        const next = this.gridview.next(location)?.view;
        this.doSetGroupActive(next as T);
    }

    public moveToPrevious(options?: MovementOptions2): void {
        if (!options) {
            options = {};
        }
        if (!options.group) {
            if (!this.activeGroup) {
                return;
            }
            options.group = this.activeGroup;
        }

        const location = getGridLocation(options.group.element);
        const next = this.gridview.previous(location)?.view;
        this.doSetGroupActive(next as T);
    }

    public layout(width: number, height: number, forceResize?: boolean): void {
        const different =
            forceResize || width !== this.width || height !== this.height;

        if (!different) {
            return;
        }

        this.gridview.element.style.height = `${height}px`;
        this.gridview.element.style.width = `${width}px`;

        this.gridview.layout(width, height);
    }

    public dispose(): void {
        this._onDidActiveChange.dispose();
        this._onDidAdd.dispose();
        this._onDidRemove.dispose();

        for (const group of this.groups) {
            group.dispose();
        }

        this.gridview.dispose();

        super.dispose();
    }
}
````

## File: packages/dockview-core/src/gridview/basePanelView.ts
````typescript
import { trackFocus } from '../dom';
import { CompositeDisposable } from '../lifecycle';
import {
    IFrameworkPart,
    PanelUpdateEvent,
    PanelInitParameters,
    IPanel,
    Parameters,
} from '../panel/types';
import { PanelApi, PanelApiImpl, WillFocusEvent } from '../api/panelApi';

export interface BasePanelViewState {
    readonly id: string;
    readonly component: string;
    readonly params?: Parameters;
}

export interface BasePanelViewExported<T extends PanelApi> {
    readonly id: string;
    readonly api: T;
    readonly width: number;
    readonly height: number;
    readonly params: Parameters | undefined;
    focus(): void;
    toJSON(): object;
    update(event: PanelUpdateEvent): void;
}

export abstract class BasePanelView<T extends PanelApiImpl>
    extends CompositeDisposable
    implements IPanel, BasePanelViewExported<T>
{
    private _height = 0;
    private _width = 0;
    private readonly _element: HTMLElement;
    protected part?: IFrameworkPart;
    protected _params?: PanelInitParameters;

    // provide an IFrameworkPart that will determine the rendered UI of this view piece.
    protected abstract getComponent(): IFrameworkPart;

    get element(): HTMLElement {
        return this._element;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get params(): Parameters | undefined {
        return this._params?.params;
    }

    constructor(
        public readonly id: string,
        protected readonly component: string,
        public readonly api: T
    ) {
        super();

        this._element = document.createElement('div');
        this._element.tabIndex = -1;
        this._element.style.outline = 'none';
        this._element.style.height = '100%';
        this._element.style.width = '100%';
        this._element.style.overflow = 'hidden';

        const focusTracker = trackFocus(this._element);

        this.addDisposables(
            this.api,
            focusTracker.onDidFocus(() => {
                this.api._onDidChangeFocus.fire({ isFocused: true });
            }),
            focusTracker.onDidBlur(() => {
                this.api._onDidChangeFocus.fire({ isFocused: false });
            }),
            focusTracker
        );
    }

    focus(): void {
        const event = new WillFocusEvent();
        this.api._onWillFocus.fire(event);

        if (event.defaultPrevented) {
            return;
        }

        this._element.focus();
    }

    layout(width: number, height: number): void {
        this._width = width;
        this._height = height;
        this.api._onDidDimensionChange.fire({ width, height });

        if (this.part) {
            if (this._params) {
                this.part.update(this._params.params);
            }
        }
    }

    init(parameters: PanelInitParameters): void {
        this._params = parameters;
        this.part = this.getComponent();
    }

    update(event: PanelUpdateEvent): void {
        // merge the new parameters with the existing parameters
        this._params = {
            ...this._params,
            params: {
                ...this._params?.params,
                ...event.params,
            },
        };

        /**
         * delete new keys that have a value of undefined,
         * allow values of null
         */
        for (const key of Object.keys(event.params)) {
            if (event.params[key] === undefined) {
                delete this._params.params[key];
            }
        }

        // update the view with the updated props
        this.part?.update({ params: this._params.params });
    }

    toJSON(): BasePanelViewState {
        const params = this._params?.params ?? {};

        return {
            id: this.id,
            component: this.component,
            params: Object.keys(params).length > 0 ? params : undefined,
        };
    }

    dispose(): void {
        this.api.dispose();
        this.part?.dispose();

        super.dispose();
    }
}
````

## File: packages/dockview-core/src/gridview/branchNode.ts
````typescript
/*---------------------------------------------------------------------------------------------
 * Accreditation: This file is largly based upon the MIT licenced VSCode sourcecode found at:
 * https://github.com/microsoft/vscode/tree/main/src/vs/base/browser/ui/grid
 *--------------------------------------------------------------------------------------------*/

import {
    IView,
    Splitview,
    Orientation,
    Sizing,
    LayoutPriority,
    ISplitviewStyles,
} from '../splitview/splitview';
import { Emitter, Event } from '../events';
import { INodeDescriptor } from './gridview';
import { LeafNode } from './leafNode';
import { Node } from './types';
import { CompositeDisposable, IDisposable, Disposable } from '../lifecycle';

export class BranchNode extends CompositeDisposable implements IView {
    readonly element: HTMLElement;
    private readonly splitview: Splitview;
    private _orthogonalSize: number;
    private _size: number;
    private _childrenDisposable: IDisposable = Disposable.NONE;

    public readonly children: Node[] = [];

    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    private readonly _onDidVisibilityChange = new Emitter<{
        visible: boolean;
    }>();
    readonly onDidVisibilityChange: Event<{
        visible: boolean;
    }> = this._onDidVisibilityChange.event;

    get width(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.size
            : this.orthogonalSize;
    }

    get height(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.orthogonalSize
            : this.size;
    }

    get minimumSize(): number {
        return this.children.length === 0
            ? 0
            : Math.max(
                  ...this.children.map((c, index) =>
                      this.splitview.isViewVisible(index)
                          ? c.minimumOrthogonalSize
                          : 0
                  )
              );
    }

    get maximumSize(): number {
        return Math.min(
            ...this.children.map((c, index) =>
                this.splitview.isViewVisible(index)
                    ? c.maximumOrthogonalSize
                    : Number.POSITIVE_INFINITY
            )
        );
    }

    get minimumOrthogonalSize(): number {
        return this.splitview.minimumSize;
    }

    get maximumOrthogonalSize(): number {
        return this.splitview.maximumSize;
    }

    get orthogonalSize(): number {
        return this._orthogonalSize;
    }

    get size(): number {
        return this._size;
    }

    get minimumWidth(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.minimumOrthogonalSize
            : this.minimumSize;
    }

    get minimumHeight(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.minimumSize
            : this.minimumOrthogonalSize;
    }

    get maximumWidth(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.maximumOrthogonalSize
            : this.maximumSize;
    }

    get maximumHeight(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.maximumSize
            : this.maximumOrthogonalSize;
    }

    get priority(): LayoutPriority {
        if (this.children.length === 0) {
            return LayoutPriority.Normal;
        }

        const priorities = this.children.map((c) =>
            typeof c.priority === 'undefined'
                ? LayoutPriority.Normal
                : c.priority
        );

        if (priorities.some((p) => p === LayoutPriority.High)) {
            return LayoutPriority.High;
        } else if (priorities.some((p) => p === LayoutPriority.Low)) {
            return LayoutPriority.Low;
        }

        return LayoutPriority.Normal;
    }

    get disabled(): boolean {
        return this.splitview.disabled;
    }

    set disabled(value: boolean) {
        this.splitview.disabled = value;
    }

    get margin(): number {
        return this.splitview.margin;
    }

    set margin(value: number) {
        this.splitview.margin = value;

        this.children.forEach((child) => {
            if (child instanceof BranchNode) {
                child.margin = value;
            }
        });
    }

    constructor(
        readonly orientation: Orientation,
        readonly proportionalLayout: boolean,
        readonly styles: ISplitviewStyles | undefined,
        size: number,
        orthogonalSize: number,
        disabled: boolean,
        margin: number | undefined,
        childDescriptors?: INodeDescriptor[]
    ) {
        super();
        this._orthogonalSize = orthogonalSize;
        this._size = size;

        this.element = document.createElement('div');
        this.element.className = 'dv-branch-node';

        if (!childDescriptors) {
            this.splitview = new Splitview(this.element, {
                orientation: this.orientation,
                proportionalLayout,
                styles,
                margin,
            });
            this.splitview.layout(this.size, this.orthogonalSize);
        } else {
            const descriptor = {
                views: childDescriptors.map((childDescriptor) => {
                    return {
                        view: childDescriptor.node,
                        size: childDescriptor.node.size,
                        visible:
                            childDescriptor.node instanceof LeafNode &&
                            childDescriptor.visible !== undefined
                                ? childDescriptor.visible
                                : true,
                    };
                }),
                size: this.orthogonalSize,
            };

            this.children = childDescriptors.map((c) => c.node);
            this.splitview = new Splitview(this.element, {
                orientation: this.orientation,
                descriptor,
                proportionalLayout,
                styles,
                margin,
            });
        }

        this.disabled = disabled;

        this.addDisposables(
            this._onDidChange,
            this._onDidVisibilityChange,
            this.splitview.onDidSashEnd(() => {
                this._onDidChange.fire({});
            })
        );

        this.setupChildrenEvents();
    }

    setVisible(_visible: boolean): void {
        // noop
    }

    isChildVisible(index: number): boolean {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        return this.splitview.isViewVisible(index);
    }

    setChildVisible(index: number, visible: boolean): void {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        if (this.splitview.isViewVisible(index) === visible) {
            return;
        }

        const wereAllChildrenHidden = this.splitview.contentSize === 0;

        this.splitview.setViewVisible(index, visible);
        // }
        const areAllChildrenHidden = this.splitview.contentSize === 0;

        // If all children are hidden then the parent should hide the entire splitview
        // If the entire splitview is hidden then the parent should show the splitview when a child is shown
        if (
            (visible && wereAllChildrenHidden) ||
            (!visible && areAllChildrenHidden)
        ) {
            this._onDidVisibilityChange.fire({ visible });
        }
    }

    moveChild(from: number, to: number): void {
        if (from === to) {
            return;
        }

        if (from < 0 || from >= this.children.length) {
            throw new Error('Invalid from index');
        }

        if (from < to) {
            to--;
        }

        this.splitview.moveView(from, to);

        const child = this._removeChild(from);
        this._addChild(child, to);
    }

    getChildSize(index: number): number {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        return this.splitview.getViewSize(index);
    }

    resizeChild(index: number, size: number): void {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        this.splitview.resizeView(index, size);
    }

    public layout(size: number, orthogonalSize: number) {
        this._size = orthogonalSize;
        this._orthogonalSize = size;

        this.splitview.layout(orthogonalSize, size);
    }

    public addChild(
        node: Node,
        size: number | Sizing,
        index: number,
        skipLayout?: boolean
    ): void {
        if (index < 0 || index > this.children.length) {
            throw new Error('Invalid index');
        }

        this.splitview.addView(node, size, index, skipLayout);
        this._addChild(node, index);
    }

    getChildCachedVisibleSize(index: number): number | undefined {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        return this.splitview.getViewCachedVisibleSize(index);
    }

    public removeChild(index: number, sizing?: Sizing): Node {
        if (index < 0 || index >= this.children.length) {
            throw new Error('Invalid index');
        }

        this.splitview.removeView(index, sizing);
        return this._removeChild(index);
    }

    private _addChild(node: Node, index: number): void {
        this.children.splice(index, 0, node);
        this.setupChildrenEvents();
    }

    private _removeChild(index: number): Node {
        const [child] = this.children.splice(index, 1);
        this.setupChildrenEvents();

        return child;
    }

    private setupChildrenEvents(): void {
        this._childrenDisposable.dispose();

        this._childrenDisposable = new CompositeDisposable(
            Event.any(...this.children.map((c) => c.onDidChange))((e) => {
                /**
                 * indicate a change has occured to allows any re-rendering but don't bubble
                 * event because that was specific to this branch
                 */
                this._onDidChange.fire({ size: e.orthogonalSize });
            }),
            ...this.children.map((c, i) => {
                if (c instanceof BranchNode) {
                    return c.onDidVisibilityChange(({ visible }) => {
                        this.setChildVisible(i, visible);
                    });
                }
                return Disposable.NONE;
            })
        );
    }

    public dispose(): void {
        this._childrenDisposable.dispose();
        this.splitview.dispose();
        this.children.forEach((child) => child.dispose());

        super.dispose();
    }
}
````

## File: packages/dockview-core/src/gridview/gridview.ts
````typescript
/*---------------------------------------------------------------------------------------------
 * Accreditation: This file is largly based upon the MIT licenced VSCode sourcecode found at:
 * https://github.com/microsoft/vscode/tree/main/src/vs/base/browser/ui/grid
 *--------------------------------------------------------------------------------------------*/

import {
    ISplitviewStyles,
    LayoutPriority,
    Orientation,
    Sizing,
} from '../splitview/splitview';
import { tail } from '../array';
import { LeafNode } from './leafNode';
import { BranchNode } from './branchNode';
import { Node } from './types';
import { Emitter, Event } from '../events';
import { IDisposable, MutableDisposable } from '../lifecycle';
import { Position } from '../dnd/droptarget';

function findLeaf(candiateNode: Node, last: boolean): LeafNode {
    if (candiateNode instanceof LeafNode) {
        return candiateNode;
    }
    if (candiateNode instanceof BranchNode) {
        return findLeaf(
            candiateNode.children[last ? candiateNode.children.length - 1 : 0],
            last
        );
    }
    throw new Error('invalid node');
}

function cloneNode<T extends Node>(
    node: T,
    size: number,
    orthogonalSize: number
): T {
    if (node instanceof BranchNode) {
        const result = new BranchNode(
            node.orientation,
            node.proportionalLayout,
            node.styles,
            size,
            orthogonalSize,
            node.disabled,
            node.margin
        );

        for (let i = node.children.length - 1; i >= 0; i--) {
            const child = node.children[i];

            result.addChild(
                cloneNode(child, child.size, child.orthogonalSize),
                child.size,
                0,
                true
            );
        }

        return result as T;
    } else {
        return new LeafNode(node.view, node.orientation, orthogonalSize) as T;
    }
}

function flipNode<T extends Node>(
    node: T,
    size: number,
    orthogonalSize: number
): T {
    if (node instanceof BranchNode) {
        const result = new BranchNode(
            orthogonal(node.orientation),
            node.proportionalLayout,
            node.styles,
            size,
            orthogonalSize,
            node.disabled,
            node.margin
        );

        let totalSize = 0;

        for (let i = node.children.length - 1; i >= 0; i--) {
            const child = node.children[i];
            const childSize =
                child instanceof BranchNode ? child.orthogonalSize : child.size;

            let newSize =
                node.size === 0
                    ? 0
                    : Math.round((size * childSize) / node.size);
            totalSize += newSize;

            // The last view to add should adjust to rounding errors
            if (i === 0) {
                newSize += size - totalSize;
            }

            result.addChild(
                flipNode(child, orthogonalSize, newSize),
                newSize,
                0,
                true
            );
        }

        return result as T;
    } else {
        return new LeafNode(
            node.view,
            orthogonal(node.orientation),
            orthogonalSize
        ) as T;
    }
}

export function indexInParent(element: HTMLElement): number {
    const parentElement = element.parentElement;

    if (!parentElement) {
        throw new Error('Invalid grid element');
    }

    let el = parentElement.firstElementChild;
    let index = 0;

    while (el !== element && el !== parentElement.lastElementChild && el) {
        el = el.nextElementSibling;
        index++;
    }

    return index;
}

/**
 * Find the grid location of a specific DOM element by traversing the parent
 * chain and finding each child index on the way.
 *
 * This will break as soon as DOM structures of the Splitview or Gridview change.
 */
export function getGridLocation(element: HTMLElement): number[] {
    const parentElement = element.parentElement;

    if (!parentElement) {
        throw new Error('Invalid grid element');
    }

    if (/\bdv-grid-view\b/.test(parentElement.className)) {
        return [];
    }

    const index = indexInParent(parentElement);
    const ancestor = parentElement.parentElement!.parentElement!.parentElement!;
    return [...getGridLocation(ancestor), index];
}

export function getRelativeLocation(
    rootOrientation: Orientation,
    location: number[],
    direction: Position
): number[] {
    const orientation = getLocationOrientation(rootOrientation, location);
    const directionOrientation = getDirectionOrientation(direction);

    if (orientation === directionOrientation) {
        const [rest, _index] = tail(location);
        let index = _index;

        if (direction === 'right' || direction === 'bottom') {
            index += 1;
        }

        return [...rest, index];
    } else {
        const index = direction === 'right' || direction === 'bottom' ? 1 : 0;
        return [...location, index];
    }
}

export function getDirectionOrientation(direction: Position): Orientation {
    return direction === 'top' || direction === 'bottom'
        ? Orientation.VERTICAL
        : Orientation.HORIZONTAL;
}

export function getLocationOrientation(
    rootOrientation: Orientation,
    location: number[]
): Orientation {
    return location.length % 2 === 0
        ? orthogonal(rootOrientation)
        : rootOrientation;
}

export interface IViewSize {
    width?: number;
    height?: number;
}

export interface IGridView {
    readonly onDidChange: Event<IViewSize | undefined>;
    readonly element: HTMLElement;
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly minimumHeight: number;
    readonly maximumHeight: number;
    readonly isVisible: boolean;
    priority?: LayoutPriority;
    layout(width: number, height: number): void;
    toJSON(): object;
    fromJSON?(json: object): void;
    snap?: boolean;
    setVisible?(visible: boolean): void;
}

export const orthogonal = (orientation: Orientation) =>
    orientation === Orientation.HORIZONTAL
        ? Orientation.VERTICAL
        : Orientation.HORIZONTAL;

export interface GridLeafNode<T extends IGridView> {
    readonly view: T;
    readonly cachedVisibleSize: number | undefined;
    readonly box: { width: number; height: number };
}

export interface GridBranchNode<T extends IGridView> {
    readonly children: GridNode<T>[];
    readonly box: { width: number; height: number };
}

export type GridNode<T extends IGridView> = GridLeafNode<T> | GridBranchNode<T>;

export function isGridBranchNode<T extends IGridView>(
    node: GridNode<T>
): node is GridBranchNode<T> {
    return !!(node as any).children;
}

export interface SerializedGridObject<T> {
    type: 'leaf' | 'branch';
    data: T | SerializedGridObject<T>[];
    size?: number;
    visible?: boolean;
}

const serializeBranchNode = <T extends IGridView>(
    node: GridNode<T>,
    orientation: Orientation
): SerializedGridObject<any> => {
    const size =
        orientation === Orientation.VERTICAL ? node.box.width : node.box.height;

    if (!isGridBranchNode(node)) {
        if (typeof node.cachedVisibleSize === 'number') {
            return {
                type: 'leaf',
                data: node.view.toJSON(),
                size: node.cachedVisibleSize,
                visible: false,
            };
        }

        return { type: 'leaf', data: node.view.toJSON(), size };
    }

    return {
        type: 'branch',
        data: node.children.map((c) =>
            serializeBranchNode(c, orthogonal(orientation))
        ),
        size,
    };
};

export interface ISerializedLeafNode<T = any> {
    type: 'leaf';
    data: T;
    size: number;
    visible?: boolean;
}

export interface ISerializedBranchNode {
    type: 'branch';
    data: ISerializedNode[];
    size: number;
}

export type ISerializedNode = ISerializedLeafNode | ISerializedBranchNode;

export interface INodeDescriptor {
    node: Node;
    visible?: boolean;
}

export interface IViewDeserializer {
    fromJSON: (data: ISerializedLeafNode) => IGridView;
}

export interface SerializedNodeDescriptor {
    location: number[];
}

export interface SerializedGridview<T> {
    root: SerializedGridObject<T>;
    width: number;
    height: number;
    orientation: Orientation;
    maximizedNode?: SerializedNodeDescriptor;
}

export interface MaximizedViewChanged {
    view: IGridView;
    isMaximized: boolean;
}

export class Gridview implements IDisposable {
    readonly element: HTMLElement;

    private _root: BranchNode | undefined;
    private _locked = false;
    private _margin = 0;
    private _maximizedNode:
        | { leaf: LeafNode; hiddenOnMaximize: LeafNode[] }
        | undefined = undefined;
    private readonly disposable: MutableDisposable = new MutableDisposable();

    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    private readonly _onDidViewVisibilityChange = new Emitter<void>();
    readonly onDidViewVisibilityChange = this._onDidViewVisibilityChange.event;

    private readonly _onDidMaximizedNodeChange =
        new Emitter<MaximizedViewChanged>();
    readonly onDidMaximizedNodeChange = this._onDidMaximizedNodeChange.event;

    public get length(): number {
        return this._root ? this._root.children.length : 0;
    }

    public get orientation(): Orientation {
        return this.root.orientation;
    }

    public set orientation(orientation: Orientation) {
        if (this.root.orientation === orientation) {
            return;
        }

        const { size, orthogonalSize } = this.root;
        this.root = flipNode(this.root, orthogonalSize, size);
        this.root.layout(size, orthogonalSize);
    }

    get width(): number {
        return this.root.width;
    }

    get height(): number {
        return this.root.height;
    }

    get minimumWidth(): number {
        return this.root.minimumWidth;
    }

    get minimumHeight(): number {
        return this.root.minimumHeight;
    }

    get maximumWidth(): number {
        return this.root.maximumHeight;
    }

    get maximumHeight(): number {
        return this.root.maximumHeight;
    }

    get locked(): boolean {
        return this._locked;
    }

    set locked(value: boolean) {
        this._locked = value;

        const branch: Node[] = [this.root];

        /**
         * simple depth-first-search to cover all nodes
         *
         * @see https://en.wikipedia.org/wiki/Depth-first_search
         */
        while (branch.length > 0) {
            const node = branch.pop();

            if (node instanceof BranchNode) {
                node.disabled = value;
                branch.push(...node.children);
            }
        }
    }

    get margin(): number {
        return this._margin;
    }

    set margin(value: number) {
        this._margin = value;
        this.root.margin = value;
    }

    maximizedView(): IGridView | undefined {
        return this._maximizedNode?.leaf.view;
    }

    hasMaximizedView(): boolean {
        return this._maximizedNode !== undefined;
    }

    maximizeView(view: IGridView): void {
        const location = getGridLocation(view.element);
        const [_, node] = this.getNode(location);

        if (!(node instanceof LeafNode)) {
            return;
        }

        if (this._maximizedNode?.leaf === node) {
            return;
        }

        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        serializeBranchNode(this.getView(), this.orientation);

        const hiddenOnMaximize: LeafNode[] = [];

        function hideAllViewsBut(parent: BranchNode, exclude: LeafNode): void {
            for (let i = 0; i < parent.children.length; i++) {
                const child = parent.children[i];
                if (child instanceof LeafNode) {
                    if (child !== exclude) {
                        if (parent.isChildVisible(i)) {
                            parent.setChildVisible(i, false);
                        } else {
                            hiddenOnMaximize.push(child);
                        }
                    }
                } else {
                    hideAllViewsBut(child, exclude);
                }
            }
        }

        hideAllViewsBut(this.root, node);
        this._maximizedNode = { leaf: node, hiddenOnMaximize };
        this._onDidMaximizedNodeChange.fire({
            view: node.view,
            isMaximized: true,
        });
    }

    exitMaximizedView(): void {
        if (!this._maximizedNode) {
            return;
        }

        const hiddenOnMaximize = this._maximizedNode.hiddenOnMaximize;

        function showViewsInReverseOrder(parent: BranchNode): void {
            for (let index = parent.children.length - 1; index >= 0; index--) {
                const child = parent.children[index];
                if (child instanceof LeafNode) {
                    if (!hiddenOnMaximize.includes(child)) {
                        parent.setChildVisible(index, true);
                    }
                } else {
                    showViewsInReverseOrder(child);
                }
            }
        }

        showViewsInReverseOrder(this.root);

        const tmp = this._maximizedNode.leaf;
        this._maximizedNode = undefined;
        this._onDidMaximizedNodeChange.fire({
            view: tmp.view,
            isMaximized: false,
        });
    }

    public serialize(): SerializedGridview<any> {
        const maximizedView = this.maximizedView();

        let maxmizedViewLocation: number[] | undefined;

        if (maximizedView) {
            /**
             * The minimum information we can get away with in order to serialize a maxmized view is it's location within the grid
             * which is represented as a branch of indices
             */
            maxmizedViewLocation = getGridLocation(maximizedView.element);
        }

        if (this.hasMaximizedView()) {
            /**
             * the saved layout cannot be in its maxmized state otherwise all of the underlying
             * view dimensions will be wrong
             *
             * To counteract this we temporaily remove the maximized view to compute the serialized output
             * of the grid before adding back the maxmized view as to not alter the layout from the users
             * perspective when `.toJSON()` is called
             */
            this.exitMaximizedView();
        }

        const root = serializeBranchNode(this.getView(), this.orientation);

        const resullt: SerializedGridview<any> = {
            root,
            width: this.width,
            height: this.height,
            orientation: this.orientation,
        };

        if (maxmizedViewLocation) {
            resullt.maximizedNode = {
                location: maxmizedViewLocation,
            };
        }

        if (maximizedView) {
            // replace any maximzied view that was removed for serialization purposes
            this.maximizeView(maximizedView);
        }

        return resullt;
    }

    public dispose(): void {
        this.disposable.dispose();
        this._onDidChange.dispose();
        this._onDidMaximizedNodeChange.dispose();
        this._onDidViewVisibilityChange.dispose();

        this.root.dispose();
        this._maximizedNode = undefined;
        this.element.remove();
    }

    public clear(): void {
        const orientation = this.root.orientation;
        this.root = new BranchNode(
            orientation,
            this.proportionalLayout,
            this.styles,
            this.root.size,
            this.root.orthogonalSize,
            this.locked,
            this.margin
        );
    }

    public deserialize<T>(
        json: SerializedGridview<T>,
        deserializer: IViewDeserializer
    ): void {
        const orientation = json.orientation;
        const height =
            orientation === Orientation.VERTICAL ? json.height : json.width;

        this._deserialize(
            json.root as ISerializedBranchNode,
            orientation,
            deserializer,
            height
        );

        /**
         * The deserialied layout must be positioned through this.layout(...)
         * before any maximizedNode can be positioned
         */
        this.layout(json.width, json.height);

        if (json.maximizedNode) {
            const location = json.maximizedNode.location;

            const [_, node] = this.getNode(location);

            if (!(node instanceof LeafNode)) {
                return;
            }

            this.maximizeView(node.view);
        }
    }

    private _deserialize(
        root: ISerializedBranchNode,
        orientation: Orientation,
        deserializer: IViewDeserializer,
        orthogonalSize: number
    ): void {
        this.root = this._deserializeNode(
            root,
            orientation,
            deserializer,
            orthogonalSize
        ) as BranchNode;
    }

    private _deserializeNode(
        node: ISerializedNode,
        orientation: Orientation,
        deserializer: IViewDeserializer,
        orthogonalSize: number
    ): Node {
        let result: Node;
        if (node.type === 'branch') {
            const serializedChildren = node.data;
            const children = serializedChildren.map((serializedChild) => {
                return {
                    node: this._deserializeNode(
                        serializedChild,
                        orthogonal(orientation),
                        deserializer,
                        node.size
                    ),
                    visible: (serializedChild as { visible: boolean }).visible,
                } as INodeDescriptor;
            });

            result = new BranchNode(
                orientation,
                this.proportionalLayout,
                this.styles,
                node.size, // <- orthogonal size - flips at each depth
                orthogonalSize, // <- size - flips at each depth,
                this.locked,
                this.margin,
                children
            );
        } else {
            const view = deserializer.fromJSON(node);
            if (typeof node.visible === 'boolean') {
                view.setVisible?.(node.visible);
            }

            result = new LeafNode(view, orientation, orthogonalSize, node.size);
        }

        return result;
    }

    private get root(): BranchNode {
        return this._root!;
    }

    private set root(root: BranchNode) {
        const oldRoot = this._root;

        if (oldRoot) {
            oldRoot.dispose();
            this._maximizedNode = undefined;
            this.element.removeChild(oldRoot.element);
        }

        this._root = root;
        this.element.appendChild(this._root.element);
        this.disposable.value = this._root.onDidChange((e) => {
            this._onDidChange.fire(e);
        });
    }

    normalize(): void {
        if (!this._root) {
            return;
        }

        if (this._root.children.length !== 1) {
            return;
        }

        const oldRoot = this.root;

        // can remove one level of redundant branching if there is only a single child
        const childReference = oldRoot.children[0];

        if (childReference instanceof LeafNode) {
            return;
        }

        oldRoot.element.remove();

        const child = oldRoot.removeChild(0); // Remove child to prevent double disposal
        oldRoot.dispose(); // Dispose old root (won't dispose removed child)
        child.dispose(); // Dispose the removed child

        this._root = cloneNode(
            childReference,
            childReference.size,
            childReference.orthogonalSize
        );

        this.element.appendChild(this._root.element);

        this.disposable.value = this._root.onDidChange((e) => {
            this._onDidChange.fire(e);
        });
    }

    /**
     * If the root is orientated as a VERTICAL node then nest the existing root within a new HORIZIONTAL root node
     * If the root is orientated as a HORIZONTAL node then nest the existing root within a new VERITCAL root node
     */
    public insertOrthogonalSplitviewAtRoot(): void {
        if (!this._root) {
            return;
        }

        const oldRoot = this.root;
        oldRoot.element.remove();

        this._root = new BranchNode(
            orthogonal(oldRoot.orientation),
            this.proportionalLayout,
            this.styles,
            this.root.orthogonalSize,
            this.root.size,
            this.locked,
            this.margin
        );

        if (oldRoot.children.length === 0) {
            // no data so no need to add anything back in
        } else if (oldRoot.children.length === 1) {
            // can remove one level of redundant branching if there is only a single child
            const childReference = oldRoot.children[0];
            const child = oldRoot.removeChild(0); // remove to prevent disposal when disposing of unwanted root
            child.dispose();
            oldRoot.dispose();

            this._root.addChild(
                /**
                 * the child node will have the same orientation as the new root since
                 * we are removing the inbetween node.
                 * the entire 'tree' must be flipped recursively to ensure that the orientation
                 * flips at each level
                 */
                flipNode(
                    childReference,
                    childReference.orthogonalSize,
                    childReference.size
                ),
                Sizing.Distribute,
                0
            );
        } else {
            this._root.addChild(oldRoot, Sizing.Distribute, 0);
        }

        this.element.appendChild(this._root.element);

        this.disposable.value = this._root.onDidChange((e) => {
            this._onDidChange.fire(e);
        });
    }

    public next(location: number[]): LeafNode {
        return this.progmaticSelect(location);
    }

    public previous(location: number[]): LeafNode {
        return this.progmaticSelect(location, true);
    }

    getView(): GridBranchNode<IGridView>;
    getView(location?: number[]): GridNode<IGridView>;
    getView(location?: number[]): GridNode<IGridView> {
        const node = location ? this.getNode(location)[1] : this.root;
        return this._getViews(node, this.orientation);
    }

    private _getViews(
        node: Node,
        orientation: Orientation,
        cachedVisibleSize?: number
    ): GridNode<IGridView> {
        const box = { height: node.height, width: node.width };

        if (node instanceof LeafNode) {
            return { box, view: node.view, cachedVisibleSize };
        }

        const children: GridNode<IGridView>[] = [];

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            const nodeCachedVisibleSize = node.getChildCachedVisibleSize(i);

            children.push(
                this._getViews(
                    child,
                    orthogonal(orientation),
                    nodeCachedVisibleSize
                )
            );
        }

        return { box, children };
    }

    private progmaticSelect(location: number[], reverse = false): LeafNode {
        const [path, node] = this.getNode(location);

        if (!(node instanceof LeafNode)) {
            throw new Error('invalid location');
        }

        for (let i = path.length - 1; i > -1; i--) {
            const n = path[i];
            const l = location[i] || 0;
            const canProgressInCurrentLevel = reverse
                ? l - 1 > -1
                : l + 1 < n.children.length;
            if (canProgressInCurrentLevel) {
                return findLeaf(n.children[reverse ? l - 1 : l + 1], reverse);
            }
        }

        return findLeaf(this.root, reverse);
    }

    constructor(
        readonly proportionalLayout: boolean,
        readonly styles: ISplitviewStyles | undefined,
        orientation: Orientation,
        locked?: boolean,
        margin?: number
    ) {
        this.element = document.createElement('div');
        this.element.className = 'dv-grid-view';

        this._locked = locked ?? false;
        this._margin = margin ?? 0;

        this.root = new BranchNode(
            orientation,
            proportionalLayout,
            styles,
            0,
            0,
            this.locked,
            this.margin
        );
    }

    isViewVisible(location: number[]): boolean {
        const [rest, index] = tail(location);
        const [, parent] = this.getNode(rest);

        if (!(parent instanceof BranchNode)) {
            throw new Error('Invalid from location');
        }

        return parent.isChildVisible(index);
    }

    setViewVisible(location: number[], visible: boolean): void {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [rest, index] = tail(location);
        const [, parent] = this.getNode(rest);

        if (!(parent instanceof BranchNode)) {
            throw new Error('Invalid from location');
        }

        this._onDidViewVisibilityChange.fire();

        parent.setChildVisible(index, visible);
    }

    public moveView(parentLocation: number[], from: number, to: number): void {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [, parent] = this.getNode(parentLocation);

        if (!(parent instanceof BranchNode)) {
            throw new Error('Invalid location');
        }

        parent.moveChild(from, to);
    }

    public addView(
        view: IGridView,
        size: number | Sizing,
        location: number[]
    ): void {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [rest, index] = tail(location);

        const [pathToParent, parent] = this.getNode(rest);

        if (parent instanceof BranchNode) {
            const node = new LeafNode(
                view,
                orthogonal(parent.orientation),
                parent.orthogonalSize
            );
            parent.addChild(node, size, index);
        } else {
            const [grandParent, ..._] = [...pathToParent].reverse();
            const [parentIndex, ...__] = [...rest].reverse();

            let newSiblingSize: number | Sizing = 0;

            const newSiblingCachedVisibleSize =
                grandParent.getChildCachedVisibleSize(parentIndex);
            if (typeof newSiblingCachedVisibleSize === 'number') {
                newSiblingSize = Sizing.Invisible(newSiblingCachedVisibleSize);
            }

            const child = grandParent.removeChild(parentIndex);
            child.dispose();

            const newParent = new BranchNode(
                parent.orientation,
                this.proportionalLayout,
                this.styles,
                parent.size,
                parent.orthogonalSize,
                this.locked,
                this.margin
            );
            grandParent.addChild(newParent, parent.size, parentIndex);

            const newSibling = new LeafNode(
                parent.view,
                grandParent.orientation,
                parent.size
            );
            newParent.addChild(newSibling, newSiblingSize, 0);

            if (typeof size !== 'number' && size.type === 'split') {
                size = { type: 'split', index: 0 };
            }

            const node = new LeafNode(
                view,
                grandParent.orientation,
                parent.size
            );
            newParent.addChild(node, size, index);
        }
    }

    public remove(view: IGridView, sizing?: Sizing): IGridView {
        const location = getGridLocation(view.element);
        return this.removeView(location, sizing);
    }

    removeView(location: number[], sizing?: Sizing): IGridView {
        if (this.hasMaximizedView()) {
            this.exitMaximizedView();
        }

        const [rest, index] = tail(location);
        const [pathToParent, parent] = this.getNode(rest);

        if (!(parent instanceof BranchNode)) {
            throw new Error('Invalid location');
        }

        const nodeToRemove = parent.children[index];

        if (!(nodeToRemove instanceof LeafNode)) {
            throw new Error('Invalid location');
        }

        parent.removeChild(index, sizing);
        nodeToRemove.dispose();

        if (parent.children.length !== 1) {
            return nodeToRemove.view;
        }

        // if the parent has only one child and we know the parent is a BranchNode we can make the tree
        // more efficiently spaced by replacing the parent BranchNode with the child.
        // if that child is a LeafNode then we simply replace the BranchNode with the child otherwise if the child
        // is a BranchNode too we should spread it's children into the grandparent.

        // refer to the remaining child as the sibling
        const sibling = parent.children[0];

        if (pathToParent.length === 0) {
            // if the parent is root

            if (sibling instanceof LeafNode) {
                // if the sibling is a leaf node no action is required
                return nodeToRemove.view;
            }

            // otherwise the sibling is a branch node. since the parent is the root and the root has only one child
            // which is a branch node we can just set this branch node to be the new root node

            // for good housekeeping we'll removing the sibling from it's existing tree
            parent.removeChild(0, sizing);

            // and set that sibling node to be root
            this.root = sibling;

            return nodeToRemove.view;
        }

        // otherwise the parent is apart of a large sub-tree

        const [grandParent, ..._] = [...pathToParent].reverse();
        const [parentIndex, ...__] = [...rest].reverse();

        const isSiblingVisible = parent.isChildVisible(0);

        // either way we need to remove the sibling from it's existing tree
        parent.removeChild(0, sizing);

        // note the sizes of all of the grandparents children
        const sizes = grandParent.children.map((_size, i) =>
            grandParent.getChildSize(i)
        );

        // remove the parent from the grandparent since we are moving the sibling to take the parents place
        // this parent is no longer used and can be disposed of
        grandParent.removeChild(parentIndex, sizing).dispose();

        if (sibling instanceof BranchNode) {
            // replace the parent with the siblings children
            sizes.splice(
                parentIndex,
                1,
                ...sibling.children.map((c) => c.size)
            );

            // and add those siblings to the grandparent
            for (let i = 0; i < sibling.children.length; i++) {
                const child = sibling.children[i];
                grandParent.addChild(child, child.size, parentIndex + i);
            }

            /**
             * clean down the branch node since we need to dipose of it and
             * when .dispose() it called on a branch it will dispose of any
             * views it is holding onto.
             */
            while (sibling.children.length > 0) {
                sibling.removeChild(0);
            }
        } else {
            // otherwise create a new leaf node and add that to the grandparent

            const newSibling = new LeafNode(
                sibling.view,
                orthogonal(sibling.orientation),
                sibling.size
            );
            const siblingSizing = isSiblingVisible
                ? sibling.orthogonalSize
                : Sizing.Invisible(sibling.orthogonalSize);

            grandParent.addChild(newSibling, siblingSizing, parentIndex);
        }

        // the containing node of the sibling is no longer required and can be disposed of
        sibling.dispose();

        // resize everything
        for (let i = 0; i < sizes.length; i++) {
            grandParent.resizeChild(i, sizes[i]);
        }

        return nodeToRemove.view;
    }

    public layout(width: number, height: number): void {
        const [size, orthogonalSize] =
            this.root.orientation === Orientation.HORIZONTAL
                ? [height, width]
                : [width, height];
        this.root.layout(size, orthogonalSize);
    }

    private getNode(
        location: number[],
        node: Node = this.root,
        path: BranchNode[] = []
    ): [BranchNode[], Node] {
        if (location.length === 0) {
            return [path, node];
        }

        if (!(node instanceof BranchNode)) {
            throw new Error('Invalid location');
        }

        const [index, ...rest] = location;

        if (index < 0 || index >= node.children.length) {
            throw new Error('Invalid location');
        }

        const child = node.children[index];
        path.push(node);

        return this.getNode(rest, child, path);
    }
}
````

## File: packages/dockview-core/src/gridview/gridviewComponent.ts
````typescript
import {
    getRelativeLocation,
    SerializedGridObject,
    getGridLocation,
    SerializedGridview,
} from './gridview';
import { tail, sequenceEquals } from '../array';
import { CompositeDisposable } from '../lifecycle';
import { IPanelDeserializer } from '../dockview/deserializer';
import { GridviewComponentOptions } from './options';
import {
    BaseGrid,
    Direction,
    IBaseGrid,
    IGridPanelView,
    toTarget,
} from './baseComponentGridview';
import {
    GridviewPanel,
    GridviewInitParameters,
    GridPanelViewState,
    IGridviewPanel,
} from './gridviewPanel';
import { BaseComponentOptions, Parameters } from '../panel/types';
import { Orientation, Sizing } from '../splitview/splitview';
import { Emitter, Event } from '../events';
import { Position } from '../dnd/droptarget';

export interface SerializedGridviewComponent {
    grid: SerializedGridview<GridPanelViewState>;
    activePanel?: string;
}

export interface AddComponentOptions<T extends object = Parameters>
    extends BaseComponentOptions<T> {
    minimumWidth?: number;
    maximumWidth?: number;
    minimumHeight?: number;
    maximumHeight?: number;
    position?: {
        direction: Direction;
        referencePanel: string;
    };
    location?: number[];
}

export interface IGridPanelComponentView extends IGridPanelView {
    init: (params: GridviewInitParameters) => void;
}

export interface IGridviewComponent extends IBaseGrid<GridviewPanel> {
    readonly orientation: Orientation;
    readonly onDidLayoutFromJSON: Event<void>;
    updateOptions(options: Partial<GridviewComponentOptions>): void;
    addPanel<T extends object = Parameters>(
        options: AddComponentOptions<T>
    ): IGridviewPanel;
    removePanel(panel: IGridviewPanel, sizing?: Sizing): void;
    focus(): void;
    fromJSON(serializedGridview: SerializedGridviewComponent): void;
    toJSON(): SerializedGridviewComponent;
    movePanel(
        panel: IGridviewPanel,
        options: { direction: Direction; reference: string; size?: number }
    ): void;
    setVisible(panel: IGridviewPanel, visible: boolean): void;
    setActive(panel: IGridviewPanel): void;
    readonly onDidRemoveGroup: Event<GridviewPanel>;
    readonly onDidAddGroup: Event<GridviewPanel>;
    readonly onDidActiveGroupChange: Event<GridviewPanel | undefined>;
}

export class GridviewComponent
    extends BaseGrid<GridviewPanel>
    implements IGridviewComponent
{
    private _options: Exclude<GridviewComponentOptions, 'orientation'>;
    private _deserializer: IPanelDeserializer | undefined;

    private readonly _onDidLayoutfromJSON = new Emitter<void>();
    readonly onDidLayoutFromJSON: Event<void> = this._onDidLayoutfromJSON.event;

    private readonly _onDidRemoveGroup = new Emitter<GridviewPanel>();
    readonly onDidRemoveGroup: Event<GridviewPanel> =
        this._onDidRemoveGroup.event;

    protected readonly _onDidAddGroup = new Emitter<GridviewPanel>();
    readonly onDidAddGroup: Event<GridviewPanel> = this._onDidAddGroup.event;

    private readonly _onDidActiveGroupChange = new Emitter<
        GridviewPanel | undefined
    >();
    readonly onDidActiveGroupChange: Event<GridviewPanel | undefined> =
        this._onDidActiveGroupChange.event;

    get orientation(): Orientation {
        return this.gridview.orientation;
    }

    set orientation(value: Orientation) {
        this.gridview.orientation = value;
    }

    get options(): GridviewComponentOptions {
        return this._options;
    }

    get deserializer(): IPanelDeserializer | undefined {
        return this._deserializer;
    }

    set deserializer(value: IPanelDeserializer | undefined) {
        this._deserializer = value;
    }

    constructor(container: HTMLElement, options: GridviewComponentOptions) {
        super(container, {
            proportionalLayout: options.proportionalLayout ?? true,
            orientation: options.orientation,
            styles: options.hideBorders
                ? { separatorBorder: 'transparent' }
                : undefined,
            disableAutoResizing: options.disableAutoResizing,
            className: options.className,
        });

        this._options = options;

        this.addDisposables(
            this._onDidAddGroup,
            this._onDidRemoveGroup,
            this._onDidActiveGroupChange,
            this.onDidAdd((event) => {
                this._onDidAddGroup.fire(event);
            }),
            this.onDidRemove((event) => {
                this._onDidRemoveGroup.fire(event);
            }),
            this.onDidActiveChange((event) => {
                this._onDidActiveGroupChange.fire(event);
            })
        );
    }

    override updateOptions(options: Partial<GridviewComponentOptions>): void {
        super.updateOptions(options);

        const hasOrientationChanged =
            typeof options.orientation === 'string' &&
            this.gridview.orientation !== options.orientation;

        this._options = { ...this.options, ...options };

        if (hasOrientationChanged) {
            this.gridview.orientation = options.orientation!;
        }

        this.layout(this.gridview.width, this.gridview.height, true);
    }

    removePanel(panel: GridviewPanel): void {
        this.removeGroup(panel);
    }

    /**
     * Serialize the current state of the layout
     *
     * @returns A JSON respresentation of the layout
     */
    public toJSON(): SerializedGridviewComponent {
        const data = this.gridview.serialize() as {
            height: number;
            width: number;
            orientation: Orientation;
            root: SerializedGridObject<GridPanelViewState>;
        };

        return {
            grid: data,
            activePanel: this.activeGroup?.id,
        };
    }

    setVisible(panel: GridviewPanel, visible: boolean): void {
        this.gridview.setViewVisible(getGridLocation(panel.element), visible);
    }

    setActive(panel: GridviewPanel): void {
        this._groups.forEach((value, _key) => {
            value.value.setActive(panel === value.value);
        });
    }

    focus(): void {
        this.activeGroup?.focus();
    }

    public fromJSON(serializedGridview: SerializedGridviewComponent): void {
        this.clear();

        const { grid, activePanel } = serializedGridview;

        try {
            const queue: Function[] = [];

            // take note of the existing dimensions
            const width = this.width;
            const height = this.height;

            this.gridview.deserialize(grid, {
                fromJSON: (node) => {
                    const { data } = node;

                    const view = this.options.createComponent({
                        id: data.id,
                        name: data.component,
                    });

                    queue.push(() =>
                        view.init({
                            params: data.params,
                            minimumWidth: data.minimumWidth,
                            maximumWidth: data.maximumWidth,
                            minimumHeight: data.minimumHeight,
                            maximumHeight: data.maximumHeight,
                            priority: data.priority,
                            snap: !!data.snap,
                            accessor: this,
                            isVisible: node.visible,
                        })
                    );

                    this._onDidAddGroup.fire(view);

                    this.registerPanel(view);

                    return view;
                },
            });

            this.layout(width, height, true);

            queue.forEach((f) => f());

            if (typeof activePanel === 'string') {
                const panel = this.getPanel(activePanel);
                if (panel) {
                    this.doSetGroupActive(panel);
                }
            }
        } catch (err) {
            /**
             * To remove a group we cannot call this.removeGroup(...) since this makes assumptions about
             * the underlying HTMLElement existing in the Gridview.
             */
            for (const group of this.groups) {
                group.dispose();
                this._groups.delete(group.id);
                this._onDidRemoveGroup.fire(group);
            }

            // fires clean-up events and clears the underlying HTML gridview.
            this.clear();

            /**
             * even though we have cleaned-up we still want to inform the caller of their error
             * and we'll do this through re-throwing the original error since afterall you would
             * expect trying to load a corrupted layout to result in an error and not silently fail...
             */
            throw err;
        }

        this._onDidLayoutfromJSON.fire();
    }

    clear(): void {
        const hasActiveGroup = this.activeGroup;

        const groups = Array.from(this._groups.values()); // reassign since group panels will mutate
        for (const group of groups) {
            group.disposable.dispose();
            this.doRemoveGroup(group.value, { skipActive: true });
        }

        if (hasActiveGroup) {
            this.doSetGroupActive(undefined);
        }

        this.gridview.clear();
    }

    movePanel(
        panel: GridviewPanel,
        options: { direction: Direction; reference: string; size?: number }
    ): void {
        let relativeLocation: number[];

        const removedPanel = this.gridview.remove(panel) as GridviewPanel;

        const referenceGroup = this._groups.get(options.reference)?.value;

        if (!referenceGroup) {
            throw new Error(
                `reference group ${options.reference} does not exist`
            );
        }

        const target = toTarget(options.direction);
        if (target === 'center') {
            throw new Error(`${target} not supported as an option`);
        } else {
            const location = getGridLocation(referenceGroup.element);
            relativeLocation = getRelativeLocation(
                this.gridview.orientation,
                location,
                target
            );
        }

        this.doAddGroup(removedPanel, relativeLocation, options.size);
    }

    public addPanel<T extends object = Parameters>(
        options: AddComponentOptions<T>
    ): IGridviewPanel {
        let relativeLocation: number[] = options.location ?? [0];

        if (options.position?.referencePanel) {
            const referenceGroup = this._groups.get(
                options.position.referencePanel
            )?.value;

            if (!referenceGroup) {
                throw new Error(
                    `reference group ${options.position.referencePanel} does not exist`
                );
            }

            const target = toTarget(options.position.direction);
            if (target === 'center') {
                throw new Error(`${target} not supported as an option`);
            } else {
                const location = getGridLocation(referenceGroup.element);
                relativeLocation = getRelativeLocation(
                    this.gridview.orientation,
                    location,
                    target
                );
            }
        }

        const view = this.options.createComponent({
            id: options.id,
            name: options.component,
        });

        view.init({
            params: options.params ?? {},
            minimumWidth: options.minimumWidth,
            maximumWidth: options.maximumWidth,
            minimumHeight: options.minimumHeight,
            maximumHeight: options.maximumHeight,
            priority: options.priority,
            snap: !!options.snap,
            accessor: this,
            isVisible: true,
        });

        this.doAddGroup(view, relativeLocation, options.size);
        this.registerPanel(view);
        this.doSetGroupActive(view);

        return view;
    }

    private registerPanel(panel: GridviewPanel): void {
        const disposable = new CompositeDisposable(
            panel.api.onDidFocusChange((event) => {
                if (!event.isFocused) {
                    return;
                }
                this._groups.forEach((groupItem) => {
                    const group = groupItem.value;
                    if (group !== panel) {
                        group.setActive(false);
                    } else {
                        group.setActive(true);
                    }
                });
            })
        );

        this._groups.set(panel.id, {
            value: panel,
            disposable,
        });
    }

    public moveGroup(
        referenceGroup: IGridPanelComponentView,
        groupId: string,
        target: Position
    ): void {
        const sourceGroup = this.getPanel(groupId);

        if (!sourceGroup) {
            throw new Error('invalid operation');
        }

        const referenceLocation = getGridLocation(referenceGroup.element);
        const targetLocation = getRelativeLocation(
            this.gridview.orientation,
            referenceLocation,
            target
        );

        const [targetParentLocation, to] = tail(targetLocation);
        const sourceLocation = getGridLocation(sourceGroup.element);
        const [sourceParentLocation, from] = tail(sourceLocation);

        if (sequenceEquals(sourceParentLocation, targetParentLocation)) {
            // special case when 'swapping' two views within same grid location
            // if a group has one tab - we are essentially moving the 'group'
            // which is equivalent to swapping two views in this case
            this.gridview.moveView(sourceParentLocation, from, to);

            return;
        }

        // source group will become empty so delete the group
        const targetGroup = this.doRemoveGroup(sourceGroup, {
            skipActive: true,
            skipDispose: true,
        });

        // after deleting the group we need to re-evaulate the ref location
        const updatedReferenceLocation = getGridLocation(
            referenceGroup.element
        );
        const location = getRelativeLocation(
            this.gridview.orientation,
            updatedReferenceLocation,
            target
        );
        this.doAddGroup(targetGroup, location);
    }

    removeGroup(group: GridviewPanel): void {
        super.removeGroup(group);
    }

    public dispose(): void {
        super.dispose();

        this._onDidLayoutfromJSON.dispose();
    }
}
````

## File: packages/dockview-core/src/gridview/gridviewPanel.ts
````typescript
import { PanelInitParameters } from '../panel/types';
import { IGridPanelComponentView } from './gridviewComponent';
import { FunctionOrValue } from '../types';
import {
    BasePanelView,
    BasePanelViewExported,
    BasePanelViewState,
} from './basePanelView';
import {
    GridviewPanelApi,
    GridviewPanelApiImpl,
} from '../api/gridviewPanelApi';
import { LayoutPriority } from '../splitview/splitview';
import { Emitter, Event } from '../events';
import { IViewSize } from './gridview';
import { BaseGrid, IGridPanelView } from './baseComponentGridview';

export interface Contraints {
    minimumWidth?: number;
    maximumWidth?: number;
    minimumHeight?: number;
    maximumHeight?: number;
}

export interface GridviewInitParameters extends PanelInitParameters {
    minimumWidth?: number;
    maximumWidth?: number;
    minimumHeight?: number;
    maximumHeight?: number;
    priority?: LayoutPriority;
    snap?: boolean;
    accessor: BaseGrid<IGridPanelView>;
    isVisible?: boolean;
}

export interface IGridviewPanel<T extends GridviewPanelApi = GridviewPanelApi>
    extends BasePanelViewExported<T> {
    readonly minimumWidth: number;
    readonly maximumWidth: number;
    readonly minimumHeight: number;
    readonly maximumHeight: number;
    readonly priority: LayoutPriority | undefined;
    readonly snap: boolean;
}

export abstract class GridviewPanel<
        T extends GridviewPanelApiImpl = GridviewPanelApiImpl
    >
    extends BasePanelView<T>
    implements IGridPanelComponentView, IGridviewPanel
{
    private _evaluatedMinimumWidth = 0;
    private _evaluatedMaximumWidth = Number.MAX_SAFE_INTEGER;
    private _evaluatedMinimumHeight = 0;
    private _evaluatedMaximumHeight = Number.MAX_SAFE_INTEGER;

    private _minimumWidth: FunctionOrValue<number> = 0;
    private _minimumHeight: FunctionOrValue<number> = 0;
    private _maximumWidth: FunctionOrValue<number> = Number.MAX_SAFE_INTEGER;
    private _maximumHeight: FunctionOrValue<number> = Number.MAX_SAFE_INTEGER;
    private _priority?: LayoutPriority;
    private _snap = false;

    private readonly _onDidChange = new Emitter<IViewSize | undefined>();
    readonly onDidChange: Event<IViewSize | undefined> =
        this._onDidChange.event;

    get priority(): LayoutPriority | undefined {
        return this._priority;
    }

    get snap(): boolean {
        return this._snap;
    }

    get minimumWidth(): number {
        /**
         * defer to protected function to allow subclasses to override easily.
         * see https://github.com/microsoft/TypeScript/issues/338
         */
        return this.__minimumWidth();
    }

    get minimumHeight(): number {
        /**
         * defer to protected function to allow subclasses to override easily.
         * see https://github.com/microsoft/TypeScript/issues/338
         */
        return this.__minimumHeight();
    }

    get maximumHeight(): number {
        /**
         * defer to protected function to allow subclasses to override easily.
         * see https://github.com/microsoft/TypeScript/issues/338
         */
        return this.__maximumHeight();
    }

    get maximumWidth(): number {
        /**
         * defer to protected function to allow subclasses to override easily.
         * see https://github.com/microsoft/TypeScript/issues/338
         */
        return this.__maximumWidth();
    }

    protected __minimumWidth(): number {
        const width =
            typeof this._minimumWidth === 'function'
                ? this._minimumWidth()
                : this._minimumWidth;

        if (width !== this._evaluatedMinimumWidth) {
            this._evaluatedMinimumWidth = width;
            this.updateConstraints();
        }

        return width;
    }

    protected __maximumWidth(): number {
        const width =
            typeof this._maximumWidth === 'function'
                ? this._maximumWidth()
                : this._maximumWidth;

        if (width !== this._evaluatedMaximumWidth) {
            this._evaluatedMaximumWidth = width;
            this.updateConstraints();
        }

        return width;
    }

    protected __minimumHeight(): number {
        const height =
            typeof this._minimumHeight === 'function'
                ? this._minimumHeight()
                : this._minimumHeight;

        if (height !== this._evaluatedMinimumHeight) {
            this._evaluatedMinimumHeight = height;
            this.updateConstraints();
        }

        return height;
    }

    protected __maximumHeight(): number {
        const height =
            typeof this._maximumHeight === 'function'
                ? this._maximumHeight()
                : this._maximumHeight;

        if (height !== this._evaluatedMaximumHeight) {
            this._evaluatedMaximumHeight = height;
            this.updateConstraints();
        }

        return height;
    }

    get isActive(): boolean {
        return this.api.isActive;
    }

    get isVisible(): boolean {
        return this.api.isVisible;
    }

    constructor(
        id: string,
        component: string,
        options?: {
            minimumWidth?: number;
            maximumWidth?: number;
            minimumHeight?: number;
            maximumHeight?: number;
        },
        api?: T
    ) {
        super(id, component, api ?? <T>new GridviewPanelApiImpl(id, component));

        if (typeof options?.minimumWidth === 'number') {
            this._minimumWidth = options.minimumWidth;
        }
        if (typeof options?.maximumWidth === 'number') {
            this._maximumWidth = options.maximumWidth;
        }
        if (typeof options?.minimumHeight === 'number') {
            this._minimumHeight = options.minimumHeight;
        }
        if (typeof options?.maximumHeight === 'number') {
            this._maximumHeight = options.maximumHeight;
        }

        this.api.initialize(this); // TODO: required to by-pass 'super before this' requirement

        this.addDisposables(
            this.api.onWillVisibilityChange((event) => {
                const { isVisible } = event;
                const { accessor } = this._params as GridviewInitParameters;

                accessor.setVisible(this, isVisible);
            }),
            this.api.onActiveChange(() => {
                const { accessor } = this._params as GridviewInitParameters;

                accessor.doSetGroupActive(this);
            }),
            this.api.onDidConstraintsChangeInternal((event) => {
                if (
                    typeof event.minimumWidth === 'number' ||
                    typeof event.minimumWidth === 'function'
                ) {
                    this._minimumWidth = event.minimumWidth;
                }
                if (
                    typeof event.minimumHeight === 'number' ||
                    typeof event.minimumHeight === 'function'
                ) {
                    this._minimumHeight = event.minimumHeight;
                }
                if (
                    typeof event.maximumWidth === 'number' ||
                    typeof event.maximumWidth === 'function'
                ) {
                    this._maximumWidth = event.maximumWidth;
                }
                if (
                    typeof event.maximumHeight === 'number' ||
                    typeof event.maximumHeight === 'function'
                ) {
                    this._maximumHeight = event.maximumHeight;
                }
            }),
            this.api.onDidSizeChange((event) => {
                this._onDidChange.fire({
                    height: event.height,
                    width: event.width,
                });
            }),
            this._onDidChange
        );
    }

    setVisible(isVisible: boolean): void {
        this.api._onDidVisibilityChange.fire({ isVisible });
    }

    setActive(isActive: boolean): void {
        this.api._onDidActiveChange.fire({ isActive });
    }

    init(parameters: GridviewInitParameters): void {
        if (parameters.maximumHeight) {
            this._maximumHeight = parameters.maximumHeight;
        }
        if (parameters.minimumHeight) {
            this._minimumHeight = parameters.minimumHeight;
        }
        if (parameters.maximumWidth) {
            this._maximumWidth = parameters.maximumWidth;
        }
        if (parameters.minimumWidth) {
            this._minimumWidth = parameters.minimumWidth;
        }

        this._priority = parameters.priority;
        this._snap = !!parameters.snap;

        super.init(parameters);

        if (typeof parameters.isVisible === 'boolean') {
            this.setVisible(parameters.isVisible);
        }
    }

    private updateConstraints(): void {
        this.api._onDidConstraintsChange.fire({
            minimumWidth: this._evaluatedMinimumWidth,
            maximumWidth: this._evaluatedMaximumWidth,
            minimumHeight: this._evaluatedMinimumHeight,
            maximumHeight: this._evaluatedMaximumHeight,
        });
    }

    toJSON(): GridPanelViewState {
        const state = super.toJSON();
        const maximum = (value: number) =>
            value === Number.MAX_SAFE_INTEGER ? undefined : value;
        const minimum = (value: number) => (value <= 0 ? undefined : value);

        return {
            ...state,
            minimumHeight: minimum(this.minimumHeight),
            maximumHeight: maximum(this.maximumHeight),
            minimumWidth: minimum(this.minimumWidth),
            maximumWidth: maximum(this.maximumWidth),
            snap: this.snap,
            priority: this.priority,
        };
    }
}

export interface GridPanelViewState extends BasePanelViewState {
    minimumHeight?: number;
    maximumHeight?: number;
    minimumWidth?: number;
    maximumWidth?: number;
    snap?: boolean;
    priority?: LayoutPriority;
}
````

## File: packages/dockview-core/src/gridview/leafNode.ts
````typescript
/*---------------------------------------------------------------------------------------------
 * Accreditation: This file is largly based upon the MIT licenced VSCode sourcecode found at:
 * https://github.com/microsoft/vscode/tree/main/src/vs/base/browser/ui/grid
 *--------------------------------------------------------------------------------------------*/

import { IView, LayoutPriority, Orientation } from '../splitview/splitview';
import { Emitter, Event } from '../events';
import { IGridView } from './gridview';
import { IDisposable } from '../lifecycle';

export class LeafNode implements IView {
    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;
    private _size: number;
    private _orthogonalSize: number;
    private readonly _disposable: IDisposable;

    private get minimumWidth(): number {
        return this.view.minimumWidth;
    }

    private get maximumWidth(): number {
        return this.view.maximumWidth;
    }

    private get minimumHeight(): number {
        return this.view.minimumHeight;
    }

    private get maximumHeight(): number {
        return this.view.maximumHeight;
    }

    get priority(): LayoutPriority | undefined {
        return this.view.priority;
    }

    get snap(): boolean | undefined {
        return this.view.snap;
    }

    get minimumSize(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.minimumHeight
            : this.minimumWidth;
    }

    get maximumSize(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.maximumHeight
            : this.maximumWidth;
    }

    get minimumOrthogonalSize(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.minimumWidth
            : this.minimumHeight;
    }

    get maximumOrthogonalSize(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.maximumWidth
            : this.maximumHeight;
    }

    get orthogonalSize(): number {
        return this._orthogonalSize;
    }

    get size(): number {
        return this._size;
    }

    get element(): HTMLElement {
        return this.view.element;
    }

    get width(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.orthogonalSize
            : this.size;
    }

    get height(): number {
        return this.orientation === Orientation.HORIZONTAL
            ? this.size
            : this.orthogonalSize;
    }

    constructor(
        public readonly view: IGridView,
        readonly orientation: Orientation,
        orthogonalSize: number,
        size = 0
    ) {
        this._orthogonalSize = orthogonalSize;
        this._size = size;

        this._disposable = this.view.onDidChange((event) => {
            if (event) {
                this._onDidChange.fire({
                    size:
                        this.orientation === Orientation.VERTICAL
                            ? event.width
                            : event.height,
                    orthogonalSize:
                        this.orientation === Orientation.VERTICAL
                            ? event.height
                            : event.width,
                });
            } else {
                this._onDidChange.fire({});
            }
        });
    }

    public setVisible(visible: boolean): void {
        if (this.view.setVisible) {
            this.view.setVisible(visible);
        }
    }

    public layout(size: number, orthogonalSize: number): void {
        this._size = size;
        this._orthogonalSize = orthogonalSize;

        this.view.layout(this.width, this.height);
    }

    public dispose(): void {
        this._onDidChange.dispose();
        this._disposable.dispose();
    }
}
````

## File: packages/dockview-core/src/gridview/options.ts
````typescript
import { GridviewPanel } from './gridviewPanel';
import { Orientation } from '../splitview/splitview';
import { CreateComponentOptions } from '../dockview/options';

export interface GridviewOptions {
    disableAutoResizing?: boolean;
    proportionalLayout?: boolean;
    orientation: Orientation;
    className?: string;
    hideBorders?: boolean;
}

export interface GridviewFrameworkOptions {
    createComponent: (options: CreateComponentOptions) => GridviewPanel;
}

export type GridviewComponentOptions = GridviewOptions &
    GridviewFrameworkOptions;

export const PROPERTY_KEYS_GRIDVIEW: (keyof GridviewOptions)[] = (() => {
    /**
     * by readong the keys from an empty value object TypeScript will error
     * when we add or remove new properties to `DockviewOptions`
     */
    const properties: Record<keyof GridviewOptions, undefined> = {
        disableAutoResizing: undefined,
        proportionalLayout: undefined,
        orientation: undefined,
        hideBorders: undefined,
        className: undefined,
    };

    return Object.keys(properties) as (keyof GridviewOptions)[];
})();
````

## File: packages/dockview-core/src/gridview/types.ts
````typescript
import { BranchNode } from './branchNode';
import { LeafNode } from './leafNode';

export type Node = BranchNode | LeafNode;
````

## File: packages/dockview-core/src/overlay/overlay.ts
````typescript
import {
    disableIframePointEvents,
    quasiDefaultPrevented,
    toggleClass,
} from '../dom';
import { Emitter, Event, addDisposableListener } from '../events';
import { CompositeDisposable, MutableDisposable } from '../lifecycle';
import { clamp } from '../math';
import { AnchoredBox } from '../types';

class AriaLevelTracker {
    private _orderedList: HTMLElement[] = [];

    push(element: HTMLElement): void {
        this._orderedList = [
            ...this._orderedList.filter((item) => item !== element),
            element,
        ];

        this.update();
    }

    destroy(element: HTMLElement): void {
        this._orderedList = this._orderedList.filter(
            (item) => item !== element
        );
        this.update();
    }

    private update(): void {
        for (let i = 0; i < this._orderedList.length; i++) {
            this._orderedList[i].setAttribute('aria-level', `${i}`);
            this._orderedList[
                i
            ].style.zIndex = `calc(var(--dv-overlay-z-index, 999) + ${i * 2})`;
        }
    }
}

const arialLevelTracker = new AriaLevelTracker();

export class Overlay extends CompositeDisposable {
    private readonly _element: HTMLElement = document.createElement('div');

    private readonly _onDidChange = new Emitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    private readonly _onDidChangeEnd = new Emitter<void>();
    readonly onDidChangeEnd: Event<void> = this._onDidChangeEnd.event;

    private static readonly MINIMUM_HEIGHT = 20;
    private static readonly MINIMUM_WIDTH = 20;

    private verticalAlignment: 'top' | 'bottom' | undefined;
    private horiziontalAlignment: 'left' | 'right' | undefined;

    private _isVisible: boolean;

    set minimumInViewportWidth(value: number | undefined) {
        this.options.minimumInViewportWidth = value;
    }

    set minimumInViewportHeight(value: number | undefined) {
        this.options.minimumInViewportHeight = value;
    }

    get element(): HTMLElement {
        return this._element;
    }

    get isVisible(): boolean {
        return this._isVisible;
    }

    constructor(
        private readonly options: AnchoredBox & {
            container: HTMLElement;
            content: HTMLElement;
            minimumInViewportWidth?: number;
            minimumInViewportHeight?: number;
        }
    ) {
        super();

        this.addDisposables(this._onDidChange, this._onDidChangeEnd);

        this._element.className = 'dv-resize-container';
        this._isVisible = true;

        this.setupResize('top');
        this.setupResize('bottom');
        this.setupResize('left');
        this.setupResize('right');
        this.setupResize('topleft');
        this.setupResize('topright');
        this.setupResize('bottomleft');
        this.setupResize('bottomright');

        this._element.appendChild(this.options.content);
        this.options.container.appendChild(this._element);

        // if input bad resize within acceptable boundaries
        this.setBounds({
            height: this.options.height,
            width: this.options.width,
            ...('top' in this.options && { top: this.options.top }),
            ...('bottom' in this.options && { bottom: this.options.bottom }),
            ...('left' in this.options && { left: this.options.left }),
            ...('right' in this.options && { right: this.options.right }),
        });

        arialLevelTracker.push(this._element);
    }

    setVisible(isVisible: boolean): void {
        if (isVisible === this.isVisible) {
            return;
        }

        this._isVisible = isVisible;

        toggleClass(this.element, 'dv-hidden', !this.isVisible);
    }

    bringToFront(): void {
        arialLevelTracker.push(this._element);
    }

    setBounds(bounds: Partial<AnchoredBox> = {}): void {
        if (typeof bounds.height === 'number') {
            this._element.style.height = `${bounds.height}px`;
        }
        if (typeof bounds.width === 'number') {
            this._element.style.width = `${bounds.width}px`;
        }
        if ('top' in bounds && typeof bounds.top === 'number') {
            this._element.style.top = `${bounds.top}px`;
            this._element.style.bottom = 'auto';
            this.verticalAlignment = 'top';
        }
        if ('bottom' in bounds && typeof bounds.bottom === 'number') {
            this._element.style.bottom = `${bounds.bottom}px`;
            this._element.style.top = 'auto';
            this.verticalAlignment = 'bottom';
        }
        if ('left' in bounds && typeof bounds.left === 'number') {
            this._element.style.left = `${bounds.left}px`;
            this._element.style.right = 'auto';
            this.horiziontalAlignment = 'left';
        }
        if ('right' in bounds && typeof bounds.right === 'number') {
            this._element.style.right = `${bounds.right}px`;
            this._element.style.left = 'auto';
            this.horiziontalAlignment = 'right';
        }

        const containerRect = this.options.container.getBoundingClientRect();
        const overlayRect = this._element.getBoundingClientRect();

        // region: ensure bounds within allowable limits

        // a minimum width of minimumViewportWidth must be inside the viewport
        const xOffset = Math.max(0, this.getMinimumWidth(overlayRect.width));

        // a minimum height of minimumViewportHeight must be inside the viewport
        const yOffset = Math.max(0, this.getMinimumHeight(overlayRect.height));

        if (this.verticalAlignment === 'top') {
            const top = clamp(
                overlayRect.top - containerRect.top,
                -yOffset,
                Math.max(0, containerRect.height - overlayRect.height + yOffset)
            );
            this._element.style.top = `${top}px`;
            this._element.style.bottom = 'auto';
        }

        if (this.verticalAlignment === 'bottom') {
            const bottom = clamp(
                containerRect.bottom - overlayRect.bottom,
                -yOffset,
                Math.max(0, containerRect.height - overlayRect.height + yOffset)
            );
            this._element.style.bottom = `${bottom}px`;
            this._element.style.top = 'auto';
        }

        if (this.horiziontalAlignment === 'left') {
            const left = clamp(
                overlayRect.left - containerRect.left,
                -xOffset,
                Math.max(0, containerRect.width - overlayRect.width + xOffset)
            );
            this._element.style.left = `${left}px`;
            this._element.style.right = 'auto';
        }

        if (this.horiziontalAlignment === 'right') {
            const right = clamp(
                containerRect.right - overlayRect.right,
                -xOffset,
                Math.max(0, containerRect.width - overlayRect.width + xOffset)
            );
            this._element.style.right = `${right}px`;
            this._element.style.left = 'auto';
        }

        this._onDidChange.fire();
    }

    toJSON(): AnchoredBox {
        const container = this.options.container.getBoundingClientRect();
        const element = this._element.getBoundingClientRect();

        const result: any = {};

        if (this.verticalAlignment === 'top') {
            result.top = parseFloat(this._element.style.top);
        } else if (this.verticalAlignment === 'bottom') {
            result.bottom = parseFloat(this._element.style.bottom);
        } else {
            result.top = element.top - container.top;
        }

        if (this.horiziontalAlignment === 'left') {
            result.left = parseFloat(this._element.style.left);
        } else if (this.horiziontalAlignment === 'right') {
            result.right = parseFloat(this._element.style.right);
        } else {
            result.left = element.left - container.left;
        }

        result.width = element.width;
        result.height = element.height;

        return result;
    }

    setupDrag(
        dragTarget: HTMLElement,
        options: { inDragMode: boolean } = { inDragMode: false }
    ): void {
        const move = new MutableDisposable();

        const track = () => {
            let offset: { x: number; y: number } | null = null;

            const iframes = disableIframePointEvents();

            move.value = new CompositeDisposable(
                {
                    dispose: () => {
                        iframes.release();
                    },
                },
                addDisposableListener(window, 'pointermove', (e) => {
                    const containerRect =
                        this.options.container.getBoundingClientRect();
                    const x = e.clientX - containerRect.left;
                    const y = e.clientY - containerRect.top;

                    toggleClass(
                        this._element,
                        'dv-resize-container-dragging',
                        true
                    );

                    const overlayRect = this._element.getBoundingClientRect();
                    if (offset === null) {
                        offset = {
                            x: e.clientX - overlayRect.left,
                            y: e.clientY - overlayRect.top,
                        };
                    }

                    const xOffset = Math.max(
                        0,
                        this.getMinimumWidth(overlayRect.width)
                    );
                    const yOffset = Math.max(
                        0,
                        this.getMinimumHeight(overlayRect.height)
                    );

                    const top = clamp(
                        y - offset.y,
                        -yOffset,
                        Math.max(
                            0,
                            containerRect.height - overlayRect.height + yOffset
                        )
                    );

                    const bottom = clamp(
                        offset.y -
                            y +
                            containerRect.height -
                            overlayRect.height,
                        -yOffset,
                        Math.max(
                            0,
                            containerRect.height - overlayRect.height + yOffset
                        )
                    );

                    const left = clamp(
                        x - offset.x,
                        -xOffset,
                        Math.max(
                            0,
                            containerRect.width - overlayRect.width + xOffset
                        )
                    );

                    const right = clamp(
                        offset.x - x + containerRect.width - overlayRect.width,
                        -xOffset,
                        Math.max(
                            0,
                            containerRect.width - overlayRect.width + xOffset
                        )
                    );

                    const bounds: any = {};

                    // Anchor to top or to bottom depending on which one is closer
                    if (top <= bottom) {
                        bounds.top = top;
                    } else {
                        bounds.bottom = bottom;
                    }

                    // Anchor to left or to right depending on which one is closer
                    if (left <= right) {
                        bounds.left = left;
                    } else {
                        bounds.right = right;
                    }

                    this.setBounds(bounds);
                }),
                addDisposableListener(window, 'pointerup', () => {
                    toggleClass(
                        this._element,
                        'dv-resize-container-dragging',
                        false
                    );

                    move.dispose();
                    this._onDidChangeEnd.fire();
                })
            );
        };

        this.addDisposables(
            move,
            addDisposableListener(dragTarget, 'pointerdown', (event) => {
                if (event.defaultPrevented) {
                    event.preventDefault();
                    return;
                }

                // if somebody has marked this event then treat as a defaultPrevented
                // without actually calling event.preventDefault()
                if (quasiDefaultPrevented(event)) {
                    return;
                }

                track();
            }),
            addDisposableListener(
                this.options.content,
                'pointerdown',
                (event) => {
                    if (event.defaultPrevented) {
                        return;
                    }

                    // if somebody has marked this event then treat as a defaultPrevented
                    // without actually calling event.preventDefault()
                    if (quasiDefaultPrevented(event)) {
                        return;
                    }

                    if (event.shiftKey) {
                        track();
                    }
                }
            ),
            addDisposableListener(
                this.options.content,
                'pointerdown',
                () => {
                    arialLevelTracker.push(this._element);
                },
                true
            )
        );

        if (options.inDragMode) {
            track();
        }
    }

    private setupResize(
        direction:
            | 'top'
            | 'bottom'
            | 'left'
            | 'right'
            | 'topleft'
            | 'topright'
            | 'bottomleft'
            | 'bottomright'
    ): void {
        const resizeHandleElement = document.createElement('div');
        resizeHandleElement.className = `dv-resize-handle-${direction}`;
        this._element.appendChild(resizeHandleElement);

        const move = new MutableDisposable();

        this.addDisposables(
            move,
            addDisposableListener(resizeHandleElement, 'pointerdown', (e) => {
                e.preventDefault();

                let startPosition: {
                    originalY: number;
                    originalHeight: number;
                    originalX: number;
                    originalWidth: number;
                } | null = null;

                const iframes = disableIframePointEvents();

                move.value = new CompositeDisposable(
                    addDisposableListener(window, 'pointermove', (e) => {
                        const containerRect =
                            this.options.container.getBoundingClientRect();
                        const overlayRect =
                            this._element.getBoundingClientRect();

                        const y = e.clientY - containerRect.top;
                        const x = e.clientX - containerRect.left;

                        if (startPosition === null) {
                            // record the initial dimensions since as all subsequence moves are relative to this
                            startPosition = {
                                originalY: y,
                                originalHeight: overlayRect.height,
                                originalX: x,
                                originalWidth: overlayRect.width,
                            };
                        }

                        let top: number | undefined = undefined;
                        let bottom: number | undefined = undefined;
                        let height: number | undefined = undefined;
                        let left: number | undefined = undefined;
                        let right: number | undefined = undefined;
                        let width: number | undefined = undefined;

                        const moveTop = () => {
                            // When dragging top handle, constrain top position to prevent oversizing
                            const maxTop =
                                startPosition!.originalY +
                                    startPosition!.originalHeight >
                                containerRect.height
                                    ? Math.max(
                                          0,
                                          containerRect.height -
                                              Overlay.MINIMUM_HEIGHT
                                      )
                                    : Math.max(
                                          0,
                                          startPosition!.originalY +
                                              startPosition!.originalHeight -
                                              Overlay.MINIMUM_HEIGHT
                                      );
                            top = clamp(y, 0, maxTop);

                            height =
                                startPosition!.originalY +
                                startPosition!.originalHeight -
                                top;

                            bottom = containerRect.height - top - height;
                        };

                        const moveBottom = () => {
                            top =
                                startPosition!.originalY -
                                startPosition!.originalHeight;

                            // When dragging bottom handle, constrain height to container height
                            const minHeight =
                                top < 0 &&
                                typeof this.options.minimumInViewportHeight ===
                                    'number'
                                    ? -top +
                                      this.options.minimumInViewportHeight
                                    : Overlay.MINIMUM_HEIGHT;

                            const maxHeight =
                                containerRect.height - Math.max(0, top);

                            height = clamp(y - top, minHeight, maxHeight);

                            bottom = containerRect.height - top - height;
                        };

                        const moveLeft = () => {
                            const maxLeft =
                                startPosition!.originalX +
                                    startPosition!.originalWidth >
                                containerRect.width
                                    ? Math.max(
                                          0,
                                          containerRect.width -
                                              Overlay.MINIMUM_WIDTH
                                      ) // Prevent extending beyong right edge
                                    : Math.max(
                                          0,
                                          startPosition!.originalX +
                                              startPosition!.originalWidth -
                                              Overlay.MINIMUM_WIDTH
                                      );

                            left = clamp(x, 0, maxLeft); // min is 0 (Not -Infinity) to prevent dragging beyond left edge

                            width =
                                startPosition!.originalX +
                                startPosition!.originalWidth -
                                left;

                            right = containerRect.width - left - width;
                        };

                        const moveRight = () => {
                            left =
                                startPosition!.originalX -
                                startPosition!.originalWidth;

                            // When dragging right handle, constrain width to container width
                            const minWidth =
                                left < 0 &&
                                typeof this.options.minimumInViewportWidth ===
                                    'number'
                                    ? -left +
                                      this.options.minimumInViewportWidth
                                    : Overlay.MINIMUM_WIDTH;

                            const maxWidth =
                                containerRect.width - Math.max(0, left);

                            width = clamp(x - left, minWidth, maxWidth);

                            right = containerRect.width - left - width;
                        };

                        switch (direction) {
                            case 'top':
                                moveTop();
                                break;
                            case 'bottom':
                                moveBottom();
                                break;
                            case 'left':
                                moveLeft();
                                break;
                            case 'right':
                                moveRight();
                                break;
                            case 'topleft':
                                moveTop();
                                moveLeft();
                                break;
                            case 'topright':
                                moveTop();
                                moveRight();
                                break;
                            case 'bottomleft':
                                moveBottom();
                                moveLeft();
                                break;
                            case 'bottomright':
                                moveBottom();
                                moveRight();
                                break;
                        }

                        const bounds: any = {};

                        // Anchor to top or to bottom depending on which one is closer
                        if (top! <= bottom!) {
                            bounds.top = top;
                        } else {
                            bounds.bottom = bottom;
                        }

                        // Anchor to left or to right depending on which one is closer
                        if (left! <= right!) {
                            bounds.left = left;
                        } else {
                            bounds.right = right;
                        }

                        bounds.height = height;
                        bounds.width = width;

                        this.setBounds(bounds);
                    }),
                    {
                        dispose: () => {
                            iframes.release();
                        },
                    },
                    addDisposableListener(window, 'pointerup', () => {
                        move.dispose();
                        this._onDidChangeEnd.fire();
                    })
                );
            })
        );
    }

    private getMinimumWidth(width: number) {
        if (typeof this.options.minimumInViewportWidth === 'number') {
            return width - this.options.minimumInViewportWidth;
        }
        return 0;
    }

    private getMinimumHeight(height: number) {
        if (typeof this.options.minimumInViewportHeight === 'number') {
            return height - this.options.minimumInViewportHeight;
        }
        return 0;
    }

    override dispose(): void {
        arialLevelTracker.destroy(this._element);
        this._element.remove();
        super.dispose();
    }
}
````

## File: packages/dockview-core/src/overlay/overlayRenderContainer.ts
````typescript
import { DragAndDropObserver } from '../dnd/dnd';
import { Droptarget } from '../dnd/droptarget';
import { getDomNodePagePosition, toggleClass } from '../dom';
import {
    CompositeDisposable,
    Disposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import { IDockviewPanel } from '../dockview/dockviewPanel';
import { DockviewComponent } from '../dockview/dockviewComponent';

class PositionCache {
    private cache = new Map<Element, { rect: { left: number; top: number; width: number; height: number }; frameId: number }>();
    private currentFrameId = 0;
    private rafId: number | null = null;

    getPosition(element: Element): { left: number; top: number; width: number; height: number } {
        const cached = this.cache.get(element);
        if (cached && cached.frameId === this.currentFrameId) {
            return cached.rect;
        }

        this.scheduleFrameUpdate();
        const rect = getDomNodePagePosition(element);
        this.cache.set(element, { rect, frameId: this.currentFrameId });
        return rect;
    }

    invalidate(): void {
        this.currentFrameId++;
    }

    private scheduleFrameUpdate() {
        if (this.rafId) return;
        this.rafId = requestAnimationFrame(() => {
            this.currentFrameId++;
            this.rafId = null;
        });
    }
}

export type DockviewPanelRenderer = 'onlyWhenVisible' | 'always';

export interface IRenderable {
    readonly element: HTMLElement;
    readonly dropTarget: Droptarget;
}

function createFocusableElement(): HTMLDivElement {
    const element = document.createElement('div');
    element.tabIndex = -1;
    return element;
}

export class OverlayRenderContainer extends CompositeDisposable {
    private readonly map: Record<
        string,
        {
            panel: IDockviewPanel;
            disposable: IDisposable;
            destroy: IDisposable;
            element: HTMLElement;
            resize?: () => void;
        }
    > = {};

    private _disposed = false;
    private readonly positionCache = new PositionCache();
    private readonly pendingUpdates = new Set<string>();

    constructor(
        readonly element: HTMLElement,
        readonly accessor: DockviewComponent
    ) {
        super();

        this.addDisposables(
            Disposable.from(() => {
                for (const value of Object.values(this.map)) {
                    value.disposable.dispose();
                    value.destroy.dispose();
                }
                this._disposed = true;
            })
        );
    }

    updateAllPositions(): void {
        if (this._disposed) {
            return;
        }

        // Invalidate position cache to force recalculation
        this.positionCache.invalidate();

        // Call resize function directly for all visible panels
        for (const entry of Object.values(this.map)) {
            if (entry.panel.api.isVisible && entry.resize) {
                entry.resize();
            }
        }
    }

    detatch(panel: IDockviewPanel): boolean {
        if (this.map[panel.api.id]) {
            const { disposable, destroy } = this.map[panel.api.id];
            disposable.dispose();
            destroy.dispose();
            delete this.map[panel.api.id];
            return true;
        }
        return false;
    }

    attach(options: {
        panel: IDockviewPanel;
        referenceContainer: IRenderable;
    }): HTMLElement {
        const { panel, referenceContainer } = options;

        if (!this.map[panel.api.id]) {
            const element = createFocusableElement();
            element.className = 'dv-render-overlay';

            this.map[panel.api.id] = {
                panel,
                disposable: Disposable.NONE,
                destroy: Disposable.NONE,

                element,
            };
        }

        const focusContainer = this.map[panel.api.id].element;

        if (panel.view.content.element.parentElement !== focusContainer) {
            focusContainer.appendChild(panel.view.content.element);
        }

        if (focusContainer.parentElement !== this.element) {
            this.element.appendChild(focusContainer);
        }

        const resize = () => {
            const panelId = panel.api.id;

            if (this.pendingUpdates.has(panelId)) {
                return; // Update already scheduled
            }

            this.pendingUpdates.add(panelId);

            requestAnimationFrame(() => {
                this.pendingUpdates.delete(panelId);

                if (this.isDisposed || !this.map[panelId]) {
                    return;
                }

                const box = this.positionCache.getPosition(referenceContainer.element);
                const box2 = this.positionCache.getPosition(this.element);

                // Use traditional positioning for overlay containers
                const left = box.left - box2.left;
                const top = box.top - box2.top;
                const width = box.width;
                const height = box.height;

                focusContainer.style.left = `${left}px`;
                focusContainer.style.top = `${top}px`;
                focusContainer.style.width = `${width}px`;
                focusContainer.style.height = `${height}px`;

                toggleClass(
                    focusContainer,
                    'dv-render-overlay-float',
                    panel.group.api.location.type === 'floating'
                );
            });
        };

        const visibilityChanged = () => {
            if (panel.api.isVisible) {
                this.positionCache.invalidate();
                resize();
            }

            focusContainer.style.display = panel.api.isVisible ? '' : 'none';
        };

        const observerDisposable = new MutableDisposable();

        const correctLayerPosition = () => {
            if (panel.api.location.type === 'floating') {
                queueMicrotask(() => {
                    const floatingGroup = this.accessor.floatingGroups.find(
                        (group) => group.group === panel.api.group
                    );

                    if (!floatingGroup) {
                        return;
                    }

                    const element = floatingGroup.overlay.element;

                    const update = () => {
                        const level = Number(
                            element.getAttribute('aria-level')
                        );
                        focusContainer.style.zIndex = `calc(var(--dv-overlay-z-index, 999) + ${
                            level * 2 + 1
                        })`;
                    };

                    const observer = new MutationObserver(() => {
                        update();
                    });

                    observerDisposable.value = Disposable.from(() =>
                        observer.disconnect()
                    );

                    observer.observe(element, {
                        attributeFilter: ['aria-level'],
                        attributes: true,
                    });

                    update();
                });
            } else {
                focusContainer.style.zIndex = ''; // reset the z-index, perhaps CSS will take over here
            }
        };

        const disposable = new CompositeDisposable(
            observerDisposable,
            /**
             * since container is positioned absoutely we must explicitly forward
             * the dnd events for the expect behaviours to continue to occur in terms of dnd
             *
             * the dnd observer does not need to be conditional on whether the panel is visible since
             * non-visible panels are 'display: none' and in such case the dnd observer will not fire.
             */
            new DragAndDropObserver(focusContainer, {
                onDragEnd: (e) => {
                    referenceContainer.dropTarget.dnd.onDragEnd(e);
                },
                onDragEnter: (e) => {
                    referenceContainer.dropTarget.dnd.onDragEnter(e);
                },
                onDragLeave: (e) => {
                    referenceContainer.dropTarget.dnd.onDragLeave(e);
                },
                onDrop: (e) => {
                    referenceContainer.dropTarget.dnd.onDrop(e);
                },
                onDragOver: (e) => {
                    referenceContainer.dropTarget.dnd.onDragOver(e);
                },
            }),

            panel.api.onDidVisibilityChange(() => {
                /**
                 * Control the visibility of the content, however even when not visible (display: none)
                 * the content is still maintained within the DOM hence DOM specific attributes
                 * such as scroll position are maintained when next made visible.
                 */
                visibilityChanged();
            }),
            panel.api.onDidDimensionsChange(() => {
                if (!panel.api.isVisible) {
                    return;
                }

                resize();
            }),
            panel.api.onDidLocationChange(() => {
                correctLayerPosition();
            })
        );

        this.map[panel.api.id].destroy = Disposable.from(() => {
            if (panel.view.content.element.parentElement === focusContainer) {
                focusContainer.removeChild(panel.view.content.element);
            }

            focusContainer.parentElement?.removeChild(focusContainer);
        });

        correctLayerPosition();

        queueMicrotask(() => {
            if (this.isDisposed) {
                return;
            }

            /**
             * wait until everything has finished in the current stack-frame call before
             * calling the first resize as other size-altering events may still occur before
             * the end of the stack-frame.
             */
            visibilityChanged();
        });

        // dispose of logic asoccciated with previous reference-container
        this.map[panel.api.id].disposable.dispose();
        // and reset the disposable to the active reference-container
        this.map[panel.api.id].disposable = disposable;
        // store the resize function for direct access
        this.map[panel.api.id].resize = resize;

        return focusContainer;
    }
}
````

## File: packages/dockview-core/src/panel/types.ts
````typescript
import { IDisposable } from '../lifecycle';
import { LayoutPriority } from '../splitview/splitview';

/**
 * A key-value object of anything that is a valid JavaScript Object.
 */
export interface Parameters {
    [key: string]: any;
}

export interface PanelInitParameters {
    params: Parameters;
}

export interface PanelUpdateEvent<T extends Parameters = Parameters> {
    params: Partial<T>;
}

export interface IPanel extends IDisposable {
    readonly id: string;
    init(params: PanelInitParameters): void;
    layout(width: number, height: number): void;
    update(event: PanelUpdateEvent<Parameters>): void;
    toJSON(): object;
    focus(): void;
}

export interface IFrameworkPart extends IDisposable {
    update(params: Parameters): void;
}

export interface BaseComponentOptions<T extends object = Parameters> {
    id: string;
    component: string;
    params?: T;
    snap?: boolean;
    priority?: LayoutPriority;
    size?: number;
}
````

## File: packages/dockview-core/src/paneview/defaultPaneviewHeader.ts
````typescript
import { addDisposableListener } from '../events';
import { PaneviewPanelApiImpl } from '../api/paneviewPanelApi';
import { CompositeDisposable, MutableDisposable } from '../lifecycle';
import { PanelUpdateEvent } from '../panel/types';
import { IPanePart, PanePanelInitParameter } from './paneviewPanel';
import { toggleClass } from '../dom';
import { createChevronRightButton, createExpandMoreButton } from '../svg';

export class DefaultHeader extends CompositeDisposable implements IPanePart {
    private readonly _expandedIcon = createExpandMoreButton();
    private readonly _collapsedIcon = createChevronRightButton();
    private readonly disposable = new MutableDisposable();
    private readonly _element: HTMLElement;
    private readonly _content: HTMLElement;
    private readonly _expander: HTMLElement;
    private readonly apiRef: { api: PaneviewPanelApiImpl | null } = {
        api: null,
    };

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        super();

        this._element = document.createElement('div');
        this.element.className = 'dv-default-header';

        this._content = document.createElement('span');
        this._expander = document.createElement('div');
        this._expander.className = 'dv-pane-header-icon';

        this.element.appendChild(this._expander);
        this.element.appendChild(this._content);

        this.addDisposables(
            addDisposableListener(this._element, 'click', () => {
                this.apiRef.api?.setExpanded(!this.apiRef.api.isExpanded);
            })
        );
    }

    init(params: PanePanelInitParameter & { api: PaneviewPanelApiImpl }): void {
        this.apiRef.api = params.api;

        this._content.textContent = params.title;

        this.updateIcon();

        this.disposable.value = params.api.onDidExpansionChange(() => {
            this.updateIcon();
        });
    }

    private updateIcon(): void {
        const isExpanded = !!this.apiRef.api?.isExpanded;
        toggleClass(this._expander, 'collapsed', !isExpanded);

        if (isExpanded) {
            if (this._expander.contains(this._collapsedIcon)) {
                this._collapsedIcon.remove();
            }
            if (!this._expander.contains(this._expandedIcon)) {
                this._expander.appendChild(this._expandedIcon);
            }
        } else {
            if (this._expander.contains(this._expandedIcon)) {
                this._expandedIcon.remove();
            }
            if (!this._expander.contains(this._collapsedIcon)) {
                this._expander.appendChild(this._collapsedIcon);
            }
        }
    }

    update(_params: PanelUpdateEvent): void {
        //
    }

    dispose(): void {
        this.disposable.dispose();
        super.dispose();
    }
}
````

## File: packages/dockview-core/src/paneview/draggablePaneviewPanel.ts
````typescript
import { PaneviewApi } from '../api/component.api';
import { DragHandler } from '../dnd/abstractDragHandler';
import {
    getPaneData,
    LocalSelectionTransfer,
    PaneTransfer,
} from '../dnd/dataTransfer';
import { Droptarget, DroptargetEvent } from '../dnd/droptarget';
import { Emitter, Event } from '../events';
import { IDisposable } from '../lifecycle';
import { Orientation } from '../splitview/splitview';
import {
    PaneviewDndOverlayEvent,
    PaneviewUnhandledDragOverEvent,
} from './options';
import { IPaneviewComponent } from './paneviewComponent';
import {
    IPaneviewPanel,
    PanePanelInitParameter,
    PaneviewPanel,
} from './paneviewPanel';

export interface PaneviewDidDropEvent extends DroptargetEvent {
    panel: IPaneviewPanel;
    getData: () => PaneTransfer | undefined;
    api: PaneviewApi;
}

export abstract class DraggablePaneviewPanel extends PaneviewPanel {
    private handler: DragHandler | undefined;
    private target: Droptarget | undefined;

    private readonly _onDidDrop = new Emitter<PaneviewDidDropEvent>();
    readonly onDidDrop = this._onDidDrop.event;

    private readonly _onUnhandledDragOverEvent =
        new Emitter<PaneviewDndOverlayEvent>();
    readonly onUnhandledDragOverEvent: Event<PaneviewDndOverlayEvent> =
        this._onUnhandledDragOverEvent.event;

    readonly accessor: IPaneviewComponent;

    constructor(options: {
        accessor: IPaneviewComponent;
        id: string;
        component: string;
        headerComponent: string | undefined;
        orientation: Orientation;
        isExpanded: boolean;
        disableDnd: boolean;
        headerSize: number;
        minimumBodySize: number;
        maximumBodySize: number;
    }) {
        super({
            id: options.id,
            component: options.component,
            headerComponent: options.headerComponent,
            orientation: options.orientation,
            isExpanded: options.isExpanded,
            isHeaderVisible: true,
            headerSize: options.headerSize,
            minimumBodySize: options.minimumBodySize,
            maximumBodySize: options.maximumBodySize,
        });

        this.accessor = options.accessor;

        this.addDisposables(this._onDidDrop, this._onUnhandledDragOverEvent);

        if (!options.disableDnd) {
            this.initDragFeatures();
        }
    }

    private initDragFeatures(): void {
        if (!this.header) {
            return;
        }

        const id = this.id;
        const accessorId = this.accessor.id;
        this.header.draggable = true;

        this.handler = new (class PaneDragHandler extends DragHandler {
            getData(): IDisposable {
                LocalSelectionTransfer.getInstance().setData(
                    [new PaneTransfer(accessorId, id)],
                    PaneTransfer.prototype
                );

                return {
                    dispose: () => {
                        LocalSelectionTransfer.getInstance().clearData(
                            PaneTransfer.prototype
                        );
                    },
                };
            }
        })(this.header);

        this.target = new Droptarget(this.element, {
            acceptedTargetZones: ['top', 'bottom'],
            overlayModel: {
                activationSize: { type: 'percentage', value: 50 },
            },
            canDisplayOverlay: (event, position) => {
                const data = getPaneData();

                if (data) {
                    if (
                        data.paneId !== this.id &&
                        data.viewId === this.accessor.id
                    ) {
                        return true;
                    }
                }

                const firedEvent = new PaneviewUnhandledDragOverEvent(
                    event,
                    position,
                    getPaneData,
                    this
                );

                this._onUnhandledDragOverEvent.fire(firedEvent);

                return firedEvent.isAccepted;
            },
        });

        this.addDisposables(
            this._onDidDrop,
            this.handler,
            this.target,
            this.target.onDrop((event) => {
                this.onDrop(event);
            })
        );
    }

    private onDrop(event: DroptargetEvent): void {
        const data = getPaneData();

        if (!data || data.viewId !== this.accessor.id) {
            // if there is no local drag event for this panel
            // or if the drag event was creating by another Paneview instance
            this._onDidDrop.fire({
                ...event,
                panel: this,
                api: new PaneviewApi(this.accessor),
                getData: getPaneData,
            });
            return;
        }

        const containerApi = (this._params! as PanePanelInitParameter)
            .containerApi;
        const panelId = data.paneId;

        const existingPanel = containerApi.getPanel(panelId);
        if (!existingPanel) {
            // if the panel doesn't exist
            this._onDidDrop.fire({
                ...event,
                panel: this,
                getData: getPaneData,
                api: new PaneviewApi(this.accessor),
            });
            return;
        }

        const allPanels = containerApi.panels;

        const fromIndex = allPanels.indexOf(existingPanel);
        let toIndex = containerApi.panels.indexOf(this);

        if (event.position === 'left' || event.position === 'top') {
            toIndex = Math.max(0, toIndex - 1);
        }
        if (event.position === 'right' || event.position === 'bottom') {
            if (fromIndex > toIndex) {
                toIndex++;
            }
            toIndex = Math.min(allPanels.length - 1, toIndex);
        }

        containerApi.movePanel(fromIndex, toIndex);
    }
}
````

## File: packages/dockview-core/src/paneview/options.ts
````typescript
import { PaneTransfer } from '../dnd/dataTransfer';
import { Position } from '../dnd/droptarget';
import { CreateComponentOptions } from '../dockview/options';
import { AcceptableEvent, IAcceptableEvent } from '../events';
import { IPanePart, IPaneviewPanel } from './paneviewPanel';

export interface PaneviewOptions {
    disableAutoResizing?: boolean;
    disableDnd?: boolean;
    className?: string;
}

export interface PaneviewFrameworkOptions {
    createComponent: (options: CreateComponentOptions) => IPanePart;
    createHeaderComponent?: (
        options: CreateComponentOptions
    ) => IPanePart | undefined;
}

export type PaneviewComponentOptions = PaneviewOptions &
    PaneviewFrameworkOptions;

export const PROPERTY_KEYS_PANEVIEW: (keyof PaneviewOptions)[] = (() => {
    /**
     * by readong the keys from an empty value object TypeScript will error
     * when we add or remove new properties to `DockviewOptions`
     */
    const properties: Record<keyof PaneviewOptions, undefined> = {
        disableAutoResizing: undefined,
        disableDnd: undefined,
        className: undefined,
    };

    return Object.keys(properties) as (keyof PaneviewOptions)[];
})();

export interface PaneviewDndOverlayEvent extends IAcceptableEvent {
    nativeEvent: DragEvent;
    position: Position;
    panel: IPaneviewPanel;
    getData: () => PaneTransfer | undefined;
}

export class PaneviewUnhandledDragOverEvent
    extends AcceptableEvent
    implements PaneviewDndOverlayEvent
{
    constructor(
        readonly nativeEvent: DragEvent,
        readonly position: Position,
        readonly getData: () => PaneTransfer | undefined,
        readonly panel: IPaneviewPanel
    ) {
        super();
    }
}
````

## File: packages/dockview-core/src/paneview/paneview.ts
````typescript
import {
    Splitview,
    Orientation,
    ISplitViewDescriptor,
    Sizing,
} from '../splitview/splitview';
import { CompositeDisposable, IDisposable } from '../lifecycle';
import { Emitter, Event } from '../events';
import { addClasses, removeClasses } from '../dom';
import { PaneviewPanel } from './paneviewPanel';

interface PaneItem {
    pane: PaneviewPanel;
    disposable: IDisposable;
}

export class Paneview extends CompositeDisposable implements IDisposable {
    private readonly element: HTMLElement;
    private readonly splitview: Splitview;
    private paneItems: PaneItem[] = [];
    private readonly _orientation: Orientation;
    private animationTimer: any;
    private skipAnimation = false;

    private readonly _onDidChange = new Emitter<void>();
    readonly onDidChange: Event<void> = this._onDidChange.event;

    get onDidAddView(): Event<PaneviewPanel> {
        return <Event<PaneviewPanel>>this.splitview.onDidAddView;
    }
    get onDidRemoveView(): Event<PaneviewPanel> {
        return <Event<PaneviewPanel>>this.splitview.onDidRemoveView;
    }

    get minimumSize(): number {
        return this.splitview.minimumSize;
    }

    get maximumSize(): number {
        return this.splitview.maximumSize;
    }

    get orientation(): Orientation {
        return this.splitview.orientation;
    }

    get size(): number {
        return this.splitview.size;
    }

    get orthogonalSize(): number {
        return this.splitview.orthogonalSize;
    }

    constructor(
        container: HTMLElement,
        options: { orientation: Orientation; descriptor?: ISplitViewDescriptor }
    ) {
        super();

        this._orientation = options.orientation ?? Orientation.VERTICAL;

        this.element = document.createElement('div');
        this.element.className = 'dv-pane-container';

        container.appendChild(this.element);

        this.splitview = new Splitview(this.element, {
            orientation: this._orientation,
            proportionalLayout: false,
            descriptor: options.descriptor,
        });

        // if we've added views from the descriptor we need to
        // add the panes to our Pane array and setup animation
        this.getPanes().forEach((pane) => {
            const disposable = new CompositeDisposable(
                pane.onDidChangeExpansionState(() => {
                    this.setupAnimation();
                    this._onDidChange.fire(undefined);
                })
            );

            const paneItem: PaneItem = {
                pane,
                disposable: {
                    dispose: () => {
                        disposable.dispose();
                    },
                },
            };

            this.paneItems.push(paneItem);
            pane.orthogonalSize = this.splitview.orthogonalSize;
        });

        this.addDisposables(
            this._onDidChange,
            this.splitview.onDidSashEnd(() => {
                this._onDidChange.fire(undefined);
            }),
            this.splitview.onDidAddView(() => {
                this._onDidChange.fire();
            }),
            this.splitview.onDidRemoveView(() => {
                this._onDidChange.fire();
            })
        );
    }

    setViewVisible(index: number, visible: boolean) {
        this.splitview.setViewVisible(index, visible);
    }

    public addPane(
        pane: PaneviewPanel,
        size?: number | Sizing,
        index = this.splitview.length,
        skipLayout = false
    ): void {
        const disposable = pane.onDidChangeExpansionState(() => {
            this.setupAnimation();
            this._onDidChange.fire(undefined);
        });

        const paneItem: PaneItem = {
            pane,
            disposable: {
                dispose: () => {
                    disposable.dispose();
                },
            },
        };

        this.paneItems.splice(index, 0, paneItem);

        pane.orthogonalSize = this.splitview.orthogonalSize;
        this.splitview.addView(pane, size, index, skipLayout);
    }

    getViewSize(index: number): number {
        return this.splitview.getViewSize(index);
    }

    public getPanes(): PaneviewPanel[] {
        return this.splitview.getViews();
    }

    public removePane(
        index: number,
        options: { skipDispose: boolean } = { skipDispose: false }
    ): PaneItem {
        const paneItem = this.paneItems.splice(index, 1)[0];
        this.splitview.removeView(index);

        if (!options.skipDispose) {
            paneItem.disposable.dispose();
            paneItem.pane.dispose();
        }

        return paneItem;
    }

    public moveView(from: number, to: number): void {
        if (from === to) {
            return;
        }

        const view = this.removePane(from, { skipDispose: true });

        this.skipAnimation = true;
        try {
            this.addPane(view.pane, view.pane.size, to, false);
        } finally {
            this.skipAnimation = false;
        }
    }

    public layout(size: number, orthogonalSize: number): void {
        this.splitview.layout(size, orthogonalSize);
    }

    private setupAnimation(): void {
        if (this.skipAnimation) {
            return;
        }

        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
            this.animationTimer = undefined;
        }

        addClasses(this.element, 'dv-animated');

        this.animationTimer = setTimeout(() => {
            this.animationTimer = undefined;
            removeClasses(this.element, 'dv-animated');
        }, 200);
    }

    public dispose(): void {
        super.dispose();

        if (this.animationTimer) {
            clearTimeout(this.animationTimer);
            this.animationTimer = undefined;
        }

        this.paneItems.forEach((paneItem) => {
            paneItem.disposable.dispose();
            paneItem.pane.dispose();
        });
        this.paneItems = [];

        this.splitview.dispose();
        this.element.remove();
    }
}
````

## File: packages/dockview-core/src/paneview/paneviewComponent.ts
````typescript
import { PaneviewApi } from '../api/component.api';
import { Emitter, Event } from '../events';
import {
    CompositeDisposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import { LayoutPriority, Orientation, Sizing } from '../splitview/splitview';
import { PaneviewComponentOptions, PaneviewDndOverlayEvent } from './options';
import { Paneview } from './paneview';
import { IPanePart, PaneviewPanel, IPaneviewPanel } from './paneviewPanel';
import {
    DraggablePaneviewPanel,
    PaneviewDidDropEvent,
} from './draggablePaneviewPanel';
import { DefaultHeader } from './defaultPaneviewHeader';
import { sequentialNumberGenerator } from '../math';
import { Resizable } from '../resizable';
import { Parameters } from '../panel/types';
import { Classnames } from '../dom';

const nextLayoutId = sequentialNumberGenerator();

const HEADER_SIZE = 22;
const MINIMUM_BODY_SIZE = 0;
const MAXIMUM_BODY_SIZE = Number.MAX_SAFE_INTEGER;

export interface SerializedPaneviewPanel {
    snap?: boolean;
    priority?: LayoutPriority;
    minimumSize?: number;
    maximumSize?: number;
    headerSize?: number;
    data: {
        id: string;
        component: string;
        title: string;
        headerComponent?: string;
        params?: { [index: string]: any };
    };
    size: number;
    expanded?: boolean;
}

export interface SerializedPaneview {
    size: number;
    views: SerializedPaneviewPanel[];
}

export class PaneFramework extends DraggablePaneviewPanel {
    constructor(
        private readonly options: {
            id: string;
            component: string;
            headerComponent: string | undefined;
            body: IPanePart;
            header: IPanePart;
            orientation: Orientation;
            isExpanded: boolean;
            disableDnd: boolean;
            accessor: IPaneviewComponent;
            headerSize: number;
            minimumBodySize: number;
            maximumBodySize: number;
        }
    ) {
        super({
            accessor: options.accessor,
            id: options.id,
            component: options.component,
            headerComponent: options.headerComponent,
            orientation: options.orientation,
            isExpanded: options.isExpanded,
            disableDnd: options.disableDnd,
            headerSize: options.headerSize,
            minimumBodySize: options.minimumBodySize,
            maximumBodySize: options.maximumBodySize,
        });
    }

    getBodyComponent() {
        return this.options.body;
    }

    getHeaderComponent() {
        return this.options.header;
    }
}

export interface AddPaneviewComponentOptions<T extends object = Parameters> {
    id: string;
    component: string;
    headerComponent?: string;
    params?: T;
    minimumBodySize?: number;
    maximumBodySize?: number;
    headerSize?: number;
    isExpanded?: boolean;
    title: string;
    index?: number;
    size?: number;
}

export interface IPaneviewComponent extends IDisposable {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly minimumSize: number;
    readonly maximumSize: number;
    readonly panels: IPaneviewPanel[];
    readonly options: PaneviewComponentOptions;
    readonly onDidAddView: Event<PaneviewPanel>;
    readonly onDidRemoveView: Event<PaneviewPanel>;
    readonly onDidDrop: Event<PaneviewDidDropEvent>;
    readonly onDidLayoutChange: Event<void>;
    readonly onDidLayoutFromJSON: Event<void>;
    readonly onUnhandledDragOverEvent: Event<PaneviewDndOverlayEvent>;
    addPanel<T extends object = Parameters>(
        options: AddPaneviewComponentOptions<T>
    ): IPaneviewPanel;
    layout(width: number, height: number): void;
    toJSON(): SerializedPaneview;
    fromJSON(serializedPaneview: SerializedPaneview): void;
    focus(): void;
    removePanel(panel: IPaneviewPanel): void;
    getPanel(id: string): IPaneviewPanel | undefined;
    movePanel(from: number, to: number): void;
    updateOptions(options: Partial<PaneviewComponentOptions>): void;
    setVisible(panel: IPaneviewPanel, visible: boolean): void;
    clear(): void;
}

export class PaneviewComponent extends Resizable implements IPaneviewComponent {
    private readonly _id = nextLayoutId.next();
    private _options: PaneviewComponentOptions;
    private readonly _disposable = new MutableDisposable();
    private readonly _viewDisposables = new Map<string, IDisposable>();
    private _paneview!: Paneview;

    private readonly _onDidLayoutfromJSON = new Emitter<void>();
    readonly onDidLayoutFromJSON: Event<void> = this._onDidLayoutfromJSON.event;

    private readonly _onDidLayoutChange = new Emitter<void>();
    readonly onDidLayoutChange: Event<void> = this._onDidLayoutChange.event;

    private readonly _onDidDrop = new Emitter<PaneviewDidDropEvent>();
    readonly onDidDrop: Event<PaneviewDidDropEvent> = this._onDidDrop.event;

    private readonly _onDidAddView = new Emitter<PaneviewPanel>();
    readonly onDidAddView = this._onDidAddView.event;

    private readonly _onDidRemoveView = new Emitter<PaneviewPanel>();
    readonly onDidRemoveView = this._onDidRemoveView.event;

    private readonly _onUnhandledDragOverEvent =
        new Emitter<PaneviewDndOverlayEvent>();
    readonly onUnhandledDragOverEvent: Event<PaneviewDndOverlayEvent> =
        this._onUnhandledDragOverEvent.event;

    private readonly _classNames: Classnames;

    get id(): string {
        return this._id;
    }

    get panels(): PaneviewPanel[] {
        return this.paneview.getPanes();
    }

    set paneview(value: Paneview) {
        this._paneview = value;

        this._disposable.value = new CompositeDisposable(
            this._paneview.onDidChange(() => {
                this._onDidLayoutChange.fire(undefined);
            }),
            this._paneview.onDidAddView((e) => this._onDidAddView.fire(e)),
            this._paneview.onDidRemoveView((e) => this._onDidRemoveView.fire(e))
        );
    }

    get paneview(): Paneview {
        return this._paneview;
    }

    get minimumSize(): number {
        return this.paneview.minimumSize;
    }

    get maximumSize(): number {
        return this.paneview.maximumSize;
    }

    get height(): number {
        return this.paneview.orientation === Orientation.HORIZONTAL
            ? this.paneview.orthogonalSize
            : this.paneview.size;
    }

    get width(): number {
        return this.paneview.orientation === Orientation.HORIZONTAL
            ? this.paneview.size
            : this.paneview.orthogonalSize;
    }

    get options(): PaneviewComponentOptions {
        return this._options;
    }

    constructor(container: HTMLElement, options: PaneviewComponentOptions) {
        super(document.createElement('div'), options.disableAutoResizing);
        this.element.style.height = '100%';
        this.element.style.width = '100%';

        this.addDisposables(
            this._onDidLayoutChange,
            this._onDidLayoutfromJSON,
            this._onDidDrop,
            this._onDidAddView,
            this._onDidRemoveView,
            this._onUnhandledDragOverEvent
        );

        this._classNames = new Classnames(this.element);
        this._classNames.setClassNames(options.className ?? '');

        // the container is owned by the third-party, do not modify/delete it
        container.appendChild(this.element);

        this._options = options;

        this.paneview = new Paneview(this.element, {
            // only allow paneview in the vertical orientation for now
            orientation: Orientation.VERTICAL,
        });

        this.addDisposables(this._disposable);
    }

    setVisible(panel: PaneviewPanel, visible: boolean): void {
        const index = this.panels.indexOf(panel);
        this.paneview.setViewVisible(index, visible);
    }

    focus(): void {
        //noop
    }

    updateOptions(options: Partial<PaneviewComponentOptions>): void {
        if ('className' in options) {
            this._classNames.setClassNames(options.className ?? '');
        }

        if ('disableResizing' in options) {
            this.disableResizing = options.disableAutoResizing ?? false;
        }

        this._options = { ...this.options, ...options };
    }

    addPanel<T extends object = Parameters>(
        options: AddPaneviewComponentOptions<T>
    ): IPaneviewPanel {
        const body = this.options.createComponent({
            id: options.id,
            name: options.component,
        });

        let header: IPanePart | undefined;

        if (options.headerComponent && this.options.createHeaderComponent) {
            header = this.options.createHeaderComponent({
                id: options.id,
                name: options.headerComponent,
            });
        }

        if (!header) {
            header = new DefaultHeader();
        }

        const view = new PaneFramework({
            id: options.id,
            component: options.component,
            headerComponent: options.headerComponent,
            header,
            body,
            orientation: Orientation.VERTICAL,
            isExpanded: !!options.isExpanded,
            disableDnd: !!this.options.disableDnd,
            accessor: this,
            headerSize: options.headerSize ?? HEADER_SIZE,
            minimumBodySize: MINIMUM_BODY_SIZE,
            maximumBodySize: MAXIMUM_BODY_SIZE,
        });

        this.doAddPanel(view);

        const size: Sizing | number =
            typeof options.size === 'number' ? options.size : Sizing.Distribute;
        const index =
            typeof options.index === 'number' ? options.index : undefined;

        view.init({
            params: options.params ?? {},
            minimumBodySize: options.minimumBodySize,
            maximumBodySize: options.maximumBodySize,
            isExpanded: options.isExpanded,
            title: options.title,
            containerApi: new PaneviewApi(this),
            accessor: this,
        });

        this.paneview.addPane(view, size, index);

        view.orientation = this.paneview.orientation;

        return view;
    }

    removePanel(panel: PaneviewPanel): void {
        const views = this.panels;
        const index = views.findIndex((_) => _ === panel);
        this.paneview.removePane(index);

        this.doRemovePanel(panel);
    }

    movePanel(from: number, to: number): void {
        this.paneview.moveView(from, to);
    }

    getPanel(id: string): PaneviewPanel | undefined {
        return this.panels.find((view) => view.id === id);
    }

    layout(width: number, height: number): void {
        const [size, orthogonalSize] =
            this.paneview.orientation === Orientation.HORIZONTAL
                ? [width, height]
                : [height, width];
        this.paneview.layout(size, orthogonalSize);
    }

    toJSON(): SerializedPaneview {
        const maximum = (value: number) =>
            value === Number.MAX_SAFE_INTEGER ||
            value === Number.POSITIVE_INFINITY
                ? undefined
                : value;
        const minimum = (value: number) => (value <= 0 ? undefined : value);

        const views: SerializedPaneviewPanel[] = this.paneview
            .getPanes()
            .map((view, i) => {
                const size = this.paneview.getViewSize(i);
                return {
                    size,
                    data: view.toJSON(),
                    minimumSize: minimum(view.minimumBodySize),
                    maximumSize: maximum(view.maximumBodySize),
                    headerSize: view.headerSize,
                    expanded: view.isExpanded(),
                };
            });

        return {
            views,
            size: this.paneview.size,
        };
    }

    fromJSON(serializedPaneview: SerializedPaneview): void {
        this.clear();

        const { views, size } = serializedPaneview;

        const queue: Function[] = [];

        // take note of the existing dimensions
        const width = this.width;
        const height = this.height;

        this.paneview = new Paneview(this.element, {
            orientation: Orientation.VERTICAL,
            descriptor: {
                size,
                views: views.map((view) => {
                    const data = view.data;

                    const body = this.options.createComponent({
                        id: data.id,
                        name: data.component,
                    });

                    let header: IPanePart | undefined;

                    if (
                        data.headerComponent &&
                        this.options.createHeaderComponent
                    ) {
                        header = this.options.createHeaderComponent({
                            id: data.id,
                            name: data.headerComponent,
                        });
                    }

                    if (!header) {
                        header = new DefaultHeader();
                    }

                    const panel = new PaneFramework({
                        id: data.id,
                        component: data.component,
                        headerComponent: data.headerComponent,
                        header,
                        body,
                        orientation: Orientation.VERTICAL,
                        isExpanded: !!view.expanded,
                        disableDnd: !!this.options.disableDnd,
                        accessor: this,
                        headerSize: view.headerSize ?? HEADER_SIZE,
                        minimumBodySize: view.minimumSize ?? MINIMUM_BODY_SIZE,
                        maximumBodySize: view.maximumSize ?? MAXIMUM_BODY_SIZE,
                    });

                    this.doAddPanel(panel);

                    queue.push(() => {
                        panel.init({
                            params: data.params ?? {},
                            minimumBodySize: view.minimumSize,
                            maximumBodySize: view.maximumSize,
                            title: data.title,
                            isExpanded: !!view.expanded,
                            containerApi: new PaneviewApi(this),
                            accessor: this,
                        });
                        panel.orientation = this.paneview.orientation;
                    });

                    setTimeout(() => {
                        // the original onDidAddView events are missed since they are fired before we can subcribe to them
                        this._onDidAddView.fire(panel);
                    }, 0);

                    return { size: view.size, view: panel };
                }),
            },
        });

        this.layout(width, height);

        queue.forEach((f) => f());

        this._onDidLayoutfromJSON.fire();
    }

    clear(): void {
        for (const [_, value] of this._viewDisposables.entries()) {
            value.dispose();
        }
        this._viewDisposables.clear();

        this.paneview.dispose();
    }

    private doAddPanel(panel: PaneFramework): void {
        const disposable = new CompositeDisposable(
            panel.onDidDrop((event) => {
                this._onDidDrop.fire(event);
            }),
            panel.onUnhandledDragOverEvent((event) => {
                this._onUnhandledDragOverEvent.fire(event);
            })
        );

        this._viewDisposables.set(panel.id, disposable);
    }

    private doRemovePanel(panel: PaneviewPanel): void {
        const disposable = this._viewDisposables.get(panel.id);

        if (disposable) {
            disposable.dispose();
            this._viewDisposables.delete(panel.id);
        }
    }

    public dispose(): void {
        super.dispose();

        for (const [_, value] of this._viewDisposables.entries()) {
            value.dispose();
        }
        this._viewDisposables.clear();

        this.element.remove();

        this.paneview.dispose();
    }
}
````

## File: packages/dockview-core/src/paneview/paneviewPanel.ts
````typescript
import { PaneviewApi } from '../api/component.api';
import { PaneviewPanelApiImpl } from '../api/paneviewPanelApi';
import { addClasses, removeClasses } from '../dom';
import { addDisposableListener, Emitter, Event } from '../events';
import {
    BasePanelView,
    BasePanelViewExported,
    BasePanelViewState,
} from '../gridview/basePanelView';
import { IDisposable } from '../lifecycle';
import {
    IFrameworkPart,
    PanelInitParameters,
    PanelUpdateEvent,
    Parameters,
} from '../panel/types';
import { IView, Orientation } from '../splitview/splitview';
import { PaneviewComponent } from './paneviewComponent';

export interface PanePanelViewState extends BasePanelViewState {
    headerComponent?: string;
    title: string;
}

export interface PanePanelInitParameter extends PanelInitParameters {
    minimumBodySize?: number;
    maximumBodySize?: number;
    isExpanded?: boolean;
    title: string;
    containerApi: PaneviewApi;
    accessor: PaneviewComponent;
}

export interface PanePanelComponentInitParameter
    extends PanePanelInitParameter {
    api: PaneviewPanelApiImpl;
}

export interface IPanePart extends IDisposable {
    readonly element: HTMLElement;
    update(params: PanelUpdateEvent): void;
    init(parameters: PanePanelComponentInitParameter): void;
}

export interface IPaneview extends IView {
    onDidChangeExpansionState: Event<boolean>;
}

export interface IPaneviewPanel
    extends BasePanelViewExported<PaneviewPanelApiImpl> {
    readonly minimumSize: number;
    readonly maximumSize: number;
    readonly minimumBodySize: number;
    readonly maximumBodySize: number;
    isExpanded(): boolean;
    setExpanded(isExpanded: boolean): void;
    headerVisible: boolean;
}

export abstract class PaneviewPanel
    extends BasePanelView<PaneviewPanelApiImpl>
    implements IPaneview, IPaneviewPanel
{
    private readonly _onDidChangeExpansionState: Emitter<boolean> =
        new Emitter<boolean>({ replay: true });
    onDidChangeExpansionState = this._onDidChangeExpansionState.event;
    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    private _orthogonalSize = 0;
    private _size = 0;
    private _minimumBodySize: number;
    private _maximumBodySize: number;
    private _isExpanded = false;
    protected header?: HTMLElement;
    protected body?: HTMLElement;
    private bodyPart?: IPanePart;
    private headerPart?: IPanePart;
    private animationTimer: any;
    private _orientation: Orientation;

    private _headerVisible: boolean;

    readonly headerSize: number;
    readonly headerComponent: string | undefined;

    set orientation(value: Orientation) {
        this._orientation = value;
    }

    get orientation(): Orientation {
        return this._orientation;
    }

    get minimumSize(): number {
        const headerSize = this.headerSize;
        const expanded = this.isExpanded();
        const minimumBodySize = expanded ? this._minimumBodySize : 0;

        return headerSize + minimumBodySize;
    }

    get maximumSize(): number {
        const headerSize = this.headerSize;
        const expanded = this.isExpanded();
        const maximumBodySize = expanded ? this._maximumBodySize : 0;

        return headerSize + maximumBodySize;
    }

    get size(): number {
        return this._size;
    }

    get orthogonalSize(): number {
        return this._orthogonalSize;
    }

    set orthogonalSize(size: number) {
        this._orthogonalSize = size;
    }

    get minimumBodySize(): number {
        return this._minimumBodySize;
    }

    set minimumBodySize(value: number) {
        this._minimumBodySize = typeof value === 'number' ? value : 0;
    }

    get maximumBodySize(): number {
        return this._maximumBodySize;
    }

    set maximumBodySize(value: number) {
        this._maximumBodySize =
            typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
    }

    get headerVisible(): boolean {
        return this._headerVisible;
    }

    set headerVisible(value: boolean) {
        this._headerVisible = value;
        this.header!.style.display = value ? '' : 'none';
    }

    constructor(options: {
        id: string;
        component: string;
        headerComponent: string | undefined;
        orientation: Orientation;
        isExpanded: boolean;
        isHeaderVisible: boolean;
        headerSize: number;
        minimumBodySize: number;
        maximumBodySize: number;
    }) {
        super(
            options.id,
            options.component,
            new PaneviewPanelApiImpl(options.id, options.component)
        );
        this.api.pane = this; // TODO cannot use 'this' before 'super'
        this.api.initialize(this);

        this.headerSize = options.headerSize;
        this.headerComponent = options.headerComponent;

        this._minimumBodySize = options.minimumBodySize;
        this._maximumBodySize = options.maximumBodySize;

        this._isExpanded = options.isExpanded;
        this._headerVisible = options.isHeaderVisible;

        this._onDidChangeExpansionState.fire(this.isExpanded()); // initialize value

        this._orientation = options.orientation;

        this.element.classList.add('dv-pane');

        this.addDisposables(
            this.api.onWillVisibilityChange((event) => {
                const { isVisible } = event;
                const { accessor } = this._params as PanePanelInitParameter;
                accessor.setVisible(this, isVisible);
            }),
            this.api.onDidSizeChange((event) => {
                this._onDidChange.fire({ size: event.size });
            }),
            addDisposableListener(
                this.element,
                'mouseenter',
                (ev: MouseEvent) => {
                    this.api._onMouseEnter.fire(ev);
                }
            ),
            addDisposableListener(
                this.element,
                'mouseleave',
                (ev: MouseEvent) => {
                    this.api._onMouseLeave.fire(ev);
                }
            )
        );

        this.addDisposables(
            this._onDidChangeExpansionState,
            this.onDidChangeExpansionState((isPanelExpanded) => {
                this.api._onDidExpansionChange.fire({
                    isExpanded: isPanelExpanded,
                });
            }),
            this.api.onDidFocusChange((e) => {
                if (!this.header) {
                    return;
                }
                if (e.isFocused) {
                    addClasses(this.header, 'focused');
                } else {
                    removeClasses(this.header, 'focused');
                }
            })
        );

        this.renderOnce();
    }

    setVisible(isVisible: boolean): void {
        this.api._onDidVisibilityChange.fire({ isVisible });
    }

    setActive(isActive: boolean): void {
        this.api._onDidActiveChange.fire({ isActive });
    }

    isExpanded(): boolean {
        return this._isExpanded;
    }

    setExpanded(expanded: boolean): void {
        if (this._isExpanded === expanded) {
            return;
        }

        this._isExpanded = expanded;

        if (expanded) {
            if (this.animationTimer) {
                clearTimeout(this.animationTimer);
            }
            if (this.body) {
                this.element.appendChild(this.body);
            }
        } else {
            this.animationTimer = setTimeout(() => {
                this.body?.remove();
            }, 200);
        }

        this._onDidChange.fire(expanded ? { size: this.width } : {});
        this._onDidChangeExpansionState.fire(expanded);
    }

    layout(size: number, orthogonalSize: number): void {
        this._size = size;
        this._orthogonalSize = orthogonalSize;
        const [width, height] =
            this.orientation === Orientation.HORIZONTAL
                ? [size, orthogonalSize]
                : [orthogonalSize, size];
        super.layout(width, height);
    }

    init(parameters: PanePanelInitParameter): void {
        super.init(parameters);

        if (typeof parameters.minimumBodySize === 'number') {
            this.minimumBodySize = parameters.minimumBodySize;
        }
        if (typeof parameters.maximumBodySize === 'number') {
            this.maximumBodySize = parameters.maximumBodySize;
        }

        this.bodyPart = this.getBodyComponent();
        this.headerPart = this.getHeaderComponent();

        this.bodyPart.init({ ...parameters, api: this.api });
        this.headerPart.init({ ...parameters, api: this.api });

        this.body?.append(this.bodyPart.element);
        this.header?.append(this.headerPart.element);

        if (typeof parameters.isExpanded === 'boolean') {
            this.setExpanded(parameters.isExpanded);
        }
    }

    toJSON(): PanePanelViewState {
        const params = this._params as PanePanelInitParameter;
        return {
            ...super.toJSON(),
            headerComponent: this.headerComponent,
            title: params.title,
        };
    }

    private renderOnce(): void {
        this.header = document.createElement('div');
        this.header.tabIndex = 0;

        this.header.className = 'dv-pane-header';
        this.header.style.height = `${this.headerSize}px`;
        this.header.style.lineHeight = `${this.headerSize}px`;
        this.header.style.minHeight = `${this.headerSize}px`;
        this.header.style.maxHeight = `${this.headerSize}px`;

        this.element.appendChild(this.header);

        this.body = document.createElement('div');

        this.body.className = 'dv-pane-body';

        this.element.appendChild(this.body);
    }

    // TODO slightly hacky by-pass of the component to create a body and header component
    getComponent(): IFrameworkPart {
        return {
            update: (params: Parameters) => {
                this.bodyPart?.update({ params });
                this.headerPart?.update({ params });
            },
            dispose: () => {
                this.bodyPart?.dispose();
                this.headerPart?.dispose();
            },
        };
    }

    protected abstract getBodyComponent(): IPanePart;
    protected abstract getHeaderComponent(): IPanePart;
}
````

## File: packages/dockview-core/src/splitview/options.ts
````typescript
import { PanelInitParameters } from '../panel/types';
import { SplitViewOptions, LayoutPriority } from './splitview';
import { SplitviewPanel } from './splitviewPanel';
import { SplitviewComponent } from './splitviewComponent';
import { CreateComponentOptions } from '../dockview/options';

export interface PanelViewInitParameters extends PanelInitParameters {
    minimumSize?: number;
    maximumSize?: number;
    snap?: boolean;
    priority?: LayoutPriority;
    accessor: SplitviewComponent;
}

export interface SplitviewOptions extends SplitViewOptions {
    disableAutoResizing?: boolean;
    className?: string;
}

export interface SplitviewFrameworkOptions {
    createComponent: (options: CreateComponentOptions) => SplitviewPanel;
}

export type SplitviewComponentOptions = SplitviewOptions &
    SplitviewFrameworkOptions;

export const PROPERTY_KEYS_SPLITVIEW: (keyof SplitviewOptions)[] = (() => {
    /**
     * by readong the keys from an empty value object TypeScript will error
     * when we add or remove new properties to `DockviewOptions`
     */
    const properties: Record<keyof SplitviewOptions, undefined> = {
        orientation: undefined,
        descriptor: undefined,
        proportionalLayout: undefined,
        styles: undefined,
        margin: undefined,
        disableAutoResizing: undefined,
        className: undefined,
    };

    return Object.keys(properties) as (keyof SplitviewOptions)[];
})();
````

## File: packages/dockview-core/src/splitview/splitview.ts
````typescript
/*---------------------------------------------------------------------------------------------
 * Accreditation: This file is largly based upon the MIT licenced VSCode sourcecode found at:
 * https://github.com/microsoft/vscode/tree/main/src/vs/base/browser/ui/splitview
 *--------------------------------------------------------------------------------------------*/

import {
    removeClasses,
    addClasses,
    toggleClass,
    disableIframePointEvents,
} from '../dom';
import { Event, Emitter } from '../events';
import { pushToStart, pushToEnd, firstIndex } from '../array';
import { range, clamp } from '../math';
import { ViewItem } from './viewItem';
import { IDisposable } from '../lifecycle';

export enum Orientation {
    HORIZONTAL = 'HORIZONTAL',
    VERTICAL = 'VERTICAL',
}

export enum SashState {
    MAXIMUM,
    MINIMUM,
    DISABLED,
    ENABLED,
}

export interface ISplitviewStyles {
    separatorBorder: string;
}

export interface SplitViewOptions {
    orientation?: Orientation;
    descriptor?: ISplitViewDescriptor;
    proportionalLayout?: boolean;
    styles?: ISplitviewStyles;
    margin?: number;
}

export enum LayoutPriority {
    Low = 'low', // view is offered space last
    High = 'high', // view is offered space first
    Normal = 'normal', // view is offered space in view order
}

export interface IBaseView extends IDisposable {
    minimumSize: number;
    maximumSize: number;
    snap?: boolean;
    priority?: LayoutPriority;
}

export interface IView extends IBaseView {
    readonly element: HTMLElement | DocumentFragment;
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }>;
    layout(size: number, orthogonalSize: number): void;
    setVisible(visible: boolean): void;
}

interface ISashItem {
    container: HTMLElement;
    disposable: () => void;
}

interface ISashDragSnapState {
    readonly index: number;
    readonly limitDelta: number;
    readonly size: number;
}

type ViewItemSize = number | { cachedVisibleSize: number };

export type DistributeSizing = { type: 'distribute' };
export type SplitSizing = { type: 'split'; index: number };
export type InvisibleSizing = { type: 'invisible'; cachedVisibleSize: number };
export type Sizing = DistributeSizing | SplitSizing | InvisibleSizing;

export namespace Sizing {
    export const Distribute: DistributeSizing = { type: 'distribute' };
    export function Split(index: number): SplitSizing {
        return { type: 'split', index };
    }
    export function Invisible(cachedVisibleSize: number): InvisibleSizing {
        return { type: 'invisible', cachedVisibleSize };
    }
}

export interface ISplitViewDescriptor {
    size: number;
    views: {
        visible?: boolean;
        size: number;
        view: IView;
    }[];
}

export class Splitview {
    private readonly element: HTMLElement;
    private readonly viewContainer: HTMLElement;
    private readonly sashContainer: HTMLElement;
    private readonly viewItems: ViewItem[] = [];
    private readonly sashes: ISashItem[] = [];
    private _orientation: Orientation;
    private _size = 0;
    private _orthogonalSize = 0;
    private _contentSize = 0;
    private _proportions: (number | undefined)[] | undefined = undefined;
    private readonly proportionalLayout: boolean;
    private _startSnappingEnabled = true;
    private _endSnappingEnabled = true;
    private _disabled = false;
    private _margin = 0;

    private readonly _onDidSashEnd = new Emitter<void>();
    readonly onDidSashEnd = this._onDidSashEnd.event;
    private readonly _onDidAddView = new Emitter<IView>();
    readonly onDidAddView = this._onDidAddView.event;
    private readonly _onDidRemoveView = new Emitter<IView>();
    readonly onDidRemoveView = this._onDidRemoveView.event;

    get contentSize(): number {
        return this._contentSize;
    }

    get size(): number {
        return this._size;
    }

    set size(value: number) {
        this._size = value;
    }

    get orthogonalSize(): number {
        return this._orthogonalSize;
    }

    set orthogonalSize(value: number) {
        this._orthogonalSize = value;
    }

    public get length(): number {
        return this.viewItems.length;
    }

    public get proportions(): (number | undefined)[] | undefined {
        return this._proportions ? [...this._proportions] : undefined;
    }

    get orientation(): Orientation {
        return this._orientation;
    }

    set orientation(value: Orientation) {
        this._orientation = value;

        const tmp = this.size;
        this.size = this.orthogonalSize;
        this.orthogonalSize = tmp;

        removeClasses(this.element, 'dv-horizontal', 'dv-vertical');
        this.element.classList.add(
            this.orientation == Orientation.HORIZONTAL
                ? 'dv-horizontal'
                : 'dv-vertical'
        );
    }

    get minimumSize(): number {
        return this.viewItems.reduce((r, item) => r + item.minimumSize, 0);
    }

    get maximumSize(): number {
        return this.length === 0
            ? Number.POSITIVE_INFINITY
            : this.viewItems.reduce((r, item) => r + item.maximumSize, 0);
    }

    get startSnappingEnabled(): boolean {
        return this._startSnappingEnabled;
    }

    set startSnappingEnabled(startSnappingEnabled: boolean) {
        if (this._startSnappingEnabled === startSnappingEnabled) {
            return;
        }

        this._startSnappingEnabled = startSnappingEnabled;
        this.updateSashEnablement();
    }

    get endSnappingEnabled(): boolean {
        return this._endSnappingEnabled;
    }

    set endSnappingEnabled(endSnappingEnabled: boolean) {
        if (this._endSnappingEnabled === endSnappingEnabled) {
            return;
        }

        this._endSnappingEnabled = endSnappingEnabled;
        this.updateSashEnablement();
    }

    get disabled(): boolean {
        return this._disabled;
    }

    set disabled(value: boolean) {
        this._disabled = value;

        toggleClass(this.element, 'dv-splitview-disabled', value);
    }

    get margin(): number {
        return this._margin;
    }

    set margin(value: number) {
        this._margin = value;

        toggleClass(this.element, 'dv-splitview-has-margin', value !== 0);
    }

    constructor(
        private readonly container: HTMLElement,
        options: SplitViewOptions
    ) {
        this._orientation = options.orientation ?? Orientation.VERTICAL;
        this.element = this.createContainer();

        this.margin = options.margin ?? 0;

        this.proportionalLayout =
            options.proportionalLayout === undefined
                ? true
                : !!options.proportionalLayout;

        this.viewContainer = this.createViewContainer();
        this.sashContainer = this.createSashContainer();

        this.element.appendChild(this.sashContainer);
        this.element.appendChild(this.viewContainer);

        this.container.appendChild(this.element);

        this.style(options.styles);

        // We have an existing set of view, add them now
        if (options.descriptor) {
            this._size = options.descriptor.size;
            options.descriptor.views.forEach((viewDescriptor, index) => {
                const sizing =
                    viewDescriptor.visible === undefined ||
                    viewDescriptor.visible
                        ? viewDescriptor.size
                        : ({
                              type: 'invisible',
                              cachedVisibleSize: viewDescriptor.size,
                          } as InvisibleSizing);

                const view = viewDescriptor.view;
                this.addView(
                    view,
                    sizing,
                    index,
                    true
                    // true skip layout
                );
            });

            // Initialize content size and proportions for first layout
            this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
            this.saveProportions();
        }
    }

    style(styles?: ISplitviewStyles): void {
        if (styles?.separatorBorder === 'transparent') {
            removeClasses(this.element, 'dv-separator-border');
            this.element.style.removeProperty('--dv-separator-border');
        } else {
            addClasses(this.element, 'dv-separator-border');
            if (styles?.separatorBorder) {
                this.element.style.setProperty(
                    '--dv-separator-border',
                    styles.separatorBorder
                );
            }
        }
    }

    isViewVisible(index: number): boolean {
        if (index < 0 || index >= this.viewItems.length) {
            throw new Error('Index out of bounds');
        }

        const viewItem = this.viewItems[index];
        return viewItem.visible;
    }

    setViewVisible(index: number, visible: boolean): void {
        if (index < 0 || index >= this.viewItems.length) {
            throw new Error('Index out of bounds');
        }

        const viewItem = this.viewItems[index];

        viewItem.setVisible(visible, viewItem.size);

        this.distributeEmptySpace(index);
        this.layoutViews();
        this.saveProportions();
    }

    getViewSize(index: number): number {
        if (index < 0 || index >= this.viewItems.length) {
            return -1;
        }

        return this.viewItems[index].size;
    }

    resizeView(index: number, size: number): void {
        if (index < 0 || index >= this.viewItems.length) {
            return;
        }

        const indexes = range(this.viewItems.length).filter((i) => i !== index);
        const lowPriorityIndexes = [
            ...indexes.filter(
                (i) => this.viewItems[i].priority === LayoutPriority.Low
            ),
            index,
        ];
        const highPriorityIndexes = indexes.filter(
            (i) => this.viewItems[i].priority === LayoutPriority.High
        );

        const item = this.viewItems[index];
        size = Math.round(size);
        size = clamp(
            size,
            item.minimumSize,
            Math.min(item.maximumSize, this._size)
        );

        item.size = size;
        this.relayout(lowPriorityIndexes, highPriorityIndexes);
    }

    public getViews<T extends IView>(): T[] {
        return this.viewItems.map((x) => x.view as T);
    }

    private onDidChange(item: ViewItem, size: number | undefined): void {
        const index = this.viewItems.indexOf(item);

        if (index < 0 || index >= this.viewItems.length) {
            return;
        }

        size = typeof size === 'number' ? size : item.size;
        size = clamp(size, item.minimumSize, item.maximumSize);

        item.size = size;

        const indexes = range(this.viewItems.length).filter((i) => i !== index);
        const lowPriorityIndexes = [
            ...indexes.filter(
                (i) => this.viewItems[i].priority === LayoutPriority.Low
            ),
            index,
        ];
        const highPriorityIndexes = indexes.filter(
            (i) => this.viewItems[i].priority === LayoutPriority.High
        );

        /**
         * add this view we are changing to the low-index list since we have determined the size
         * here and don't want it changed
         */
        this.relayout([...lowPriorityIndexes, index], highPriorityIndexes);
    }

    public addView(
        view: IView,
        size: number | Sizing = { type: 'distribute' },
        index: number = this.viewItems.length,
        skipLayout?: boolean
    ): void {
        const container = document.createElement('div');
        container.className = 'dv-view';

        container.appendChild(view.element);

        let viewSize: ViewItemSize;

        if (typeof size === 'number') {
            viewSize = size;
        } else if (size.type === 'split') {
            viewSize = this.getViewSize(size.index) / 2;
        } else if (size.type === 'invisible') {
            viewSize = { cachedVisibleSize: size.cachedVisibleSize };
        } else {
            viewSize = view.minimumSize;
        }

        const disposable = view.onDidChange((newSize) =>
            this.onDidChange(viewItem, newSize.size)
        );

        const viewItem = new ViewItem(container, view, viewSize, {
            dispose: () => {
                disposable.dispose();
                this.viewContainer.removeChild(container);
            },
        });

        if (index === this.viewItems.length) {
            this.viewContainer.appendChild(container);
        } else {
            this.viewContainer.insertBefore(
                container,
                this.viewContainer.children.item(index)
            );
        }

        this.viewItems.splice(index, 0, viewItem);

        if (this.viewItems.length > 1) {
            //add sash
            const sash = document.createElement('div');
            sash.className = 'dv-sash';

            const onPointerStart = (event: PointerEvent) => {
                for (const item of this.viewItems) {
                    item.enabled = false;
                }

                const iframes = disableIframePointEvents();

                const start =
                    this._orientation === Orientation.HORIZONTAL
                        ? event.clientX
                        : event.clientY;

                const sashIndex = firstIndex(
                    this.sashes,
                    (s) => s.container === sash
                );

                //
                const sizes = this.viewItems.map((x) => x.size);

                //
                let snapBefore: ISashDragSnapState | undefined;
                let snapAfter: ISashDragSnapState | undefined;
                const upIndexes = range(sashIndex, -1);
                const downIndexes = range(sashIndex + 1, this.viewItems.length);
                const minDeltaUp = upIndexes.reduce(
                    (r, i) => r + (this.viewItems[i].minimumSize - sizes[i]),
                    0
                );
                const maxDeltaUp = upIndexes.reduce(
                    (r, i) =>
                        r + (this.viewItems[i].viewMaximumSize - sizes[i]),
                    0
                );
                const maxDeltaDown =
                    downIndexes.length === 0
                        ? Number.POSITIVE_INFINITY
                        : downIndexes.reduce(
                              (r, i) =>
                                  r +
                                  (sizes[i] - this.viewItems[i].minimumSize),
                              0
                          );
                const minDeltaDown =
                    downIndexes.length === 0
                        ? Number.NEGATIVE_INFINITY
                        : downIndexes.reduce(
                              (r, i) =>
                                  r +
                                  (sizes[i] -
                                      this.viewItems[i].viewMaximumSize),
                              0
                          );
                const minDelta = Math.max(minDeltaUp, minDeltaDown);
                const maxDelta = Math.min(maxDeltaDown, maxDeltaUp);
                const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
                const snapAfterIndex = this.findFirstSnapIndex(downIndexes);
                if (typeof snapBeforeIndex === 'number') {
                    const snappedViewItem = this.viewItems[snapBeforeIndex];
                    const halfSize = Math.floor(
                        snappedViewItem.viewMinimumSize / 2
                    );

                    snapBefore = {
                        index: snapBeforeIndex,
                        limitDelta: snappedViewItem.visible
                            ? minDelta - halfSize
                            : minDelta + halfSize,
                        size: snappedViewItem.size,
                    };
                }

                if (typeof snapAfterIndex === 'number') {
                    const snappedViewItem = this.viewItems[snapAfterIndex];
                    const halfSize = Math.floor(
                        snappedViewItem.viewMinimumSize / 2
                    );

                    snapAfter = {
                        index: snapAfterIndex,
                        limitDelta: snappedViewItem.visible
                            ? maxDelta + halfSize
                            : maxDelta - halfSize,
                        size: snappedViewItem.size,
                    };
                }

                const onPointerMove = (event: PointerEvent) => {
                    const current =
                        this._orientation === Orientation.HORIZONTAL
                            ? event.clientX
                            : event.clientY;
                    const delta = current - start;

                    this.resize(
                        sashIndex,
                        delta,
                        sizes,
                        undefined,
                        undefined,
                        minDelta,
                        maxDelta,
                        snapBefore,
                        snapAfter
                    );
                    this.distributeEmptySpace();
                    this.layoutViews();
                };

                const end = () => {
                    for (const item of this.viewItems) {
                        item.enabled = true;
                    }

                    iframes.release();

                    this.saveProportions();

                    document.removeEventListener('pointermove', onPointerMove);
                    document.removeEventListener('pointerup', end);
                    document.removeEventListener('pointercancel', end);
                    document.removeEventListener('contextmenu', end);

                    this._onDidSashEnd.fire(undefined);
                };

                document.addEventListener('pointermove', onPointerMove);
                document.addEventListener('pointerup', end);
                document.addEventListener('pointercancel', end);
                document.addEventListener('contextmenu', end);
            };

            sash.addEventListener('pointerdown', onPointerStart);

            const sashItem: ISashItem = {
                container: sash,
                disposable: () => {
                    sash.removeEventListener('pointerdown', onPointerStart);
                    this.sashContainer.removeChild(sash);
                },
            };

            this.sashContainer.appendChild(sash);
            this.sashes.push(sashItem);
        }

        if (!skipLayout) {
            this.relayout([index]);
        }

        if (
            !skipLayout &&
            typeof size !== 'number' &&
            size.type === 'distribute'
        ) {
            this.distributeViewSizes();
        }

        this._onDidAddView.fire(view);
    }

    distributeViewSizes(): void {
        const flexibleViewItems: ViewItem[] = [];
        let flexibleSize = 0;

        for (const item of this.viewItems) {
            if (item.maximumSize - item.minimumSize > 0) {
                flexibleViewItems.push(item);
                flexibleSize += item.size;
            }
        }

        const size = Math.floor(flexibleSize / flexibleViewItems.length);

        for (const item of flexibleViewItems) {
            item.size = clamp(size, item.minimumSize, item.maximumSize);
        }

        const indexes = range(this.viewItems.length);
        const lowPriorityIndexes = indexes.filter(
            (i) => this.viewItems[i].priority === LayoutPriority.Low
        );
        const highPriorityIndexes = indexes.filter(
            (i) => this.viewItems[i].priority === LayoutPriority.High
        );

        this.relayout(lowPriorityIndexes, highPriorityIndexes);
    }

    public removeView(
        index: number,
        sizing?: Sizing,
        skipLayout = false
    ): IView {
        // Remove view
        const viewItem = this.viewItems.splice(index, 1)[0];
        viewItem.dispose();

        // Remove sash
        if (this.viewItems.length >= 1) {
            const sashIndex = Math.max(index - 1, 0);
            const sashItem = this.sashes.splice(sashIndex, 1)[0];
            sashItem.disposable();
        }

        if (!skipLayout) {
            this.relayout();
        }

        if (sizing && sizing.type === 'distribute') {
            this.distributeViewSizes();
        }

        this._onDidRemoveView.fire(viewItem.view);

        return viewItem.view;
    }

    getViewCachedVisibleSize(index: number): number | undefined {
        if (index < 0 || index >= this.viewItems.length) {
            throw new Error('Index out of bounds');
        }

        const viewItem = this.viewItems[index];
        return viewItem.cachedVisibleSize;
    }

    public moveView(from: number, to: number): void {
        const cachedVisibleSize = this.getViewCachedVisibleSize(from);
        const sizing =
            typeof cachedVisibleSize === 'undefined'
                ? this.getViewSize(from)
                : Sizing.Invisible(cachedVisibleSize);
        const view = this.removeView(from, undefined, true);
        this.addView(view, sizing, to);
    }

    public layout(size: number, orthogonalSize: number): void {
        const previousSize = Math.max(this.size, this._contentSize);
        this.size = size;
        this.orthogonalSize = orthogonalSize;

        if (!this.proportions) {
            const indexes = range(this.viewItems.length);
            const lowPriorityIndexes = indexes.filter(
                (i) => this.viewItems[i].priority === LayoutPriority.Low
            );
            const highPriorityIndexes = indexes.filter(
                (i) => this.viewItems[i].priority === LayoutPriority.High
            );

            this.resize(
                this.viewItems.length - 1,
                size - previousSize,
                undefined,
                lowPriorityIndexes,
                highPriorityIndexes
            );
        } else {
            let total = 0;

            for (let i = 0; i < this.viewItems.length; i++) {
                const item = this.viewItems[i];
                const proportion = this.proportions[i];

                if (typeof proportion === 'number') {
                    total += proportion;
                } else {
                    size -= item.size;
                }
            }

            for (let i = 0; i < this.viewItems.length; i++) {
                const item = this.viewItems[i];
                const proportion = this.proportions[i];

                if (typeof proportion === 'number' && total > 0) {
                    item.size = clamp(
                        Math.round((proportion * size) / total),
                        item.minimumSize,
                        item.maximumSize
                    );
                }
            }
        }

        this.distributeEmptySpace();
        this.layoutViews();
    }

    private relayout(
        lowPriorityIndexes?: number[],
        highPriorityIndexes?: number[]
    ): void {
        const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);

        this.resize(
            this.viewItems.length - 1,
            this._size - contentSize,
            undefined,
            lowPriorityIndexes,
            highPriorityIndexes
        );
        this.distributeEmptySpace();
        this.layoutViews();
        this.saveProportions();
    }

    private distributeEmptySpace(lowPriorityIndex?: number): void {
        const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
        let emptyDelta = this.size - contentSize;

        const indexes = range(this.viewItems.length - 1, -1);
        const lowPriorityIndexes = indexes.filter(
            (i) => this.viewItems[i].priority === LayoutPriority.Low
        );
        const highPriorityIndexes = indexes.filter(
            (i) => this.viewItems[i].priority === LayoutPriority.High
        );

        for (const index of highPriorityIndexes) {
            pushToStart(indexes, index);
        }

        for (const index of lowPriorityIndexes) {
            pushToEnd(indexes, index);
        }

        if (typeof lowPriorityIndex === 'number') {
            pushToEnd(indexes, lowPriorityIndex);
        }

        for (let i = 0; emptyDelta !== 0 && i < indexes.length; i++) {
            const item = this.viewItems[indexes[i]];
            const size = clamp(
                item.size + emptyDelta,
                item.minimumSize,
                item.maximumSize
            );
            const viewDelta = size - item.size;

            emptyDelta -= viewDelta;
            item.size = size;
        }
    }

    private saveProportions(): void {
        if (this.proportionalLayout && this._contentSize > 0) {
            this._proportions = this.viewItems.map((i) =>
                i.visible ? i.size / this._contentSize : undefined
            );
        }
    }

    /**
     * Margin explain:
     *
     * For `n` views in a splitview there will be `n-1` margins `m`.
     *
     * To fit the margins each view must reduce in size by `(m * (n - 1)) / n`.
     *
     * For each view `i` the offet must be adjusted by `m * i/(n - 1)`.
     */
    private layoutViews(): void {
        this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);

        this.updateSashEnablement();

        if (this.viewItems.length === 0) {
            return;
        }

        const visibleViewItems = this.viewItems.filter((i) => i.visible);

        const sashCount = Math.max(0, visibleViewItems.length - 1);
        const marginReducedSize =
            (this.margin * sashCount) / Math.max(1, visibleViewItems.length);

        let totalLeftOffset = 0;
        const viewLeftOffsets: number[] = [];

        const sashWidth = 4; // hardcoded in css

        const runningVisiblePanelCount = this.viewItems.reduce(
            (arr, viewItem, i) => {
                const flag = viewItem.visible ? 1 : 0;
                if (i === 0) {
                    arr.push(flag);
                } else {
                    arr.push(arr[i - 1] + flag);
                }

                return arr;
            },
            [] as number[]
        );

        // calculate both view and cash positions
        this.viewItems.forEach((view, i) => {
            totalLeftOffset += this.viewItems[i].size;
            viewLeftOffsets.push(totalLeftOffset);

            const size = view.visible ? view.size - marginReducedSize : 0;

            const visiblePanelsBeforeThisView = Math.max(
                0,
                runningVisiblePanelCount[i] - 1
            );

            const offset =
                i === 0 || visiblePanelsBeforeThisView === 0
                    ? 0
                    : viewLeftOffsets[i - 1] +
                      (visiblePanelsBeforeThisView / sashCount) *
                          marginReducedSize;

            if (i < this.viewItems.length - 1) {
                // calculate sash position
                const newSize = view.visible
                    ? offset + size - sashWidth / 2 + this.margin / 2
                    : offset;

                if (this._orientation === Orientation.HORIZONTAL) {
                    this.sashes[i].container.style.left = `${newSize}px`;
                    this.sashes[i].container.style.top = `0px`;
                }
                if (this._orientation === Orientation.VERTICAL) {
                    this.sashes[i].container.style.left = `0px`;
                    this.sashes[i].container.style.top = `${newSize}px`;
                }
            }

            // calculate view position

            if (this._orientation === Orientation.HORIZONTAL) {
                view.container.style.width = `${size}px`;
                view.container.style.left = `${offset}px`;
                view.container.style.top = '';

                view.container.style.height = '';
            }
            if (this._orientation === Orientation.VERTICAL) {
                view.container.style.height = `${size}px`;
                view.container.style.top = `${offset}px`;
                view.container.style.width = '';
                view.container.style.left = '';
            }

            view.view.layout(
                view.size - marginReducedSize,
                this._orthogonalSize
            );
        });
    }

    private findFirstSnapIndex(indexes: number[]): number | undefined {
        // visible views first
        for (const index of indexes) {
            const viewItem = this.viewItems[index];

            if (!viewItem.visible) {
                continue;
            }

            if (viewItem.snap) {
                return index;
            }
        }

        // then, hidden views
        for (const index of indexes) {
            const viewItem = this.viewItems[index];

            if (
                viewItem.visible &&
                viewItem.maximumSize - viewItem.minimumSize > 0
            ) {
                return undefined;
            }

            if (!viewItem.visible && viewItem.snap) {
                return index;
            }
        }

        return undefined;
    }

    private updateSashEnablement(): void {
        let previous = false;
        const collapsesDown = this.viewItems.map(
            (i) => (previous = i.size - i.minimumSize > 0 || previous)
        );

        previous = false;
        const expandsDown = this.viewItems.map(
            (i) => (previous = i.maximumSize - i.size > 0 || previous)
        );

        const reverseViews = [...this.viewItems].reverse();
        previous = false;
        const collapsesUp = reverseViews
            .map((i) => (previous = i.size - i.minimumSize > 0 || previous))
            .reverse();

        previous = false;
        const expandsUp = reverseViews
            .map((i) => (previous = i.maximumSize - i.size > 0 || previous))
            .reverse();

        let position = 0;
        for (let index = 0; index < this.sashes.length; index++) {
            const sash = this.sashes[index];
            const viewItem = this.viewItems[index];
            position += viewItem.size;

            const min = !(collapsesDown[index] && expandsUp[index + 1]);
            const max = !(expandsDown[index] && collapsesUp[index + 1]);

            if (min && max) {
                const upIndexes = range(index, -1);
                const downIndexes = range(index + 1, this.viewItems.length);
                const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
                const snapAfterIndex = this.findFirstSnapIndex(downIndexes);

                const snappedBefore =
                    typeof snapBeforeIndex === 'number' &&
                    !this.viewItems[snapBeforeIndex].visible;
                const snappedAfter =
                    typeof snapAfterIndex === 'number' &&
                    !this.viewItems[snapAfterIndex].visible;

                if (
                    snappedBefore &&
                    collapsesUp[index] &&
                    (position > 0 || this.startSnappingEnabled)
                ) {
                    this.updateSash(sash, SashState.MINIMUM);
                } else if (
                    snappedAfter &&
                    collapsesDown[index] &&
                    (position < this._contentSize || this.endSnappingEnabled)
                ) {
                    this.updateSash(sash, SashState.MAXIMUM);
                } else {
                    this.updateSash(sash, SashState.DISABLED);
                }
            } else if (min && !max) {
                this.updateSash(sash, SashState.MINIMUM);
            } else if (!min && max) {
                this.updateSash(sash, SashState.MAXIMUM);
            } else {
                this.updateSash(sash, SashState.ENABLED);
            }
        }
    }

    private updateSash(sash: ISashItem, state: SashState): void {
        toggleClass(
            sash.container,
            'dv-disabled',
            state === SashState.DISABLED
        );
        toggleClass(sash.container, 'dv-enabled', state === SashState.ENABLED);
        toggleClass(sash.container, 'dv-maximum', state === SashState.MAXIMUM);
        toggleClass(sash.container, 'dv-minimum', state === SashState.MINIMUM);
    }

    private resize = (
        index: number,
        delta: number,
        sizes: number[] = this.viewItems.map((x) => x.size),
        lowPriorityIndexes?: number[],
        highPriorityIndexes?: number[],
        overloadMinDelta: number = Number.NEGATIVE_INFINITY,
        overloadMaxDelta: number = Number.POSITIVE_INFINITY,
        snapBefore?: ISashDragSnapState,
        snapAfter?: ISashDragSnapState
    ): number => {
        if (index < 0 || index > this.viewItems.length) {
            return 0;
        }

        const upIndexes = range(index, -1);
        const downIndexes = range(index + 1, this.viewItems.length);
        //
        if (highPriorityIndexes) {
            for (const i of highPriorityIndexes) {
                pushToStart(upIndexes, i);
                pushToStart(downIndexes, i);
            }
        }

        if (lowPriorityIndexes) {
            for (const i of lowPriorityIndexes) {
                pushToEnd(upIndexes, i);
                pushToEnd(downIndexes, i);
            }
        }
        //
        const upItems = upIndexes.map((i) => this.viewItems[i]);
        const upSizes = upIndexes.map((i) => sizes[i]);
        //
        const downItems = downIndexes.map((i) => this.viewItems[i]);
        const downSizes = downIndexes.map((i) => sizes[i]);
        //
        const minDeltaUp = upIndexes.reduce(
            (_, i) => _ + this.viewItems[i].minimumSize - sizes[i],
            0
        );
        const maxDeltaUp = upIndexes.reduce(
            (_, i) => _ + this.viewItems[i].maximumSize - sizes[i],
            0
        );
        //
        const maxDeltaDown =
            downIndexes.length === 0
                ? Number.POSITIVE_INFINITY
                : downIndexes.reduce(
                      (_, i) => _ + sizes[i] - this.viewItems[i].minimumSize,

                      0
                  );
        const minDeltaDown =
            downIndexes.length === 0
                ? Number.NEGATIVE_INFINITY
                : downIndexes.reduce(
                      (_, i) => _ + sizes[i] - this.viewItems[i].maximumSize,
                      0
                  );
        //
        const minDelta = Math.max(minDeltaUp, minDeltaDown);
        const maxDelta = Math.min(maxDeltaDown, maxDeltaUp);
        //
        let snapped = false;
        if (snapBefore) {
            const snapView = this.viewItems[snapBefore.index];
            const visible = delta >= snapBefore.limitDelta;
            snapped = visible !== snapView.visible;
            snapView.setVisible(visible, snapBefore.size);
        }

        if (!snapped && snapAfter) {
            const snapView = this.viewItems[snapAfter.index];
            const visible = delta < snapAfter.limitDelta;
            snapped = visible !== snapView.visible;
            snapView.setVisible(visible, snapAfter.size);
        }

        if (snapped) {
            return this.resize(
                index,
                delta,
                sizes,
                lowPriorityIndexes,
                highPriorityIndexes,
                overloadMinDelta,
                overloadMaxDelta
            );
        }
        //
        const tentativeDelta = clamp(delta, minDelta, maxDelta);
        let actualDelta = 0;
        //
        let deltaUp = tentativeDelta;

        for (let i = 0; i < upItems.length; i++) {
            const item = upItems[i];
            const size = clamp(
                upSizes[i] + deltaUp,
                item.minimumSize,
                item.maximumSize
            );
            const viewDelta = size - upSizes[i];

            actualDelta += viewDelta;
            deltaUp -= viewDelta;
            item.size = size;
        }
        //
        let deltaDown = actualDelta;
        for (let i = 0; i < downItems.length; i++) {
            const item = downItems[i];
            const size = clamp(
                downSizes[i] - deltaDown,
                item.minimumSize,
                item.maximumSize
            );
            const viewDelta = size - downSizes[i];

            deltaDown += viewDelta;
            item.size = size;
        }
        //
        return delta;
    };

    private createViewContainer(): HTMLElement {
        const element = document.createElement('div');
        element.className = 'dv-view-container';
        return element;
    }

    private createSashContainer(): HTMLElement {
        const element = document.createElement('div');
        element.className = 'dv-sash-container';
        return element;
    }

    private createContainer(): HTMLElement {
        const element = document.createElement('div');
        const orientationClassname =
            this._orientation === Orientation.HORIZONTAL
                ? 'dv-horizontal'
                : 'dv-vertical';
        element.className = `dv-split-view-container ${orientationClassname}`;
        return element;
    }

    public dispose(): void {
        this._onDidSashEnd.dispose();
        this._onDidAddView.dispose();
        this._onDidRemoveView.dispose();

        for (let i = 0; i < this.element.children.length; i++) {
            if (this.element.children.item(i) === this.element) {
                this.element.removeChild(this.element);
                break;
            }
        }

        for (const viewItem of this.viewItems) {
            viewItem.dispose();
        }

        this.element.remove();
    }
}
````

## File: packages/dockview-core/src/splitview/splitviewComponent.ts
````typescript
import {
    CompositeDisposable,
    IDisposable,
    MutableDisposable,
} from '../lifecycle';
import {
    IView,
    LayoutPriority,
    Orientation,
    Sizing,
    Splitview,
    SplitViewOptions,
} from './splitview';
import { SplitviewComponentOptions } from './options';
import { BaseComponentOptions, Parameters } from '../panel/types';
import { Emitter, Event } from '../events';
import { SplitviewPanel, ISplitviewPanel } from './splitviewPanel';
import { Resizable } from '../resizable';
import { Classnames } from '../dom';

export interface SerializedSplitviewPanelData {
    id: string;
    component: string;
    minimumSize?: number;
    maximumSize?: number;
    params?: { [index: string]: any };
}

export interface SerializedSplitviewPanel {
    snap?: boolean;
    priority?: LayoutPriority;
    data: SerializedSplitviewPanelData;
    size: number;
}

export interface SerializedSplitview {
    orientation: Orientation;
    size: number;
    activeView?: string;
    views: SerializedSplitviewPanel[];
}

export interface AddSplitviewComponentOptions<T extends Parameters = Parameters>
    extends BaseComponentOptions<T> {
    index?: number;
    minimumSize?: number;
    maximumSize?: number;
}

export interface ISplitviewComponent extends IDisposable {
    readonly minimumSize: number;
    readonly maximumSize: number;
    readonly height: number;
    readonly width: number;
    readonly length: number;
    readonly orientation: Orientation;
    readonly onDidAddView: Event<IView>;
    readonly onDidRemoveView: Event<IView>;
    readonly onDidLayoutFromJSON: Event<void>;
    readonly panels: SplitviewPanel[];
    updateOptions(options: Partial<SplitViewOptions>): void;
    addPanel<T extends object = Parameters>(
        options: AddSplitviewComponentOptions<T>
    ): ISplitviewPanel;
    layout(width: number, height: number): void;
    onDidLayoutChange: Event<void>;
    toJSON(): SerializedSplitview;
    fromJSON(serializedSplitview: SerializedSplitview): void;
    focus(): void;
    getPanel(id: string): ISplitviewPanel | undefined;
    removePanel(panel: ISplitviewPanel, sizing?: Sizing): void;
    setVisible(panel: ISplitviewPanel, visible: boolean): void;
    movePanel(from: number, to: number): void;
    clear(): void;
}

/**
 * A high-level implementation of splitview that works using 'panels'
 */
export class SplitviewComponent
    extends Resizable
    implements ISplitviewComponent
{
    private readonly _splitviewChangeDisposable = new MutableDisposable();
    private _splitview!: Splitview;
    private _activePanel: SplitviewPanel | undefined;
    private readonly _panels = new Map<string, IDisposable>();
    private _options: SplitviewComponentOptions;

    private readonly _onDidLayoutfromJSON = new Emitter<void>();
    readonly onDidLayoutFromJSON: Event<void> = this._onDidLayoutfromJSON.event;

    private readonly _onDidAddView = new Emitter<IView>();
    readonly onDidAddView = this._onDidAddView.event;

    private readonly _onDidRemoveView = new Emitter<IView>();
    readonly onDidRemoveView = this._onDidRemoveView.event;

    private readonly _onDidLayoutChange = new Emitter<void>();
    readonly onDidLayoutChange: Event<void> = this._onDidLayoutChange.event;

    private readonly _classNames: Classnames;

    get panels(): SplitviewPanel[] {
        return this.splitview.getViews();
    }

    get options(): SplitviewComponentOptions {
        return this._options;
    }

    get length(): number {
        return this._panels.size;
    }

    get orientation(): Orientation {
        return this.splitview.orientation;
    }

    get splitview(): Splitview {
        return this._splitview;
    }

    set splitview(value: Splitview) {
        if (this._splitview) {
            this._splitview.dispose();
        }

        this._splitview = value;

        this._splitviewChangeDisposable.value = new CompositeDisposable(
            this._splitview.onDidSashEnd(() => {
                this._onDidLayoutChange.fire(undefined);
            }),
            this._splitview.onDidAddView((e) => this._onDidAddView.fire(e)),
            this._splitview.onDidRemoveView((e) =>
                this._onDidRemoveView.fire(e)
            )
        );
    }

    get minimumSize(): number {
        return this.splitview.minimumSize;
    }

    get maximumSize(): number {
        return this.splitview.maximumSize;
    }

    get height(): number {
        return this.splitview.orientation === Orientation.HORIZONTAL
            ? this.splitview.orthogonalSize
            : this.splitview.size;
    }

    get width(): number {
        return this.splitview.orientation === Orientation.HORIZONTAL
            ? this.splitview.size
            : this.splitview.orthogonalSize;
    }

    constructor(container: HTMLElement, options: SplitviewComponentOptions) {
        super(document.createElement('div'), options.disableAutoResizing);
        this.element.style.height = '100%';
        this.element.style.width = '100%';

        this._classNames = new Classnames(this.element);
        this._classNames.setClassNames(options.className ?? '');

        // the container is owned by the third-party, do not modify/delete it
        container.appendChild(this.element);

        this._options = options;

        this.splitview = new Splitview(this.element, options);

        this.addDisposables(
            this._onDidAddView,
            this._onDidLayoutfromJSON,
            this._onDidRemoveView,
            this._onDidLayoutChange
        );
    }

    updateOptions(options: Partial<SplitviewComponentOptions>): void {
        if ('className' in options) {
            this._classNames.setClassNames(options.className ?? '');
        }

        if ('disableResizing' in options) {
            this.disableResizing = options.disableAutoResizing ?? false;
        }

        if (typeof options.orientation === 'string') {
            this.splitview.orientation = options.orientation!;
        }

        this._options = { ...this.options, ...options };

        this.splitview.layout(
            this.splitview.size,
            this.splitview.orthogonalSize
        );
    }

    focus(): void {
        this._activePanel?.focus();
    }

    movePanel(from: number, to: number): void {
        this.splitview.moveView(from, to);
    }

    setVisible(panel: SplitviewPanel, visible: boolean): void {
        const index = this.panels.indexOf(panel);
        this.splitview.setViewVisible(index, visible);
    }

    setActive(panel: SplitviewPanel, skipFocus?: boolean): void {
        this._activePanel = panel;

        this.panels
            .filter((v) => v !== panel)
            .forEach((v) => {
                v.api._onDidActiveChange.fire({ isActive: false });
                if (!skipFocus) {
                    v.focus();
                }
            });
        panel.api._onDidActiveChange.fire({ isActive: true });
        if (!skipFocus) {
            panel.focus();
        }
    }

    removePanel(panel: SplitviewPanel, sizing?: Sizing): void {
        const item = this._panels.get(panel.id);

        if (!item) {
            throw new Error(`unknown splitview panel ${panel.id}`);
        }

        item.dispose();

        this._panels.delete(panel.id);

        const index = this.panels.findIndex((_) => _ === panel);
        const removedView = this.splitview.removeView(index, sizing);
        removedView.dispose();

        const panels = this.panels;
        if (panels.length > 0) {
            this.setActive(panels[panels.length - 1]);
        }
    }

    getPanel(id: string): SplitviewPanel | undefined {
        return this.panels.find((view) => view.id === id);
    }

    addPanel<T extends object = Parameters>(
        options: AddSplitviewComponentOptions<T>
    ): SplitviewPanel {
        if (this._panels.has(options.id)) {
            throw new Error(`panel ${options.id} already exists`);
        }

        const view = this.options.createComponent({
            id: options.id,
            name: options.component,
        });

        view.orientation = this.splitview.orientation;

        view.init({
            params: options.params ?? {},
            minimumSize: options.minimumSize,
            maximumSize: options.maximumSize,
            snap: options.snap,
            priority: options.priority,
            accessor: this,
        });

        const size: Sizing | number =
            typeof options.size === 'number' ? options.size : Sizing.Distribute;
        const index =
            typeof options.index === 'number' ? options.index : undefined;

        this.splitview.addView(view, size, index);

        this.doAddView(view);
        this.setActive(view);

        return view;
    }

    layout(width: number, height: number): void {
        const [size, orthogonalSize] =
            this.splitview.orientation === Orientation.HORIZONTAL
                ? [width, height]
                : [height, width];
        this.splitview.layout(size, orthogonalSize);
    }

    private doAddView(view: SplitviewPanel): void {
        const disposable = view.api.onDidFocusChange((event) => {
            if (!event.isFocused) {
                return;
            }
            this.setActive(view, true);
        });

        this._panels.set(view.id, disposable);
    }

    toJSON(): SerializedSplitview {
        const views: SerializedSplitviewPanel[] = this.splitview
            .getViews<SplitviewPanel>()
            .map((view, i) => {
                const size = this.splitview.getViewSize(i);
                return {
                    size,
                    data: view.toJSON(),
                    snap: !!view.snap,
                    priority: view.priority,
                };
            });

        return {
            views,
            activeView: this._activePanel?.id,
            size: this.splitview.size,
            orientation: this.splitview.orientation,
        };
    }

    fromJSON(serializedSplitview: SerializedSplitview): void {
        this.clear();

        const { views, orientation, size, activeView } = serializedSplitview;

        const queue: Function[] = [];

        // take note of the existing dimensions
        const width = this.width;
        const height = this.height;

        this.splitview = new Splitview(this.element, {
            orientation,
            proportionalLayout: this.options.proportionalLayout,
            descriptor: {
                size,
                views: views.map((view) => {
                    const data = view.data;

                    if (this._panels.has(data.id)) {
                        throw new Error(`panel ${data.id} already exists`);
                    }

                    const panel = this.options.createComponent({
                        id: data.id,
                        name: data.component,
                    });

                    queue.push(() => {
                        panel.init({
                            params: data.params ?? {},
                            minimumSize: data.minimumSize,
                            maximumSize: data.maximumSize,
                            snap: view.snap,
                            priority: view.priority,
                            accessor: this,
                        });
                    });

                    panel.orientation = orientation;

                    this.doAddView(panel);
                    setTimeout(() => {
                        // the original onDidAddView events are missed since they are fired before we can subcribe to them
                        this._onDidAddView.fire(panel);
                    }, 0);

                    return { size: view.size, view: panel };
                }),
            },
        });

        this.layout(width, height);

        queue.forEach((f) => f());

        if (typeof activeView === 'string') {
            const panel = this.getPanel(activeView);
            if (panel) {
                this.setActive(panel);
            }
        }

        this._onDidLayoutfromJSON.fire();
    }

    clear(): void {
        for (const disposable of this._panels.values()) {
            disposable.dispose();
        }

        this._panels.clear();

        while (this.splitview.length > 0) {
            const view = this.splitview.removeView(0, Sizing.Distribute, true);
            view.dispose();
        }
    }

    dispose(): void {
        for (const disposable of this._panels.values()) {
            disposable.dispose();
        }

        this._panels.clear();

        const views = this.splitview.getViews();

        this._splitviewChangeDisposable.dispose();
        this.splitview.dispose();

        for (const view of views) {
            view.dispose();
        }

        this.element.remove();

        super.dispose();
    }
}
````

## File: packages/dockview-core/src/splitview/splitviewPanel.ts
````typescript
import { PanelViewInitParameters } from './options';
import {
    BasePanelView,
    BasePanelViewExported,
} from '../gridview/basePanelView';
import { SplitviewPanelApiImpl } from '../api/splitviewPanelApi';
import { LayoutPriority, Orientation } from './splitview';
import { FunctionOrValue } from '../types';
import { Emitter, Event } from '../events';

export interface ISplitviewPanel
    extends BasePanelViewExported<SplitviewPanelApiImpl> {
    readonly priority: LayoutPriority | undefined;
    readonly minimumSize: number;
    readonly maximumSize: number;
    readonly snap: boolean;
    readonly orientation: Orientation;
}

export abstract class SplitviewPanel
    extends BasePanelView<SplitviewPanelApiImpl>
    implements ISplitviewPanel
{
    private _evaluatedMinimumSize = 0;
    private _evaluatedMaximumSize = Number.POSITIVE_INFINITY;

    private _minimumSize: FunctionOrValue<number> = 0;
    private _maximumSize: FunctionOrValue<number> = Number.POSITIVE_INFINITY;
    private _priority?: LayoutPriority;
    private _snap = false;

    private _orientation?: Orientation;

    private readonly _onDidChange = new Emitter<{
        size?: number;
        orthogonalSize?: number;
    }>();
    readonly onDidChange: Event<{ size?: number; orthogonalSize?: number }> =
        this._onDidChange.event;

    get priority(): LayoutPriority | undefined {
        return this._priority;
    }

    set orientation(value: Orientation) {
        this._orientation = value;
    }

    get orientation(): Orientation {
        return this._orientation!;
    }

    get minimumSize(): number {
        const size =
            typeof this._minimumSize === 'function'
                ? this._minimumSize()
                : this._minimumSize;

        if (size !== this._evaluatedMinimumSize) {
            this._evaluatedMinimumSize = size;
            this.updateConstraints();
        }

        return size;
    }

    get maximumSize(): number {
        const size =
            typeof this._maximumSize === 'function'
                ? this._maximumSize()
                : this._maximumSize;

        if (size !== this._evaluatedMaximumSize) {
            this._evaluatedMaximumSize = size;
            this.updateConstraints();
        }

        return size;
    }

    get snap(): boolean {
        return this._snap;
    }

    constructor(id: string, componentName: string) {
        super(id, componentName, new SplitviewPanelApiImpl(id, componentName));

        this.api.initialize(this);

        this.addDisposables(
            this._onDidChange,
            this.api.onWillVisibilityChange((event) => {
                const { isVisible } = event;
                const { accessor } = this._params as PanelViewInitParameters;
                accessor.setVisible(this, isVisible);
            }),
            this.api.onActiveChange(() => {
                const { accessor } = this._params as PanelViewInitParameters;
                accessor.setActive(this);
            }),
            this.api.onDidConstraintsChangeInternal((event) => {
                if (
                    typeof event.minimumSize === 'number' ||
                    typeof event.minimumSize === 'function'
                ) {
                    this._minimumSize = event.minimumSize;
                }
                if (
                    typeof event.maximumSize === 'number' ||
                    typeof event.maximumSize === 'function'
                ) {
                    this._maximumSize = event.maximumSize;
                }
                this.updateConstraints();
            }),
            this.api.onDidSizeChange((event) => {
                this._onDidChange.fire({ size: event.size });
            })
        );
    }

    setVisible(isVisible: boolean): void {
        this.api._onDidVisibilityChange.fire({ isVisible });
    }

    setActive(isActive: boolean): void {
        this.api._onDidActiveChange.fire({ isActive });
    }

    layout(size: number, orthogonalSize: number): void {
        const [width, height] =
            this.orientation === Orientation.HORIZONTAL
                ? [size, orthogonalSize]
                : [orthogonalSize, size];
        super.layout(width, height);
    }

    init(parameters: PanelViewInitParameters): void {
        super.init(parameters);

        this._priority = parameters.priority;

        if (parameters.minimumSize) {
            this._minimumSize = parameters.minimumSize;
        }
        if (parameters.maximumSize) {
            this._maximumSize = parameters.maximumSize;
        }
        if (parameters.snap) {
            this._snap = parameters.snap;
        }
    }

    toJSON() {
        const maximum = (value: number) =>
            value === Number.MAX_SAFE_INTEGER ||
            value === Number.POSITIVE_INFINITY
                ? undefined
                : value;
        const minimum = (value: number) => (value <= 0 ? undefined : value);

        return {
            ...super.toJSON(),
            minimumSize: minimum(this.minimumSize),
            maximumSize: maximum(this.maximumSize),
        };
    }

    private updateConstraints(): void {
        this.api._onDidConstraintsChange.fire({
            maximumSize: this._evaluatedMaximumSize,
            minimumSize: this._evaluatedMinimumSize,
        });
    }
}
````

## File: packages/dockview-core/src/splitview/viewItem.ts
````typescript
import { IDisposable } from '../lifecycle';
import { clamp } from '../math';
import { IView, LayoutPriority } from './splitview';

export class ViewItem {
    private _size: number;
    private _cachedVisibleSize: number | undefined = undefined;

    set size(size: number) {
        this._size = size;
    }

    get size(): number {
        return this._size;
    }

    get cachedVisibleSize(): number | undefined {
        return this._cachedVisibleSize;
    }

    get visible(): boolean {
        return typeof this._cachedVisibleSize === 'undefined';
    }

    get minimumSize(): number {
        return this.visible ? this.view.minimumSize : 0;
    }
    get viewMinimumSize(): number {
        return this.view.minimumSize;
    }

    get maximumSize(): number {
        return this.visible ? this.view.maximumSize : 0;
    }
    get viewMaximumSize(): number {
        return this.view.maximumSize;
    }

    get priority(): LayoutPriority | undefined {
        return this.view.priority;
    }
    get snap(): boolean {
        return !!this.view.snap;
    }

    set enabled(enabled: boolean) {
        this.container.style.pointerEvents = enabled ? '' : 'none';
    }

    constructor(
        public container: HTMLElement,
        public view: IView,
        size: number | { cachedVisibleSize: number },
        private readonly disposable: IDisposable
    ) {
        if (typeof size === 'number') {
            this._size = size;
            this._cachedVisibleSize = undefined;
            container.classList.add('visible');
        } else {
            this._size = 0;
            this._cachedVisibleSize = size.cachedVisibleSize;
        }
    }

    setVisible(visible: boolean, size?: number): void {
        if (visible === this.visible) {
            return;
        }

        if (visible) {
            this.size = clamp(
                this._cachedVisibleSize ?? 0,
                this.viewMinimumSize,
                this.viewMaximumSize
            );
            this._cachedVisibleSize = undefined;
        } else {
            this._cachedVisibleSize =
                typeof size === 'number' ? size : this.size;
            this.size = 0;
        }

        this.container.classList.toggle('visible', visible);

        if (this.view.setVisible) {
            this.view.setVisible(visible);
        }
    }

    dispose(): IView {
        this.disposable.dispose();
        return this.view;
    }
}
````

## File: packages/dockview-core/src/array.ts
````typescript
export function tail<T>(arr: T[]): [T[], T] {
    if (arr.length === 0) {
        throw new Error('Invalid tail call');
    }

    return [arr.slice(0, arr.length - 1), arr[arr.length - 1]];
}

export function last<T>(arr: T[]): T | undefined {
    return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

export function sequenceEquals<T>(arr1: T[], arr2: T[]): boolean {
    if (arr1.length !== arr2.length) {
        return false;
    }

    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Pushes an element to the start of the array, if found.
 */
export function pushToStart<T>(arr: T[], value: T): void {
    const index = arr.indexOf(value);

    if (index > -1) {
        arr.splice(index, 1);
        arr.unshift(value);
    }
}

/**
 * Pushes an element to the end of the array, if found.
 */
export function pushToEnd<T>(arr: T[], value: T): void {
    const index = arr.indexOf(value);

    if (index > -1) {
        arr.splice(index, 1);
        arr.push(value);
    }
}

export function firstIndex<T>(
    array: T[] | ReadonlyArray<T>,
    fn: (item: T) => boolean
): number {
    for (let i = 0; i < array.length; i++) {
        const element = array[i];

        if (fn(element)) {
            return i;
        }
    }

    return -1;
}

export function remove<T>(array: T[], value: T): boolean {
    const index = array.findIndex((t) => t === value);

    if (index > -1) {
        array.splice(index, 1);
        return true;
    }
    return false;
}
````

## File: packages/dockview-core/src/constants.ts
````typescript
export const DEFAULT_FLOATING_GROUP_OVERFLOW_SIZE = 100;

export const DEFAULT_FLOATING_GROUP_POSITION = { left: 100, top: 100, width: 300, height: 300 };

export const DESERIALIZATION_POPOUT_DELAY_MS = 100
````

## File: packages/dockview-core/src/dom.ts
````typescript
import {
    Event as DockviewEvent,
    Emitter,
    addDisposableListener,
} from './events';
import { IDisposable, CompositeDisposable } from './lifecycle';

export interface OverflowEvent {
    hasScrollX: boolean;
    hasScrollY: boolean;
}

export class OverflowObserver extends CompositeDisposable {
    private readonly _onDidChange = new Emitter<OverflowEvent>();
    readonly onDidChange = this._onDidChange.event;

    private _value: OverflowEvent | null = null;

    constructor(el: HTMLElement) {
        super();

        this.addDisposables(
            this._onDidChange,
            watchElementResize(el, (entry) => {
                const hasScrollX =
                    entry.target.scrollWidth > entry.target.clientWidth;

                const hasScrollY =
                    entry.target.scrollHeight > entry.target.clientHeight;

                this._value = { hasScrollX, hasScrollY };
                this._onDidChange.fire(this._value);
            })
        );
    }
}

export function watchElementResize(
    element: HTMLElement,
    cb: (entry: ResizeObserverEntry) => void
): IDisposable {
    const observer = new ResizeObserver((entires) => {
        /**
         * Fast browser window resize produces Error: ResizeObserver loop limit exceeded.
         * The error isn't visible in browser console, doesn't affect functionality, but degrades performance.
         * See https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded/58701523#58701523
         */
        requestAnimationFrame(() => {
            const firstEntry = entires[0];
            cb(firstEntry);
        });
    });

    observer.observe(element);

    return {
        dispose: () => {
            observer.unobserve(element);
            observer.disconnect();
        },
    };
}

export const removeClasses = (
    element: HTMLElement,
    ...classes: string[]
): void => {
    for (const classname of classes) {
        if (element.classList.contains(classname)) {
            element.classList.remove(classname);
        }
    }
};

export const addClasses = (
    element: HTMLElement,
    ...classes: string[]
): void => {
    for (const classname of classes) {
        if (!element.classList.contains(classname)) {
            element.classList.add(classname);
        }
    }
};

export const toggleClass = (
    element: HTMLElement,
    className: string,
    isToggled: boolean
): void => {
    const hasClass = element.classList.contains(className);
    if (isToggled && !hasClass) {
        element.classList.add(className);
    }
    if (!isToggled && hasClass) {
        element.classList.remove(className);
    }
};

export function isAncestor(
    testChild: Node | null,
    testAncestor: Node | null
): boolean {
    while (testChild) {
        if (testChild === testAncestor) {
            return true;
        }
        testChild = testChild.parentNode;
    }

    return false;
}

export function getElementsByTagName(
    tag: string,
    document: ParentNode
): HTMLElement[] {
    return Array.prototype.slice.call(document.querySelectorAll(tag), 0);
}

export interface IFocusTracker extends IDisposable {
    readonly onDidFocus: DockviewEvent<void>;
    readonly onDidBlur: DockviewEvent<void>;
    refreshState?(): void;
}

export function trackFocus(element: HTMLElement): IFocusTracker {
    return new FocusTracker(element);
}

/**
 * Track focus on an element. Ensure tabIndex is set when an HTMLElement is not focusable by default
 */
class FocusTracker extends CompositeDisposable implements IFocusTracker {
    private readonly _onDidFocus = new Emitter<void>();
    public readonly onDidFocus: DockviewEvent<void> = this._onDidFocus.event;

    private readonly _onDidBlur = new Emitter<void>();
    public readonly onDidBlur: DockviewEvent<void> = this._onDidBlur.event;

    private readonly _refreshStateHandler: () => void;

    constructor(element: HTMLElement) {
        super();

        this.addDisposables(this._onDidFocus, this._onDidBlur);

        let hasFocus = isAncestor(document.activeElement, <HTMLElement>element);
        let loosingFocus = false;

        const onFocus = () => {
            loosingFocus = false;
            if (!hasFocus) {
                hasFocus = true;
                this._onDidFocus.fire();
            }
        };

        const onBlur = () => {
            if (hasFocus) {
                loosingFocus = true;
                window.setTimeout(() => {
                    if (loosingFocus) {
                        loosingFocus = false;
                        hasFocus = false;
                        this._onDidBlur.fire();
                    }
                }, 0);
            }
        };

        this._refreshStateHandler = () => {
            const currentNodeHasFocus = isAncestor(
                document.activeElement,
                <HTMLElement>element
            );
            if (currentNodeHasFocus !== hasFocus) {
                if (hasFocus) {
                    onBlur();
                } else {
                    onFocus();
                }
            }
        };

        this.addDisposables(
            addDisposableListener(element, 'focus', onFocus, true)
        );
        this.addDisposables(
            addDisposableListener(element, 'blur', onBlur, true)
        );
    }

    refreshState(): void {
        this._refreshStateHandler();
    }
}

// quasi: apparently, but not really; seemingly
const QUASI_PREVENT_DEFAULT_KEY = 'dv-quasiPreventDefault';

// mark an event directly for other listeners to check
export function quasiPreventDefault(event: Event): void {
    (event as any)[QUASI_PREVENT_DEFAULT_KEY] = true;
}

// check if this event has been marked
export function quasiDefaultPrevented(event: Event): boolean {
    return (event as any)[QUASI_PREVENT_DEFAULT_KEY];
}

export function addStyles(document: Document, styleSheetList: StyleSheetList) {
    const styleSheets = Array.from(styleSheetList);

    for (const styleSheet of styleSheets) {
        if (styleSheet.href) {
            const link = document.createElement('link');
            link.href = styleSheet.href;
            link.type = styleSheet.type;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }

        let cssTexts: string[] = [];

        try {
            if (styleSheet.cssRules) {
                cssTexts = Array.from(styleSheet.cssRules).map(
                    (rule) => rule.cssText
                );
            }
        } catch (err) {
            // security errors (lack of permissions), ignore
        }

        for (const rule of cssTexts) {
            const style = document.createElement('style');
            style.appendChild(document.createTextNode(rule));
            document.head.appendChild(style);
        }
    }
}

export function getDomNodePagePosition(domNode: Element): {
    left: number;
    top: number;
    width: number;
    height: number;
} {
    const { left, top, width, height } = domNode.getBoundingClientRect();
    return {
        left: left + window.scrollX,
        top: top + window.scrollY,
        width: width,
        height: height,
    };
}

/**
 * Check whether an element is in the DOM (including the Shadow DOM)
 * @see https://terodox.tech/how-to-tell-if-an-element-is-in-the-dom-including-the-shadow-dom/
 */
export function isInDocument(element: Element): boolean {
    let currentElement: Element | ParentNode = element;

    while (currentElement?.parentNode) {
        if (currentElement.parentNode === document) {
            return true;
        } else if (currentElement.parentNode instanceof DocumentFragment) {
            // handle shadow DOMs
            currentElement = (currentElement.parentNode as ShadowRoot).host;
        } else {
            currentElement = currentElement.parentNode;
        }
    }

    return false;
}

export function addTestId(element: HTMLElement, id: string): void {
    element.setAttribute('data-testid', id);
}

/**
 * Should be more efficient than element.querySelectorAll("*") since there
 * is no need to store every element in-memory using this approach
 */
function allTagsNamesInclusiveOfShadowDoms(tagNames: string[]) {
    const iframes: HTMLElement[] = [];

    function findIframesInNode(node: Element) {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (tagNames.includes(node.tagName)) {
                iframes.push(node as HTMLElement);
            }

            if (node.shadowRoot) {
                findIframesInNode(<any>node.shadowRoot);
            }

            for (const child of node.children) {
                findIframesInNode(child);
            }
        }
    }

    findIframesInNode(document.documentElement);

    return iframes;
}

export function disableIframePointEvents(rootNode: ParentNode = document) {
    const iframes = allTagsNamesInclusiveOfShadowDoms(['IFRAME', 'WEBVIEW']);

    const original = new WeakMap<HTMLElement, string>(); // don't hold onto HTMLElement references longer than required

    for (const iframe of iframes) {
        original.set(iframe, iframe.style.pointerEvents);
        iframe.style.pointerEvents = 'none';
    }

    return {
        release: () => {
            for (const iframe of iframes) {
                iframe.style.pointerEvents = original.get(iframe) ?? 'auto';
            }
            iframes.splice(0, iframes.length); // don't hold onto HTMLElement references longer than required
        },
    };
}

export function getDockviewTheme(element: HTMLElement): string | undefined {
    function toClassList(element: HTMLElement) {
        const list: string[] = [];

        for (let i = 0; i < element.classList.length; i++) {
            list.push(element.classList.item(i)!);
        }

        return list;
    }

    let theme: string | undefined = undefined;
    let parent: HTMLElement | null = element;

    while (parent !== null) {
        theme = toClassList(parent).find((cls) =>
            cls.startsWith('dockview-theme-')
        );
        if (typeof theme === 'string') {
            break;
        }
        parent = parent.parentElement;
    }

    return theme;
}

export class Classnames {
    private _classNames: string[] = [];

    constructor(private readonly element: HTMLElement) {}

    setClassNames(classNames: string) {
        for (const className of this._classNames) {
            toggleClass(this.element, className, false);
        }

        this._classNames = classNames
            .split(' ')
            .filter((v) => v.trim().length > 0);

        for (const className of this._classNames) {
            toggleClass(this.element, className, true);
        }
    }
}

const DEBOUCE_DELAY = 100;

export function isChildEntirelyVisibleWithinParent(
    child: HTMLElement,
    parent: HTMLElement
): boolean {
    //
    const childPosition = getDomNodePagePosition(child);
    const parentPosition = getDomNodePagePosition(parent);

    if (childPosition.left < parentPosition.left) {
        return false;
    }

    if (
        childPosition.left + childPosition.width >
        parentPosition.left + parentPosition.width
    ) {
        return false;
    }

    return true;
}

export function onDidWindowMoveEnd(window: Window): Emitter<void> {
    const emitter = new Emitter<void>();

    let previousScreenX = window.screenX;
    let previousScreenY = window.screenY;

    let timeout: any;

    const checkMovement = () => {
        if (window.closed) {
            return;
        }

        const currentScreenX = window.screenX;
        const currentScreenY = window.screenY;

        if (
            currentScreenX !== previousScreenX ||
            currentScreenY !== previousScreenY
        ) {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                emitter.fire();
            }, DEBOUCE_DELAY);

            previousScreenX = currentScreenX;
            previousScreenY = currentScreenY;
        }

        requestAnimationFrame(checkMovement);
    };

    checkMovement();

    return emitter;
}

export function onDidWindowResizeEnd(element: Window, cb: () => void) {
    let resizeTimeout: any;

    const disposable = new CompositeDisposable(
        addDisposableListener(element, 'resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                cb();
            }, DEBOUCE_DELAY);
        })
    );

    return disposable;
}

export function shiftAbsoluteElementIntoView(
    element: HTMLElement,
    root: HTMLElement,
    options: { buffer: number } = { buffer: 10 }
) {
    const buffer = options.buffer;
    const rect = element.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();

    let translateX = 0;
    let translateY = 0;

    const left = rect.left - rootRect.left;
    const top = rect.top - rootRect.top;
    const bottom = rect.bottom - rootRect.bottom;
    const right = rect.right - rootRect.right;

    // Check horizontal overflow
    if (left < buffer) {
        translateX = buffer - left;
    } else if (right > buffer) {
        translateX = -buffer - right;
    }

    // Check vertical overflow
    if (top < buffer) {
        translateY = buffer - top;
    } else if (bottom > buffer) {
        translateY = -bottom - buffer;
    }

    // Apply the translation if needed
    if (translateX !== 0 || translateY !== 0) {
        element.style.transform = `translate(${translateX}px, ${translateY}px)`;
    }
}

export function findRelativeZIndexParent(el: HTMLElement): HTMLElement | null {
    let tmp: HTMLElement | null = el;

    while (tmp && (tmp.style.zIndex === 'auto' || tmp.style.zIndex === '')) {
        tmp = tmp.parentElement;
    }

    return tmp;
}
````

## File: packages/dockview-core/src/events.ts
````typescript
import { IDisposable } from './lifecycle';

export interface Event<T> {
    (listener: (e: T) => any): IDisposable;
}

export interface EmitterOptions {
    readonly replay?: boolean;
}

export namespace Event {
    export const any = <T>(...children: Event<T>[]): Event<T> => {
        return (listener: (e: T) => void) => {
            const disposables = children.map((child) => child(listener));

            return {
                dispose: () => {
                    disposables.forEach((d) => {
                        d.dispose();
                    });
                },
            };
        };
    };
}

export interface IDockviewEvent {
    readonly defaultPrevented: boolean;
    preventDefault(): void;
}

export class DockviewEvent implements IDockviewEvent {
    private _defaultPrevented = false;

    get defaultPrevented(): boolean {
        return this._defaultPrevented;
    }

    preventDefault(): void {
        this._defaultPrevented = true;
    }
}

export interface IAcceptableEvent {
    readonly isAccepted: boolean;
    accept(): void;
}

export class AcceptableEvent implements IAcceptableEvent {
    private _isAccepted = false;

    get isAccepted(): boolean {
        return this._isAccepted;
    }

    accept(): void {
        this._isAccepted = true;
    }
}

class LeakageMonitor {
    readonly events = new Map<Event<any>, Stacktrace>();

    get size(): number {
        return this.events.size;
    }

    add<T>(event: Event<T>, stacktrace: Stacktrace): void {
        this.events.set(event, stacktrace);
    }

    delete<T>(event: Event<T>): void {
        this.events.delete(event);
    }

    clear(): void {
        this.events.clear();
    }
}

class Stacktrace {
    static create(): Stacktrace {
        return new Stacktrace(new Error().stack ?? '');
    }

    private constructor(readonly value: string) {}

    print(): void {
        console.warn('dockview: stacktrace', this.value);
    }
}

class Listener<T> {
    constructor(
        readonly callback: (t: T) => void,
        readonly stacktrace: Stacktrace | undefined
    ) {}
}

// relatively simple event emitter taken from https://github.com/microsoft/vscode/blob/master/src/vs/base/common/event.ts
export class Emitter<T> implements IDisposable {
    private _event?: Event<T>;

    private _last?: T;
    private _listeners: Listener<any>[] = [];
    private _disposed = false;

    static ENABLE_TRACKING = false;
    static readonly MEMORY_LEAK_WATCHER = new LeakageMonitor();

    static setLeakageMonitorEnabled(isEnabled: boolean): void {
        if (isEnabled !== Emitter.ENABLE_TRACKING) {
            Emitter.MEMORY_LEAK_WATCHER.clear();
        }
        Emitter.ENABLE_TRACKING = isEnabled;
    }

    get value(): T | undefined {
        return this._last;
    }

    constructor(private readonly options?: EmitterOptions) {}

    get event(): Event<T> {
        if (!this._event) {
            this._event = (callback: (e: T) => void): IDisposable => {
                if (this.options?.replay && this._last !== undefined) {
                    callback(this._last);
                }

                const listener = new Listener(
                    callback,
                    Emitter.ENABLE_TRACKING ? Stacktrace.create() : undefined
                );
                this._listeners.push(listener);

                return {
                    dispose: () => {
                        const index = this._listeners.indexOf(listener);
                        if (index > -1) {
                            this._listeners.splice(index, 1);
                        } else if (Emitter.ENABLE_TRACKING) {
                            // console.warn(
                            //     `dockview: listener already disposed`,
                            //     Stacktrace.create().print()
                            // );
                        }
                    },
                };
            };

            if (Emitter.ENABLE_TRACKING) {
                Emitter.MEMORY_LEAK_WATCHER.add(
                    this._event,
                    Stacktrace.create()
                );
            }
        }
        return this._event;
    }

    public fire(e: T): void {
        if(this.options?.replay){
            this._last = e;
        }
        for (const listener of this._listeners) {
            listener.callback(e);
        }
    }

    public dispose(): void {
        if (!this._disposed) {
            this._disposed = true;

            if (this._listeners.length > 0) {
                if (Emitter.ENABLE_TRACKING) {
                    queueMicrotask(() => {
                        // don't check until stack of execution is completed to allow for out-of-order disposals within the same execution block
                        for (const listener of this._listeners) {
                            console.warn(
                                'dockview: stacktrace',
                                listener.stacktrace?.print()
                            );
                        }
                    });
                }

                this._listeners = [];
            }

            if (Emitter.ENABLE_TRACKING && this._event) {
                Emitter.MEMORY_LEAK_WATCHER.delete(this._event);
            }
        }
    }
}

export function addDisposableListener<K extends keyof WindowEventMap>(
    element: Window,
    type: K,
    listener: (this: Window, ev: WindowEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
): IDisposable;
export function addDisposableListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
): IDisposable;
export function addDisposableListener<
    K extends keyof HTMLElementEventMap | keyof WindowEventMap
>(
    element: HTMLElement | Window,
    type: K,
    listener: (
        this: K extends keyof HTMLElementEventMap ? HTMLElement : Window,
        ev: K extends keyof HTMLElementEventMap
            ? HTMLElementEventMap[K]
            : K extends keyof WindowEventMap
            ? WindowEventMap[K]
            : never
    ) => any,
    options?: boolean | AddEventListenerOptions
): IDisposable {
    element.addEventListener(type, <any>listener, options);

    return {
        dispose: () => {
            element.removeEventListener(type, <any>listener, options);
        },
    };
}

/**
 *
 * Event Emitter that fires events from a Microtask callback, only one event will fire per event-loop cycle.
 *
 * It's kind of like using an `asapScheduler` in RxJs with additional logic to only fire once per event-loop cycle.
 * This implementation exists to avoid external dependencies.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/queueMicrotask
 * @see https://rxjs.dev/api/index/const/asapScheduler
 */
export class AsapEvent implements IDisposable {
    private readonly _onFired = new Emitter<void>();
    private _currentFireCount = 0;
    private _queued = false;

    readonly onEvent: Event<void> = (e) => {
        /**
         * when the event is first subscribed to take note of the current fire count
         */
        const fireCountAtTimeOfEventSubscription = this._currentFireCount;

        return this._onFired.event(() => {
            /**
             * if the current fire count is greater than the fire count at event subscription
             * then the event has been fired since we subscribed and it's ok to "on_next" the event.
             *
             * if the count is not greater then what we are recieving is an event from the microtask
             * queue that was triggered before we actually subscribed and therfore we should ignore it.
             */
            if (this._currentFireCount > fireCountAtTimeOfEventSubscription) {
                e();
            }
        });
    };

    fire(): void {
        this._currentFireCount++;

        if (this._queued) {
            return;
        }

        this._queued = true;

        queueMicrotask(() => {
            this._queued = false;
            this._onFired.fire();
        });
    }

    dispose(): void {
        this._onFired.dispose();
    }
}
````

## File: packages/dockview-core/src/framwork.ts
````typescript
import { Parameters } from "./panel/types";

export interface PanelParameters<T extends {} = Parameters> {
    params: T;
}
````

## File: packages/dockview-core/src/index.ts
````typescript
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
````

## File: packages/dockview-core/src/lifecycle.ts
````typescript
export interface IDisposable {
    dispose(): void;
}

export interface IValueDisposable<T> {
    readonly value: T;
    readonly disposable: IDisposable;
}

export namespace Disposable {
    export const NONE: IDisposable = {
        dispose: () => {
            // noop
        },
    };

    export function from(func: () => void): IDisposable {
        return {
            dispose: () => {
                func();
            },
        };
    }
}

export class CompositeDisposable {
    private _disposables: IDisposable[];
    private _isDisposed = false;

    get isDisposed(): boolean {
        return this._isDisposed;
    }

    constructor(...args: IDisposable[]) {
        this._disposables = args;
    }

    public addDisposables(...args: IDisposable[]): void {
        args.forEach((arg) => this._disposables.push(arg));
    }

    public dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._isDisposed = true;
        this._disposables.forEach((arg) => arg.dispose());
        this._disposables = [];
    }
}

export class MutableDisposable implements IDisposable {
    private _disposable = Disposable.NONE;

    set value(disposable: IDisposable) {
        if (this._disposable) {
            this._disposable.dispose();
        }
        this._disposable = disposable;
    }

    public dispose(): void {
        if (this._disposable) {
            this._disposable.dispose();
            this._disposable = Disposable.NONE;
        }
    }
}
````

## File: packages/dockview-core/src/math.ts
````typescript
export const clamp = (value: number, min: number, max: number): number => {
    if (min > max) {
        /**
         * caveat: an error should be thrown here if this was a proper `clamp` function but we need to handle
         * cases where `min` > `max` and in those cases return `min`.
         */
        return min;
    }
    return Math.min(max, Math.max(value, min));
};

export const sequentialNumberGenerator = (): { next: () => string } => {
    let value = 1;
    return { next: () => (value++).toString() };
};

export const range = (from: number, to?: number): number[] => {
    const result: number[] = [];

    if (typeof to !== 'number') {
        to = from;
        from = 0;
    }

    if (from <= to) {
        for (let i = from; i < to; i++) {
            result.push(i);
        }
    } else {
        for (let i = from; i > to; i--) {
            result.push(i);
        }
    }

    return result;
};
````

## File: packages/dockview-core/src/popoutWindow.ts
````typescript
import { addStyles } from './dom';
import { Emitter, addDisposableListener } from './events';
import { CompositeDisposable, Disposable, IDisposable } from './lifecycle';
import { Box } from './types';

export type PopoutWindowOptions = {
    url: string;
    onDidOpen?: (event: { id: string; window: Window }) => void;
    onWillClose?: (event: { id: string; window: Window }) => void;
} & Box;

export class PopoutWindow extends CompositeDisposable {
    private readonly _onWillClose = new Emitter<void>();
    readonly onWillClose = this._onWillClose.event;

    private readonly _onDidClose = new Emitter<void>();
    readonly onDidClose = this._onDidClose.event;

    private _window: { value: Window; disposable: IDisposable } | null = null;

    get window(): Window | null {
        return this._window?.value ?? null;
    }

    constructor(
        private readonly target: string,
        private readonly className: string,
        private readonly options: PopoutWindowOptions
    ) {
        super();

        this.addDisposables(this._onWillClose, this._onDidClose, {
            dispose: () => {
                this.close();
            },
        });
    }

    dimensions(): Box | null {
        if (!this._window) {
            return null;
        }

        const left = this._window.value.screenX;
        const top = this._window.value.screenY;
        const width = this._window.value.innerWidth;
        const height = this._window.value.innerHeight;

        return { top, left, width, height };
    }

    close(): void {
        if (this._window) {
            this._onWillClose.fire();

            this.options.onWillClose?.({
                id: this.target,
                window: this._window.value,
            });

            this._window.disposable.dispose();
            this._window = null;

            this._onDidClose.fire();
        }
    }

    async open(): Promise<HTMLElement | null> {
        if (this._window) {
            throw new Error('instance of popout window is already open');
        }

        const url = `${this.options.url}`;

        const features = Object.entries({
            top: this.options.top,
            left: this.options.left,
            width: this.options.width,
            height: this.options.height,
        })
            .map(([key, value]) => `${key}=${value}`)
            .join(',');

        /**
         * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/open
         */
        const externalWindow = window.open(url, this.target, features);

        if (!externalWindow) {
            /**
             * Popup blocked
             */
            return null;
        }

        const disposable = new CompositeDisposable();

        this._window = { value: externalWindow, disposable };

        disposable.addDisposables(
            Disposable.from(() => {
                externalWindow.close();
            }),
            addDisposableListener(window, 'beforeunload', () => {
                /**
                 * before the main window closes we should close this popup too
                 * to be good citizens
                 *
                 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
                 */
                this.close();
            })
        );

        const container = this.createPopoutWindowContainer();

        if (this.className) {
            container.classList.add(this.className);
        }

        this.options.onDidOpen?.({
            id: this.target,
            window: externalWindow,
        });

        return new Promise<HTMLElement | null>((resolve, reject) => {
            externalWindow.addEventListener('unload', (e) => {
                // if page fails to load before unloading
                // this.close();
            });

            externalWindow.addEventListener('load', () => {
                /**
                 * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/load_event
                 */

                try {
                    const externalDocument = externalWindow.document;
                    externalDocument.title = document.title;

                    externalDocument.body.appendChild(container);

                    addStyles(externalDocument, window.document.styleSheets);

                    /**
                     * beforeunload must be registered after load for reasons I could not determine
                     * otherwise the beforeunload event will not fire when the window is closed
                     */
                    addDisposableListener(
                        externalWindow,
                        'beforeunload',
                        () => {
                            /**
                             * @see https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
                             */
                            this.close();
                        }
                    );

                    resolve(container);
                } catch (err) {
                    // only except this is the DOM isn't setup. e.g. in a in correctly configured test
                    reject(err as Error);
                }
            });
        });
    }

    private createPopoutWindowContainer(): HTMLElement {
        const el = document.createElement('div');
        el.classList.add('dv-popout-window');
        el.id = 'dv-popout-window';
        el.style.position = 'absolute';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.top = '0px';
        el.style.left = '0px';

        return el;
    }
}
````

## File: packages/dockview-core/src/resizable.ts
````typescript
import { isInDocument, watchElementResize } from './dom';
import { CompositeDisposable } from './lifecycle';

export abstract class Resizable extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private _disableResizing: boolean;

    get element(): HTMLElement {
        return this._element;
    }

    get disableResizing(): boolean {
        return this._disableResizing;
    }

    set disableResizing(value: boolean) {
        this._disableResizing = value;
    }

    constructor(parentElement: HTMLElement, disableResizing = false) {
        super();

        this._disableResizing = disableResizing;

        this._element = parentElement;

        this.addDisposables(
            watchElementResize(this._element, (entry) => {
                if (this.isDisposed) {
                    /**
                     * resize is delayed through requestAnimationFrame so there is a small chance
                     * the component has already been disposed of
                     */
                    return;
                }

                if (this.disableResizing) {
                    return;
                }

                if (!this._element.offsetParent) {
                    /**
                     * offsetParent === null is equivalent to display: none being set on the element or one
                     * of it's parents. In the display: none case the size will become (0, 0) which we do
                     * not want to propagate.
                     *
                     * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent
                     *
                     * You could use checkVisibility() but at the time of writing it's not supported across
                     * all Browsers
                     *
                     * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility
                     */
                    return;
                }

                if (!isInDocument(this._element)) {
                    /**
                     * since the event is dispatched through requestAnimationFrame there is a small chance
                     * the component is no longer attached to the DOM, if that is the case the dimensions
                     * are mostly likely all zero and meaningless. we should skip this case.
                     */
                    return;
                }

                const { width, height } = entry.contentRect;
                this.layout(width, height);
            })
        );
    }

    abstract layout(width: number, height: number): void;
}
````

## File: packages/dockview-core/src/scrollbar.ts
````typescript
import { toggleClass, watchElementResize } from './dom';
import { addDisposableListener } from './events';
import { CompositeDisposable } from './lifecycle';
import { clamp } from './math';

export class Scrollbar extends CompositeDisposable {
    private readonly _element: HTMLElement;
    private readonly _horizontalScrollbar: HTMLElement;
    private _scrollLeft: number = 0;
    private _animationTimer: any;
    public static MouseWheelSpeed = 1;

    get element(): HTMLElement {
        return this._element;
    }

    constructor(private readonly scrollableElement: HTMLElement) {
        super();

        this._element = document.createElement('div');
        this._element.className = 'dv-scrollable';

        this._horizontalScrollbar = document.createElement('div');
        this._horizontalScrollbar.className = 'dv-scrollbar-horizontal';

        this.element.appendChild(scrollableElement);
        this.element.appendChild(this._horizontalScrollbar);

        this.addDisposables(
            addDisposableListener(this.element, 'wheel', (event) => {
                this._scrollLeft += event.deltaY * Scrollbar.MouseWheelSpeed;

                this.calculateScrollbarStyles();
            }),
            addDisposableListener(
                this._horizontalScrollbar,
                'pointerdown',
                (event) => {
                    event.preventDefault();

                    toggleClass(this.element, 'dv-scrollable-scrolling', true);

                    const originalClientX = event.clientX;
                    const originalScrollLeft = this._scrollLeft;

                    const onPointerMove = (event: PointerEvent) => {
                        const deltaX = event.clientX - originalClientX;

                        const { clientWidth } = this.element;
                        const { scrollWidth } = this.scrollableElement;
                        const p = clientWidth / scrollWidth;

                        this._scrollLeft = originalScrollLeft + deltaX / p;
                        this.calculateScrollbarStyles();
                    };

                    const onEnd = () => {
                        toggleClass(
                            this.element,
                            'dv-scrollable-scrolling',
                            false
                        );

                        document.removeEventListener(
                            'pointermove',
                            onPointerMove
                        );
                        document.removeEventListener('pointerup', onEnd);
                        document.removeEventListener('pointercancel', onEnd);
                    };

                    document.addEventListener('pointermove', onPointerMove);
                    document.addEventListener('pointerup', onEnd);
                    document.addEventListener('pointercancel', onEnd);
                }
            ),
            addDisposableListener(this.element, 'scroll', () => {
                this.calculateScrollbarStyles();
            }),
            addDisposableListener(this.scrollableElement, 'scroll', () => {
                this._scrollLeft = this.scrollableElement.scrollLeft;
                this.calculateScrollbarStyles();
            }),
            watchElementResize(this.element, () => {
                toggleClass(this.element, 'dv-scrollable-resizing', true);

                if (this._animationTimer) {
                    clearTimeout(this._animationTimer);
                }

                this._animationTimer = setTimeout(() => {
                    clearTimeout(this._animationTimer);
                    toggleClass(this.element, 'dv-scrollable-resizing', false);
                }, 500);

                this.calculateScrollbarStyles();
            })
        );
    }

    private calculateScrollbarStyles(): void {
        const { clientWidth } = this.element;
        const { scrollWidth } = this.scrollableElement;

        const hasScrollbar = scrollWidth > clientWidth;

        if (hasScrollbar) {
            const px = clientWidth * (clientWidth / scrollWidth);
            this._horizontalScrollbar.style.width = `${px}px`;

            this._scrollLeft = clamp(
                this._scrollLeft,
                0,
                this.scrollableElement.scrollWidth - clientWidth
            );

            this.scrollableElement.scrollLeft = this._scrollLeft;

            const percentageComplete =
                this._scrollLeft / (scrollWidth - clientWidth);

            this._horizontalScrollbar.style.left = `${
                (clientWidth - px) * percentageComplete
            }px`;
        } else {
            this._horizontalScrollbar.style.width = `0px`;
            this._horizontalScrollbar.style.left = `0px`;
            this._scrollLeft = 0;
        }
    }
}
````

## File: packages/dockview-core/src/svg.ts
````typescript
const createSvgElementFromPath = (params: {
    height: string;
    width: string;
    viewbox: string;
    path: string;
}): SVGSVGElement => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttributeNS(null, 'height', params.height);
    svg.setAttributeNS(null, 'width', params.width);
    svg.setAttributeNS(null, 'viewBox', params.viewbox);
    svg.setAttributeNS(null, 'aria-hidden', 'false');
    svg.setAttributeNS(null, 'focusable', 'false');
    svg.classList.add('dv-svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttributeNS(null, 'd', params.path);
    svg.appendChild(path);
    return svg;
};

export const createCloseButton = (): SVGSVGElement =>
    createSvgElementFromPath({
        width: '11',
        height: '11',
        viewbox: '0 0 28 28',
        path: 'M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z',
    });

export const createExpandMoreButton = (): SVGSVGElement =>
    createSvgElementFromPath({
        width: '11',
        height: '11',
        viewbox: '0 0 24 15',
        path: 'M12 14.15L0 2.15L2.15 0L12 9.9L21.85 0.0499992L24 2.2L12 14.15Z',
    });

export const createChevronRightButton = (): SVGSVGElement =>
    createSvgElementFromPath({
        width: '11',
        height: '11',
        viewbox: '0 0 15 25',
        path: 'M2.15 24.1L0 21.95L9.9 12.05L0 2.15L2.15 0L14.2 12.05L2.15 24.1Z',
    });
````

## File: packages/dockview-core/src/types.ts
````typescript
export type FunctionOrValue<T> = (() => T) | T;

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export interface Box {
    left: number;
    top: number;
    height: number;
    width: number;
}

type TopLeft = { top: number; left: number };
type TopRight = { top: number; right: number };
type BottomLeft = { bottom: number; left: number };
type BottomRight = { bottom: number; right: number };

export type AnchorPosition = TopLeft | TopRight | BottomLeft | BottomRight;
type Size = { width: number; height: number };

export type AnchoredBox = Size & AnchorPosition;
````

## File: packages/dockview-core/package.json
````json
{
  "name": "dockview-core",
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
    "build:css": "gulp sass",
    "build:esm": "cross-env ../../node_modules/.bin/tsc --build ./tsconfig.esm.json --verbose --extendedDiagnostics",
    "build": "npm run build:cjs && npm run build:esm && npm run build:css",
    "clean": "rimraf dist/ .build/ .rollup.cache/",
    "prepublishOnly": "npm run rebuild && npm run build:bundle && npm run test",
    "rebuild": "npm run clean && npm run build",
    "test": "cross-env ../../node_modules/.bin/jest --selectProjects dockview-core",
    "test:cov": "cross-env ../../node_modules/.bin/jest --selectProjects dockview-core --coverage"
  }
}
````

## File: packages/docs/docs/advanced/advanced.mdx
````markdown
import { MultiFrameworkContainer } from '@site/src/components/ui/container';
import DockviewNative2 from '@site/sandboxes/nativeapp-dockview/src/app';

# Window-like mananger with tabs

<MultiFrameworkContainer sandboxId="nativeapp-dockview" react={DockviewNative2} />
````

## File: packages/docs/docs/advanced/iframe.mdx
````markdown
import { MultiFrameworkContainer } from '@site/src/components/ui/container';
import DockviewWithIFrames from '@site/sandboxes/iframe-dockview/src/app';

# iframes

iframes reload when repositioned within the DOM which can cause issues.

iFrames required special attention because of a particular behaviour in how iFrames render:

> Re-parenting an iFrame will reload the contents of the iFrame or the rephrase this, moving an iFrame within the DOM will cause a reload of its contents.

You can find many examples of discussions on this. Two reputable forums for example are linked [here](https://bugzilla.mozilla.org/show_bug.cgi?id=254144) and [here](https://github.com/whatwg/html/issues/5484).

To ensure iFrames work as expected you should render them in panels with `renderer: 'always'` to ensure they are never removed from the DOM, alternatively set the defaultRenderer to `always`.

> See the [Panel Rendering](/core/panels/rendering.mdx) section for more information of render modes.

```tsx title="Example of a panel using an alternative renderer"
api.addPanel({
  id: 'my_panel_id',
  component: 'my_component',
  renderer: 'always',
});
        ```

<MultiFrameworkContainer
    sandboxId="iframe-dockview"
    height={600}
    react={DockviewWithIFrames}
/>
````

## File: packages/docs/docs/advanced/keyboard.mdx
````markdown
---
title: Keyboard
---

import { MultiFrameworkContainer } from '@site/src/components/ui/container';
import DockviewKeyboard from '@site/sandboxes/keyboard-dockview/src/app';

# Keyboard Navigation

Keyboard shortcuts

<MultiFrameworkContainer
    height={600}
    sandboxId="keyboard-dockview"
    react={DockviewKeyboard}
/>
````

## File: packages/docs/docs/advanced/nested.mdx
````markdown
---
title: Nested Instances
---


import { CodeRunner } from '@site/src/components/ui/codeRunner';

# Nested Dockviews

You can safely create multiple dockview instances within one page and nest dockviews within other dockviews.
If you wish to interact with the drop event from one dockview instance in another dockview instance you can implement the `api.onUnhandledDragOverEvent` and `onDidDrop` props on `DockviewReact`.

<CodeRunner id="dockview/nested" />
````

## File: packages/docs/docs/api/dockview/groupApi.mdx
````markdown
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
````

## File: packages/docs/docs/api/dockview/options.mdx
````markdown
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
````

## File: packages/docs/docs/api/dockview/overview.mdx
````markdown
---
title: API
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes the api object.

<DocRef declaration="DockviewApi" />
````

## File: packages/docs/docs/api/dockview/panelApi.mdx
````markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="DockviewPanelApi" />
````

## File: packages/docs/docs/api/gridview/api.mdx
````markdown
---
description: API
title: "API"
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="GridviewApi" />
````

## File: packages/docs/docs/api/gridview/options.mdx
````markdown
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
````

## File: packages/docs/docs/api/gridview/panelApi.mdx
````markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="GridviewPanelApi" />
````

## File: packages/docs/docs/api/paneview/api.mdx
````markdown
---
description: API
title: "API"
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="PaneviewApi" />
````

## File: packages/docs/docs/api/paneview/options.mdx
````markdown
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
````

## File: packages/docs/docs/api/paneview/panelApi.mdx
````markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="PaneviewPanelApi" />
````

## File: packages/docs/docs/api/splitview/api.mdx
````markdown
---
description: API
title: "API"
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="SplitviewApi" />
````

## File: packages/docs/docs/api/splitview/options.mdx
````markdown
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
````

## File: packages/docs/docs/api/splitview/panelApi.mdx
````markdown
---
description: API
title: Panel API
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


<DocRef declaration="SplitviewPanelApi" />
````

## File: packages/docs/docs/core/dnd/disable.mdx
````markdown
---
title: 'Disable Dnd'
sidebar_position: 3
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


:::info
You may want to combine this with `locked={true}` to provide a locked grid with no dnd funtionality. See [Locked](/docs/core/locked) for more.
:::

<FrameworkSpecific framework="JavaScript">
  <DocRef declaration="DockviewComponentOptions" methods={["disableDnd"]} />
</FrameworkSpecific>

<FrameworkSpecific framework="React">
  <DocRef declaration="IDockviewReactProps" methods={["disableDnd"]}  />
</FrameworkSpecific>

<FrameworkSpecific framework="Vue">
  <DocRef declaration="IDockviewVueProps" methods={["disableDnd"]}  />
</FrameworkSpecific>

<FrameworkSpecific framework="Angular">
  <DocRef declaration="IDockviewAngularProps" methods={["disableDnd"]}  />
</FrameworkSpecific>
````

## File: packages/docs/docs/core/dnd/dragAndDrop.mdx
````markdown
---
title: 'Dnd'
sidebar_position: 1
---

import useBaseUrl from '@docusaurus/useBaseUrl';
import { MultiFrameworkContainer } from '@site/src/components/ui/container';
import DockviewExternalDnd from '@site/sandboxes/externaldnd-dockview/src/app';

import { DocRef } from '@site/src/components/ui/reference/docRef';

The dock makes heavy use of drag and drop functionalities.

<DocRef declaration="DockviewApi"
  methods={[
    'onWillDragPanel', 'onWillDragGroup',
    'onWillDrop', 'onWillShowOverlay'
  ]}
  />

<CodeRunner framework='react' id='dockview/dnd-events' />


# Drag And Drop

You can override the conditions of the far edge overlays through the `dndEdges` prop.

```tsx
<DockviewReact
  {...props}
   dndEdges={{
    size: { value: 100, type: 'pixels' },
    activationSize: { value: 5, type: 'percentage' },
  }}
  />
```

## Extended behaviours

For interaction with the Drag events directly the component exposes some method to help determine whether external drag events should be interacted with or not.

```tsx
/**
 * called when an ondrop event which does not originate from the dockview libray and
 * passes the onUnhandledDragOverEvent condition
 **/
const onDidDrop = (event: DockviewDropEvent) => {
    const { group } = event;

    event.api.addPanel({
        id: 'test',
        component: 'default',
        position: {
            referencePanel: group.activePanel.id,
            direction: 'within',
        },
    });
};

const onReady = (event: DockviewReadyEvent) => {

  /**
   * called for drag over events which do not originate from the dockview library
   * allowing the developer to decide where the overlay should be shown for a
   * particular drag event
   **/
  api.onUnhandledDragOverEvent(event => {
    event.accept();
  });
}

return (
    <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-abyss"
        onDidDrop={onDidDrop}
    />
);
```

## Third Party Dnd Libraries

This shows a simple example of a third-party library used inside a panel that relies on drag
and drop functionalities. This examples serves to show that `dockview` doesn't interfer with
any drag and drop logic for other controls.

<MultiFrameworkContainer
    sandboxId="externaldnd-dockview"
    react={DockviewExternalDnd}
/>
````

## File: packages/docs/docs/core/dnd/external.mdx
````markdown
---
title: 'External Dnd Events'
sidebar_position: 3
---

External Dnd events can be intercepted through a number of utilities.

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="DockviewApi"
  methods={['onDidDrop', 'onUnhandledDragOverEvent']}
/>

## Intercepting Drag Events

You can intercept drag events to attach your own metadata using the `onWillDragPanel` and `onWillDragGroup` api methods.

<CodeRunner id="dockview/dnd-external" />
````

## File: packages/docs/docs/core/dnd/overview.mdx
````markdown
---
title: 'Overview'
sidebar_position: 0
---

import useBaseUrl from '@docusaurus/useBaseUrl';

Dockview supports a wide variety of built-in Drag and Drop possibilities.

<h4>Position a tab between two other tabs</h4>

<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '50px' }} src={useBaseUrl('/img/add_to_tab.svg')} />
</div>

<h4>Position a tab at the end of a list of tabs</h4>

<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '50px' }} src={useBaseUrl('/img/add_to_empty_space.svg')} />
</div>

<h4>Merge one group with another group</h4>

<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '50px' }} src={useBaseUrl('/img/add_to_group.svg')} />
</div>

<h4>Move both Tabs and Groups in relation to another group</h4>


<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '300px' }} src={useBaseUrl('/img/drop_positions.svg')} />
</div>

<h4>Move both Tabs and Groups in relation to the container</h4>

<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '300px' }} src={useBaseUrl('/img/magnet_drop_positions.svg')} />
</div>
````

## File: packages/docs/docs/core/dnd/thirdParty.mdx
````markdown
---
title: 'Third Party Libraries'
sidebar_position: 2
---

All third party Drag & Drop libraries should work as expected.

Dockview fire and intercepts Drag & Drop events extensively however it is indended that the user has ultimate
control over all events.

Dockview should not change the behaviours of any third party Drag & Drop libraries.
If you feel that Dockview is cause the behaviour of any third party Drag & Drop libraries to change please
raise an Issue.
````

## File: packages/docs/docs/core/groups/constraints.mdx
````markdown
---
title: Constraints
---

import { DocRef } from '@site/src/components/ui/reference/docRef'

:::warning
Constraints come with several caveats. They are not serialized with layouts and can only be applied to groups.
:::

<DocRef declaration="DockviewGroupPanelApi" methods={['setConstraints', 'onDidConstraintsChange']} />

## Live Example

<CodeRunner id="dockview/constraints"/>
````

## File: packages/docs/docs/core/groups/controls.mdx
````markdown
---
title: Group Controls
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes how you can customize the header component of each group.

<FrameworkSpecific framework='React'>
  <DocRef declaration="IDockviewReactProps" methods={['leftHeaderActionsComponent', 'rightHeaderActionsComponent', 'prefixHeaderActionsComponent']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
  <DocRef declaration="IDockviewVueProps" methods={['leftHeaderActionsComponent', 'rightHeaderActionsComponent', 'prefixHeaderActionsComponent']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
  <DocRef declaration="IDockviewAngularProps" methods={['leftHeaderActionsComponent', 'rightHeaderActionsComponent', 'prefixHeaderActionsComponent']} />
</FrameworkSpecific>

<FrameworkSpecific framework='JavaScript'>
  <DocRef declaration="DockviewComponentOptions"
    methods={['createLeftHeaderActionsElement', 'createRightHeaderActionsElement', 'createPrefixHeaderActionsElement']} />
</FrameworkSpecific>


```tsx
const LeftComponent = (props: IDockviewHeaderActionsProps) => {
    return <div>{/** content */}</div>;
};

const RightComponent = (props: IDockviewHeaderActionsProps) => {
       return <div>{/** content */}</div>;
};

const PrefixComponent = (props: IDockviewHeaderActionsProps) => {
    return <div>{/** content */}</div>;
};

return <DockviewReact
  leftHeaderActionsComponent={LeftComponent}
  rightHeaderActionsComponent={RightComponent}
  prefixHeaderActionsComponent={PrefixComponent}
/>;
```

## Live Example

<CodeRunner id="dockview/group-actions"/>
````

## File: packages/docs/docs/core/groups/floatingGroups.mdx
````markdown
---
title: Floating Groups
---

import useBaseUrl from '@docusaurus/useBaseUrl';
import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes floating groups.

:::info
Floating groups **cannot** be maximized. Calling maximize function on groups in these states will have no effect.
:::

Dockview has built-in support for floating groups. Each floating container can contain a single group with many panels
and you can have as many floating containers as needed. You cannot dock multiple groups together in the same floating container.

## Options

The following properties can be set to configure the behaviours of floating groups.

<FrameworkSpecific framework='React'>
  <DocRef declaration="IDockviewReactProps" methods={['floatingGroupBounds', 'disableFloatingGroups']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
  <DocRef declaration="IDockviewVueProps" methods={['floatingGroupBounds', 'disableFloatingGroups']} />
</FrameworkSpecific>

<FrameworkSpecific framework='JavaScript'>
  <DocRef declaration="DockviewComponentOptions" methods={['floatingGroupBounds', 'disableFloatingGroups']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
  <DocRef declaration="IDockviewAngularProps" methods={['floatingGroupBounds', 'disableFloatingGroups']} />
</FrameworkSpecific>

You can control the bounding box of floating groups through the optional `floatingGroupBounds` options:

-   `boundedWithinViewport` will force the entire floating group to be bounded within the docks viewport.
-   `{minimumHeightWithinViewport?: number, minimumWidthWithinViewport?: number}` sets the respective dimension minimums that must appears within the docks viewport
-   If no options are provided the defaults of `100px` minimum height and width within the viewport are set.


## API

The following properties can be used to create floating groups

<DocRef declaration="DockviewApi" methods={['addFloatingGroup']} />

:::info
`addFloatingGroup` only accepts existing panels and groups. See [Addding Panels](/docs/core/panels/add) on how to firstly add panels.
:::


Floating groups can be programatically added through the dockview `api` method `api.addFloatingGroup(...)`.

## Panel and Group API

<DocRef declaration="DockviewPanelApi" methods={['location', 'onDidLocationChange']} />

You can check whether a group is floating via the `group.api.location` property. See examples for full code.


## Working with Floating Groups

<h4>Float an existing tab by holding `shift` whilst interacting with the tab</h4>

<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '200px' }} src={useBaseUrl('/img/float_add.svg')} />
</div>

<h4>Move a floating tab by holding `shift` whilst moving the cursor or dragging the empty header space</h4>

<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '200px' }} src={useBaseUrl('/img/float_move.svg')} />
</div>

<h4>Move an entire floating group by holding `shift` whilst dragging the empty header space</h4>

<div style={{display:' flex', justifyContent: 'center'}}>
  <img style={{ height: '200px' }} src={useBaseUrl('/img/float_group.svg')} />
</div>

## Live Example

<CodeRunner id="dockview/floating-groups"/>
````

## File: packages/docs/docs/core/groups/hiddenHeader.mdx
````markdown
---
title: Hidden Header
---

import useBaseUrl from '@docusaurus/useBaseUrl';
import { DocRef } from '@site/src/components/ui/reference/docRef';

You may wish to hide the header section of a group. This can achieved through the `hidden` variable on `panel.group.header`.

```tsx
panel.group.header.hidden = true;
```
````

## File: packages/docs/docs/core/groups/locked.mdx
````markdown
---
title: Locked Groups
---

import { CodeRunner } from '@site/src/components/ui/codeRunner';

## Locked group

Locking a group will disable all drop events for this group ensuring no additional panels can be added to the group through drop events.
You can still add groups to a locked panel programatically using the API though.

```tsx
panel.group.locked = true;

// Or

panel.group.locked = 'no-drop-target';
```

Use `true` to keep drop zones top, right, bottom, left for the group. Use `no-drop-target` to disable all drop zones. For you to get a
better understanding of what this means, try and drag the panels in the example below to the locked groups.

<CodeRunner id="dockview/locked"/>
````

## File: packages/docs/docs/core/groups/maxmizedGroups.mdx
````markdown
---
title: Maximized Groups
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section described how to maxmimize groups.

## Options

<DocRef declaration="DockviewApi" methods={['maximizeGroup', 'hasMaximizedGroup', 'exitMaximizedGroup', 'onDidMaxmizedGroupChange']} />

```tsx
const api: DockviewApi;

// maximize a specified group
api.maxmimizeGroup(group);

// check whether a specific group is maximized
const result: boolean = api.isMaximizedGroup(group);

// if there is any maximized group exit the maximized state
exitMaximizedGroup();

// is there a maximized group
const result: boolean = hasMaximizedGroup();
```

## Panel API

<DocRef declaration="DockviewPanelApi" methods={['maximize', 'isMaximized', 'exitMaximized']} />

```tsx
const api: DockviewPanelApi;

// maximize the group
api.maximize();

// is this group maximized (if another group is maximized this method will still return false)
const result: boolean = api.isMaxmized();

// exit only if this group is maximzied (if another group is maxmized this has no affect)
api.exitMaximized();
```

:::tip
`api.<maximize|isMaximized|exitMaximized>` is equivalent to `api.group.api.<maximize|isMaximized|exitMaximized>`.
The methods exist on the panel `api` object for convenience.
:::

## Live Examples

<CodeRunner id="dockview/maximize-group"/>
````

## File: packages/docs/docs/core/groups/move.mdx
````markdown
---
title: Move Group
sidebar_position: 5
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes how you can move a group.

## Methods

<DocRef declaration="DockviewGroupPanelApi" methods={["moveTo"]}/>

## Move a Group

You can move a group through the [Group API](/docs/api/dockview/groupApi) and you can find out how to move a Panel [here](/docs/core/panels/move).

```ts
panel.group.api.moveTo({ group, position, index });
```
````

## File: packages/docs/docs/core/groups/popoutGroups.mdx
````markdown
---
title: Popout Windows
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes have to create popout windows.

:::info
Popout groups **cannot** be maximized. Calling maximize function on groups in these states will have no effect.
:::

<DocRef declaration="DockviewApi" methods={['addPopoutGroup']} />

Dockview has built-in support for opening groups in new Windows.
Each popout window can contain a single group with many panels and you can have as many popout
windows as needed. You cannot dock multiple groups together in the same window.

Popout windows require your website to have a blank `.html` page that can be used, by default this is set to `/popout.html` but
can be configured to match requirements.

```tsx
api.addPopoutGroup(
  group,
  // the second arguments (options) is optional
  {
    popoutUrl:"/popout.html",
    box: { left: 0, top: 0, height: 200, width: 300 }
  });
```

> If you do not provide `options.popoutUrl` a default of `/popout.html` is used and if `options.box` is not provided
the view will be places according to it's currently position.

From within a panel you may say

```tsx
props.containerApi.addPopoutGroup(props.api.group);
```

## Closing the Popout Group

To programatically move the popout group back into the main grid you can use the `moveTo` method in many ways, one of the following would suffice

```tsx
// option 1: add absolutely to the right-side of the grid
props.group.api.moveTo({ position: 'right' });

// option 2: create a new group and move the contents of the popout group to it
const group = props.containerApi.addGroup();
props.group.api.moveTo({ group });
```

Alternatively, if the user closes the Window the group the dock will make a best attempt to place it back
in it's original location within the grid. If the dock cannot determine the original location it will
choose a new location.


<CodeRunner id="dockview/popout-group"/>
````

## File: packages/docs/docs/core/groups/resizing.mdx
````markdown
---
title: Resizing
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="DockviewGroupPanelApi" methods={['height', 'width', 'setSize', 'onDidDimensionsChange']} />


## Panel Resizing

Each Dockview contains of a number of groups and each group has a number of panels.
Logically a user may want to resize a panel, but this translates to resizing the group which contains that panel.

You can set the size of a panel using `props.api.setSize(...)`.
You can also set the size of the group associated with the panel using `props.api.group.api.setSize(...)` although this isn't recommended
due to the clunky syntax.

```tsx
// it's mandatory to provide either a height or a width, providing both is optional
props.api.setSize({
    height: 100,
    width: 200,
});

// you could also resize the panels group, although not recommended it achieved the same result
props.api.group.api.setSize({
    height: 100,
    width: 200,
});
```

You can see an example invoking both approaches below.


<CodeRunner framework="react" id="dockview/resize"/>
````

## File: packages/docs/docs/core/panels/add.mdx
````markdown
---
title: Adding Panels
sidebar_position: 1
---

import { DocRef } from '@site/src/components/ui/reference/docRef';
import { CodeRunner } from '@site/src/components/ui/codeRunner';

This section describes how to add a new panel and the options you can provide.


Panels can be added through the dock api.

<DocRef declaration="DockviewApi" methods={['addPanel']} />



## Opening a Basic Panel

To open a panel requires a unique `id` and the name of the `component` to render.

```ts
const panel: IDockviewPanel = api.addPanel({
    id: 'my_unique_panel_id',
    component: 'my_component',
    // optionally set `inactive: true` to prevent the added panel becoming active automatically
    inactive: true
});
```


> See [Overview](/docs/core/overview) to register components.

## Providing a Panel Title

:::warning
Registering and updating the title using these built-in variables only works for the default tab renderer.
If you use a custom tab render you can optionally access these variables to render the title, or you can take
your own approach to rendering a tab title.
:::

Use `title` to provide a custom title for the panel. If no `title` is provided then the dock will render `id` in the tab.

```tsx
api.addPanel({
    id: 'panel_1',
    component: 'my_component',
    title: 'my_custom_title',
});
```

```tsx
api.setTitle('my_new_custom_title');
```

<CodeRunner  id="dockview/update-title" height={250}/>

## Provide a custom Tab renderer

:::info
You can override the default tab renderer through the [Options](/docs/api/dockview/options).
:::

To render a custom tab component you should specify the `tabComponent`.

```ts
const panel: IDockviewPanel = api.addPanel({
    id: 'my_unique_panel_id',
    component: 'my_component',
    tabComponent: 'my_tab_component',
});
```

> See [Tabs](/docs/core/panels/tabs) to learn how to register tab components.

## Provide custom Parameters

Using the `params` option you can specific a simple object that is accessible in both the panel and tab renderer.
To update these parameters after the panel has been created see [Update Panel](/docs/core/panels/update).

```ts
const panel: IDockviewPanel = api.addPanel({
    id: 'my_unique_panel_id',
    component: 'my_component',
    params: {
        myCustomKey: 'my_custom_value',
    },
});
```

## Rendering

See [Panel Rendering](/docs/core/panels/rendering).

## Positioning the Panel

You can position a panel relative to an existing panel, group using `direction`. If you do not provide a reference panel
or group then the panel will be positioned to the edge of the dock in the specified direction.

<DocRef declaration="Direction" />

#### Relative to another Panel

```ts
const panel2: IDockviewPanel = api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: {
      referencePanel: 'panel_1',
      direction: 'above'
    }
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    position: {
      referencePanel: panel2,
      direction: 'above'
    }
});

api.addPanel({
    id: 'panel_4',
    component: 'default',
    position: {
      referencePanel: panel2,
      index: 2  // optionally specify which index to add the panel at
    }
});
```

#### Relative to another Group

```ts
const panel2: IDockviewPanel = api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: {
      referenceGroup: 'panel_1',
      direction: 'left'
    }
});



api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: {
      referenceGroup: panel2.group,
      direction: 'left'
    }
});

api.addPanel({
    id: 'panel_3',
    component: 'default',
    position: {
      referenceGroup: panel2.group,
          index: 2  // optionally specify which index to add the panel at
    }
});
```

#### Relative to the container

```ts
const panel = api.addPanel({
    id: 'panel_2',
    component: 'default',
    position: {
      direction: 'right'
    }
});
```

### Floating

You should specific the `floating` option which can be either `true` or an object describing the position of the floating group.

:::info
The `position` property of the `floating` object accepts combinations of `top`, `left`, `bottom` and `right`.
:::

```ts
api.addPanel({
    id: 'panel_1',
    component: 'default',
    floating: true
});

api.addPanel({
  id: 'panel_2',
  component: 'default',
  floating: {
      position: { left: 10, top: 10 },
      width: 300,
      height: 300
  }
});
```

### Minimum and Maximum

You can define both minimum and maxmium widths and heights, these are persisted with layouts.

:::info
Since panels exist within groups there are occasions where these boundaries will be ignored to prevent overflow and clipping issues within the dock.
:::

```ts
api.addPanel({
    id: 'panel_1',
    component: 'default',
    minimumWidth: 100,
    maximumWidth: 100,
    minimumHeight: 200,
    maximumHeight: 2000
});
```

### Initial Size

You can define an `initialWidth` and `initialHeight`. The dock will may a best attempt to obey these inputs but it may not always be possible due to the constraints of the grid.

```ts
api.addPanel({
    id: 'panel_1',
    component: 'default',
    initialWidth: 100,
    initialHeight: 100
});
```
````

## File: packages/docs/docs/core/panels/move.mdx
````markdown
---
title: Move Panel
sidebar_position: 3
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes how you can move a panel to another panel or group.

## Methods

<DocRef declaration="DockviewPanelApi" methods={["moveTo"]}/>

## Move a Panel

You can move a panel through the [Panel API](/docs/api/dockview/panelApi) and you can find out how to move a Group [here](/docs/core/groups/move).

```ts
panel.api.moveTo({ group, position, index });
```

An equivalent method for moving groups is avaliable on the group `api`.

```ts
const group = panel.api.group;
group.api.moveTo({ group, position });
```
````

## File: packages/docs/docs/core/panels/register.mdx
````markdown
---
title: Registering Panels
sidebar_position: 0
---

import { DocRef } from '@site/src/components/ui/reference/docRef';


This section describes how to register a panel.

You can register panels through the dock  [option](/docs/api/dockview/options) `components`.

<FrameworkSpecific framework='React'>
  <DocRef declaration="IDockviewReactProps" methods={['components']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
  <DocRef declaration="IDockviewVueProps" methods={['components']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
  <DocRef declaration="IDockviewAngularProps" methods={['components']} />
</FrameworkSpecific>


<FrameworkSpecific framework='JavaScript'>
  <DocRef declaration="DockviewComponentOptions" methods={['createComponent']} />
</FrameworkSpecific>


<FrameworkSpecific framework='React'>
```tsx
const components = {
  component_1: (props: IDockviewPanelProps) => {
    const api: DockviewPanelApi  = props.api;
    const groupApi: DockviewGroupPanelApi  = props.group.api;
    const containerApi: DockviewApi  = props.containerApi;

    return <div>{/** logic */}</div>
  },
  component_2: (props: IDockviewPanelProps) => {
    return <div>{/** logic */}</div>
  }
}

return <DockviewReact components={components}/>
```
</FrameworkSpecific>


<FrameworkSpecific framework='JavaScript'>
```tsx
class Panel implements IContentRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
    }

    init(parameters: GroupPanelPartInitParameters): void {
        //
    }
}


const api = createDockview(parentElement, {
    createComponent: (options) => {
        switch (options.name) {
            case 'component_1':
                return new Panel();
        }
    },
});
```
</FrameworkSpecific>


<FrameworkSpecific framework='Vue'>
```tsx
const App = {
    name: 'App',
    components: {
        'component_1': VueComponent1,
        'component_2': VueComponent2,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addPanel({
                id: 'panel_1',
                component: 'component_1'
            });

               event.api.addPanel({
                id: 'panel_2',
                component: 'component_2'
            });
        },
    },
    template: `
      <dockview-vue
        @ready="onReady"
      >
      </dockview-vue>`,
};
```
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
```tsx
@Component({
    selector: 'panel-component-1',
    template: `<div>Panel Content 1</div>`
})
export class PanelComponent1 {
    @Input() api: DockviewPanelApi;
    @Input() group: any;
    @Input() containerApi: DockviewApi;
}

@Component({
    selector: 'panel-component-2', 
    template: `<div>Panel Content 2</div>`
})
export class PanelComponent2 {
    @Input() api: DockviewPanelApi;
}

@Component({
    selector: 'app-root',
    template: `
        <dv-dockview 
            [components]="components"
            (ready)="onReady($event)">
        </dv-dockview>
    `
})
export class AppComponent {
    components = {
        'component_1': PanelComponent1,
        'component_2': PanelComponent2,
    };

    onReady(event: DockviewReadyEvent) {
        event.api.addPanel({
            id: 'panel_1',
            component: 'component_1'
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'component_2'
        });
    }
}
```
</FrameworkSpecific>


Each panel has an [api](/docs/api/dockview/panelApi) which is used to control specific
features on that individual panel.
The panel also has access the [group api](/docs/api/dockview/groupApi) and the container
[api](/docs/api/dockview/overview).
````

## File: packages/docs/docs/core/panels/remove.mdx
````markdown
---
title: Remove Panel
sidebar_position: 4
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes multiple ways to remove a panel.

## Remove a Panel using the Panel API

<DocRef declaration="DockviewPanelApi" methods={["close"]}/>

Calling `close` on the panel API is the easiest way to close a panel through code.

```ts
panel.api.close();
```

## Remove a Panel using the API
<DocRef declaration="DockviewApi" methods={["removePanel"]}/>

Firstly, you can retrieve a reference to the panel given it's id and then you can
pass that reference into `removePanel` to remove the panel.

```ts
const panel: IDockviewPanel = api.getPanel('myPanel');
api.removePanel(panel);
```
````

## File: packages/docs/docs/core/panels/rendering.mdx
````markdown
---
title: Rendering Panels
sidebar_postiion: 5
---

import { MultiFrameworkContainer } from '@site/src/components/ui/container';
import { CodeRunner } from '@site/src/components/ui/codeRunner';
import RenderingDockview from '@site/sandboxes/rendering-dockview/src/app';

Rendering type is an important consideration when creating your application and whether your panels should be destroyed when hidden.

:::info
If you are looking for information on how to render **iframes** in Dockview please go the the [iframes](/docs/advanced/iframe) section.
:::

When a panel is selected all other panels in that group are not visible. The API does expose methods to determine whether your panel is visible or not
and the panel instance only ever destroyed when removed however the question still remains, what to do with the partial DOM tree that makes up your panel and there are two options the dock can take:

1. (*onlyWhenVisible*) Remove the element from the DOM tree to make space for the new panel.

This will cause the element to loss any DOM-specific state such as scrollbar position and if you measure the size of any elements during this time you will mostly like see both a width and height of 0px,
this is also true for any active ResizeObservers.

```ts
api.addPanel({
    id: 'my_unique_panel_id',
    component: 'my_component',
    renderer: 'always'
});
```

2. (*always*) Keep the DOM tree alive but hide it in order to allow the select panels content to show.

This approach will maintain any DOM-sepcific state you had and is essential if you require the native scrollbar position to be preserved.

```ts
api.addPanel({
    id: 'my_unique_panel_id',
    component: 'my_component',
    renderer: 'onlyWhenVisible'
});
```

Both are valid use-cases therefore the dock allows you to choose your rendering mode, the default however is the first option since this is the most memory efficient solution.

> You can change the `defaultRenderer` in the Dock [Options](/docs/api/dockview/options).

:::info
The panel instance is only ever destroyed when it is removed from the dock allowing you to still run code associated with the panel when it is not visible.
The renderer only affects what happens to the DOM element.
:::

## Choose a Render Mode

```ts
api.addPanel({
    id: 'my_unique_panel_id',
    component: 'my_component',
    renderer: 'always'
});

api.addPanel({
    id: 'my_unique_panel_id',
    component: 'my_component',
    renderer: 'onlyWhenVisible'
});
```

## Live Example

<CodeRunner id="dockview/render-mode"/>


By default `DockviewReact` only adds to the DOM those panels that are visible,
if a panel is not the active tab and not shown the contents of the hidden panel will be removed from the DOM.

When a panel is in `onlyWhenVisible` render mode this only affects the contents within the DOM. The lifecycle of that panel instance is still maintained.
The React Components associated with each panel are only created once and will always exist for as long as the panel exists, hidden or not.

> e.g. This means that any hooks in those components will run whether the panel is visible or not which may lead to excessive background work depending
> on the panels implementation.

You can listen to the visiblity state of the panel and write additional logic to optimize your application if required, although this is an advanced case.

If you wanted to unmount the React Components when the panel is not visible you could create a Higher-Order-Component that listens to the panels
visiblity state and only renders the panel when visible.

```tsx title="Only rendering the React Component when the panel is visible, otherwise rendering a null React Component"
import { IDockviewPanelProps } from 'dockview';
import * as React from 'react';

function RenderWhenVisible(
    component: React.FunctionComponent<IDockviewPanelProps>
) {
    const HigherOrderComponent = (props: IDockviewPanelProps) => {
        const [visible, setVisible] = React.useState<boolean>(
            props.api.isVisible
        );

        React.useEffect(() => {
            const disposable = props.api.onDidVisibilityChange((event) =>
                setVisible(event.isVisible)
            );

            return () => {
                disposable.dispose();
            };
        }, [props.api]);

        if (!visible) {
            return null;
        }

        return React.createElement(component, props);
    };
    return HigherOrderComponent;
}
```

```tsx
const components = { default: RenderWhenVisible(MyComponent) };
```

Toggling the checkbox you can see that when you only render those panels which are visible the underling React component is destroyed when it becomes hidden and re-created when it becomes visible.


<MultiFrameworkContainer
    sandboxId="rendering-dockview"
    react={RenderingDockview}
/>
````

## File: packages/docs/docs/core/panels/resizing.mdx
````markdown
---
title: Resizing
---

This section describes how to programatically resize a panel.

import { CodeRunner } from '@site/src/components/ui/codeRunner';
import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="DockviewPanelApi" methods={['height', 'width', 'setSize', 'onDidDimensionsChange']} />



## Panel Resizing

Each dock contains groups and each group contains panels.
Logically a user may want to resize a panel but this really translates to resizing the group which contains that panel.

The panel resize methods are repeats of the same resize methods found on the group.

```tsx
// it's mandatory to provide either a height or a width, providing both is optional
props.api.setSize({
    height: 100,
    width: 200,
});

/**
 * you could also resize the panels group, although not recommended due to the
 * clunky syntax it does achieve the same result
 */
props.api.group.api.setSize({
    height: 100,
    width: 200,
});
```

You can see an example invoking both approaches below.

<CodeRunner id="dockview/resize"/>
````

## File: packages/docs/docs/core/panels/tabs.mdx
````markdown
---
title: Tabs
sidebar_position: 2
---

import { MultiFrameworkContainer } from '@site/src/components/ui/container';
import { CodeRunner } from '@site/src/components/ui/codeRunner';
import DockviewNative from '@site/sandboxes/fullwidthtab-dockview/src/app';
import { attach as attachNativeDockview } from '@site/sandboxes/javascript/fullwidthtab-dockview/src/app';
import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes how to implement custom tab renderers

## Register a Tab Component

<FrameworkSpecific framework='React'>
```tsx
const components = {
  tab_1: (props: IDockviewPanelHeaderProps) => {
    const api: DockviewPanelApi  = props.api;
    const containerApi: DockviewApi  = props.containerApi;

    return <div>{/** logic */}</div>
  },
  tab_2: (props: IDockviewPanelHeaderProps) => {
    return <div>{/** logic */}</div>
  }
};

return <DockviewReact tabComponents={tabComponents}/>
```
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
```tsx
const App = {
    name: 'App',
    components: {
        'component_1': VueComponent1,
        'tab_1': VueComponent2,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addPanel({
                id: 'panel_1',
                component: 'component_1',
                tabComponent: 'tab_1'
            });
        },
    },
    template: `
      <dockview-vue
        @ready="onReady"
      >
      </dockview-vue>`,
};
```
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
```tsx
@Component({
    selector: 'tab-component-1',
    template: `<div>Custom Tab 1</div>`
})
export class TabComponent1 {
    @Input() api: DockviewPanelApi;
    @Input() containerApi: DockviewApi;
}

@Component({
    selector: 'tab-component-2',
    template: `<div>Custom Tab 2</div>`
})
export class TabComponent2 {
    @Input() api: DockviewPanelApi;
    @Input() containerApi: DockviewApi;
}

@Component({
    selector: 'app-root',
    template: `
        <dv-dockview 
            [tabComponents]="tabComponents"
            (ready)="onReady($event)">
        </dv-dockview>
    `
})
export class AppComponent {
    tabComponents = {
        'tab_1': TabComponent1,
        'tab_2': TabComponent2,
    };

    onReady(event: DockviewReadyEvent) {
        event.api.addPanel({
            id: 'panel_1',
            component: 'component_1',
            tabComponent: 'tab_1'
        });
    }
}
```
</FrameworkSpecific>

<FrameworkSpecific framework='JavaScript'>
```tsx
class CustomTabRenderer implements IHeaderRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
    }

    init(parameters: HeaderPartInitParameters): void {
        const api: DockviewPanelApi = parameters.api;
        const containerApi: DockviewApi = parameters.containerApi;
        
        this._element.textContent = api.title || 'Custom Tab';
    }

    dispose(): void {
        // Cleanup logic
    }
}

const api = createDockview(parentElement, {
    createTabComponent: (options) => {
        switch (options.name) {
            case 'tab_1':
                return new CustomTabRenderer();
            default:
                return undefined;
        }
    },
});

api.addPanel({
    id: 'panel_1',
    component: 'component_1',
    tabComponent: 'tab_1'
});
```
</FrameworkSpecific>


## Default Tab Renderer

<FrameworkSpecific framework='React'>
```jsx
const CustomTabRenderer = (props: IDockviewPanelHeaderProps) => {
  const api: DockviewPanelApi  = props.api;
  const containerApi: DockviewApi  = props.containerApi;

  return <div>{/** logic */}</div>
}

return <DockviewReact defaultTabRenderer={CustomTabRenderer}/>
```
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
```tsx
const App = {
    name: 'App',
    components: {
        'component_1': VueComponent1,
        'tab_1': VueComponent2,
    },
    methods: {
        onReady(event: DockviewReadyEvent) {
            event.api.addPanel({
                id: 'panel_1',
                component: 'component_1',
            });
        },
    },
    template: `
      <dockview-vue
        @ready="onReady"
        :defaultTabRenderer='tab_1'
      >
      </dockview-vue>`,
};
```
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
```tsx
@Component({
    selector: 'custom-tab-renderer',
    template: `<div>Default Tab</div>`
})
export class CustomTabRenderer {
    @Input() api: DockviewPanelApi;
    @Input() containerApi: DockviewApi;
}

@Component({
    selector: 'app-root',
    template: `
        <dv-dockview 
            [defaultTabRenderer]="defaultTabRenderer"
            (ready)="onReady($event)">
        </dv-dockview>
    `
})
export class AppComponent {
    defaultTabRenderer = CustomTabRenderer;

    onReady(event: DockviewReadyEvent) {
        event.api.addPanel({
            id: 'panel_1',
            component: 'component_1',
        });
    }
}
```
</FrameworkSpecific>

<FrameworkSpecific framework='JavaScript'>
```tsx
class DefaultTabRenderer implements IHeaderRenderer {
    private readonly _element: HTMLElement;

    get element(): HTMLElement {
        return this._element;
    }

    constructor() {
        this._element = document.createElement('div');
        this._element.className = 'custom-default-tab';
    }

    init(parameters: HeaderPartInitParameters): void {
        const api: DockviewPanelApi = parameters.api;
        const containerApi: DockviewApi = parameters.containerApi;
        
        this._element.textContent = api.title || 'Default Tab';
    }

    dispose(): void {
        // Cleanup logic
    }
}

const api = createDockview(parentElement, {
    createTabComponent: (options) => {
        // Return the default tab renderer for all tabs
        return new DefaultTabRenderer();
    },
});
```
</FrameworkSpecific>

## Accessing Custom Panel Parameters

You can provide a generic type that matches the structure of the expected custom panels parameters
to provide type-hints for the panel parameters which can be accessed via the `params` option.

<FrameworkSpecific framework='React'>
```jsx
type MyParameters = { my_value: number };

const MyTab = (props: IDockviewPanelHeaderProps<MyParameters>) => {
  const value: number = props.params.my_value;
  return <div>{/** logic */}</div>
}
```
</FrameworkSpecific>


## Extend the Default Tab Implementation

If you only want to make minor changes to the tab rendering you may be able to use the
default implementation as a base. This could include:
- Hiding the close button
- Attaching additional event listeners


<FrameworkSpecific framework='React'>
```tsx
import { IDockviewPanelHeaderProps, DockviewDefaultTab } from 'dockview';

const MyCustomTab = (props: IDockviewPanelHeaderProps) => {
    const onContextMenu = (event: React.MouseEvent) => {
        event.preventDefault();
        alert('context menu');
    };
    return <DockviewDefaultTab onContextMenu={onContextMenu} hideClose={true} {...props} />;
};
```
</FrameworkSpecific>

As a simple example the below attaches a custom event handler for the context menu on all tabs as a default tab renderer

The below example uses a custom tab renderer to reigster a popover when the user right clicked on a tab.
This still makes use of the `DockviewDefaultTab` since it's only a minor change.

<CodeRunner id="dockview/custom-header"/>

## Full Width Tab

When a group has only one single tab you may want that tab to take the full width.

<FrameworkSpecific framework='React'>
  <DocRef declaration="IDockviewReactProps" methods={['singleTabMode']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
  <DocRef declaration="IDockviewVueProps" methods={['singleTabMode']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
  <DocRef declaration="IDockviewAngularProps" methods={['singleTabMode']} />
</FrameworkSpecific>

<FrameworkSpecific framework='JavaScript'>
  <DocRef declaration="DockviewComponentOptions" methods={['singleTabMode']} />
</FrameworkSpecific>

```tsx
return <DockviewReactComponent singleTabMode="fullwidth" />
```

<MultiFrameworkContainer
    sandboxId="fullwidthtab-dockview"
    react={DockviewNative}
    typescript={attachNativeDockview}
/>

## Tab Height

Tab height can be controlled through CSS.
````

## File: packages/docs/docs/core/panels/update.mdx
````markdown
---
title: Update Panel
sidebar_position: 2
---

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes how to update the parameters of a panel.

:::warning
**Use this feature sparingly**: Anything you assign to the `params` options of a panel will be saved when calling `api.toJSON()`.
Only use this to store small amounts of static view data.
**Do not** use this to store application state or dynamic panel state.
:::

## Methods

<DocRef declaration="DockviewPanelApi" methods={['updateParameters']} />

## Updating parameters

:::info
If you want to set initial parameters when adding a panel see the [Add Panel](/docs/core/panels/add) section.
:::

You can update a panel through the [Panel API](/docs/api/dockview/panelApi).

```ts
panel.api.updateParameters({
    keyA: 'anotherValueA',
    keyB: 'valueB',
});
```

To delete a parameter you should pass a value of `undefined`.

```ts
panel.api.updateParameters({
    keyA: undefined,
});
```

## Live Example

<CodeRunner id="dockview/update-parameters"/>
````

## File: packages/docs/docs/core/state/load.mdx
````markdown
---
title: Loading State
---

import { CodeRunner } from '@site/src/components/ui/codeRunner';
import { DocRef } from '@site/src/components/ui/reference/docRef';

This section described loading a dock layout.

<DocRef declaration="DockviewApi" methods={['fromJSON', 'onDidLayoutFromJSON']} />

## Load A Layout

To load a layout you should a pass a valid object to `fromJSON`. If you try to load an invalid or corrupted layout the dock will throw an Error and the dock will reset gracefully ready
for another attempt with a valid object.

You could load a previously saved layout from local storage for example.

```tsx
const onReady = (event: DockviewReadyEvent) => {
    let success = false;

    const mySerializedLayout = localStorage.getItem('my_layout');

    if (mySerializedLayout) {
        try {
            const layout = JSON.parse(mySerializedLayout);
            event.api.fromJSON(layout);
            success = true;
        } catch (err) {
            // log the error
        }
    }

    if (!success) {
        // perhap load a default layout?
    }
};

return <DockviewComponent onReady={onReady}/>;
```

# Live Example

<CodeRunner id="dockview/layout"/>
````

## File: packages/docs/docs/core/state/save.mdx
````markdown
---
title: Saving State
---

import { CodeRunner } from '@site/src/components/ui/codeRunner';
import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes how to serialize a dockview instance.

<DocRef declaration="DockviewApi" methods={['toJSON', 'onDidLayoutChange']} />

To retrieve the current state of the dock call `toJSON()`.
You can listen to the event `onDidlayoutChange` to determine when the layout has changed.

```tsx
const [api, setApi] = React.useState<DockviewApi>();

React.useEffect(() => {
  if(!api) {
    return;
  }

  const disposable = api.onDidLayoutChange(() => {
    const layout: SerializedDockview = api.toJSON();
    localStorage.setItem('my_layout', JSON.stringify(layout));
  });

  return () => disposable.dispose();
}, [api]);

const onReady = (event: DockviewReadyEvent) => {
  setApi(event.api);
}

return <DockviewComponent onReady={onReady}/>
```

# Live Example

<CodeRunner id="dockview/layout"/>
````

## File: packages/docs/docs/core/locked.mdx
````markdown
---
title: Locked
---

import useBaseUrl from '@docusaurus/useBaseUrl';

import { DocRef } from '@site/src/components/ui/reference/docRef';

This section describes how to lock the dock to prevent movement.

:::info
You may want to combine this with `disableDnd={true}` to provide a locked grid with no dnd funtionality. See [Disable Dnd](/docs/core/dnd/disable) for more.
:::

Locking the component prevent the resizing of components using the drag handles between panels.

<CodeRunner id='dockview/locked'/>
````

## File: packages/docs/docs/core/overview.mdx
````markdown
---
title: Overview
sidebar_position: 0
---

This section provided a core overview.

The component takes a collection of [Options](/docs/api/dockview/options) as inputs and
once you have created a dock you can store a reference to the [API](/docs/api/dockview/overview) that is created.


<FrameworkSpecific framework='JavaScript'>
```tsx
const element: HTMLElement
const options: DockviewComponentOptions
const api: DockviewApi = createDockview(element, options);
```
</FrameworkSpecific>

<FrameworkSpecific framework='React'>
```tsx
function onReady(event: DockviewReadyEvent) {
  /**
   * You should store a reference to `api` in a Ref or State
   * for later interactions
   */
  const api: DockviewApi = event.api;
}

<DockviewReact onReady={onReady}/>
```
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
```tsx
const App = {
    name: 'App',
    methods: {
        onReady(event: DockviewReadyEvent) {
          const api: DockviewApi = event.api;
        },
    },
    template: `
      <dockview-vue
        @ready="onReady"
      >
      </dockview-vue>`,
};
```
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
```tsx
export class AppComponent {
    onReady(event: DockviewReadyEvent) {
        /**
         * You should store a reference to `api` as a class property
         * for later interactions
         */
        const api: DockviewApi = event.api;
    }
}

// In template:
<dv-dockview (ready)="onReady($event)"></dv-dockview>
```
</FrameworkSpecific>
````

## File: packages/docs/docs/core/scrollbars.mdx
````markdown
---
title: Scrolling
---

It's important to understand how to configure the scrollbar within a panel.

A panel will appear with a scrollbar if the the contents of your view has a fixed height.
If you are using a relative height such as `100%` you will need a child container
with the appropiate `overflow` value to allow for scrollbars.

## Live Examples

The following example contains three views:
- **Panel 1** (`height: 100%`): No scrollbar appears and the content is clipped.
- **Panel 2** (`height: 2000px`): A scrollbar does appear since a fixed height has been used.
- **Panel 3**: `height: 100%` and a child component with `overflow: auto` which will enable scrollbars.

<CodeRunner id="dockview/scrollbars"/>
````

## File: packages/docs/docs/core/watermark.mdx
````markdown
---
title: Watermark
---

import useBaseUrl from '@docusaurus/useBaseUrl';

import { DocRef } from '@site/src/components/ui/reference/docRef';

When there is nothing else to display.

When the dock is empty or a group has no panels (an empty group) you can render some fallback
content which is refered to as a `watermark`. Both are controlled through the same provided component.

## Options

The following properties can be set to configure the behaviours of floating groups.

<FrameworkSpecific framework='React'>
  <DocRef declaration="IDockviewReactProps" methods={['watermarkComponent']} />
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
  <DocRef declaration="IDockviewVueProps" methods={['watermarkComponent']} />
</FrameworkSpecific>

<FrameworkSpecific framework='JavaScript'>
  <DocRef declaration="DockviewComponentOptions"
  methods={['createWatermarkComponent']}
  />
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
  <DocRef declaration="IDockviewAngularProps" methods={['watermarkComponent']} />
</FrameworkSpecific>

## Live Examples

<CodeRunner id="dockview/watermark"/>
````

## File: packages/docs/docs/other/gridview/overview.mdx
````markdown
---
title: Overview
sidebar_position: 0
---

import LiveExample from '@site/src/components/ui/exampleFrame';
import { DocRef } from '@site/src/components/ui/reference/docRef';

The implementation of the dock is a collection of nested *splitview* controls forming a *gridview*
which is exposed as a seperate component to be used independantly.

<DocRef declaration="IGridviewReactProps"/>

## Live Example

<LiveExample framework='react' id='gridview/simple' />
````

## File: packages/docs/docs/other/paneview/overview.mdx
````markdown
---
title: Overview
sidebar_position: 0
---
import LiveExample from '@site/src/components/ui/exampleFrame';
import { DocRef } from '@site/src/components/ui/reference/docRef';

A *splitview* control where each panel contains a header and collapsable content.

<DocRef declaration="IPaneviewReactProps"/>

## Live Example

<LiveExample framework='react' id='paneview/simple' />
````

## File: packages/docs/docs/other/splitview/overview.mdx
````markdown
---
title: Overview
sidebar_position: 0
---

The implementation of the dock is a collection of nested *splitview* controls
which is exposed as a seperate component to be used independantly.

import LiveExample from '@site/src/components/ui/exampleFrame';
import { DocRef } from '@site/src/components/ui/reference/docRef';

<DocRef declaration="ISplitviewReactProps"/>

## Live Example

<LiveExample framework='react' id='splitview/simple' height={200} />
````

## File: packages/docs/docs/other/tabview.mdx
````markdown
---
title: Tabview
sidebar_position: 3
---

A *tabview* can be created using a dock and preventing some default behaviours.

<CodeRunner id='dockview/tabview' />
````

## File: packages/docs/docs/overview/getStarted/contributing.mdx
````markdown
---
sidebar_position: 2
description: Contributing
title: Contributing
---

## Project description

Pre-requisites: Node >=18, Yarn

Dockview is a layout manager library designed to provide a complete layouting solution.
It is written in plain TypeScript and can be used without any framework although
an extensive React wrapper has always and will always be provided for those using the React framework.

The project is hosted on GitHub and developed within a Monorepo powered by [Lerna](https://github.com/lerna/lerna).
It is developed using the `yarn` package manager since at the time of creation `yarn` was far superior when it came to managing monorepos.
The Monorepo contains three packages:

#### packages/dockview-core

The core project is entirely written in plain TypeScript without any frameworks or dependencies and it's source-code can be found
within the `dockview-core` package which is also published to npm.

#### packages/dockview

A complete collection of React components for use through the React framework to use dockview seamlessly
and is published to npm. It depends explicitly on `dockview-core` so there is no need to additionally install `dockview-core`.

> Dockview was originally a React-only library which is why the React version maintains the name `dockview` after
> splitting the core logic into a seperate package named `dockview-core`.

#### packages/docs

This package contains the code for this documentation website and examples hosted through **CodeSandbox**. It is **not** a published package on npm.

# Run the project locally

1. After you have cloned the project from GitHub run `yarn` at the root of the project which will install all project dependencies.
2. In order build `packages/dockview-core` then `packages/dockview`.
3. Run the docs website through `npm run start` in the `packages/docs` directory and go to _http://localhost:3000_ which
   will now be running the local copy of `dockview` that you have just built.

### Examples

All examples can be found under [**packages/docs/sandboxes**](https://github.com/mathuo/dockview/tree/master/packages/docs/sandboxes).
Each example is an independently runnable example through **CodeSandbox**.
Through the documentation you will see links to runnable **CodeSandbox** examples.

## FAQ

#### Are there any plans to publish wrapper libraries for other frameworks such as Angular and Vue?

Vue3 is now supported through the `dockview-vue` package, an Angular wrapper is intended once time permits.
````

## File: packages/docs/docs/overview/getStarted/installation.mdx
````markdown
---
id: installation
title: Installation
sidebar_position: 0
---

Learn how to install Dockview for a selection of frameworks.

<FrameworkSpecific framework='JavaScript'>
Firstly, install the `dockview-core` library:

```sh
npm install dockview-core
```
</FrameworkSpecific>

<FrameworkSpecific framework='React'>
Firstly, install the `dockview` library:

```sh
npm install dockview-react
```
</FrameworkSpecific>


<FrameworkSpecific framework='Vue'>
Firstly, install the `dockview-vue` library:

```sh
npm install dockview-vue
```
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
Firstly, install the `dockview-angular` library:

```sh
npm install dockview-angular
```
</FrameworkSpecific>
````

## File: packages/docs/docs/overview/getStarted/theme.mdx
````markdown
---
sidebar_position: 1
description: Theming Dockview Components
title: Theme
---


import { CSSVariablesTable, ThemeTable } from '@site/src/components/cssVariables';
import { DocRef } from '@site/src/components/ui/reference/docRef';

Dockview components accept a `theme` property which is highly customizable, the theme is largly controlled through CSS however some properties can only be adjusted
by direct editing variables of the `theme` object.

Firstly, you should import `dockview.css`:

<FrameworkSpecific framework='JavaScript'>
```css
@import './node_modules/dockview-core/dist/styles/dockview.css';
```
</FrameworkSpecific>

<FrameworkSpecific framework='React'>
```css
@import './node_modules/dockview-react/dist/styles/dockview.css';
```
</FrameworkSpecific>

<FrameworkSpecific framework='Vue'>
```css
@import './node_modules/dockview-vue/dist/styles/dockview.css';
```
</FrameworkSpecific>

<FrameworkSpecific framework='Angular'>
```css
@import './node_modules/dockview-angular/dist/styles/dockview.css';
```
</FrameworkSpecific>


## Provided themes

`dockview` comes with a number of built-in themes. Each theme is represented as an object that can be imported.

For dock components you should pass the theme object to the `theme` property, for other components such as split, pane and grid views you should
use set the themes associated CSS class to the `className` property.

```tsx
import { themeAbyss } from "dockview";

// For dock components
theme={themeAbyss}

// For other components
const {className} = themeAbyss;
```

<ThemeTable/>

:::info
The source code for all themes can be found [here](https://github.com/mathuo/dockview/blob/master/packages/dockview-core/src/theme.scss) and the associated CSS [here](https://github.com/mathuo/dockview/blob/master/packages/dockview-core/src/theme.scss).
:::

## Build your own theme

You can define your own `DockviewTheme` object and pass it to the `theme` property.

<DocRef declaration="DockviewTheme" />


## Customizing Theme

The provided themes are controlled primarily through a long list of CSS variables which can be modified by the user either entirely for a new theme
or partial for a modification to an existing theme.

<CSSVariablesTable />

## Extending Theme

You can extends existing themes or create new themes.

As an example if you wanted to extend the **dockview-theme-abyss** theme to dislay a within the tabs container you
may try:


```css
.dockview-theme-abyss {
  .groupview {
      &.active-group {
          > .tabs-and-actions-container {
              border-bottom: 2px solid var(--dv-activegroup-visiblepanel-tab-background-color);
          }
      }
      &.inactive-group {
          > .tabs-and-actions-container {
              border-bottom: 2px solid var(--dv-inactivegroup-visiblepanel-tab-background-color);
          }
      }
  }
}
```
````

## File: packages/docs/docs/index.mdx
````markdown
landing
````

## File: packages/docs/sandboxes/dockview-app/src/app.tsx
````typescript
import {
    GridviewReact,
    GridviewReadyEvent,
    IGridviewPanelProps,
    IPaneviewPanelProps,
    PaneviewReact,
    PaneviewReadyEvent,
} from 'dockview';
import * as React from 'react';

const paneComponents = {
    default: (props: IPaneviewPanelProps) => {
        return (
            <div
                style={{
                    height: '100%',
                    padding: '20px',
                    background: 'var(--dv-group-view-background-color)',
                }}
            >
                {props.params.title}
            </div>
        );
    },
};

const components = {
    default: (props: IGridviewPanelProps<{ title: string }>) => {
        return (
            <div
                style={{
                    height: '100%',
                    padding: '20px',
                    background: 'var(--dv-group-view-background-color)',
                }}
            >
                {props.params.title}
            </div>
        );
    },
    panes: (props: IGridviewPanelProps) => {
        const onReady = (event: PaneviewReadyEvent) => {
            event.api.addPanel({
                id: 'pane_1',
                component: 'default',
                title: 'Pane 1',
                isExpanded: false,
            });

            event.api.addPanel({
                id: 'pane_2',
                component: 'default',
                title: 'Pane 2',
                isExpanded: true,
            });

            event.api.addPanel({
                id: 'pane_3',
                component: 'default',
                title: 'Pane 3',
                isExpanded: true,
            });

            event.api.addPanel({
                id: 'pane_4',
                component: 'default',
                title: 'Pane 4',
                isExpanded: false,
            });
        };

        return <PaneviewReact onReady={onReady} components={paneComponents} />;
    },
};

const DockviewDemo2 = (props: { theme?: string }) => {
    const onReady = (event: GridviewReadyEvent) => {
        event.api.addPanel({
            id: 'panes',
            component: 'panes',
            minimumHeight: 100,
            minimumWidth: 100,
        });

        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            position: { referencePanel: 'panes', direction: 'right' },
            minimumHeight: 100,
            minimumWidth: 100,
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            position: { referencePanel: 'panel_1', direction: 'below' },
            minimumHeight: 100,
            minimumWidth: 100,
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            position: { referencePanel: 'panel_2', direction: 'below' },
            minimumHeight: 100,
            minimumWidth: 100,
        });
    };

    return (
        <GridviewReact
            onReady={onReady}
            components={components}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default DockviewDemo2;
````

## File: packages/docs/sandboxes/dockview-app/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/constraints/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    GridConstraintChangeEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

const components = {
    default: (props: IDockviewPanelProps) => {
        const [contraints, setContraints] =
            React.useState<GridConstraintChangeEvent | null>(null);

        React.useEffect(() => {
            props.api.group.api.onDidConstraintsChange((event) => {
                setContraints(event);
            });
        }, []);

        const onClick = () => {
            props.api.group.api.setConstraints({
                maximumWidth: 300,
                maximumHeight: 300,
            });
        };

        return (
            <div
                style={{
                    height: '100%',
                    padding: '20px',
                    background: 'var(--dv-group-view-background-color)',
                    color: 'white',
                }}
            >
                <button onClick={onClick}>Set</button>
                {contraints && (
                    <div style={{ fontSize: '13px' }}>
                        {typeof contraints.maximumHeight === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '1px',
                                }}
                            >
                                <span
                                    style={{ color: 'grey' }}
                                >{`Maximum Height: `}</span>
                                <span>{`${contraints.maximumHeight}px`}</span>
                            </div>
                        )}
                        {typeof contraints.minimumHeight === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '1px',
                                }}
                            >
                                <span
                                    style={{ color: 'grey' }}
                                >{`Minimum Height: `}</span>
                                <span>{`${contraints.minimumHeight}px`}</span>
                            </div>
                        )}
                        {typeof contraints.maximumWidth === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '1px',
                                }}
                            >
                                <span
                                    style={{ color: 'grey' }}
                                >{`Maximum Width: `}</span>
                                <span>{`${contraints.maximumWidth}px`}</span>
                            </div>
                        )}
                        {typeof contraints.minimumWidth === 'number' && (
                            <div
                                style={{
                                    border: '1px solid grey',
                                    margin: '2px',
                                    padding: '1px',
                                }}
                            >
                                <span
                                    style={{ color: 'grey' }}
                                >{`Minimum Width: `}</span>
                                <span>{`${contraints.minimumWidth}px`}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    },
};

const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        const panel1 = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        const panel2 = event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            position: {
                referencePanel: panel1,
                direction: 'right',
            },
        });

        const panel3 = event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            position: {
                referencePanel: panel2,
                direction: 'right',
            },
        });

        const panel4 = event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            position: {
                direction: 'below',
            },
        });
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default App;
````

## File: packages/docs/sandboxes/react/dockview/constraints/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/app.tsx
````typescript
import {
    DockviewDefaultTab,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
    DockviewApi,
    DockviewTheme,
} from 'dockview';
import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import './app.scss';
import { defaultConfig } from './defaultLayout';
import { GridActions } from './gridActions';
import { PanelActions } from './panelActions';
import { GroupActions } from './groupActions';
import { LeftControls, PrefixHeaderControls, RightControls } from './controls';
import { Table, usePanelApiMetadata } from './debugPanel';

const DebugContext = React.createContext<boolean>(false);

const Option = (props: {
    title: string;
    onClick: () => void;
    value: string;
}) => {
    return (
        <div>
            <span>{`${props.title}: `}</span>
            <button onClick={props.onClick}>{props.value}</button>
        </div>
    );
};

const ShadowIframe = (props: IDockviewPanelProps) => {
    return (
        <iframe
            onMouseDown={() => {
                if (!props.api.isActive) {
                    props.api.setActive();
                }
            }}
            style={{ border: 'none', width: '100%', height: '100%' }}
            src="https://dockview.dev"
        />
    );
};

const components = {
    default: (props: IDockviewPanelProps) => {
        const isDebug = React.useContext(DebugContext);
        const metadata = usePanelApiMetadata(props.api);

        const [firstRender, setFirstRender] = React.useState<string>('');

        React.useEffect(() => {
            setFirstRender(new Date().toISOString());
        }, []);

        return (
            <div
                style={{
                    height: '100%',
                    overflow: 'auto',
                    position: 'relative',
                    padding: 5,
                    border: isDebug ? '2px dashed orange' : '',
                }}
            >
                <span
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%,-50%)',
                        pointerEvents: 'none',
                        fontSize: '42px',
                        opacity: 0.5,
                    }}
                >
                    {props.api.title}
                </span>

                <div>{firstRender}</div>

                {isDebug && (
                    <div style={{ fontSize: '0.8em' }}>
                        <Option
                            title="Panel Rendering Mode"
                            value={metadata.renderer.value}
                            onClick={() =>
                                props.api.setRenderer(
                                    props.api.renderer === 'always'
                                        ? 'onlyWhenVisible'
                                        : 'always'
                                )
                            }
                        />

                        <Table data={metadata} />
                    </div>
                )}
            </div>
        );
    },
    nested: (props: IDockviewPanelProps) => {
        const theme = React.useContext(ThemeContext);
        return (
            <DockviewReact
                components={components}
                onReady={(event: DockviewReadyEvent) => {
                    event.api.addPanel({ id: 'panel_1', component: 'default' });
                    event.api.addPanel({ id: 'panel_2', component: 'default' });
                    event.api.addPanel({
                        id: 'panel_3',
                        component: 'default',
                    });

                    event.api.onDidRemovePanel((e) => {
                        console.log('remove', e);
                    });
                }}
                theme={theme}
            />
        );
    },
    iframe: (props: IDockviewPanelProps) => {
        return (
            <iframe
                onMouseDown={() => {
                    if (!props.api.isActive) {
                        props.api.setActive();
                    }
                }}
                style={{
                    border: 'none',
                    width: '100%',
                    height: '100%',
                }}
                src="https://dockview.dev"
            />
        );
    },
    shadowDom: (props: IDockviewPanelProps) => {
        const ref = React.useRef<HTMLDivElement>(null);

        React.useEffect(() => {
            if (!ref.current) {
                return;
            }

            const shadow = ref.current.attachShadow({
                mode: 'open',
            });

            const shadowRoot = document.createElement('div');
            shadowRoot.style.height = '100%';
            shadow.appendChild(shadowRoot);

            const root = ReactDOM.createRoot(shadowRoot);

            root.render(<ShadowIframe {...props} />);

            return () => {
                root.unmount();
            };
        }, []);

        return <div style={{ height: '100%' }} ref={ref}></div>;
    },
};

const headerComponents = {
    default: (props: IDockviewPanelHeaderProps) => {
        const onContextMenu = (event: React.MouseEvent) => {
            event.preventDefault();
            alert('context menu');
        };
        return <DockviewDefaultTab onContextMenu={onContextMenu} {...props} />;
    },
};

const colors = [
    'rgba(255,0,0,0.2)',
    'rgba(0,255,0,0.2)',
    'rgba(0,0,255,0.2)',
    'rgba(255,255,0,0.2)',
    'rgba(0,255,255,0.2)',
    'rgba(255,0,255,0.2)',
];
let count = 0;

const WatermarkComponent = () => {
    return <div>custom watermark</div>;
};

const ThemeContext = React.createContext<DockviewTheme | undefined>(undefined);

const DockviewDemo = (props: { theme?: DockviewTheme }) => {
    const [logLines, setLogLines] = React.useState<
        { text: string; timestamp?: Date; backgroundColor?: string }[]
    >([]);

    const [panels, setPanels] = React.useState<string[]>([]);
    const [groups, setGroups] = React.useState<string[]>([]);
    const [api, setApi] = React.useState<DockviewApi>();

    const [activePanel, setActivePanel] = React.useState<string>();
    const [activeGroup, setActiveGroup] = React.useState<string>();

    const [pending, setPending] = React.useState<
        { text: string; timestamp?: Date }[]
    >([]);

    const addLogLine = (message: string) => {
        setPending((line) => [
            { text: message, timestamp: new Date() },
            ...line,
        ]);
    };

    React.useLayoutEffect(() => {
        if (pending.length === 0) {
            return;
        }
        const color = colors[count++ % colors.length];
        setLogLines((lines) => [
            ...pending.map((_) => ({ ..._, backgroundColor: color })),
            ...lines,
        ]);
        setPending([]);
    }, [pending]);

    React.useEffect(() => {
        if (!api) {
            return;
        }

        const disposables = [
            api.onDidAddPanel((event) => {
                setPanels((_) => [..._, event.id]);
                addLogLine(`Panel Added ${event.id}`);
            }),
            api.onDidActivePanelChange((event) => {
                setActivePanel(event?.id);
                addLogLine(`Panel Activated ${event?.id}`);
            }),
            api.onDidRemovePanel((event) => {
                setPanels((_) => {
                    const next = [..._];
                    next.splice(
                        next.findIndex((x) => x === event.id),
                        1
                    );

                    return next;
                });
                addLogLine(`Panel Removed ${event.id}`);
            }),

            api.onDidAddGroup((event) => {
                setGroups((_) => [..._, event.id]);
                addLogLine(`Group Added ${event.id}`);
            }),

            api.onDidMovePanel((event) => {
                addLogLine(`Panel Moved ${event.panel.id}`);
            }),

            api.onDidMaximizedGroupChange((event) => {
                addLogLine(
                    `Group Maximized Changed ${event.group.api.id} [${event.isMaximized}]`
                );
            }),

            api.onDidRemoveGroup((event) => {
                setGroups((_) => {
                    const next = [..._];
                    next.splice(
                        next.findIndex((x) => x === event.id),
                        1
                    );

                    return next;
                });
                addLogLine(`Group Removed ${event.id}`);
            }),

            api.onDidActiveGroupChange((event) => {
                setActiveGroup(event?.id);
                addLogLine(`Group Activated ${event?.id}`);
            }),
        ];

        const loadLayout = () => {
            const state = localStorage.getItem('dv-demo-state');

            if (state) {
                try {
                    api.fromJSON(JSON.parse(state));
                    return;
                } catch {
                    localStorage.removeItem('dv-demo-state');
                }
                return;
            }

            defaultConfig(api);
        };

        loadLayout();

        return () => {
            disposables.forEach((disposable) => disposable.dispose());
        };
    }, [api]);

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);
    };

    const [watermark, setWatermark] = React.useState<boolean>(false);

    const [gapCheck, setGapCheck] = React.useState<boolean>(false);

    const css = React.useMemo(() => {
        if (!gapCheck) {
            return {};
        }

        return {
            '--dv-group-gap-size': '0.5rem',
            '--demo-border': '5px dashed purple',
        } as React.CSSProperties;
    }, [gapCheck]);

    const [showLogs, setShowLogs] = React.useState<boolean>(false);
    const [debug, setDebug] = React.useState<boolean>(false);

    return (
        <div
            className="dockview-demo"
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                padding: '8px',
                backgroundColor: 'rgba(0,0,50,0.25)',
                borderRadius: '8px',
                position: 'relative',
                ...css,
            }}
        >
            <div>
                <GridActions
                    api={api}
                    toggleCustomWatermark={() => setWatermark(!watermark)}
                    hasCustomWatermark={watermark}
                />
                {api && (
                    <PanelActions
                        api={api}
                        panels={panels}
                        activePanel={activePanel}
                    />
                )}
                {api && (
                    <GroupActions
                        api={api}
                        groups={groups}
                        activeGroup={activeGroup}
                    />
                )}
                {/* <div>
                    <button
                        onClick={() => {
                            setGapCheck(!gapCheck);
                        }}
                    >
                        {gapCheck ? 'Disable Gap Check' : 'Enable Gap Check'}
                    </button>
                </div> */}
            </div>
            <div
                className="action-container"
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    padding: '4px',
                }}
            >
                <button
                    onClick={() => {
                        setDebug(!debug);
                    }}
                >
                    <span className="material-symbols-outlined">
                        engineering
                    </span>
                </button>
                {showLogs && (
                    <button
                        onClick={() => {
                            setLogLines([]);
                        }}
                    >
                        <span className="material-symbols-outlined">undo</span>
                    </button>
                )}
                <button
                    onClick={() => {
                        setShowLogs(!showLogs);
                    }}
                >
                    <span style={{ paddingRight: '4px' }}>
                        {`${showLogs ? 'Hide' : 'Show'} Events Log`}
                    </span>
                    <span className="material-symbols-outlined">terminal</span>
                </button>
            </div>
            <div
                style={{
                    flexGrow: 1,
                    height: 0,
                    display: 'flex',
                }}
            >
                <div
                    style={{
                        flexGrow: 1,
                        overflow: 'hidden',
                        display: 'flex',
                    }}
                >
                    <DebugContext.Provider value={debug}>
                        <ThemeContext.Provider value={props.theme}>
                            <DockviewReact
                                components={components}
                                defaultTabComponent={headerComponents.default}
                                rightHeaderActionsComponent={RightControls}
                                leftHeaderActionsComponent={LeftControls}
                                prefixHeaderActionsComponent={
                                    PrefixHeaderControls
                                }
                                watermarkComponent={
                                    watermark ? WatermarkComponent : undefined
                                }
                                onReady={onReady}
                                theme={props.theme}
                            />
                        </ThemeContext.Provider>
                    </DebugContext.Provider>
                </div>

                {showLogs && (
                    <div
                        style={{
                            width: '400px',
                            backgroundColor: 'black',
                            color: 'white',
                            overflow: 'hidden',
                            fontFamily: 'monospace',
                            marginLeft: '10px',
                            flexShrink: 0,
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div style={{ flexGrow: 1, overflow: 'auto' }}>
                            {logLines.map((line, i) => {
                                return (
                                    <div
                                        style={{
                                            height: '30px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            fontSize: '13px',
                                            display: 'flex',
                                            alignItems: 'center',

                                            backgroundColor:
                                                line.backgroundColor,
                                        }}
                                        key={i}
                                    >
                                        <span
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                minWidth: '20px',
                                                maxWidth: '20px',
                                                color: 'gray',
                                                borderRight: '1px solid gray',
                                                marginRight: '4px',
                                                paddingLeft: '4px',
                                                height: '100%',
                                            }}
                                        >
                                            {logLines.length - i}
                                        </span>
                                        <span>
                                            {line.timestamp && (
                                                <span
                                                    style={{
                                                        fontSize: '0.7em',
                                                        padding: '0px 2px',
                                                    }}
                                                >
                                                    {line.timestamp
                                                        .toISOString()
                                                        .substring(11, 23)}
                                                </span>
                                            )}
                                            <span>{line.text}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div
                            style={{
                                padding: '4px',
                                display: 'flex',
                                justifyContent: 'flex-end',
                            }}
                        >
                            <button onClick={() => setLogLines([])}>
                                Clear
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DockviewDemo;
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/controls.tsx
````typescript
import { IDockviewHeaderActionsProps } from 'dockview';
import * as React from 'react';
import { nextId } from './defaultLayout';

const Icon = (props: {
    icon: string;
    title?: string;
    onClick?: (event: React.MouseEvent) => void;
}) => {
    return (
        <div title={props.title} className="action" onClick={props.onClick}>
            <span
                style={{ fontSize: 'inherit' }}
                className="material-symbols-outlined"
            >
                {props.icon}
            </span>
        </div>
    );
};

const groupControlsComponents: Record<string, React.FC> = {
    panel_1: () => {
        return <Icon icon="file_download" />;
    },
};

export const RightControls = (props: IDockviewHeaderActionsProps) => {
    const Component = React.useMemo(() => {
        if (!props.isGroupActive || !props.activePanel) {
            return null;
        }

        return groupControlsComponents[props.activePanel.id];
    }, [props.isGroupActive, props.activePanel]);

    const [isMaximized, setIsMaximized] = React.useState<boolean>(
        props.containerApi.hasMaximizedGroup()
    );

    const [isPopout, setIsPopout] = React.useState<boolean>(
        props.api.location.type === 'popout'
    );

    React.useEffect(() => {
        const disposable = props.containerApi.onDidMaximizedGroupChange(() => {
            setIsMaximized(props.containerApi.hasMaximizedGroup());
        });

        const disposable2 = props.api.onDidLocationChange(() => {
            setIsPopout(props.api.location.type === 'popout');
        });

        return () => {
            disposable.dispose();
            disposable2.dispose();
        };
    }, [props.containerApi]);

    const onClick = () => {
        if (props.containerApi.hasMaximizedGroup()) {
            props.containerApi.exitMaximizedGroup();
        } else {
            props.activePanel?.api.maximize();
        }
    };

    const onClick2 = () => {
        if (props.api.location.type !== 'popout') {
            props.containerApi.addPopoutGroup(props.group);
        } else {
            props.api.moveTo({ position: 'right' });
        }
    };

    return (
        <div
            className="group-control"
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0px 8px',
                height: '100%',
                color: 'var(--dv-activegroup-hiddenpanel-tab-color)',
            }}
        >
            {props.isGroupActive && <Icon icon="star" />}
            {Component && <Component />}
            <Icon
                title={isPopout ? 'Close Window' : 'Open In New Window'}
                icon={isPopout ? 'close_fullscreen' : 'open_in_new'}
                onClick={onClick2}
            />
            {!isPopout && (
                <Icon
                    title={isMaximized ? 'Minimize View' : 'Maximize View'}
                    icon={isMaximized ? 'collapse_content' : 'expand_content'}
                    onClick={onClick}
                />
            )}
        </div>
    );
};

export const LeftControls = (props: IDockviewHeaderActionsProps) => {
    const onClick = () => {
        props.containerApi.addPanel({
            id: `id_${Date.now().toString()}`,
            component: 'default',
            title: `Tab ${nextId()}`,
            position: {
                referenceGroup: props.group,
            },
        });
    };

    return (
        <div
            className="group-control"
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0px 8px',
                height: '100%',
                color: 'var(--dv-activegroup-visiblepanel-tab-color)',
            }}
        >
            <Icon onClick={onClick} icon="add" />
        </div>
    );
};

export const PrefixHeaderControls = (props: IDockviewHeaderActionsProps) => {
    return (
        <div
            className="group-control"
            style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0px 8px',
                height: '100%',
                color: 'var(--dv-activegroup-visiblepanel-tab-color)',
            }}
        >
            <Icon icon="Menu" />
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/debugPanel.tsx
````typescript
import {
    DockviewGroupLocation,
    DockviewPanelApi,
    DockviewPanelRenderer,
} from 'dockview';
import * as React from 'react';

export interface PanelApiMetadata {
    isActive: {
        value: boolean;
        count: number;
    };
    isVisible: {
        value: boolean;
        count: number;
    };
    renderer: {
        value: DockviewPanelRenderer;
        count: number;
    };
    isGroupActive: {
        value: boolean;
        count: number;
    };
    groupChanged: {
        count: number;
    };
    location: {
        value: DockviewGroupLocation;
        count: number;
    };
    didFocus: {
        count: number;
    };
    dimensions: {
        count: number;
        value: { height: number; width: number };
    };
}

export const Table = (props: { data: PanelApiMetadata }) => {
    return (
        <div className="data-table">
            <table>
                <tr>
                    <th>{'Key'}</th>
                    <th>{'Count'}</th>
                    <th>{'Value'}</th>
                </tr>
                {Object.entries(props.data).map(([key, value]) => {
                    return (
                        <tr key={key}>
                            <th>{key}</th>
                            <th>{value.count}</th>
                            <th>{JSON.stringify(value.value, null, 4)}</th>
                        </tr>
                    );
                })}
            </table>
        </div>
    );
};

export function usePanelApiMetadata(api: DockviewPanelApi): PanelApiMetadata {
    const [state, setState] = React.useState<PanelApiMetadata>({
        isActive: { value: api.isActive, count: 0 },
        isVisible: { value: api.isVisible, count: 0 },
        renderer: { value: api.renderer, count: 0 },
        isGroupActive: { value: api.isGroupActive, count: 0 },
        groupChanged: { count: 0 },
        location: { value: api.location, count: 0 },
        didFocus: { count: 0 },
        dimensions: {
            count: 0,
            value: { height: api.height, width: api.width },
        },
    });

    React.useEffect(() => {
        const d1 = api.onDidActiveChange((event) => {
            setState((_) => ({
                ..._,
                isActive: {
                    value: event.isActive,
                    count: _.isActive.count + 1,
                },
            }));
        });
        const d2 = api.onDidActiveGroupChange((event) => {
            setState((_) => ({
                ..._,
                isGroupActive: {
                    value: event.isActive,
                    count: _.isGroupActive.count + 1,
                },
            }));
        });
        const d3 = api.onDidDimensionsChange((event) => {
            setState((_) => ({
                ..._,
                dimensions: {
                    count: _.dimensions.count + 1,
                    value: { height: event.height, width: event.width },
                },
            }));
        });
        const d4 = api.onDidFocusChange((event) => {
            setState((_) => ({
                ..._,
                didFocus: {
                    count: _.didFocus.count + 1,
                },
            }));
        });
        const d5 = api.onDidGroupChange((event) => {
            setState((_) => ({
                ..._,
                groupChanged: {
                    count: _.groupChanged.count + 1,
                },
            }));
        });
        const d7 = api.onDidLocationChange((event) => {
            setState((_) => ({
                ..._,
                location: {
                    value: event.location,
                    count: _.location.count + 1,
                },
            }));
        });
        const d8 = api.onDidRendererChange((event) => {
            setState((_) => ({
                ..._,
                renderer: {
                    value: event.renderer,
                    count: _.renderer.count + 1,
                },
            }));
        });
        const d9 = api.onDidVisibilityChange((event) => {
            setState((_) => ({
                ..._,
                isVisible: {
                    value: event.isVisible,
                    count: _.isVisible.count + 1,
                },
            }));
        });

        return () => {
            d1.dispose();
            d2.dispose();
            d3.dispose();
            d4.dispose();
            d5.dispose();
            d7.dispose();
            d8.dispose();
            d9.dispose();
        };
    }, [api]);

    return state;
}
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/gridActions.tsx
````typescript
import { DockviewApi } from 'dockview';
import * as React from 'react';
import { defaultConfig, nextId } from './defaultLayout';

import { createRoot } from 'react-dom/client';
import { PanelBuilder } from './panelBuilder';

let mount = document.querySelector('.popover-anchor') as HTMLElement | null;

if (!mount) {
    mount = document.createElement('div');
    mount.className = 'popover-anchor';
    document.body.insertBefore(mount, document.body.firstChild);
}

const PopoverComponent = (props: {
    close: () => void;
    component: React.FC<{ close: () => void }>;
}) => {
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handler = (ev: MouseEvent) => {
            let target = ev.target as HTMLElement;

            while (target.parentElement) {
                if (target === ref.current) {
                    return;
                }
                target = target.parentElement;
            }

            props.close();
        };

        window.addEventListener('mousedown', handler);

        return () => {
            window.removeEventListener('mousedown', handler);
        };
    }, []);

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                zIndex: 9999,
                height: '100%',
                width: '100%',
            }}
        >
            <div
                ref={ref}
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%,-50%)',
                    backgroundColor: 'black',
                    color: 'white',
                    padding: 10,
                }}
            >
                <props.component close={props.close} />
            </div>
        </div>
    );
};

function usePopover() {
    return {
        open: (Component: React.FC<{ close: () => void }>) => {
            const el = document.createElement('div');
            mount!.appendChild(el);
            const root = createRoot(el);

            root.render(
                <PopoverComponent
                    component={Component}
                    close={() => {
                        root.unmount();
                        el.remove();
                    }}
                />
            );
        },
    };
}

export const GridActions = (props: {
    api?: DockviewApi;
    hasCustomWatermark: boolean;
    toggleCustomWatermark: () => void;
}) => {
    const onClear = () => {
        props.api?.clear();
    };

    const onLoad = () => {
        const state = localStorage.getItem('dv-demo-state');
        if (state) {
            try {
                props.api?.fromJSON(JSON.parse(state));
            } catch (err) {
                console.error('failed to load state', err);
                localStorage.removeItem('dv-demo-state');
            }
        }
    };

    const onLoad2 = () => {
        const state = localStorage.getItem('dv-demo-state');
        if (state) {
            try {
                props.api?.fromJSON(JSON.parse(state), {
                    keepExistingPanels: true,
                });

                setGap(props.api?.gap ?? 0);
            } catch (err) {
                console.error('failed to load state', err);
                localStorage.removeItem('dv-demo-state');
            }
        }
    };

    const onSave = () => {
        if (props.api) {
            const state = props.api.toJSON();
            console.log(state);

            localStorage.setItem('dv-demo-state', JSON.stringify(state));
        }
    };

    const onReset = () => {
        if (props.api) {
            try {
                props.api.clear();
                defaultConfig(props.api);
            } catch (err) {
                localStorage.removeItem('dv-demo-state');
            }
        }
    };

    const popover = usePopover();

    const onAddPanel = (options?: { advanced?: boolean; nested?: boolean }) => {
        if (options?.advanced) {
            popover.open(({ close }) => {
                return <PanelBuilder api={props.api!} done={close} />;
            });
        } else {
            props.api?.addPanel({
                id: `id_${Date.now().toString()}`,
                component: options?.nested ? 'nested' : 'default',
                title: `Tab ${nextId()}`,
                renderer: 'always',
            });
        }
    };

    const onAddGroup = () => {
        props.api?.addGroup();
    };

    return (
        <div className="action-container">
            <div className="button-group">
                <button className="text-button" onClick={() => onAddPanel()}>
                    Add Panel
                </button>
                <button
                    className="demo-icon-button"
                    onClick={() => onAddPanel({ advanced: true })}
                >
                    <span className="material-symbols-outlined">tune</span>
                </button>
            </div>
            <button
                className="text-button"
                onClick={() => onAddPanel({ nested: true })}
            >
                Add Nested Panel
            </button>
            <button className="text-button" onClick={onAddGroup}>
                Add Group
            </button>
            <span className="button-action">
                <button
                    className={
                        props.hasCustomWatermark
                            ? 'demo-button selected'
                            : 'demo-button'
                    }
                    onClick={props.toggleCustomWatermark}
                >
                    Use Custom Watermark
                </button>
            </span>
            <button className="text-button" onClick={onClear}>
                Clear
            </button>
            <button className="text-button" onClick={onLoad}>
                Load
            </button>
            <button className="text-button" onClick={onLoad2}>
                Load2
            </button>
            <button className="text-button" onClick={onSave}>
                Save
            </button>
            <button className="text-button" onClick={onReset}>
                Reset
            </button>
            <span style={{ flexGrow: 1 }} />
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/groupActions.tsx
````typescript
import {
    DockviewApi,
    DockviewGroupLocation,
    DockviewGroupPanel,
} from 'dockview';
import * as React from 'react';

const GroupAction = (props: {
    groupId: string;
    groups: string[];
    api: DockviewApi;
    activeGroup?: string;
}) => {
    const onClick = () => {
        props.api?.getGroup(props.groupId)?.focus();
    };

    const isActive = props.activeGroup === props.groupId;

    const [group, setGroup] = React.useState<DockviewGroupPanel | undefined>(
        undefined
    );

    React.useEffect(() => {
        const disposable = props.api.onDidLayoutFromJSON(() => {
            setGroup(props.api.getGroup(props.groupId));
        });

        setGroup(props.api.getGroup(props.groupId));

        return () => {
            disposable.dispose();
        };
    }, [props.api, props.groupId]);

    const [location, setLocation] =
        React.useState<DockviewGroupLocation | null>(null);
    const [isMaximized, setIsMaximized] = React.useState<boolean>(false);
    const [isVisible, setIsVisible] = React.useState<boolean>(true);

    React.useEffect(() => {
        if (!group) {
            setLocation(null);
            return;
        }

        const disposable = group.api.onDidLocationChange((event) => {
            setLocation(event.location);
        });

        const disposable2 = props.api.onDidMaximizedGroupChange(() => {
            setIsMaximized(group.api.isMaximized());
        });

        const disposable3 = group.api.onDidVisibilityChange(() => {
            setIsVisible(group.api.isVisible);
        });

        setLocation(group.api.location);
        setIsMaximized(group.api.isMaximized());
        setIsVisible(group.api.isVisible);

        return () => {
            disposable.dispose();
            disposable2.dispose();
            disposable3.dispose();
        };
    }, [group]);

    return (
        <div className="button-action">
            <div style={{ display: 'flex' }}>
                <button
                    onClick={onClick}
                    className={
                        isActive ? 'demo-button selected' : 'demo-button'
                    }
                >
                    {props.groupId}
                </button>
            </div>
            <div style={{ display: 'flex' }}>
                <button
                    className={
                        location?.type === 'floating'
                            ? 'demo-icon-button selected'
                            : 'demo-icon-button'
                    }
                    onClick={() => {
                        if (group) {
                            props.api.addFloatingGroup(group, {
                                width: 400,
                                height: 300,
                                x: 50,
                                y: 50,
                                position: {
                                    bottom: 50,
                                    right: 50,
                                },
                            });
                        }
                    }}
                >
                    <span className="material-symbols-outlined">ad_group</span>
                </button>
                <button
                    className={
                        location?.type === 'popout'
                            ? 'demo-icon-button selected'
                            : 'demo-icon-button'
                    }
                    onClick={() => {
                        if (group) {
                            props.api.addPopoutGroup(group);
                        }
                    }}
                >
                    <span className="material-symbols-outlined">
                        open_in_new
                    </span>
                </button>
                <button
                    className={
                        isMaximized
                            ? 'demo-icon-button selected'
                            : 'demo-icon-button'
                    }
                    onClick={() => {
                        if (group) {
                            if (group.api.isMaximized()) {
                                group.api.exitMaximized();
                            } else {
                                group.api.maximize();
                            }
                        }
                    }}
                >
                    <span className="material-symbols-outlined">
                        fullscreen
                    </span>
                </button>
                <button
                    className="demo-icon-button"
                    onClick={() => {
                        console.log(group);
                        if (group) {
                            if (group.api.isVisible) {
                                group.api.setVisible(false);
                            } else {
                                group.api.setVisible(true);
                            }
                        }
                    }}
                >
                    <span className="material-symbols-outlined">
                        {isVisible ? 'visibility' : 'visibility_off'}
                    </span>
                </button>
                <button
                    className="demo-icon-button"
                    onClick={() => {
                        const panel = props.api?.getGroup(props.groupId);
                        panel?.api.close();
                    }}
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>
        </div>
    );
};

export const GroupActions = (props: {
    groups: string[];
    api: DockviewApi;
    activeGroup?: string;
}) => {
    return (
        <div className="action-container">
            {props.groups.map((groupId) => {
                return (
                    <GroupAction key={groupId} {...props} groupId={groupId} />
                );
            })}
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/mapboxPanel.tsx
````typescript
import { IDockviewPanelProps } from 'dockview';
import * as React from 'react';
import Map from 'react-map-gl';

export const MapboxPanel = (props: IDockviewPanelProps) => {
    React.useEffect(() => {
        const subscription = props.api.onDidLocationChange((e) => {
            const isPopout = e.location.type === 'popout';
        });

        return () => subscription.dispose();
    }, [props.api]);

    return (
        <div style={{ overflow: 'auto', height: '100%' }}>
            <Map
                mapboxAccessToken="pk.eyJ1IjoibWF0aHVvIiwiYSI6ImNrMXo4bnJ1ajA5OXUzaXA5ODg3Nnc1M3YifQ.Il7zfYd-sZ113W6Fmmagjg"
                initialViewState={{
                    longitude: -122.4,
                    latitude: 37.8,
                    zoom: 14,
                }}
                style={{ width: 600, height: 400 }}
                mapStyle="mapbox://styles/mapbox/streets-v9"
            />
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/panelActions.tsx
````typescript
import { DockviewApi, IDockviewPanel } from 'dockview';
import * as React from 'react';

const PanelAction = (props: {
    panels: string[];
    api: DockviewApi;
    activePanel?: string;
    panelId: string;
}) => {
    const onClick = () => {
        props.api.getPanel(props.panelId)?.focus();
    };

    React.useEffect(() => {
        const panel = props.api.getPanel(props.panelId);
        if (panel) {
            const disposable = panel.api.onDidVisibilityChange((event) => {
                setVisible(event.isVisible);
            });
            setVisible(panel.api.isVisible);

            return () => {
                disposable.dispose();
            };
        }
    }, [props.api, props.panelId]);

    const [panel, setPanel] = React.useState<IDockviewPanel | undefined>(
        undefined
    );

    React.useEffect(() => {
        const list = [
            props.api.onDidLayoutFromJSON(() => {
                setPanel(props.api.getPanel(props.panelId));
            }),
        ];

        if (panel) {
            const disposable = panel.api.onDidVisibilityChange((event) => {
                setVisible(event.isVisible);
            });
            setVisible(panel.api.isVisible);

            list.push(disposable);
        }

        setPanel(props.api.getPanel(props.panelId));

        return () => {
            list.forEach((l) => l.dispose());
        };
    }, [props.api, props.panelId]);

    const [visible, setVisible] = React.useState<boolean>(true);

    return (
        <div className="button-action">
            <div style={{ display: 'flex' }}>
                <button
                    className={
                        props.activePanel === props.panelId
                            ? 'demo-button selected'
                            : 'demo-button'
                    }
                    onClick={onClick}
                >
                    {props.panelId}
                </button>
            </div>
            <div style={{ display: 'flex' }}>
                <button
                    className="demo-icon-button"
                    onClick={() => {
                        const panel = props.api.getPanel(props.panelId);
                        if (panel) {
                            props.api.addFloatingGroup(panel);
                        }
                    }}
                >
                    <span className="material-symbols-outlined">ad_group</span>
                </button>
                <button
                    className="demo-icon-button"
                    onClick={() => {
                        const panel = props.api.getPanel(props.panelId);
                        if (panel) {
                            props.api.addPopoutGroup(panel);
                        }
                    }}
                >
                    <span className="material-symbols-outlined">
                        open_in_new
                    </span>
                </button>
                <button
                    className="demo-icon-button"
                    onClick={() => {
                        const panel = props.api.getPanel(props.panelId);
                        panel?.api.close();
                    }}
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
                <button
                    title="Panel visiblity cannot be edited manually."
                    disabled={true}
                    className="demo-icon-button"
                >
                    <span className="material-symbols-outlined">
                        {visible ? 'visibility' : 'visibility_off'}
                    </span>
                </button>
            </div>
        </div>
    );
};

export const PanelActions = (props: {
    panels: string[];
    api: DockviewApi;
    activePanel?: string;
}) => {
    return (
        <div className="action-container">
            {props.panels.map((id) => {
                return <PanelAction key={id} {...props} panelId={id} />;
            })}
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/demo-dockview/src/panelBuilder.tsx
````typescript
import { DockviewApi } from 'dockview';
import * as React from 'react';
import { nextId } from './defaultLayout';

export const PanelBuilder = (props: { api: DockviewApi; done: () => void }) => {
    const [parameters, setParameters] = React.useState<{
        initialWidth?: number;
        initialHeight?: number;
        maximumHeight?: number;
        maximumWidth?: number;
        minimumHeight?: number;
        minimumWidth?: number;
    }>({});
    return (
        <div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                }}
            >
                <div>{'Initial Width'}</div>
                <input
                    type="number"
                    value={parameters.initialWidth}
                    onChange={(event) =>
                        setParameters((_) => ({
                            ..._,
                            initialWidth: Number(event.target.value),
                        }))
                    }
                />
                <div>{'Initial Height'}</div>
                <input
                    type="number"
                    value={parameters.initialHeight}
                    onChange={(event) =>
                        setParameters((_) => ({
                            ..._,
                            initialHeight: Number(event.target.value),
                        }))
                    }
                />
                <div>{'Maximum Width'}</div>
                <input
                    type="number"
                    value={parameters.maximumWidth}
                    onChange={(event) =>
                        setParameters((_) => ({
                            ..._,
                            maximumWidth: Number(event.target.value),
                        }))
                    }
                />
                <div>{'Maximum Height'}</div>
                <input
                    type="number"
                    value={parameters.maximumHeight}
                    onChange={(event) =>
                        setParameters((_) => ({
                            ..._,
                            maximumHeight: Number(event.target.value),
                        }))
                    }
                />
                <div>{'Minimum Width'}</div>
                <input
                    type="number"
                    value={parameters.minimumWidth}
                    onChange={(event) =>
                        setParameters((_) => ({
                            ..._,
                            minimumWidth: Number(event.target.value),
                        }))
                    }
                />
                <div>{'Minimum Height'}</div>
                <input
                    type="number"
                    value={parameters.minimumHeight}
                    onChange={(event) =>
                        setParameters((_) => ({
                            ..._,
                            minimumHeight: Number(event.target.value),
                        }))
                    }
                />
            </div>
            <div>
                <button
                    onClick={() => {
                        props.done();
                    }}
                >
                    Cancel
                </button>
                <button
                    onClick={() => {
                        props.api?.addPanel({
                            id: `id_${Date.now().toString()}`,
                            component: 'default',
                            title: `Tab ${nextId()}`,
                            renderer: 'always',
                            ...parameters,
                        });

                        props.done();
                    }}
                >
                    Go
                </button>
            </div>
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/dnd-events/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

const Default = (props: IDockviewPanelProps) => {
    return (
        <div style={{ height: '100%' }}>
            <div>{props.api.title}</div>
        </div>
    );
};

const components = {
    default: Default,
};

const Component = (props: { theme?: string }) => {
    const [disablePanelDrag, setDisablePanelDrag] =
        React.useState<boolean>(false);
    const [disableGroupDrag, setDisableGroupDrag] =
        React.useState<boolean>(false);
    const [disableOverlay, setDisableOverlay] = React.useState<boolean>(false);

    const [api, setApi] = React.useState<DockviewApi>();

    React.useEffect(() => {
        if (!api) {
            return;
        }

        const disposables = [
            api.onWillDragPanel((e) => {
                if (!disablePanelDrag) {
                    return;
                }
                e.nativeEvent.preventDefault();
            }),

            api.onWillDragGroup((e) => {
                if (!disableGroupDrag) {
                    return;
                }
                e.nativeEvent.preventDefault();
            }),
            api.onWillShowOverlay((e) => {
                console.log(e);

                if (!disableOverlay) {
                    return;
                }

                e.preventDefault();
            }),

            api.onWillDrop((e) => {
                //
            }),

            api.onDidDrop((e) => {
                //
            }),
        ];

        return () => {
            disposables.forEach((disposable) => {
                disposable.dispose();
            });
        };
    }, [api, disablePanelDrag, disableGroupDrag, disableOverlay]);

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);

        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            position: {
                direction: 'right',
                referencePanel: 'panel_1',
            },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            position: {
                direction: 'below',
                referencePanel: 'panel_1',
            },
        });
        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
        });
        event.api.addPanel({
            id: 'panel_5',
            component: 'default',
        });
    };

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
            <div>
                <button
                    onClick={() => setDisablePanelDrag(!disablePanelDrag)}
                >{`Panel Drag: ${
                    disablePanelDrag ? 'disabled' : 'enabled'
                }`}</button>
                <button
                    onClick={() => setDisableGroupDrag(!disableGroupDrag)}
                >{`Group Drag: ${
                    disableGroupDrag ? 'disabled' : 'enabled'
                }`}</button>
                <button
                    onClick={() => setDisableOverlay(!disableOverlay)}
                >{`Overlay: ${
                    disableOverlay ? 'disabled' : 'enabled'
                }`}</button>
            </div>
            <div style={{ flexGrow: 1 }}>
                <DockviewReact
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                    onReady={onReady}
                    components={components}
                />
            </div>
        </div>
    );
};

export default Component;
````

## File: packages/docs/sandboxes/react/dockview/dnd-events/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/dnd-external/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewDndOverlayEvent,
    DockviewDidDropEvent,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    positionToDirection,
} from 'dockview';
import * as React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div style={{ padding: '20px' }}>
                <div>{props.params.title}</div>
            </div>
        );
    },
};

const DraggableElement = () => (
    <span
        tabIndex={-1}
        onDragStart={(event) => {
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';

                event.dataTransfer.setData('text/plain', 'nothing');
            }
        }}
        style={{
            backgroundColor: 'orange',
            padding: '0px 8px',
            borderRadius: '4px',
            width: '100px',
            cursor: 'pointer',
        }}
        draggable={true}
    >
        Drag me into the dock
    </span>
);

const DndDockview = (props: { renderVisibleOnly: boolean; theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    React.useEffect(() => {
        if (!api) {
            return;
        }

        api.addPanel({
            id: 'panel_1',
            component: 'default',
            params: {
                title: 'Panel 1',
            },
        });

        api.addPanel({
            id: 'panel_2',
            component: 'default',
            params: {
                title: 'Panel 2',
            },
        });

        api.addPanel({
            id: 'panel_3',
            component: 'default',
            params: {
                title: 'Panel 3',
            },
        });

        api.addPanel({
            id: 'panel_4',
            component: 'default',
            params: {
                title: 'Panel 4',
            },
            position: { referencePanel: 'panel_1', direction: 'right' },
        });

        const panelDragDisposable = api.onWillDragPanel((event) => {
            const dataTransfer = event.nativeEvent.dataTransfer;

            if (dataTransfer) {
                dataTransfer.setData(
                    'text/plain',
                    'Some custom panel data transfer data'
                );
                dataTransfer.setData(
                    'text/json',
                    '{text: "Some custom panel data transfer data"}'
                );
            }
        });

        const groupDragDisposable = api.onWillDragGroup((event) => {
            const dataTransfer = event.nativeEvent.dataTransfer;

            if (dataTransfer) {
                dataTransfer.setData(
                    'text/plain',
                    'Some custom group data transfer data'
                );
                dataTransfer.setData(
                    'text/json',
                    '{text: "Some custom group data transfer data"}'
                );
            }
        });

        const disposable = api.onUnhandledDragOverEvent((event) => {
            event.accept();
        });

        return () => {
            disposable.dispose();
            panelDragDisposable.dispose();
            groupDragDisposable.dispose();
        };
    }, [api]);

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);
    };

    const onDidDrop = (event: DockviewDidDropEvent) => {
        event.api.addPanel({
            id: 'test',
            component: 'default',
            position: {
                direction: positionToDirection(event.position),
                referenceGroup: event.group || undefined,
            },
        });
    };

    const onDrop = (event: React.DragEvent) => {
        const dataTransfer = event.dataTransfer;

        let text = 'The following dataTransfer data was found:\n';

        for (let i = 0; i < dataTransfer.items.length; i++) {
            const item = dataTransfer.items[i];
            const value = dataTransfer.getData(item.type);
            text += `type=${item.type},data=${value}\n`;
        }

        alert(text);
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
            }}
        >
            <div style={{ margin: '2px 0px' }}>
                <DraggableElement />
                <div
                    style={{
                        padding: '0px 4px',
                        backgroundColor: 'black',
                        borderRadius: '2px',
                        color: 'white',
                    }}
                    onDrop={onDrop}
                >
                    Drop a tab or group here to inspect the attached metadata
                </div>
            </div>
            <DockviewReact
                components={components}
                onReady={onReady}
                className={`${props.theme || 'dockview-theme-abyss'}`}
                onDidDrop={onDidDrop}
                dndEdges={{
                    size: { value: 100, type: 'pixels' },
                    activationSize: { value: 5, type: 'percentage' },
                }}
            />
        </div>
    );
};

export default DndDockview;
````

## File: packages/docs/sandboxes/react/dockview/dnd-external/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/floating-groups/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewGroupPanel,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
    SerializedDockview,
} from 'dockview';
import * as React from 'react';
import { Icon } from './utils';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div
                style={{
                    height: '100%',
                    padding: '20px',
                    background: 'var(--dv-group-view-background-color)',
                }}
            >
                {props.params.title}
            </div>
        );
    },
};

const counter = (() => {
    let i = 0;

    return {
        next: () => ++i,
    };
})();

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
    });

    const panel4 = api.addPanel({
        id: 'panel_4',
        component: 'default',
        floating: true,
    });

    api.addPanel({
        id: 'panel_5',
        component: 'default',
        floating: false,
        position: { referencePanel: panel4 },
    });

    api.addPanel({
        id: 'panel_6',
        component: 'default',
    });
}

let panelCount = 0;

function addPanel(api: DockviewApi) {
    api.addPanel({
        id: (++panelCount).toString(),
        title: `Tab ${panelCount}`,
        component: 'default',
    });
}

function addFloatingPanel2(api: DockviewApi) {
    api.addPanel({
        id: (++panelCount).toString(),
        title: `Tab ${panelCount}`,
        component: 'default',
        floating: { width: 250, height: 150, left: 50, top: 50 },
    });
}

function safeParse<T>(value: any): T | null {
    try {
        return JSON.parse(value) as T;
    } catch (err) {
        return null;
    }
}

const useLocalStorage = <T,>(
    key: string
): [T | null, (setter: T | null) => void] => {
    const [state, setState] = React.useState<T | null>(
        safeParse(localStorage.getItem(key))
    );

    React.useEffect(() => {
        const _state = localStorage.getItem('key');
        try {
            if (_state !== null) {
                setState(JSON.parse(_state));
            }
        } catch (err) {
            //
        }
    }, [key]);

    return [
        state,
        (_state: T | null) => {
            if (_state === null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(_state));
                setState(_state);
            }
        },
    ];
};

export const DockviewPersistence = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [layout, setLayout] =
        useLocalStorage<SerializedDockview>('floating.layout');

    const [disableFloatingGroups, setDisableFloatingGroups] =
        React.useState<boolean>(false);

    const load = (api: DockviewApi) => {
        api.clear();
        if (layout) {
            try {
                api.fromJSON(layout);
            } catch (err) {
                console.error(err);
                api.clear();
                loadDefaultLayout(api);
            }
        } else {
            loadDefaultLayout(api);
        }
    };

    const onReady = (event: DockviewReadyEvent) => {
        load(event.api);
        setApi(event.api);
    };

    const [options, setOptions] = React.useState<
        'boundedWithinViewport' | undefined
    >(undefined);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
            }}
        >
            <div style={{ height: '25px' }}>
                <button
                    onClick={() => {
                        if (api) {
                            setLayout(api.toJSON());
                        }
                    }}
                >
                    Save
                </button>
                <button
                    onClick={() => {
                        if (api) {
                            load(api);
                        }
                    }}
                >
                    Load
                </button>
                <button
                    onClick={() => {
                        api!.clear();
                        setLayout(null);
                    }}
                >
                    Clear
                </button>
                <button
                    onClick={() => {
                        addFloatingPanel2(api!);
                    }}
                >
                    Add Floating Group
                </button>
                <button
                    onClick={() => {
                        setOptions(
                            options === undefined
                                ? 'boundedWithinViewport'
                                : undefined
                        );
                    }}
                >
                    {`Bounds: ${options ? 'Within' : 'Overflow'}`}
                </button>
                <button
                    onClick={() => {
                        setDisableFloatingGroups((x) => !x);
                    }}
                >
                    {`${
                        disableFloatingGroups ? 'Enable' : 'Disable'
                    } floating groups`}
                </button>
            </div>
            <div
                style={{
                    flexGrow: 1,
                }}
            >
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    watermarkComponent={Watermark}
                    leftHeaderActionsComponent={LeftComponent}
                    rightHeaderActionsComponent={RightComponent}
                    disableFloatingGroups={disableFloatingGroups}
                    floatingGroupBounds={options}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

const LeftComponent = (props: IDockviewHeaderActionsProps) => {
    const onClick = () => {
        addPanel(props.containerApi);
    };
    return (
        <div style={{ height: '100%', color: 'white', padding: '0px 4px' }}>
            <Icon onClick={onClick} icon={'add'} />
        </div>
    );
};

const RightComponent = (props: IDockviewHeaderActionsProps) => {
    const [floating, setFloating] = React.useState<boolean>(
        props.api.location.type === 'floating'
    );

    React.useEffect(() => {
        const disposable = props.group.api.onDidLocationChange((event) => {
            setFloating(event.location.type === 'floating');
        });

        return () => {
            disposable.dispose();
        };
    }, [props.group.api]);

    const onClick = () => {
        if (floating) {
            const group = props.containerApi.addGroup();
            props.group.api.moveTo({ group });
        } else {
            props.containerApi.addFloatingGroup(props.group, {
                position: {
                    width: 400,
                    height: 300,
                    bottom: 50,
                    right: 50,
                },
            });
        }
    };

    return (
        <div style={{ height: '100%', color: 'white', padding: '0px 4px' }}>
            <Icon
                onClick={onClick}
                icon={floating ? 'jump_to_element' : 'back_to_tab'}
            />
        </div>
    );
};

export default DockviewPersistence;

const Watermark = () => {
    return <div style={{ color: 'white', padding: '8px' }}>watermark</div>;
};
````

## File: packages/docs/sandboxes/react/dockview/floating-groups/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/floating-groups/src/utils.tsx
````typescript
import * as React from 'react';

export const Icon = (props: {
    icon: string;
    title?: string;
    onClick?: (event: React.MouseEvent) => void;
}) => {
    return (
        <div
            title={props.title}
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '30px',
                height: '100%',

                fontSize: '18px',
            }}
            onClick={props.onClick}
        >
            <span
                style={{ fontSize: 'inherit', cursor: 'pointer' }}
                className="material-symbols-outlined"
            >
                {props.icon}
            </span>
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/group-actions/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';
import './app.scss';

const components = {
    default: (props: IDockviewPanelProps<{ title: string; x?: number }>) => {
        return (
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: 'gray',
                    height: '100%',
                }}
            >
                <span>{`${props.api.title}`}</span>
            </div>
        );
    },
};

const RightHeaderActions = (props: IDockviewHeaderActionsProps) => {
    const isGroupActive = props.isGroupActive;

    return (
        <div className="dockview-groupcontrol-demo">
            <span
                className="dockview-groupcontrol-demo-group-active"
                style={{
                    background: isGroupActive ? 'green' : 'red',
                }}
            >
                {isGroupActive ? 'Group Active' : 'Group Inactive'}
            </span>
        </div>
    );
};

const LeftHeaderActions = (props: IDockviewHeaderActionsProps) => {
    const activePanel = props.activePanel;

    return (
        <div className="dockview-groupcontrol-demo">
            <span className="dockview-groupcontrol-demo-active-panel">{`activePanel: ${
                activePanel?.id || 'null'
            }`}</span>
        </div>
    );
};

const PrefixHeader = (props: IDockviewHeaderActionsProps) => {
    const activePanel = props.activePanel;

    return <div className="dockview-groupcontrol-demo">{'🌲'}</div>;
};

const DockviewGroupControl = (props: { theme: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: {
                direction: 'right',
            },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
            position: {
                direction: 'below',
            },
        });
    };

    return (
        <DockviewReact
            onReady={onReady}
            components={components}
            prefixHeaderActionsComponent={PrefixHeader}
            leftHeaderActionsComponent={LeftHeaderActions}
            rightHeaderActionsComponent={RightHeaderActions}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default DockviewGroupControl;
````

## File: packages/docs/sandboxes/react/dockview/group-actions/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/layout/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div
                style={{
                    height: '100%',
                    padding: '20px',
                    background: 'var(--dv-group-view-background-color)',
                }}
            >
                {props.params.title}
            </div>
        );
    },
};

const counter = (() => {
    let i = 0;

    return {
        next: () => ++i,
    };
})();

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
    });
}

export const DockviewPersistence = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const clearLayout = () => {
        localStorage.removeItem('dockview_persistence_layout');
        if (api) {
            api.clear();
            loadDefaultLayout(api);
        }
    };

    const onReady = (event: DockviewReadyEvent) => {
        const layoutString = localStorage.getItem(
            'dockview_persistence_layout'
        );

        let success = false;

        if (layoutString) {
            try {
                const layout = JSON.parse(layoutString);
                event.api.fromJSON(layout);
                success = true;
            } catch (err) {
                console.error(err);
            }
        }

        if (!success) {
            loadDefaultLayout(event.api);
        }

        setApi(event.api);
    };

    React.useEffect(() => {
        if (!api) {
            return;
        }

        api.onDidLayoutChange(() => {
            const layout = api.toJSON();

            localStorage.setItem(
                'dockview_persistence_layout',
                JSON.stringify(layout)
            );
        });
    }, [api]);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
            }}
        >
            <div style={{ height: '25px' }}>
                <button onClick={clearLayout}>Reset Layout</button>
            </div>
            <div
                style={{
                    flexGrow: 1,
                    overflow: 'hidden',
                }}
            >
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    watermarkComponent={Watermark}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

export default DockviewPersistence;

const Watermark = () => {
    return <div style={{ color: 'white', padding: '8px' }}>watermark</div>;
};
````

## File: packages/docs/sandboxes/react/dockview/layout/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/locked/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

const Default = (props: IDockviewPanelProps) => {
    return (
        <div style={{ height: '100%' }}>
            <div>{props.api.title}</div>
        </div>
    );
};

const components = {
    default: Default,
};

const Component = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            position: {
                direction: 'right',
                referencePanel: 'panel_1',
            },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            position: {
                direction: 'below',
                referencePanel: 'panel_1',
            },
        });
        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
        });
        event.api.addPanel({
            id: 'panel_5',
            component: 'default',
        });
    };

    return (
        <DockviewReact
            className={`${props.theme || 'dockview-theme-abyss'}`}
            onReady={onReady}
            components={components}
            locked={true}
        />
    );
};

export default Component;
````

## File: packages/docs/sandboxes/react/dockview/locked/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/maximize-group/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewGroupPanel,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewHeaderActionsProps,
    IDockviewPanelProps,
    SerializedDockview,
} from 'dockview';
import * as React from 'react';
import { Icon } from './utils';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div
                style={{
                    height: '100%',
                    padding: '20px',
                    background: 'var(--dv-group-view-background-color)',
                }}
            >
                {props.params.title}
            </div>
        );
    },
};

const counter = (() => {
    let i = 0;

    return {
        next: () => ++i,
    };
})();

function loadDefaultLayout(api: DockviewApi) {
    api.addPanel({
        id: 'panel_1',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_2',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_3',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_4',
        component: 'default',
    });

    api.addPanel({
        id: 'panel_5',
        component: 'default',
        position: { direction: 'right' },
    });

    api.addPanel({
        id: 'panel_6',
        component: 'default',
    });
}

let panelCount = 0;

function safeParse<T>(value: any): T | null {
    try {
        return JSON.parse(value) as T;
    } catch (err) {
        return null;
    }
}

const useLocalStorage = <T,>(
    key: string
): [T | null, (setter: T | null) => void] => {
    const [state, setState] = React.useState<T | null>(
        safeParse(localStorage.getItem(key))
    );

    React.useEffect(() => {
        const _state = localStorage.getItem('key');
        try {
            if (_state !== null) {
                setState(JSON.parse(_state));
            }
        } catch (err) {
            //
        }
    }, [key]);

    return [
        state,
        (_state: T | null) => {
            if (_state === null) {
                localStorage.removeItem(key);
            } else {
                localStorage.setItem(key, JSON.stringify(_state));
                setState(_state);
            }
        },
    ];
};

export const App = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();
    const [layout, setLayout] =
        useLocalStorage<SerializedDockview>('floating.layout');

    const [disableFloatingGroups, setDisableFloatingGroups] =
        React.useState<boolean>(false);

    const load = (api: DockviewApi) => {
        api.clear();
        if (layout) {
            try {
                api.fromJSON(layout);
            } catch (err) {
                console.error(err);
                api.clear();
                loadDefaultLayout(api);
            }
        } else {
            loadDefaultLayout(api);
        }
    };

    const onReady = (event: DockviewReadyEvent) => {
        load(event.api);
        setApi(event.api);
    };

    const [options, setOptions] = React.useState<
        'boundedWithinViewport' | undefined
    >(undefined);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
            }}
        >
            <div style={{ height: '25px' }}>
                <button
                    onClick={() => {
                        if (api) {
                            setLayout(api.toJSON());
                        }
                    }}
                >
                    Save
                </button>
                <button
                    onClick={() => {
                        if (api) {
                            load(api);
                        }
                    }}
                >
                    Load
                </button>
                <button
                    onClick={() => {
                        api!.clear();
                        setLayout(null);
                    }}
                >
                    Clear
                </button>
            </div>
            <div
                style={{
                    flexGrow: 1,
                }}
            >
                <DockviewReact
                    onReady={onReady}
                    components={components}
                    watermarkComponent={Watermark}
                    leftHeaderActionsComponent={LeftComponent}
                    rightHeaderActionsComponent={RightComponent}
                    disableFloatingGroups={disableFloatingGroups}
                    floatingGroupBounds={options}
                    className={`${props.theme || 'dockview-theme-abyss'}`}
                />
            </div>
        </div>
    );
};

const LeftComponent = (props: IDockviewHeaderActionsProps) => {
    const onClick = () => {
        props.containerApi.addPanel({
            id: (++panelCount).toString(),
            title: `Tab ${panelCount}`,
            component: 'default',
            position: { referenceGroup: props.group },
        });
    };
    return (
        <div style={{ height: '100%', color: 'white', padding: '0px 4px' }}>
            <Icon onClick={onClick} icon={'add'} />
        </div>
    );
};

const RightComponent = (props: IDockviewHeaderActionsProps) => {
    const [maximized, setMaximized] = React.useState<boolean>(
        props.api.isMaximized()
    );

    React.useEffect(() => {
        const disposable = props.containerApi.onDidMaximizedGroupChange(() => {
            setMaximized(props.api.isMaximized());
        });

        return () => {
            disposable.dispose();
        };
    }, [props.containerApi]);

    const onClick = () => {
        if (maximized) {
            props.api.exitMaximized();
        } else {
            props.api.maximize();
        }
    };

    return (
        <div style={{ height: '100%', color: 'white', padding: '0px 4px' }}>
            <Icon
                onClick={onClick}
                icon={maximized ? 'jump_to_element' : 'back_to_tab'}
            />
        </div>
    );
};

export default App;

const Watermark = () => {
    return <div style={{ color: 'white', padding: '8px' }}>watermark</div>;
};
````

## File: packages/docs/sandboxes/react/dockview/maximize-group/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/maximize-group/src/utils.tsx
````typescript
import * as React from 'react';

export const Icon = (props: {
    icon: string;
    title?: string;
    onClick?: (event: React.MouseEvent) => void;
}) => {
    return (
        <div
            title={props.title}
            style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '30px',
                height: '100%',

                fontSize: '18px',
            }}
            onClick={props.onClick}
        >
            <span
                style={{ fontSize: 'inherit', cursor: 'pointer' }}
                className="material-symbols-outlined"
            >
                {props.icon}
            </span>
        </div>
    );
};
````

## File: packages/docs/sandboxes/react/dockview/render-mode/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    DockviewPanelApi,
    DockviewPanelRenderer,
    DockviewApi,
    SerializedDockview,
} from 'dockview';
import * as React from 'react';
import './app.scss';

const useRenderer = (
    api: DockviewPanelApi
): [DockviewPanelRenderer, (value: DockviewPanelRenderer) => void] => {
    const [mode, setMode] = React.useState<DockviewPanelRenderer>(api.renderer);

    React.useEffect(() => {
        const disposable = api.onDidRendererChange((event) => {
            setMode(event.renderer);
        });

        return () => {
            disposable.dispose();
        };
    }, []);

    const _setMode = React.useCallback(
        (mode: DockviewPanelRenderer) => {
            api.setRenderer(mode);
        },
        [api]
    );

    return [mode, _setMode];
};

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        const [mode, setMode] = useRenderer(props.api);

        return (
            <div style={{ height: '100%', overflow: 'auto', color: 'white' }}>
                <div
                    style={{
                        height: '1000px',
                        padding: '20px',
                        overflow: 'auto',
                    }}
                >
                    <div>{props.api.title}</div>
                    <input />
                    <div>
                        {mode}
                        <button
                            onClick={() => {
                                setMode(
                                    mode === 'onlyWhenVisible'
                                        ? 'always'
                                        : 'onlyWhenVisible'
                                );
                            }}
                        >
                            Toggle render mode
                        </button>
                    </div>
                </div>
            </div>
        );
    },
};

const DockviewDemo = (props: { theme?: string }) => {
    const [value, setValue] = React.useState<string>('100');
    const [api, setApi] = React.useState<DockviewApi | null>(null);

    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });
        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: { referencePanel: 'panel_1', direction: 'within' },
        });
        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',
        });

        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: 'panel_3', direction: 'below' },
        });

        setApi(event.api);
    };

    const onSave = () => {
        if (!api) {
            return;
        }

        localStorage.setItem(
            'dv_rendermode_state',
            JSON.stringify({ size: value, state: api.toJSON() })
        );
    };

    const onLoad = () => {
        if (!api) {
            return;
        }

        const state = localStorage.getItem('dv_rendermode_state');
        if (typeof state !== 'string') {
            return;
        }

        const json = JSON.parse(state) as {
            size: string;
            state: SerializedDockview;
        };
        setValue(json.size);
        api.fromJSON(json.state);
    };

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <div>
                <button onClick={onSave}>Save</button>
                <button onClick={onLoad}>Load</button>
                <input
                    onChange={(event) => setValue(event.target.value)}
                    type="range"
                    min="1"
                    max="100"
                    value={value}
                />
            </div>
            <div style={{ height: `${value}%`, width: `${value}%` }}>
                <DockviewReact
                    components={components}
                    onReady={onReady}
                    className={props.theme || 'dockview-theme-abyss'}
                />
            </div>
        </div>
    );
};

export default DockviewDemo;
````

## File: packages/docs/sandboxes/react/dockview/render-mode/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/resize/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';
import './resize.scss';

const Default = (props: IDockviewPanelProps) => {
    const [width, setWidth] = React.useState<number>(100);
    const [height, setHeight] = React.useState<number>(100);

    return (
        <div className="resize-panel">
            <div style={{ height: '25px' }}>{props.api.title}</div>
            <div className="resize-control">
                <span>Width:</span>
                <input
                    value={width}
                    onChange={(e) => setWidth(Number(e.target.value))}
                    type="number"
                    min={50}
                    step={1}
                />
                <button
                    style={{ width: '100px' }}
                    onClick={() => {
                        props.api.group.api.setSize({
                            width,
                        });
                    }}
                >
                    Resize Group
                </button>
                <button
                    style={{ width: '100px' }}
                    onClick={() => {
                        props.api.setSize({
                            width,
                        });
                    }}
                >
                    Resize panel
                </button>
            </div>
            <div className="resize-control">
                <span>Height:</span>
                <input
                    value={height}
                    onChange={(e) => setHeight(Number(e.target.value))}
                    type="number"
                    min={50}
                    step={1}
                />
                <button
                    style={{ width: '100px' }}
                    onClick={() => {
                        props.api.group.api.setSize({
                            height,
                        });
                    }}
                >
                    Resize Group
                </button>
                <button
                    style={{ width: '100px' }}
                    onClick={() => {
                        props.api.setSize({
                            height,
                        });
                    }}
                >
                    Resize Panel
                </button>
            </div>
        </div>
    );
};

const components = {
    default: Default,
};

const ResizeDockview = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            position: {
                direction: 'right',
                referencePanel: 'panel_1',
            },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            position: {
                direction: 'below',
                referencePanel: 'panel_1',
            },
        });
        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
        });
        event.api.addPanel({
            id: 'panel_5',
            component: 'default',
        });
    };

    return (
        <DockviewReact
            className={`${props.theme || 'dockview-theme-abyss'}`}
            onReady={onReady}
            components={components}
        />
    );
};

export default ResizeDockview;
````

## File: packages/docs/sandboxes/react/dockview/resize/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/resize-container/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div style={{ padding: '20px', color: 'white' }}>
                {props.params.title}
            </div>
        );
    },
};

export const App: React.FC = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        const panel = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            params: {
                title: 'Panel 1',
            },
        });

        panel.group.locked = true;
        panel.group.header.hidden = true;

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            params: {
                title: 'Panel 2',
            },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            params: {
                title: 'Panel 3',
            },
        });

        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            params: {
                title: 'Panel 4',
            },
            position: { referencePanel: 'panel_1', direction: 'right' },
        });

        const panel5 = event.api.addPanel({
            id: 'panel_5',
            component: 'default',
            params: {
                title: 'Panel 5',
            },
            position: { referencePanel: 'panel_3', direction: 'right' },
        });

        // panel5.group!.model.header.hidden = true;
        // panel5.group!.model.locked = true;

        event.api.addPanel({
            id: 'panel_6',
            component: 'default',
            params: {
                title: 'Panel 6',
            },
            position: { referencePanel: 'panel_5', direction: 'below' },
        });

        event.api.addPanel({
            id: 'panel_7',
            component: 'default',
            params: {
                title: 'Panel 7',
            },
            position: { referencePanel: 'panel_6', direction: 'right' },
        });
    };

    return (
        <DockviewReact
            components={components}
            onReady={onReady}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

const Container = (props: any) => {
    const [value, setValue] = React.useState<string>('50');

    return (
        <div
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            <input
                onChange={(event) => setValue(event.target.value)}
                type="range"
                min="1"
                max="100"
                value={value}
            />
            <div style={{ height: `${value}%`, width: `${value}%` }}>
                <App {...props} />
            </div>
        </div>
    );
};

export default Container;
````

## File: packages/docs/sandboxes/react/dockview/resize-container/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/scrollbars/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import './app.scss';

const TEXT =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const components = {
    fixedHeightContainer: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div style={{ height: '100%', color: 'white' }}>
                {[TEXT, '\n\n'].join('').repeat(20)}
            </div>
        );
    },
    overflowContainer: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div style={{ height: '2000px', overflow: 'auto', color: 'white' }}>
                {[TEXT, '\n\n'].join('').repeat(20)}
            </div>
        );
    },
    userDefinedOverflowContainer: (
        props: IDockviewPanelProps<{ title: string }>
    ) => {
        return (
            <div style={{ height: '100%', color: 'white' }}>
                <div
                    style={{
                        height: '100%',
                        color: 'white',
                        overflow: 'auto',
                    }}
                >
                    {[TEXT, '\n\n'].join('').repeat(20)}
                </div>
            </div>
        );
    },
};

const DockviewComponent = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'fixedHeightContainer',
            title: 'Panel 1',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'overflowContainer',
            title: 'Panel 2',
            position: { direction: 'right' },
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'userDefinedOverflowContainer',
            title: 'Panel 3',
            position: { direction: 'right' },
        });
    };

    return (
        <DockviewReact
            components={components}
            onReady={onReady}
            className={props.theme || 'dockview-theme-abyss'}
        />
    );
};

export default DockviewComponent;
````

## File: packages/docs/sandboxes/react/dockview/scrollbars/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/tabview/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

const Default = (props: IDockviewPanelProps) => {
    return (
        <div style={{ height: '100%' }}>
            <div>{props.api.title}</div>
        </div>
    );
};

const components = {
    default: Default,
};

const Component = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    React.useEffect(() => {
        if (!api) {
            return;
        }

        const disposables = [
            api.onWillShowOverlay((e) => {
                if (e.kind === 'header_space' || e.kind === 'tab') {
                    return;
                }
                e.preventDefault();
            }),
        ];

        return () => {
            disposables.forEach((disposable) => {
                disposable.dispose();
            });
        };
    }, [api]);

    const onReady = (event: DockviewReadyEvent) => {
        setApi(event.api);

        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
        });

        event.api.addPanel({
            id: 'panel_3',
            component: 'default',
        });
        event.api.addPanel({
            id: 'panel_4',
            component: 'default',
        });
        event.api.addPanel({
            id: 'panel_5',
            component: 'default',
        });
    };

    return (
        <DockviewReact
            className={`${props.theme || 'dockview-theme-abyss'}`}
            onReady={onReady}
            components={components}
            disableFloatingGroups={true}
        />
    );
};

export default Component;
````

## File: packages/docs/sandboxes/react/dockview/tabview/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/update-parameters/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelHeaderProps,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

interface CustomParams {
    myValue: number;
}

const components = {
    default: (props: IDockviewPanelProps<CustomParams>) => {
        const [running, setRunning] = React.useState<boolean>(false);

        React.useEffect(() => {
            if (!running) {
                return;
            }

            const interval = setInterval(() => {
                props.api.updateParameters({ myValue: Date.now() });
            }, 1000);
            props.api.updateParameters({ myValue: Date.now() });
            return () => {
                clearInterval(interval);
            };
        }, [running]);

        return (
            <div style={{ padding: '20px', color: 'white' }}>
                <div>{props.api.title}</div>
                <button onClick={() => setRunning(!running)}>
                    {running ? 'Stop' : 'Start'}
                </button>
                <span>{`value: ${props.params.myValue}`}</span>
            </div>
        );
    },
};

const tabComponents = {
    default: (props: IDockviewPanelHeaderProps<CustomParams>) => {
        return (
            <div>
                <div>{`custom tab: ${props.api.title}`}</div>
                <span>{`value: ${props.params.myValue}`}</span>
            </div>
        );
    },
};

export const App: React.FC = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            tabComponent: 'default',
            params: {
                myValue: Date.now(),
            },
        });

        event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            tabComponent: 'default',
            params: {
                myValue: Date.now(),
            },
        });
    };

    return (
        <DockviewReact
            components={components}
            tabComponents={tabComponents}
            onReady={onReady}
            className={props.theme || 'dockview-theme-abyss'}
        />
    );
};

export default App;
````

## File: packages/docs/sandboxes/react/dockview/update-parameters/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/update-title/src/app.tsx
````typescript
import {
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
} from 'dockview';
import * as React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ myValue: string }>) => {
        const [title, setTitle] = React.useState<string>(props.api.title ?? '');

        const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
            setTitle(event.target.value);
        };

        const onClick = () => {
            props.api.setTitle(title);
        };

        return (
            <div style={{ padding: '20px', color: 'white' }}>
                <div>
                    <span style={{ color: 'grey' }}>{'props.api.title='}</span>
                    <span>{`${props.api.title}`}</span>
                </div>
                <input value={title} onChange={onChange} />
                <button onClick={onClick}>Change</button>
                {JSON.stringify(Object.keys(props.params))}
            </div>
        );
    },
};

export const App: React.FC = (props: { theme?: string }) => {
    const onReady = (event: DockviewReadyEvent) => {
        const panel = event.api.addPanel({
            id: 'panel_1',
            component: 'default',
            title: 'Panel 1',
        });

        const panel2 = event.api.addPanel({
            id: 'panel_2',
            component: 'default',
            title: 'Panel 2',
            position: { referencePanel: panel },
        });

        const panel3 = event.api.addPanel({
            id: 'panel_3',
            component: 'default',
            title: 'Panel 3',

            position: { referencePanel: panel, direction: 'right' },
        });

        const panel4 = event.api.addPanel({
            id: 'panel_4',
            component: 'default',
            title: 'Panel 4',
            position: { referencePanel: panel3 },
        });
    };

    return (
        <DockviewReact
            components={components}
            onReady={onReady}
            className={`${props.theme || 'dockview-theme-abyss'}`}
        />
    );
};

export default App;
````

## File: packages/docs/sandboxes/react/dockview/update-title/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: packages/docs/sandboxes/react/dockview/watermark/src/app.tsx
````typescript
import {
    DockviewApi,
    DockviewReact,
    DockviewReadyEvent,
    IDockviewPanelProps,
    IWatermarkPanelProps,
    Orientation,
} from 'dockview';
import * as React from 'react';

const components = {
    default: (props: IDockviewPanelProps<{ title: string }>) => {
        return (
            <div
                style={{
                    height: '100%',
                    padding: '20px',
                    background: 'var(--dv-group-view-background-color)',
                }}
            >
                {props.params.title}
            </div>
        );
    },
};

const counter = (() => {
    let i = 0;

    return {
        next: () => ++i,
    };
})();

const Watermark = (props: IWatermarkPanelProps) => {
    const isGroup = props.containerApi.groups.length > 0;

    const addPanel = () => {
        props.containerApi.addPanel({
            id: counter.next().toString(),
            component: 'default',
        });
    };

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'white',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <span>
                    This is a custom watermark. You can put whatever React
                    component you want here
                </span>
                <span>
                    <button onClick={addPanel}>Add New Panel</button>
                </span>
                {isGroup && (
                    <span>
                        <button
                            onClick={() => {
                                props.close();
                            }}
                        >
                            Close Group
                        </button>
                    </span>
                )}
            </div>
        </div>
    );
};

const DockviewWatermark = (props: { theme?: string }) => {
    const [api, setApi] = React.useState<DockviewApi>();

    const onReady = (event: DockviewReadyEvent) => {
        // event.api.addPanel({
        //     id: 'panel_1',
        //     component: 'default',
        // });

        event.api.fromJSON({
            grid: {
                orientation: Orientation.HORIZONTAL,
                root: { type: 'branch', data: [] },
                height: 100,
                width: 100,
            },
            panels: {},
        });

        setApi(event.api);
    };

    const onClick = () => {
        if (!api) {
            return;
        }

        api.addGroup();
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
            }}
        >
            <div>
                <button onClick={onClick}>Add Empty Group</button>
            </div>
            <DockviewReact
                onReady={onReady}
                components={components}
                watermarkComponent={Watermark}
                className={`${props.theme || 'dockview-theme-abyss'}`}
            />
        </div>
    );
};

export default DockviewWatermark;
````

## File: packages/docs/sandboxes/react/dockview/watermark/src/index.tsx
````typescript
import { StrictMode } from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './styles.css';
import 'dockview/dist/styles/dockview.css';

import App from './app';

const rootElement = document.getElementById('root');

if (rootElement) {
    const root = ReactDOMClient.createRoot(rootElement);

    root.render(
        <StrictMode>
            <div className="app">
                <App />
            </div>
        </StrictMode>
    );
}
````

## File: README.md
````markdown
<div align="center">
<h1>dockview</h1>

<p>Zero dependency layout manager supporting tabs, groups, grids and splitviews. Supports React, Vue and Vanilla TypeScript</p>

</div>

---

[![npm version](https://badge.fury.io/js/dockview-core.svg)](https://www.npmjs.com/package/dockview-core)
[![npm](https://img.shields.io/npm/dm/dockview-core)](https://www.npmjs.com/package/dockview-core)
[![CI Build](https://github.com/mathuo/dockview/workflows/CI/badge.svg)](https://github.com/mathuo/dockview/actions?query=workflow%3ACI)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=mathuo_dockview&metric=coverage)](https://sonarcloud.io/summary/overall?id=mathuo_dockview)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=mathuo_dockview&metric=alert_status)](https://sonarcloud.io/summary/overall?id=mathuo_dockview)
[![Bundle Phobia](https://badgen.net/bundlephobia/minzip/dockview-core)](https://bundlephobia.com/result?p=dockview-core)

##

![](packages/docs/static/img/splashscreen.gif)

Please see the website: https://dockview.dev

## Features

-   Serialization / deserialization with full layout management
-   Support for split-views, grid-views and 'dockable' views
-   Themeable and customizable
-   Tab and Group docking / Drag n' Drop
-   Popout Windows
-   Floating Groups
-   Extensive API
-   Supports Shadow DOMs
-   High test coverage
-   Documentation website with live examples
-   Transparent builds and Code Analysis
-   Security at mind - verifed publishing and builds through GitHub Actions

Want to verify our builds? Go [here](https://www.npmjs.com/package/dockview#user-content-provenance).
````