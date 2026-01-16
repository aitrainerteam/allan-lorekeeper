/**
 * Seeded Random Number Generator
 * Uses the Alea PRNG algorithm for deterministic random number generation
 */
import Alea from 'alea';

export type PRNG = () => number;

/**
 * Create a seeded pseudo-random number generator
 * @param seed - Numeric seed for reproducible results
 * @returns A function that returns random numbers in [0, 1)
 */
export function createSeededRandom(seed: number | string): PRNG {
    return Alea(seed);
}

/**
 * Get a random integer in range [min, max] (inclusive)
 */
export function randomInt(prng: PRNG, min: number, max: number): number {
    return Math.floor(prng() * (max - min + 1)) + min;
}

/**
 * Get a random float in range [min, max)
 */
export function randomFloat(prng: PRNG, min: number, max: number): number {
    return prng() * (max - min) + min;
}

/**
 * Pick a random element from an array
 */
export function randomPick<T>(prng: PRNG, array: T[]): T {
    return array[Math.floor(prng() * array.length)];
}

/**
 * Shuffle an array in place using Fisher-Yates algorithm
 */
export function shuffle<T>(prng: PRNG, array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
