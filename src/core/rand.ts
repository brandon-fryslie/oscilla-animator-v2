/**
 * Rand Module - Seedable Randomness
 *
 * Rand<A> represents a computation that uses randomness.
 * By making randomness explicit (not ambient Math.random), we get:
 *
 * 1. Determinism: same seed → same result
 * 2. Reproducibility: animations replay identically
 * 3. Scrubbability: scrubbing doesn't change random values
 * 4. Testability: predictable outputs for testing
 *
 * The PRNG (Mulberry32) is fast and has good statistical properties.
 */

import type { Seed, Point } from './types';

// =============================================================================
// PRNG Interface
// =============================================================================

export interface PRNG {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  vary(base: number, variance: number): number;
  varyPercent(base: number, percent: number): number;
  getState(): number;
  fork(): PRNG;
}

// =============================================================================
// Rand<A> Type
// =============================================================================

/**
 * Rand<A> is a computation that uses randomness.
 * Run it with a seed to get a deterministic result.
 */
export type Rand<A> = (rng: PRNG) => A;

// =============================================================================
// PRNG Implementation (Mulberry32)
// =============================================================================

/**
 * Create a seeded PRNG using Mulberry32 algorithm.
 * Same seed always produces same sequence.
 */
export function createPRNG(seed: Seed): PRNG {
  let state = seed >>> 0; // Ensure 32-bit unsigned

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => {
    return min + next() * (max - min);
  };

  const int = (min: number, max: number): number => {
    return Math.floor(range(min, max + 1));
  };

  const pick = <T>(arr: readonly T[]): T => {
    return arr[int(0, arr.length - 1)];
  };

  const vary = (base: number, variance: number): number => {
    return base + range(-variance, variance);
  };

  const varyPercent = (base: number, percent: number): number => {
    return base * range(1 - percent, 1 + percent);
  };

  const getState = (): number => state;

  const fork = (): PRNG => {
    const derived = (state * 1664525 + 1013904223) >>> 0;
    return createPRNG(derived);
  };

  return { next, range, int, pick, vary, varyPercent, getState, fork };
}

/** Default seed for consistent results when no seed provided. */
export const DEFAULT_SEED: Seed = 42;

// =============================================================================
// Rand<A> Constructors
// =============================================================================

/** Create a Rand that always returns the same value (pure). */
export function pure<A>(value: A): Rand<A> {
  return (_rng: PRNG) => value;
}

/** Create a Rand that returns a uniform random number in [0, 1). */
export const uniform: Rand<number> = (rng: PRNG) => rng.next();

/** Create a Rand that returns a uniform random number in [min, max). */
export function uniformRange(min: number, max: number): Rand<number> {
  return (rng: PRNG) => rng.range(min, max);
}

/** Create a Rand that returns a random integer in [min, max] inclusive. */
export function uniformInt(min: number, max: number): Rand<number> {
  return (rng: PRNG) => rng.int(min, max);
}

/** Create a Rand that picks a random element from an array. */
export function pick<A>(arr: readonly A[]): Rand<A> {
  return (rng: PRNG) => rng.pick(arr);
}

/** Create a Rand that varies a base value by ±variance. */
export function vary(base: number, variance: number): Rand<number> {
  return (rng: PRNG) => rng.vary(base, variance);
}

/** Create a Rand that varies a base value by ±percent. */
export function varyPercent(base: number, percent: number): Rand<number> {
  return (rng: PRNG) => rng.varyPercent(base, percent);
}

/** Create a Rand that returns true with given probability. */
export function chance(probability: number): Rand<boolean> {
  return (rng: PRNG) => rng.next() < probability;
}

/** Create a Rand that returns a random point in a rectangle. */
export function uniformPoint(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Rand<Point> {
  return (rng: PRNG) => ({
    x: rng.range(minX, maxX),
    y: rng.range(minY, maxY),
  });
}

/** Create a Rand that returns a point within a radius of center. */
export function uniformCircle(
  centerX: number,
  centerY: number,
  radius: number
): Rand<Point> {
  return (rng: PRNG) => {
    const angle = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * radius;
    return {
      x: centerX + Math.cos(angle) * r,
      y: centerY + Math.sin(angle) * r,
    };
  };
}

/** Gaussian (normal) distribution using Box-Muller transform. */
export function gaussian(mean: number = 0, stdDev: number = 1): Rand<number> {
  return (rng: PRNG) => {
    const u1 = rng.next();
    const u2 = rng.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  };
}

// =============================================================================
// Rand Combinators (Functor/Applicative/Monad)
// =============================================================================

/** Transform the output of a Rand. */
export function map<A, B>(rand: Rand<A>, f: (a: A) => B): Rand<B> {
  return (rng: PRNG) => f(rand(rng));
}

/** Combine two Rands. */
export function map2<A, B, C>(
  randA: Rand<A>,
  randB: Rand<B>,
  f: (a: A, b: B) => C
): Rand<C> {
  return (rng: PRNG) => f(randA(rng), randB(rng));
}

/** Combine three Rands. */
export function map3<A, B, C, D>(
  randA: Rand<A>,
  randB: Rand<B>,
  randC: Rand<C>,
  f: (a: A, b: B, c: C) => D
): Rand<D> {
  return (rng: PRNG) => f(randA(rng), randB(rng), randC(rng));
}

/** Sequence Rands: run first, use result to determine second. */
export function flatMap<A, B>(rand: Rand<A>, f: (a: A) => Rand<B>): Rand<B> {
  return (rng: PRNG) => {
    const a = rand(rng);
    return f(a)(rng);
  };
}

/** Tuple of Rand results. */
export function tuple<A, B>(randA: Rand<A>, randB: Rand<B>): Rand<[A, B]> {
  return map2(randA, randB, (a, b) => [a, b]);
}

/** Record of Rand results. */
export function record<T extends Record<string, Rand<unknown>>>(
  rands: T
): Rand<{ [K in keyof T]: T[K] extends Rand<infer U> ? U : never }> {
  const keys = Object.keys(rands);
  return (rng: PRNG) => {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = rands[key](rng);
    }
    return result as { [K in keyof T]: T[K] extends Rand<infer U> ? U : never };
  };
}

/** Generate an array of random values. */
export function array<A>(rand: Rand<A>, count: number): Rand<A[]> {
  return (rng: PRNG) => {
    const result: A[] = [];
    for (let i = 0; i < count; i++) {
      result.push(rand(rng));
    }
    return result;
  };
}

/** Shuffle an array randomly. */
export function shuffle<A>(arr: readonly A[]): Rand<A[]> {
  return (rng: PRNG) => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
}

// =============================================================================
// Running Rand
// =============================================================================

/** Run a Rand with a seed to get a deterministic result. */
export function runRand<A>(rand: Rand<A>, seed: Seed): A {
  return rand(createPRNG(seed));
}

/** Run a Rand with the default seed. */
export function runRandDefault<A>(rand: Rand<A>): A {
  return runRand(rand, DEFAULT_SEED);
}
