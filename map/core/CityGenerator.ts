import { WorldMap, City } from './MapState';
import { createSeededRandom } from './SeededRandom';

// Syllable-based name generator parts
const SYLLABLES = {
    starts: ['A', 'Ba', 'Ca', 'Da', 'E', 'Fa', 'Ga', 'Ha', 'I', 'Ja', 'Ka', 'La', 'Ma', 'Na', 'O', 'Pa', 'Ra', 'Sa', 'Ta', 'U', 'Va', 'Wa', 'Za'],
    middles: ['bel', 'cor', 'dan', 'ell', 'fal', 'gar', 'has', 'ion', 'jor', 'kil', 'lum', 'mon', 'nor', 'oth', 'pel', 'qui', 'ror', 'sun', 'til', 'un', 'vel', 'wen', 'xan', 'yor', 'zel'],
    ends: ['ia', 'is', 'on', 'um', 'en', 'ar', 'os', 'ia', 'eth', 'ord', 'ast', 'ell', 'ant', 'ock', 'ham', 'ton', 'field', 'bury', 'ford', 'wood', 'mont', 'port', 'stead'],
};

export function generateCityName(prng: () => number): string {
    const length = prng() > 0.3 ? 2 : 3;
    let name = SYLLABLES.starts[Math.floor(prng() * SYLLABLES.starts.length)];

    if (length === 3) {
        name += SYLLABLES.middles[Math.floor(prng() * SYLLABLES.middles.length)];
    }

    name += SYLLABLES.ends[Math.floor(prng() * SYLLABLES.ends.length)];
    return name;
}

export class CityGenerator {
    /**
     * Place cities on the map:
     * 1. Capitals for each state
     * 2. Additional towns and villages on land
     */
    static generate(map: WorldMap, seed: number): City[] {
        const prng = createSeededRandom(seed);
        const cities: City[] = [];
        let nextId = 1;

        // 1. Place Capitals
        for (const state of map.states) {
            // Find a suitable cell for the capital (highest elevation in the state territory)
            let bestCellId = -1;
            let maxHeight = -1;

            for (let i = 0; i < map.cells.heights.length; i++) {
                if (map.cells.states[i] === state.id) {
                    if (map.cells.heights[i] > maxHeight) {
                        maxHeight = map.cells.heights[i];
                        bestCellId = i;
                    }
                }
            }

            if (bestCellId !== -1) {
                const capital: City = {
                    id: nextId++,
                    cellId: bestCellId,
                    name: generateCityName(prng) + " (Capital of " + state.name + ")",
                    population: Math.floor(prng() * 50000) + 10000,
                    type: 'Capital'
                };
                cities.push(capital);
                state.capitalId = capital.id;
            }
        }

        // 2. Place Towns (roughly 1 per 1000 land cells)
        const numTowns = Math.floor(map.cells.heights.filter(h => h > 0.2).length / 1000);
        const landCells: number[] = [];
        for (let i = 0; i < map.cells.heights.length; i++) {
            if (map.cells.heights[i] > 0.2 && !cities.some(c => c.cellId === i)) {
                landCells.push(i);
            }
        }

        for (let i = 0; i < numTowns; i++) {
            if (landCells.length === 0) break;

            const idx = Math.floor(prng() * landCells.length);
            const cellId = landCells[idx];
            landCells.splice(idx, 1);

            cities.push({
                id: nextId++,
                cellId,
                name: generateCityName(prng),
                population: Math.floor(prng() * 5000) + 2000,
                type: 'Town'
            });
        }

        // 3. Place Villages (randomly scattered)
        const numVillages = numTowns * 2;
        for (let i = 0; i < numVillages; i++) {
            if (landCells.length === 0) break;

            const idx = Math.floor(prng() * landCells.length);
            const cellId = landCells[idx];
            landCells.splice(idx, 1);

            cities.push({
                id: nextId++,
                cellId,
                name: generateCityName(prng).toLowerCase(), // Simpler naming convention
                population: Math.floor(prng() * 500) + 100,
                type: 'Village'
            });
        }

        return cities;
    }
}
