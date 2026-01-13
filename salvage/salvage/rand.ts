/**
 * Seeded PRNG and Rand<A> Combinators
 *
 * Rand<A> represents a computation that uses randomness.
 * By making randomness explicit (not ambient Math.random):
 * - Determinism: same seed → same result
 * - Reproducibility: animations replay identically
 * - Scrubbability: scrubbing doesn't change random values
 * - Testability: predictable outputs
 *
 * Uses Mulberry32 - fast with good statistical properties.
 */

// =============================================================================
// Types
// =============================================================================

export type Seed = number;

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

export type Rand<A> = (rng: PRNG) => A;

export interface Point {
  x: number;
  y: number;
}

// =============================================================================
// PRNG Implementation (Mulberry32)
// =============================================================================

export function createPRNG(seed: Seed): PRNG {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);
  const int = (min: number, max: number): number => Math.floor(range(min, max + 1));
  const pick = <T>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];
  const vary = (base: number, variance: number): number => base + range(-variance, variance);
  const varyPercent = (base: number, percent: number): number => base * range(1 - percent, 1 + percent);
  const getState = (): number => state;
  const fork = (): PRNG => createPRNG((state * 1664525 + 1013904223) >>> 0);

  return { next, range, int, pick, vary, varyPercent, getState, fork };
}

export const DEFAULT_SEED: Seed = 42;

// =============================================================================
// Rand<A> Constructors
// =============================================================================

export function pure<A>(value: A): Rand<A> {
  return () => value;
}

export const uniform: Rand<number> = (rng) => rng.next();

export function uniformRange(min: number, max: number): Rand<number> {
  return (rng) => rng.range(min, max);
}

export function uniformInt(min: number, max: number): Rand<number> {
  return (rng) => rng.int(min, max);
}

export function pick<A>(arr: readonly A[]): Rand<A> {
  return (rng) => rng.pick(arr);
}

export function vary(base: number, variance: number): Rand<number> {
  return (rng) => rng.vary(base, variance);
}

export function varyPercent(base: number, percent: number): Rand<number> {
  return (rng) => rng.varyPercent(base, percent);
}

export function chance(probability: number): Rand<boolean> {
  return (rng) => rng.next() < probability;
}

export function uniformPoint(minX: number, maxX: number, minY: number, maxY: number): Rand<Point> {
  return (rng) => ({ x: rng.range(minX, maxX), y: rng.range(minY, maxY) });
}

export function uniformCircle(centerX: number, centerY: number, radius: number): Rand<Point> {
  return (rng) => {
    const angle = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * radius;
    return { x: centerX + Math.cos(angle) * r, y: centerY + Math.sin(angle) * r };
  };
}

export function gaussian(mean: number = 0, stdDev: number = 1): Rand<number> {
  return (rng) => {
    const u1 = rng.next();
    const u2 = rng.next();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  };
}

// =============================================================================
// Rand Combinators
// =============================================================================

export function map<A, B>(rand: Rand<A>, f: (a: A) => B): Rand<B> {
  return (rng) => f(rand(rng));
}

export function map2<A, B, C>(randA: Rand<A>, randB: Rand<B>, f: (a: A, b: B) => C): Rand<C> {
  return (rng) => f(randA(rng), randB(rng));
}

export function map3<A, B, C, D>(randA: Rand<A>, randB: Rand<B>, randC: Rand<C>, f: (a: A, b: B, c: C) => D): Rand<D> {
  return (rng) => f(randA(rng), randB(rng), randC(rng));
}

export function flatMap<A, B>(rand: Rand<A>, f: (a: A) => Rand<B>): Rand<B> {
  return (rng) => f(rand(rng))(rng);
}

export function tuple<A, B>(randA: Rand<A>, randB: Rand<B>): Rand<[A, B]> {
  return map2(randA, randB, (a, b) => [a, b]);
}

export function record<T extends Record<string, Rand<unknown>>>(
  rands: T
): Rand<{ [K in keyof T]: T[K] extends Rand<infer U> ? U : never }> {
  const keys = Object.keys(rands);
  return (rng) => {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      result[key] = rands[key](rng);
    }
    return result as { [K in keyof T]: T[K] extends Rand<infer U> ? U : never };
  };
}

export function array<A>(rand: Rand<A>, count: number): Rand<A[]> {
  return (rng) => {
    const result: A[] = [];
    for (let i = 0; i < count; i++) {
      result.push(rand(rng));
    }
    return result;
  };
}

export function shuffle<A>(arr: readonly A[]): Rand<A[]> {
  return (rng) => {
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

export function runRand<A>(rand: Rand<A>, seed: Seed): A {
  return rand(createPRNG(seed));
}

export function runRandDefault<A>(rand: Rand<A>): A {
  return runRand(rand, DEFAULT_SEED);
}
