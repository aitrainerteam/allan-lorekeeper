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

/**
 * Entry for a saved map version with metadata
 */
export interface SavedMapEntry {
    id: string;           // Unique ID (timestamp-based)
    name: string;         // Auto-generated or user-provided
    date: string;         // ISO timestamp
    type: 'manual' | 'autosave';
    thumbnail: string;    // Base64 data URL from canvas
    data: SerializedMap;
}

/**
 * Lightweight version of SavedMapEntry without full map data (for list display)
 */
export interface SavedMapMeta {
    id: string;
    name: string;
    date: string;
    type: 'manual' | 'autosave';
    thumbnail: string;
    seed: number;
}

const MAX_AUTOSAVES = 5;

export class MapPersistence {
    private static STORAGE_KEY = 'lorekeeper_map_data';
    private static SAVES_KEY = 'lorekeeper_map_saves';
    private static CURRENT_ID_KEY = 'lorekeeper_current_map_id';

    /**
     * Serialize a WorldMap to a plain object for storage
     */
    static serialize(map: WorldMap): SerializedMap {
        return {
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
    }

    /**
     * Deserialize a SerializedMap back to a WorldMap
     */
    static deserialize(s: SerializedMap): WorldMap {
        const pointsArray = new Float64Array(s.points);
        const delaunay = new Delaunay(pointsArray);
        const voronoi = delaunay.voronoi([0, 0, s.width, s.height]);

        return {
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
    }

    // ============== Legacy single-map methods (for backward compatibility) ==============

    static save(map: WorldMap) {
        const serialized = this.serialize(map);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(serialized));
        console.log('Map saved to local storage');
    }

    static load(): WorldMap | null {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (!data) return null;

        try {
            const s: SerializedMap = JSON.parse(data);
            const map = this.deserialize(s);
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

    // ============== Versioned save system ==============

    /**
     * Get all saved map entries from storage
     */
    private static getSavedMaps(): SavedMapEntry[] {
        const data = localStorage.getItem(this.SAVES_KEY);
        if (!data) return [];
        try {
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    /**
     * Store all saved map entries
     */
    private static setSavedMaps(saves: SavedMapEntry[]) {
        localStorage.setItem(this.SAVES_KEY, JSON.stringify(saves));
    }

    /**
     * Save a new version of the map
     */
    static saveVersion(map: WorldMap, type: 'manual' | 'autosave', thumbnail: string): string {
        const saves = this.getSavedMaps();
        const id = `map_${Date.now()}`;
        const date = new Date().toISOString();
        
        // Generate name based on seed and type
        const name = type === 'manual' 
            ? `Map ${map.seed} - Saved`
            : `Map ${map.seed} - Autosave`;

        const entry: SavedMapEntry = {
            id,
            name,
            date,
            type,
            thumbnail,
            data: this.serialize(map)
        };

        // If autosave, limit the number of autosaves (keep only recent ones)
        if (type === 'autosave') {
            const autosaves = saves.filter(s => s.type === 'autosave');
            if (autosaves.length >= MAX_AUTOSAVES) {
                // Remove oldest autosave
                const oldestAutosave = autosaves.sort((a, b) => 
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                )[0];
                const idx = saves.findIndex(s => s.id === oldestAutosave.id);
                if (idx !== -1) {
                    saves.splice(idx, 1);
                }
            }
        }

        saves.push(entry);
        this.setSavedMaps(saves);
        this.setCurrentMapId(id);
        
        // Also update the legacy single-map storage
        this.save(map);
        
        console.log(`Map version saved: ${id} (${type})`);
        return id;
    }

    /**
     * Get list of all saves with metadata only (no full map data)
     */
    static loadVersionList(): SavedMapMeta[] {
        const saves = this.getSavedMaps();
        return saves.map(s => ({
            id: s.id,
            name: s.name,
            date: s.date,
            type: s.type,
            thumbnail: s.thumbnail,
            seed: s.data.seed
        })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    /**
     * Load a specific version by ID
     */
    static loadVersion(id: string): WorldMap | null {
        const saves = this.getSavedMaps();
        const entry = saves.find(s => s.id === id);
        if (!entry) {
            console.error(`Map version not found: ${id}`);
            return null;
        }

        try {
            const map = this.deserialize(entry.data);
            this.setCurrentMapId(id);
            // Also update legacy storage
            this.save(map);
            console.log(`Map version loaded: ${id}`);
            return map;
        } catch (err) {
            console.error('Failed to load map version:', err);
            return null;
        }
    }

    /**
     * Delete a saved version
     */
    static deleteVersion(id: string): boolean {
        const saves = this.getSavedMaps();
        const idx = saves.findIndex(s => s.id === id);
        if (idx === -1) return false;
        
        saves.splice(idx, 1);
        this.setSavedMaps(saves);
        
        // If we deleted the current map, clear the current ID
        if (this.getCurrentMapId() === id) {
            localStorage.removeItem(this.CURRENT_ID_KEY);
        }
        
        console.log(`Map version deleted: ${id}`);
        return true;
    }

    /**
     * Get the ID of the currently loaded map
     */
    static getCurrentMapId(): string | null {
        return localStorage.getItem(this.CURRENT_ID_KEY);
    }

    /**
     * Set the ID of the currently loaded map
     */
    static setCurrentMapId(id: string) {
        localStorage.setItem(this.CURRENT_ID_KEY, id);
    }

    /**
     * Check if there are any saved versions
     */
    static hasSavedVersions(): boolean {
        return this.getSavedMaps().length > 0;
    }

    /**
     * Clear all saved versions
     */
    static clearAllVersions() {
        localStorage.removeItem(this.SAVES_KEY);
        localStorage.removeItem(this.CURRENT_ID_KEY);
        this.clear();
    }
}
