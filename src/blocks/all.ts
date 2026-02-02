/**
 * Block Registration Aggregator
 *
 * Imports all block category indexes to trigger registerBlock() side effects.
 * This is the single entry point for loading all primitive blocks.
 */

// Primitive block categories
import './time';
import './signal';
import './math';
import './field';
import './shape';
import './layout';
import './color';
import './adapter';
import './event';
import './io';
import './render';
import './domain';
import './instance';
import './dev';

// Composite block library
import './composites';
