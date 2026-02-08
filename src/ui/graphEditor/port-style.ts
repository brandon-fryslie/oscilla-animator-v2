/**
 * Port Style Resolver
 *
 * Pure function that computes final port visual styles from state.
 * Single priority chain: dragHighlight > selectedDiagnostic > diagnostic > selected > connected > default
 *
 * [LAW:dataflow-not-control-flow] All states execute same operations; variability in values, not branches.
 * [LAW:one-source-of-truth] All style logic centralized here; no scattered overrides.
 */

import type React from 'react';
import { graphColors, portSize } from './graph-tokens';

/**
 * Port visual state input.
 * All independent concerns that affect port appearance.
 */
export interface PortVisualState {
  /** Type color (from type system) */
  typeColor: string;
  /** Whether port has an active connection */
  isConnected: boolean;
  /** Whether port is selected in the editor */
  isSelected: boolean;
  /** Diagnostic severity level (error > warning > none) */
  diagnosticLevel: 'error' | 'warning' | 'none';
  /** Drag highlight state (compatible > incompatible > none) */
  dragHighlight: 'compatible' | 'incompatible' | 'none';
}

/**
 * Resolved port styling output.
 * Ready to apply to ReactFlow Handle component.
 */
export interface PortResolvedStyle {
  /** CSS class name for animations (undefined = no animation) */
  className: string | undefined;
  /** Inline styles (React.CSSProperties) */
  style: React.CSSProperties;
}

/**
 * Compute final port style from visual state.
 *
 * Priority chain (first match wins):
 * 1. Drag highlight (compatible/incompatible) - overrides everything during drag
 * 2. Selected + diagnostic - static bright glow (no animation)
 * 3. Diagnostic alone - animated breathing (CSS animation)
 * 4. Selected alone - animated breathing (CSS animation)
 * 5. Connected - subtle type-colored glow
 * 6. Default - gradient background, no glow
 *
 * [LAW:dataflow-not-control-flow] Each state computes its values; priority chain selects which to use.
 */
export function resolvePortStyle(state: PortVisualState): PortResolvedStyle {
  const {
    typeColor,
    isConnected,
    isSelected,
    diagnosticLevel,
    dragHighlight,
  } = state;

  // Compute diagnostic state
  const hasError = diagnosticLevel === 'error';
  const hasWarning = diagnosticLevel === 'warning';
  const hasDiagnostic = hasError || hasWarning;
  const diagnosticColor = hasError ? graphColors.error : hasWarning ? graphColors.warning : null;

  // Priority chain: compute all states, then select via priority

  // State 1: Drag highlight (compatible)
  if (dragHighlight === 'compatible') {
    return {
      className: undefined,
      style: {
        background: typeColor,
        width: `${portSize.diameter}px`,
        height: `${portSize.diameter}px`,
        border: `${portSize.borderWidth}px solid ${typeColor}`,
        borderRadius: '50%',
        boxShadow: `0 0 12px 4px ${graphColors.dragCompatible}`,
        filter: 'brightness(1.3) saturate(1.5)',
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    };
  }

  // State 2: Drag highlight (incompatible)
  if (dragHighlight === 'incompatible') {
    return {
      className: undefined,
      style: {
        background: isConnected ? typeColor : `linear-gradient(135deg, ${typeColor}40 0%, #1a1a2e 100%)`,
        width: `${portSize.diameter}px`,
        height: `${portSize.diameter}px`,
        border: `${portSize.borderWidth}px solid ${typeColor}`,
        borderRadius: '50%',
        opacity: 0.3,
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    };
  }

  // State 3: Selected + diagnostic (static bright glow, no animation)
  if (isSelected && hasDiagnostic) {
    const glowColor = diagnosticColor!;
    return {
      className: undefined,
      style: {
        background: glowColor,
        width: `${portSize.diameter}px`,
        height: `${portSize.diameter}px`,
        border: `${portSize.borderWidth}px solid ${glowColor}`,
        borderRadius: '50%',
        boxShadow: `0 0 26px 9px ${glowColor}`,
        filter: 'brightness(1.7) saturate(1.5)', // Match animation peak
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    };
  }

  // State 4: Diagnostic alone (animated, CSS handles boxShadow/filter)
  if (hasDiagnostic) {
    const animationClass = hasError ? 'port-error' : 'port-warning';
    return {
      className: animationClass,
      style: {
        background: diagnosticColor!,
        width: `${portSize.diameter}px`,
        height: `${portSize.diameter}px`,
        border: `${portSize.borderWidth}px solid ${diagnosticColor!}`,
        borderRadius: '50%',
        // boxShadow and filter handled by CSS animation
        cursor: 'pointer',
        transition: 'none', // Disable transition when animating
      },
    };
  }

  // State 5: Selected alone (animated, CSS handles filter)
  if (isSelected) {
    return {
      className: 'port-selected',
      style: {
        background: isConnected ? typeColor : `linear-gradient(135deg, ${typeColor}40 0%, #1a1a2e 100%)`,
        width: `${portSize.diameter}px`,
        height: `${portSize.diameter}px`,
        border: `${portSize.borderWidth}px solid ${typeColor}`,
        borderRadius: '50%',
        boxShadow: `0 0 12px 3px ${typeColor}80, inset 0 0 4px ${typeColor}`,
        // filter handled by CSS animation
        cursor: 'pointer',
        transition: 'none', // Disable transition when animating
      },
    };
  }

  // State 6: Connected (subtle glow)
  if (isConnected) {
    return {
      className: undefined,
      style: {
        background: typeColor,
        width: `${portSize.diameter}px`,
        height: `${portSize.diameter}px`,
        border: `${portSize.borderWidth}px solid ${typeColor}`,
        borderRadius: '50%',
        boxShadow: `0 0 6px 1px ${typeColor}40`,
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    };
  }

  // State 7: Default (gradient, no glow)
  return {
    className: undefined,
    style: {
      background: `linear-gradient(135deg, ${typeColor}40 0%, #1a1a2e 100%)`,
      width: `${portSize.diameter}px`,
      height: `${portSize.diameter}px`,
      border: `${portSize.borderWidth}px solid ${typeColor}`,
      borderRadius: '50%',
      boxShadow: 'none',
      cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    },
  };
}
