import { WorldMap, River } from './MapState';
import { createSeededRandom } from './SeededRandom';

export class RiverGenerator {
    static generate(map: WorldMap, seed: number, count: number = 30): River[] {
        const prng = createSeededRandom(seed + 233); // Unique seed for rivers
        const rivers: River[] = [];
        const riverCells = new Set<number>(); // Track cells that are part of rivers to avoid duplicates/merging logic logic if needed

        // Candidates for river sources: High elevation, preferably humid (though for now just height)
        const candidates: number[] = [];
        for (let i = 0; i < map.cells.heights.length; i++) {
            const h = map.cells.heights[i];
            // Mountain peaks or high hills
            if (h > 0.6 && h < 0.95) { // 0.95 to avoid extreme peak tips
                candidates.push(i);
            }
        }

        // Shuffle candidates
        this.shuffle(candidates, prng);

        let attempts = 0;
        let created = 0;

        while (created < count && attempts < candidates.length) {
            const startId = candidates[attempts++];
            const path = this.traceRiver(map, startId);

            // A valid river must be long enough and end in water (height < 0.2) or merge into another river (not implemented yet for simplicity)
            if (path.length > 5 && map.cells.heights[path[path.length - 1]] < 0.2) {

                // Build River object
                const points = path.map(id => ({
                    x: map.points[id * 2],
                    y: map.points[id * 2 + 1]
                }));

                rivers.push({
                    id: `river-${created}`,
                    points: points,
                    width: 2 + prng() * 2 // Variable width
                });

                path.forEach(id => riverCells.add(id));
                created++;
            }
        }

        return rivers;
    }

    // Trace a river path downhill
    private static traceRiver(map: WorldMap, startId: number): number[] {
        const path: number[] = [startId];
        let currentId = startId;

        // prevent infinite loops
        const visited = new Set<number>();
        visited.add(startId);

        while (true) {
            const neighbors = map.voronoi.neighbors(currentId);
            let lowestNeighbor = -1;
            let minHeight = map.cells.heights[currentId];

            for (const nId of neighbors) {
                if (visited.has(nId)) continue; // Don't flow back

                const h = map.cells.heights[nId];
                if (h <= minHeight) {
                    minHeight = h;
                    lowestNeighbor = nId;
                }
            }

            // Local minimum or ocean reached
            if (lowestNeighbor === -1 || lowestNeighbor === currentId) {
                // If we are at the ocean, we are good. If we are on land, it's a lake (dead end).
                break;
            }

            // Move to neighbor
            currentId = lowestNeighbor;
            path.push(currentId);
            visited.add(currentId);

            // If we hit water, stop (river ends at sea level)
            if (map.cells.heights[currentId] < 0.2) {
                break;
            }
        }

        return path;
    }

    private static shuffle(array: number[], prng: () => number) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(prng() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
}
