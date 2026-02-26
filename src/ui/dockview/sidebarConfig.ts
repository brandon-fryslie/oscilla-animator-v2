export type SidebarSide = 'left' | 'right';

export const SIDEBAR_PANEL_IDS: Record<SidebarSide, string> = {
  left: 'left-sidebar',
  right: 'right-sidebar',
};

export const SIDEBAR_DEFAULT_WIDTH: Record<SidebarSide, number> = {
  left: 320,
  right: 320,
};

export const SIDEBAR_MIN_WIDTH: Record<SidebarSide, number> = {
  left: 240,
  right: 240,
};

export const SIDEBAR_MAX_WIDTH: Record<SidebarSide, number> = {
  left: 520,
  right: 520,
};

