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
/**
 * Rand<A> is a computation that uses randomness.
 * Run it with a seed to get a deterministic result.
 */
export type Rand<A> = (rng: PRNG) => A;
/**
 * Create a seeded PRNG using Mulberry32 algorithm.
 * Same seed always produces same sequence.
 */
export declare function createPRNG(seed: Seed): PRNG;
/** Default seed for consistent results when no seed provided. */
export declare const DEFAULT_SEED: Seed;
/** Create a Rand that always returns the same value (pure). */
export declare function pure<A>(value: A): Rand<A>;
/** Create a Rand that returns a uniform random number in [0, 1). */
export declare const uniform: Rand<number>;
/** Create a Rand that returns a uniform random number in [min, max). */
export declare function uniformRange(min: number, max: number): Rand<number>;
/** Create a Rand that returns a random integer in [min, max] inclusive. */
export declare function uniformInt(min: number, max: number): Rand<number>;
/** Create a Rand that picks a random element from an array. */
export declare function pick<A>(arr: readonly A[]): Rand<A>;
/** Create a Rand that varies a base value by ±variance. */
export declare function vary(base: number, variance: number): Rand<number>;
/** Create a Rand that varies a base value by ±percent. */
export declare function varyPercent(base: number, percent: number): Rand<number>;
/** Create a Rand that returns true with given probability. */
export declare function chance(probability: number): Rand<boolean>;
/** Create a Rand that returns a random point in a rectangle. */
export declare function uniformPoint(minX: number, maxX: number, minY: number, maxY: number): Rand<Point>;
/** Create a Rand that returns a point within a radius of center. */
export declare function uniformCircle(centerX: number, centerY: number, radius: number): Rand<Point>;
/** Gaussian (normal) distribution using Box-Muller transform. */
export declare function gaussian(mean?: number, stdDev?: number): Rand<number>;
/** Transform the output of a Rand. */
export declare function map<A, B>(rand: Rand<A>, f: (a: A) => B): Rand<B>;
/** Combine two Rands. */
export declare function map2<A, B, C>(randA: Rand<A>, randB: Rand<B>, f: (a: A, b: B) => C): Rand<C>;
/** Combine three Rands. */
export declare function map3<A, B, C, D>(randA: Rand<A>, randB: Rand<B>, randC: Rand<C>, f: (a: A, b: B, c: C) => D): Rand<D>;
/** Sequence Rands: run first, use result to determine second. */
export declare function flatMap<A, B>(rand: Rand<A>, f: (a: A) => Rand<B>): Rand<B>;
/** Tuple of Rand results. */
export declare function tuple<A, B>(randA: Rand<A>, randB: Rand<B>): Rand<[A, B]>;
/** Record of Rand results. */
export declare function record<T extends Record<string, Rand<unknown>>>(rands: T): Rand<{
    [K in keyof T]: T[K] extends Rand<infer U> ? U : never;
}>;
/** Generate an array of random values. */
export declare function array<A>(rand: Rand<A>, count: number): Rand<A[]>;
/** Shuffle an array randomly. */
export declare function shuffle<A>(arr: readonly A[]): Rand<A[]>;
/** Run a Rand with a seed to get a deterministic result. */
export declare function runRand<A>(rand: Rand<A>, seed: Seed): A;
/** Run a Rand with the default seed. */
export declare function runRandDefault<A>(rand: Rand<A>): A;
