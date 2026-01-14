import { WorldMap } from '../core/MapState';
import { interpolateSpectral } from 'd3-scale-chromatic';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  
  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  render(map: WorldMap, cameraTransform: { k: number, x: number, y: number }, layer: 'height' | 'political') {
    const { ctx } = this;
    const { width, height } = ctx.canvas;
    
    // Clear
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(cameraTransform.x, cameraTransform.y);
    ctx.scale(cameraTransform.k, cameraTransform.k);

    // Draw Voronoi Cells
    const { voronoi, cells } = map;
    
    // Optimization: Only draw visible cells (simplified here, in pro version use quadtree query)
    let i = 0;
    for (const polygon of voronoi.cellPolygons()) {
      ctx.beginPath();
      // Render geometry
      ctx.moveTo(polygon[0][0], polygon[0][1]);
      for (let j = 1; j < polygon.length; j++) {
        ctx.lineTo(polygon[j][0], polygon[j][1]);
      }
      ctx.closePath();

      // Color logic
      if (layer === 'height') {
        const h = cells.heights[i];
        if (h < 0.2) ctx.fillStyle = '#2b3a42'; // Ocean
        else ctx.fillStyle = interpolateSpectral(1 - h);
      } else if (layer === 'political') {
        // ... political coloring logic
        ctx.fillStyle = '#ccc';
      }

      ctx.fill();
      // Only stroke if zoomed in significantly
      if (cameraTransform.k > 2) {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.stroke();
      }
      i++;
    }
    
    ctx.restore();
  }
}