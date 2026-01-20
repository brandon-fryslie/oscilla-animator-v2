/**
 * DiagnosticsStore Compilation Stats Tests
 *
 * Tests for the compilation statistics tracking feature.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { DiagnosticsStore } from '../DiagnosticsStore';

describe('DiagnosticsStore Compilation Stats', () => {
  let store: DiagnosticsStore;

  beforeEach(() => {
    store = new DiagnosticsStore();
  });

  test('should start with zero stats', () => {
    const stats = store.compilationStats;
    expect(stats.count).toBe(0);
    expect(stats.totalMs).toBe(0);
    expect(stats.recentMs).toHaveLength(0);
    expect(store.avgCompileMs).toBe(0);
    expect(store.medianCompileMs).toBe(0);
  });

  test('should record compilations correctly', () => {
    store.recordCompilation(10);
    store.recordCompilation(20);
    store.recordCompilation(30);

    const stats = store.compilationStats;
    expect(stats.count).toBe(3);
    expect(stats.totalMs).toBe(60);
    expect(stats.minMs).toBe(10);
    expect(stats.maxMs).toBe(30);
    expect(stats.recentMs).toEqual([10, 20, 30]);
  });

  test('should calculate average correctly', () => {
    store.recordCompilation(10);
    store.recordCompilation(20);
    store.recordCompilation(30);
    
    expect(store.avgCompileMs).toBe(20);
  });

  test('should calculate median correctly for odd count', () => {
    store.recordCompilation(10);
    store.recordCompilation(30);
    store.recordCompilation(20);
    
    expect(store.medianCompileMs).toBe(20); // sorted: 10, 20, 30 -> middle is 20
  });

  test('should calculate median correctly for even count', () => {
    store.recordCompilation(10);
    store.recordCompilation(20);
    store.recordCompilation(30);
    store.recordCompilation(40);
    
    expect(store.medianCompileMs).toBe(25); // sorted: 10, 20, 30, 40 -> avg of 20 and 30
  });

  test('should keep only last 20 recent values', () => {
    for (let i = 1; i <= 25; i++) {
      store.recordCompilation(i);
    }
    
    const stats = store.compilationStats;
    expect(stats.count).toBe(25);
    expect(stats.recentMs).toHaveLength(20);
    expect(stats.recentMs[0]).toBe(6); // First 5 should be shifted out
    expect(stats.recentMs[19]).toBe(25);
  });

  test('should track min correctly across many values', () => {
    store.recordCompilation(50);
    store.recordCompilation(10); // min
    store.recordCompilation(30);
    
    expect(store.compilationStats.minMs).toBe(10);
  });

  test('should track max correctly across many values', () => {
    store.recordCompilation(10);
    store.recordCompilation(100); // max
    store.recordCompilation(30);
    
    expect(store.compilationStats.maxMs).toBe(100);
  });
});
