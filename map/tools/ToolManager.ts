import { WorldMap } from '@core/MapState';

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
    // Find cells within radius of e.x, e.y
    // In a real implementation, use d3-delaunay's find() or a spatial hash
    const centerCell = e.cellId;
    if (centerCell === -1) return;
    
    // Naive implementation for skeleton (updates single cell)
    // PRO VERSION: Use BFS traversal from centerCell to find neighbors within radius
    map.cells.heights[centerCell] = Math.min(1, Math.max(0, map.cells.heights[centerCell] + this.intensity));
  }
}