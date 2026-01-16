import { WorldMap } from '../core/MapState';
import { useUIStore } from '../app/store';
import { TerrainGenerator } from '../core/TerrainGenerator';

export type ToolType = 'select' | 'height-paint' | 'biome-paint' | 'city-placer' | 'castle-placer' | 'marker-placer';

export interface ToolEvent {
  x: number;
  y: number; // World coordinates
  cellId: number;
  isDragging: boolean;
  altKey?: boolean;
}

export abstract class BaseTool {
  abstract id: ToolType;
  abstract onMouseDown(map: WorldMap, e: ToolEvent): void;
  abstract onMouseMove(map: WorldMap, e: ToolEvent): void;
  abstract onMouseUp(map: WorldMap, e: ToolEvent): void;
}

export class HeightPaintTool extends BaseTool {
  id: ToolType = 'height-paint';

  onMouseDown(map: WorldMap, e: ToolEvent) {
    this.paint(map, e);
  }

  onMouseMove(map: WorldMap, e: ToolEvent) {
    if (e.isDragging) this.paint(map, e);
  }

  onMouseUp() { }

  private paint(map: WorldMap, e: ToolEvent) {
    const { brushSize, brushIntensity } = useUIStore.getState();
    const radius = brushSize;
    const intensity = e.altKey ? -brushIntensity : brushIntensity;

    const centerCell = e.cellId;
    if (centerCell === -1) return;

    const centerX = map.points[centerCell * 2];
    const centerY = map.points[centerCell * 2 + 1];

    const radiusSq = radius * radius;
    const affectedCells: number[] = [];

    // Find all cells within radius - optimization: only check cells within bounding box
    // For now, full loop is okay because it's just 10k cells, but we can do a simple distance check
    for (let i = 0; i < map.cells.heights.length; i++) {
      const cellX = map.points[i * 2];
      const cellY = map.points[i * 2 + 1];

      const dx = cellX - centerX;
      const dy = cellY - centerY;
      const distSq = dx * dx + dy * dy;

      if (distSq <= radiusSq) {
        const distance = Math.sqrt(distSq);
        const falloff = 1 - (distance / radius); // Linear falloff
        const heightChange = intensity * falloff;

        map.cells.heights[i] = Math.min(1, Math.max(0, map.cells.heights[i] + heightChange));
        affectedCells.push(i);
      }
    }

    // Recalculate biomes ONLY for affected cells
    affectedCells.forEach(id => TerrainGenerator.updateCellBiome(map, id));
  }
}

export class BiomePaintTool extends BaseTool {
  id: ToolType = 'biome-paint';

  onMouseDown(map: WorldMap, e: ToolEvent) {
    this.paint(map, e);
  }

  onMouseMove(map: WorldMap, e: ToolEvent) {
    if (e.isDragging) this.paint(map, e);
  }

  onMouseUp() { }

  private paint(map: WorldMap, e: ToolEvent) {
    const { brushSize, selectedBiome } = useUIStore.getState();
    const radius = brushSize;

    const centerCell = e.cellId;
    if (centerCell === -1) return;

    const centerX = map.points[centerCell * 2];
    const centerY = map.points[centerCell * 2 + 1];
    const radiusSq = radius * radius;

    for (let i = 0; i < map.cells.biomes.length; i++) {
      const cellX = map.points[i * 2];
      const cellY = map.points[i * 2 + 1];
      const dx = cellX - centerX;
      const dy = cellY - centerY;
      if (dx * dx + dy * dy <= radiusSq) {
        map.cells.biomes[i] = selectedBiome;
      }
    }
  }
}

import { generateCityName } from '../core/CityGenerator';

export class CityPlacerTool extends BaseTool {
  id: ToolType = 'city-placer';

  onMouseDown(map: WorldMap, e: ToolEvent) {
    if (e.cellId === -1) return;
    if (map.cells.heights[e.cellId] < 0.2) return; // Can't place city in ocean

    // Check if city already exists in this cell
    if (map.cities.some(c => c.cellId === e.cellId)) return;

    // Use a simple local random for now, or we could use seeded if we passed it
    const prng = () => Math.random();

    // Determine city type based on random or eventually UI selection
    const r = prng();
    const type = r > 0.8 ? 'Capital' : r > 0.3 ? 'Town' : 'Village';

    // Place a new city
    const newCity = {
      id: map.nextId.city++,
      cellId: e.cellId,
      name: generateCityName(prng),
      population: Math.floor(prng() * (type === 'Capital' ? 50000 : type === 'Town' ? 5000 : 500)) + (type === 'Capital' ? 10000 : type === 'Town' ? 1000 : 100),
      type: type as any
    };

    map.cities.push(newCity);
  }

  onMouseMove() { }
  onMouseUp() { }
}

export class CastlePlacerTool extends BaseTool {
  id: ToolType = 'castle-placer';

  onMouseDown(map: WorldMap, e: ToolEvent) {
    if (e.cellId === -1) return;
    if (map.cells.heights[e.cellId] < 0.2) return;

    if (map.castles.some(c => c.cellId === e.cellId)) return;

    const prng = () => Math.random();
    const r = prng();
    const type = r > 0.7 ? 'Citadel' : r > 0.4 ? 'Keep' : r > 0.2 ? 'Fort' : 'Outpost';

    const newCastle = {
      id: map.nextId.castle++,
      cellId: e.cellId,
      name: generateCityName(prng) + ' ' + (type === 'Citadel' ? 'Citadel' : type === 'Keep' ? 'Keep' : type === 'Fort' ? 'Fort' : 'Watchtower'),
      type: type as any
    };

    map.castles.push(newCastle);
  }

  onMouseMove() { }
  onMouseUp() { }
}

export class MarkerPlacerTool extends BaseTool {
  id: ToolType = 'marker-placer';

  onMouseDown(map: WorldMap, e: ToolEvent) {
    const newMarker = {
      id: map.nextId.marker++,
      x: e.x,
      y: e.y,
      name: 'New Marker',
      icon: '📍',
      note: ''
    };

    map.markers.push(newMarker);
  }

  onMouseMove() { }
  onMouseUp() { }
}

export class SelectTool extends BaseTool {
  id: ToolType = 'select';

  onMouseDown() { }
  onMouseMove() { }
  onMouseUp() { }
}

export class ToolManager {
  private static tools: Map<ToolType, BaseTool> = new Map();

  static {
    this.tools.set('select', new SelectTool());
    this.tools.set('height-paint', new HeightPaintTool());
    this.tools.set('biome-paint', new BiomePaintTool());
    this.tools.set('city-placer', new CityPlacerTool());
    this.tools.set('castle-placer', new CastlePlacerTool());
    this.tools.set('marker-placer', new MarkerPlacerTool());
  }

  static getTool(type: ToolType): BaseTool | undefined {
    return this.tools.get(type);
  }
}