import { WorldMap, State } from './MapState';
import { createSeededRandom } from './SeededRandom';

// Fantasy-style color palette for states
const STATE_COLORS = [
    '#8B4513', // Saddle Brown
    '#2E8B57', // Sea Green  
    '#4682B4', // Steel Blue
    '#9932CC', // Dark Orchid
    '#CD853F', // Peru
    '#556B2F', // Dark Olive Green
    '#6B8E23', // Olive Drab
    '#8B0000', // Dark Red
    '#483D8B', // Dark Slate Blue
    '#2F4F4F', // Dark Slate Gray
    '#B8860B', // Dark Goldenrod
    '#008B8B', // Dark Cyan
    '#704214', // Sepia
    '#3B5323', // Dark Moss Green
    '#1E3A5F', // Prussian Blue
];

// Simple fantasy name generator
const NAME_PARTS = {
    prefixes: ['Nor', 'Sou', 'Eas', 'Wes', 'Val', 'Mor', 'Kar', 'Eld', 'Ara', 'Gor', 'Bel', 'Cal', 'Dra', 'Era', 'Fen'],
    middles: ['an', 'el', 'or', 'ar', 'en', 'ir', 'al', 'on', 'un', 'eth', 'ath'],
    suffixes: ['ia', 'or', 'and', 'heim', 'land', 'mark', 'gor', 'dale', 'hold', 'mere', 'dom', 'ria', 'cia', 'via'],
};

function generateStateName(prng: () => number): string {
    const prefix = NAME_PARTS.prefixes[Math.floor(prng() * NAME_PARTS.prefixes.length)];
    const middle = prng() > 0.5 ? NAME_PARTS.middles[Math.floor(prng() * NAME_PARTS.middles.length)] : '';
    const suffix = NAME_PARTS.suffixes[Math.floor(prng() * NAME_PARTS.suffixes.length)];
    return prefix + middle + suffix;
}

export class StateGenerator {
    /**
     * Generate political states using region growth from seed cells
     * @param map The world map with cells and heights
     * @param numStates Number of states to generate
     * @param seed Random seed for reproducibility
     */
    static generate(map: WorldMap, numStates: number = 5, seed: number): State[] {
        const prng = createSeededRandom(seed);
        const numCells = map.cells.heights.length;

        // Find valid land cells (elevation > 0.25, not ocean)
        const landCells: number[] = [];
        for (let i = 0; i < numCells; i++) {
            if (map.cells.heights[i] > 0.25) {
                landCells.push(i);
            }
        }

        if (landCells.length < numStates) {
            console.warn('Not enough land cells for states');
            return [];
        }

        // Pick random seed cells for states (spaced apart)
        const stateSeedCells: number[] = [];
        const usedCells = new Set<number>();

        // Shuffle land cells for random selection
        const shuffled = [...landCells].sort(() => prng() - 0.5);

        for (const cellId of shuffled) {
            if (stateSeedCells.length >= numStates) break;

            // Check if this cell is far enough from existing seeds
            const cellX = map.points[cellId * 2];
            const cellY = map.points[cellId * 2 + 1];

            let tooClose = false;
            for (const seedCell of stateSeedCells) {
                const seedX = map.points[seedCell * 2];
                const seedY = map.points[seedCell * 2 + 1];
                const dist = Math.sqrt((cellX - seedX) ** 2 + (cellY - seedY) ** 2);
                const minDist = Math.min(map.width, map.height) / (numStates * 1.5);
                if (dist < minDist) {
                    tooClose = true;
                    break;
                }
            }

            if (!tooClose) {
                stateSeedCells.push(cellId);
                usedCells.add(cellId);
            }
        }

        // Initialize states and assign seed cells
        const states: State[] = [];
        for (let i = 0; i < stateSeedCells.length; i++) {
            const stateId = i + 1; // State IDs start at 1 (0 = no state)
            const seedCell = stateSeedCells[i];

            map.cells.states[seedCell] = stateId;

            states.push({
                id: stateId,
                name: generateStateName(prng),
                color: STATE_COLORS[i % STATE_COLORS.length],
                capitalId: -1, // Will be set when cities are placed
                centerX: map.points[seedCell * 2],
                centerY: map.points[seedCell * 2 + 1],
                cellCount: 1
            });
        }

        // Region growth - BFS from seed cells
        const queues: number[][] = stateSeedCells.map(c => [c]);
        let active = true;

        while (active) {
            active = false;

            for (let stateIdx = 0; stateIdx < states.length; stateIdx++) {
                const queue = queues[stateIdx];
                if (queue.length === 0) continue;

                // Process one cell per state per round (for balanced growth)
                const currentCell = queue.shift()!;

                // Get neighbors using Delaunay triangulation
                const neighbors = this.getNeighbors(map, currentCell);

                for (const neighbor of neighbors) {
                    // Skip if already claimed or ocean
                    if (map.cells.states[neighbor] !== 0) continue;
                    if (map.cells.heights[neighbor] <= 0.2) continue; // Ocean

                    // Claim this cell with some probability (creates irregular borders)
                    if (prng() < 0.85) {
                        map.cells.states[neighbor] = states[stateIdx].id;
                        states[stateIdx].cellCount++;
                        queue.push(neighbor);
                        active = true;
                    } else {
                        // Put it back at the end for another try later
                        queue.push(currentCell);
                        active = true;
                        break;
                    }
                }
            }
        }

        // Recalculate state centers based on all cells
        for (const state of states) {
            let sumX = 0, sumY = 0, count = 0;
            for (let i = 0; i < numCells; i++) {
                if (map.cells.states[i] === state.id) {
                    sumX += map.points[i * 2];
                    sumY += map.points[i * 2 + 1];
                    count++;
                }
            }
            if (count > 0) {
                state.centerX = sumX / count;
                state.centerY = sumY / count;
                state.cellCount = count;
            }
        }

        return states;
    }

    /**
     * Get neighboring cell IDs using Delaunay triangulation
     */
    private static getNeighbors(map: WorldMap, cellId: number): number[] {
        const neighbors: number[] = [];

        // Use Delaunay neighbors method
        for (const neighbor of map.delaunay.neighbors(cellId)) {
            neighbors.push(neighbor);
        }

        return neighbors;
    }
}
