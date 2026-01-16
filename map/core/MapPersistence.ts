import { Delaunay } from 'd3-delaunay';
import { WorldMap } from './MapState';

/**
 * Serialization format for saving map state
 * Skips non-serializable d3 objects
 */
export interface SerializedMap {
    seed: number;
    width: number;
    height: number;
    points: number[]; // Converted from Float64Array
    cells: {
        heights: number[];
        biomes: number[];
        states: number[];
        cultures: number[];
        pop: number[];
    };
    cities: any[];
    castles: any[];
    markers: any[];
    states: any[];
    rivers: any[];
    roads: any[];
    nextId: { city: number, state: number, castle: number, marker: number };
}

export class MapPersistence {
    private static STORAGE_KEY = 'lorekeeper_map_data';

    static save(map: WorldMap) {
        const serialized: SerializedMap = {
            seed: map.seed,
            width: map.width,
            height: map.height,
            points: Array.from(map.points),
            cells: {
                heights: Array.from(map.cells.heights),
                biomes: Array.from(map.cells.biomes),
                states: Array.from(map.cells.states),
                cultures: Array.from(map.cells.cultures),
                pop: Array.from(map.cells.pop),
            },
            cities: map.cities,
            castles: map.castles,
            markers: map.markers,
            states: map.states,
            rivers: map.rivers,
            roads: map.roads,
            nextId: map.nextId
        };

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serialized));
        console.log('Map saved to local storage');
    }

    static load(): WorldMap | null {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (!data) return null;

        try {
            const s: SerializedMap = JSON.parse(data);

            // Reconstruct non-serializable mesh
            const pointsArray = new Float64Array(s.points);
            const delaunay = new Delaunay(pointsArray);
            const voronoi = delaunay.voronoi([0, 0, s.width, s.height]);

            const map: WorldMap = {
                seed: s.seed,
                width: s.width,
                height: s.height,
                points: pointsArray,
                delaunay,
                voronoi,
                cells: {
                    heights: new Float32Array(s.cells.heights),
                    biomes: new Uint8Array(s.cells.biomes),
                    states: new Uint16Array(s.cells.states),
                    cultures: new Uint16Array(s.cells.cultures),
                    pop: new Float32Array(s.cells.pop),
                },
                rivers: s.rivers || [],
                roads: s.roads || [],
                cities: s.cities || [],
                castles: s.castles || [],
                markers: s.markers || [],
                labels: [],
                states: s.states || [],
                nextId: s.nextId || { city: 1, state: 1, castle: 1, marker: 1 }
            };

            console.log('Map loaded from local storage');
            return map;
        } catch (err) {
            console.error('Failed to load map:', err);
            return null;
        }
    }

    static clear() {
        localStorage.removeItem(this.STORAGE_KEY);
    }
}
