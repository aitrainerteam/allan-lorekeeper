import { WorldMap, Road, City } from './MapState';
import { BiomeType } from './TerrainGenerator';

export class RoadGenerator {
    static generate(map: WorldMap, cities: City[]): Road[] {
        const roads: Road[] = [];
        if (cities.length < 2) return roads;

        // 1. Identify connections (MST for simplicity to ensure connectivity)
        // We actually want a bit more than just MST to make it look like a network.
        // Let's connect every capital to its nearest 2 neighbor capitals, and every town to its nearest town/capital.

        // Simple approach: "Delaunay triangulation" of cities? 
        // Or just connect each city to its 2 closest neighbors.
        const connections = new Set<string>();

        // Sort cities by importance: Capital > Town > Village
        // Actually, we usually want roads between major hubs.
        const hubs = cities.filter(c => c.type === 'Capital' || c.type === 'Town');

        // Connect each hub to its nearest 2 hubs
        for (const hub of hubs) {
            // Find closest neighbors
            const neighbors = hubs
                .filter(other => other.id !== hub.id)
                .map(other => ({
                    city: other,
                    dist: this.dist(map, hub.cellId, other.cellId)
                }))
                .sort((a, b) => a.dist - b.dist)
                .slice(0, 2); // Connect to 2 closest

            for (const n of neighbors) {
                // specific connection ID to avoid duplicates (A-B is same as B-A)
                const id = [hub.id, n.city.id].sort().join('-');
                if (!connections.has(id)) {
                    connections.add(id);
                    // Pathfind
                    const path = this.findPath(map, hub.cellId, n.city.cellId);
                    if (path.length > 0) {
                        roads.push({
                            id: `road-${id}`,
                            points: path.map(pid => ({ x: map.points[pid * 2], y: map.points[pid * 2 + 1] })),
                            type: 'trade'
                        });
                    }
                }
            }
        }

        return roads;
    }

    // A* Pathfinding
    private static findPath(map: WorldMap, startId: number, endId: number): number[] {
        const cameFrom = new Map<number, number>();
        const gScore = new Map<number, number>();
        const fScore = new Map<number, number>();
        const openSet = new Set<number>();

        openSet.add(startId);
        gScore.set(startId, 0);
        fScore.set(startId, this.dist(map, startId, endId));

        while (openSet.size > 0) {
            // Get node with lowest fScore
            let current = -1;
            let minF = Infinity;
            for (const id of openSet) {
                const score = fScore.get(id) ?? Infinity;
                if (score < minF) {
                    minF = score;
                    current = id;
                }
            }

            if (current === endId) {
                return this.reconstructPath(cameFrom, current);
            }

            if (current === -1) break; // Should not happen
            openSet.delete(current);

            // Neighbors
            const neighbors = map.voronoi.neighbors(current);
            for (const neighbor of neighbors) {
                // Cost calculation
                const moveCost = this.getMovementCost(map, current, neighbor);
                if (moveCost === Infinity) continue; // Impassable (e.g. deep ocean)

                const tentativeG = (gScore.get(current) ?? Infinity) + moveCost;

                if (tentativeG < (gScore.get(neighbor) ?? Infinity)) {
                    cameFrom.set(neighbor, current);
                    gScore.set(neighbor, tentativeG);
                    fScore.set(neighbor, tentativeG + this.dist(map, neighbor, endId));
                    if (!openSet.has(neighbor)) {
                        openSet.add(neighbor);
                    }
                }
            }
        }

        return []; // No path found
    }

    private static reconstructPath(cameFrom: Map<number, number>, current: number): number[] {
        const totalPath = [current];
        while (cameFrom.has(current)) {
            current = cameFrom.get(current)!;
            totalPath.unshift(current);
        }
        return totalPath;
    }

    private static getMovementCost(map: WorldMap, fromId: number, toId: number): number {
        const fromH = map.cells.heights[fromId];
        const toH = map.cells.heights[toId];
        const biome = map.cells.biomes[toId];

        // 1. Water check.
        // We can technically build bridges over rivers (if we knew them), but ocean is hard.
        // Shallow water/coast (BEACH) might be okay for coastal roads.
        if (toH < 0.2) return Infinity; // Ocean - Impassable for road generator currently

        // 2. Distance cost (base)
        const d = this.dist(map, fromId, toId);

        // 3. Slope penalty calculation
        const slope = Math.abs(toH - fromH);
        const slopePenalty = slope * 500; // Steepness is expensive

        // 4. Biome penalty
        let biomePenalty = 1.0;
        switch (biome) {
            case BiomeType.DESERT: biomePenalty = 1.2; break; // Sand is slow
            case BiomeType.SWAMP: biomePenalty = 3.0; break; // Swamps are very hard
            case BiomeType.MOUNTAIN: biomePenalty = 4.0; break; // Mountains hard
            case BiomeType.SNOW: biomePenalty = 5.0; break; // Deep snow hard
            case BiomeType.DENSE_FOREST: biomePenalty = 1.5; break; // Cutting trees
            case BiomeType.FOREST: biomePenalty = 1.2; break;
            case BiomeType.GRASSLAND: biomePenalty = 1.0; break; // Ideal
            case BiomeType.BEACH: biomePenalty = 1.2; break; // Okay but sandy
        }

        return d * biomePenalty + slopePenalty;
    }

    private static dist(map: WorldMap, id1: number, id2: number): number {
        const x1 = map.points[id1 * 2];
        const y1 = map.points[id1 * 2 + 1];
        const x2 = map.points[id2 * 2];
        const y2 = map.points[id2 * 2 + 1];
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    }
}
