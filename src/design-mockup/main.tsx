/**
 * Design Mockup — Standalone Entry Point
 *
 * Standalone ReactFlow-based dependency graph analyzer for SourceBundle
 * + Expression block design exploration. Used to sketch scenarios and
 * see how the proposed compiler model would handle them.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { DesignMockupApp } from './DesignMockupApp';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const root = createRoot(container);
root.render(React.createElement(DesignMockupApp));
