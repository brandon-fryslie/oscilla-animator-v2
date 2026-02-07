/**
 * MUI Theme Configuration for Oscilla
 *
 * Dark theme matching the existing UI colors.
 */

import { createTheme, type Theme } from '@mui/material/styles';

/**
 * Color palette extracted from existing UI.
 */
export const colors = {
  // Backgrounds
  bgDark: '#1a1a2e',       // Main background
  bgPanel: '#16213e',      // Panel/header background
  bgContent: '#0f0f23',    // Content area background
  bgHover: 'rgba(255, 255, 255, 0.05)',
  bg: '#16213e',           // Alias for bgPanel

  // Borders
  border: '#0f3460',

  // Accent colors
  primary: '#4ecdc4',      // Teal accent
  secondary: '#ff6b6b',    // Red/error accent
  warning: '#ffd93d',      // Yellow warning
  error: '#ff6b6b',        // Error color (alias for secondary)

  // Port colors
  collectPort: '#9d4edd',  // Purple - distinct from primary teal (for collect ports)

  // Text
  textPrimary: '#eee',
  textSecondary: '#888',
  textMuted: '#666',
  text: '#eee',            // Alias for textPrimary
} as const;

/**
 * Dark theme for Oscilla UI.
 */
export const darkTheme: Theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.primary,
      contrastText: colors.bgDark,
    },
    secondary: {
      main: colors.secondary,
    },
    warning: {
      main: colors.warning,
    },
    background: {
      default: colors.bgDark,
      paper: colors.bgPanel,
    },
    text: {
      primary: colors.textPrimary,
      secondary: colors.textSecondary,
    },
    divider: colors.border,
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    h1: { fontSize: '1.5rem', fontWeight: 500 },
    h2: { fontSize: '1.25rem', fontWeight: 500 },
    h3: { fontSize: '1rem', fontWeight: 500 },
    h4: { fontSize: '0.875rem', fontWeight: 500 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.75rem' },
    caption: { fontSize: '0.75rem', color: colors.textSecondary },
  },
  components: {
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          minHeight: 36,
          padding: '6px 12px',
          fontSize: '0.875rem',
          '&.Mui-selected': {
            color: colors.primary,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 36,
          borderBottom: `1px solid ${colors.border}`,
        },
        indicator: {
          backgroundColor: colors.primary,
          height: 2,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 4,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          padding: 6,
        },
        sizeSmall: {
          padding: 4,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 8,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.bgPanel,
          border: `1px solid ${colors.border}`,
          fontSize: '0.75rem',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 4,
            '& fieldset': {
              borderColor: colors.border,
            },
            '&:hover fieldset': {
              borderColor: colors.textSecondary,
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.primary,
            },
          },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: colors.primary,
        },
        thumb: {
          width: 14,
          height: 14,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          '&:hover': {
            backgroundColor: colors.bgHover,
          },
          '&.Mui-selected': {
            backgroundColor: `${colors.primary}20`,
            '&:hover': {
              backgroundColor: `${colors.primary}30`,
            },
          },
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          padding: 4,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 4,
        },
      },
    },
  },
});

export default darkTheme;
