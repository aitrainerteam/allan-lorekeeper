import { WorldMap } from '../core/MapState';

export type ToolType = 'select' | 'height-paint' | 'biome-paint' | 'city-placer';

export interface ToolEvent {
  x: number;
  y: number; // World coordinates
  cellId: number;
  isDragging: boolean;
}

export abstract class BaseTool {
  abstract id: ToolType;
  abstract onMouseDown(map: WorldMap, e: ToolEvent): void;
  abstract onMouseMove(map: WorldMap, e: ToolEvent): void;
  abstract onMouseUp(map: WorldMap, e: ToolEvent): void;
}

export class HeightPaintTool extends BaseTool {
  id: ToolType = 'height-paint';
  radius: number = 50;
  intensity: number = 0.1;

  onMouseDown(map: WorldMap, e: ToolEvent) {
    this.paint(map, e);
  }

  onMouseMove(map: WorldMap, e: ToolEvent) {
    if (e.isDragging) this.paint(map, e);
  }

  onMouseUp() {}

  private paint(map: WorldMap, e: ToolEvent) {
    const centerCell = e.cellId;
    if (centerCell === -1) return;

    const centerX = map.points[centerCell * 2];
    const centerY = map.points[centerCell * 2 + 1];

    // Find all cells within radius
    const affectedCells: number[] = [];
    for (let i = 0; i < map.cells.heights.length; i++) {
      const cellX = map.points[i * 2];
      const cellY = map.points[i * 2 + 1];
      const distance = Math.sqrt((cellX - centerX) ** 2 + (cellY - centerY) ** 2);

      if (distance <= this.radius) {
        affectedCells.push(i);
      }
    }

    // Apply height change with falloff based on distance
    affectedCells.forEach(cellId => {
      const cellX = map.points[cellId * 2];
      const cellY = map.points[cellId * 2 + 1];
      const distance = Math.sqrt((cellX - centerX) ** 2 + (cellY - centerY) ** 2);
      const falloff = 1 - (distance / this.radius); // Linear falloff

      const heightChange = this.intensity * falloff;
      map.cells.heights[cellId] = Math.min(1, Math.max(0, map.cells.heights[cellId] + heightChange));
    });
  }
}

export class SelectTool extends BaseTool {
  id: ToolType = 'select';

  onMouseDown() {}
  onMouseMove() {}
  onMouseUp() {}
}

export class ToolManager {
  private static tools: Map<ToolType, BaseTool> = new Map();

  static {
    this.tools.set('select', new SelectTool());
    this.tools.set('height-paint', new HeightPaintTool());
  }

  static getTool(type: ToolType): BaseTool | undefined {
    return this.tools.get(type);
  }
}