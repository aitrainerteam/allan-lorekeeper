import { WorldMap } from './MapState';
import { createNoise2D } from 'simplex-noise';
import { createSeededRandom } from './SeededRandom';

export enum BiomeType {
    OCEAN = 0,
    BEACH = 1,
    GRASSLAND = 2,
    FOREST = 3,
    DENSE_FOREST = 4,
    MOUNTAIN = 5,
    SNOW = 6,
    DESERT = 7,
    SWAMP = 8,
    TUNDRA = 9
}

export interface BiomeDefinition {
    type: BiomeType;
    name: string;
    color: string;
}

export const BIOMES: Record<BiomeType, BiomeDefinition> = {
    [BiomeType.OCEAN]: { type: BiomeType.OCEAN, name: 'Ocean', color: '#1a252d' },
    [BiomeType.BEACH]: { type: BiomeType.BEACH, name: 'Beach', color: '#d2b48c' },
    [BiomeType.GRASSLAND]: { type: BiomeType.GRASSLAND, name: 'Grassland', color: '#7cb342' },
    [BiomeType.FOREST]: { type: BiomeType.FOREST, name: 'Forest', color: '#388e3c' },
    [BiomeType.DENSE_FOREST]: { type: BiomeType.DENSE_FOREST, name: 'Dense Forest', color: '#1b5e20' },
    [BiomeType.MOUNTAIN]: { type: BiomeType.MOUNTAIN, name: 'Mountain', color: '#78909c' },
    [BiomeType.SNOW]: { type: BiomeType.SNOW, name: 'Snow', color: '#ffffff' },
    [BiomeType.DESERT]: { type: BiomeType.DESERT, name: 'Desert', color: '#ffcc80' },
    [BiomeType.SWAMP]: { type: BiomeType.SWAMP, name: 'Swamp', color: '#4e342e' },
    [BiomeType.TUNDRA]: { type: BiomeType.TUNDRA, name: 'Tundra', color: '#b0bec5' },
};

export class TerrainGenerator {
    private static noise2D: any = null;
    private static lastSeed: number | null = null;

    private static getNoise(seed: number) {
        if (this.noise2D && this.lastSeed === seed) return this.noise2D;
        const prng = createSeededRandom(seed + 1);
        this.noise2D = createNoise2D(prng);
        this.lastSeed = seed;
        return this.noise2D;
    }

    /**
     * Refine biomes based on height and moisture (simulated with noise)
     */
    static generateBiomes(map: WorldMap, seed: number) {
        const noise2D = this.getNoise(seed);

        for (let i = 0; i < map.cells.heights.length; i++) {
            this.updateCellBiome(map, i, noise2D);
        }
    }

    static updateCellBiome(map: WorldMap, i: number, noise2D?: any) {
        const x = map.points[i * 2];
        const y = map.points[i * 2 + 1];
        const height = map.cells.heights[i];

        const noise = noise2D || this.getNoise(map.seed);

        // Simulating moisture with noise
        const moisture = noise(x / 800, y / 800) * 0.5 + 0.5;

        if (height < 0.2) {
            map.cells.biomes[i] = BiomeType.OCEAN;
        } else if (height < 0.25) {
            map.cells.biomes[i] = BiomeType.BEACH;
        } else if (height > 0.8) {
            map.cells.biomes[i] = BiomeType.SNOW;
        } else if (height > 0.6) {
            map.cells.biomes[i] = BiomeType.MOUNTAIN;
        } else {
            // Mid-height biomes depend on moisture
            if (moisture > 0.7) {
                map.cells.biomes[i] = BiomeType.DENSE_FOREST;
            } else if (moisture > 0.4) {
                map.cells.biomes[i] = BiomeType.FOREST;
            } else if (moisture < 0.15) {
                map.cells.biomes[i] = BiomeType.DESERT;
            } else {
                map.cells.biomes[i] = BiomeType.GRASSLAND;
            }
        }
    }

    /**
     * Placeholder for mountain range detection or specific feature extraction
     */
    static extractFeatures(_map: WorldMap) {
        // This could find contiguous areas of mountain biome to place specific mountain peak icons
    }
}

