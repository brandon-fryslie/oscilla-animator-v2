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
// =============================================================================
// PRNG Implementation (Mulberry32)
// =============================================================================
/**
 * Create a seeded PRNG using Mulberry32 algorithm.
 * Same seed always produces same sequence.
 */
export function createPRNG(seed) {
    let state = seed >>> 0; // Ensure 32-bit unsigned
    const next = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), 1 | t);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const range = (min, max) => {
        return min + next() * (max - min);
    };
    const int = (min, max) => {
        return Math.floor(range(min, max + 1));
    };
    const pick = (arr) => {
        return arr[int(0, arr.length - 1)];
    };
    const vary = (base, variance) => {
        return base + range(-variance, variance);
    };
    const varyPercent = (base, percent) => {
        return base * range(1 - percent, 1 + percent);
    };
    const getState = () => state;
    const fork = () => {
        const derived = (state * 1664525 + 1013904223) >>> 0;
        return createPRNG(derived);
    };
    return { next, range, int, pick, vary, varyPercent, getState, fork };
}
/** Default seed for consistent results when no seed provided. */
export const DEFAULT_SEED = 42;
// =============================================================================
// Rand<A> Constructors
// =============================================================================
/** Create a Rand that always returns the same value (pure). */
export function pure(value) {
    return (_rng) => value;
}
/** Create a Rand that returns a uniform random number in [0, 1). */
export const uniform = (rng) => rng.next();
/** Create a Rand that returns a uniform random number in [min, max). */
export function uniformRange(min, max) {
    return (rng) => rng.range(min, max);
}
/** Create a Rand that returns a random integer in [min, max] inclusive. */
export function uniformInt(min, max) {
    return (rng) => rng.int(min, max);
}
/** Create a Rand that picks a random element from an array. */
export function pick(arr) {
    return (rng) => rng.pick(arr);
}
/** Create a Rand that varies a base value by ±variance. */
export function vary(base, variance) {
    return (rng) => rng.vary(base, variance);
}
/** Create a Rand that varies a base value by ±percent. */
export function varyPercent(base, percent) {
    return (rng) => rng.varyPercent(base, percent);
}
/** Create a Rand that returns true with given probability. */
export function chance(probability) {
    return (rng) => rng.next() < probability;
}
/** Create a Rand that returns a random point in a rectangle. */
export function uniformPoint(minX, maxX, minY, maxY) {
    return (rng) => ({
        x: rng.range(minX, maxX),
        y: rng.range(minY, maxY),
    });
}
/** Create a Rand that returns a point within a radius of center. */
export function uniformCircle(centerX, centerY, radius) {
    return (rng) => {
        const angle = rng.range(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * radius;
        return {
            x: centerX + Math.cos(angle) * r,
            y: centerY + Math.sin(angle) * r,
        };
    };
}
/** Gaussian (normal) distribution using Box-Muller transform. */
export function gaussian(mean = 0, stdDev = 1) {
    return (rng) => {
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
export function map(rand, f) {
    return (rng) => f(rand(rng));
}
/** Combine two Rands. */
export function map2(randA, randB, f) {
    return (rng) => f(randA(rng), randB(rng));
}
/** Combine three Rands. */
export function map3(randA, randB, randC, f) {
    return (rng) => f(randA(rng), randB(rng), randC(rng));
}
/** Sequence Rands: run first, use result to determine second. */
export function flatMap(rand, f) {
    return (rng) => {
        const a = rand(rng);
        return f(a)(rng);
    };
}
/** Tuple of Rand results. */
export function tuple(randA, randB) {
    return map2(randA, randB, (a, b) => [a, b]);
}
/** Record of Rand results. */
export function record(rands) {
    const keys = Object.keys(rands);
    return (rng) => {
        const result = {};
        for (const key of keys) {
            result[key] = rands[key](rng);
        }
        return result;
    };
}
/** Generate an array of random values. */
export function array(rand, count) {
    return (rng) => {
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push(rand(rng));
        }
        return result;
    };
}
/** Shuffle an array randomly. */
export function shuffle(arr) {
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
/** Run a Rand with a seed to get a deterministic result. */
export function runRand(rand, seed) {
    return rand(createPRNG(seed));
}
/** Run a Rand with the default seed. */
export function runRandDefault(rand) {
    return runRand(rand, DEFAULT_SEED);
}
