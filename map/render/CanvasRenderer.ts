import type { WorldMap } from '../core/MapState';
import { BIOMES, BiomeType } from '../core/TerrainGenerator';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  render(map: WorldMap, cameraTransform: { k: number, x: number, y: number }, layer: 'height' | 'political') {
    const { ctx } = this;
    const { width, height } = ctx.canvas;

    // Clear and fill background
    ctx.save();
    ctx.fillStyle = '#1a252d'; // Dark ocean/background color
    ctx.fillRect(0, 0, width, height);
    ctx.translate(cameraTransform.x, cameraTransform.y);
    ctx.scale(cameraTransform.k, cameraTransform.k);

    // Draw Voronoi Cells
    const { voronoi, cells } = map;

    // Optimization: Only draw visible cells (simplified here)
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
        const b = cells.biomes[i] as BiomeType;
        ctx.fillStyle = BIOMES[b]?.color || '#888';
      } else if (layer === 'political') {
        const h = cells.heights[i];
        const stateId = cells.states[i];

        if (h < 0.2) {
          ctx.fillStyle = '#2b3a42'; // Ocean stays dark
        } else if (stateId === 0) {
          ctx.fillStyle = '#555'; // Unclaimed land
        } else {
          // Find state color
          const state = map.states.find(s => s.id === stateId);
          ctx.fillStyle = state ? state.color : '#888';
        }
      }

      ctx.fill();
      // Only stroke if zoomed in significantly
      if (cameraTransform.k > 2) {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.stroke();
      }
      i++;
    }

    // Draw Rivers
    this.renderRivers(map, cameraTransform);

    // Draw Roads
    this.renderRoads(map, cameraTransform);

    // Draw Terrain Textures/Icons
    this.renderTerrainFeatures(map, cameraTransform);

    // Draw Cities
    this.renderCities(map, cameraTransform);

    // Draw Castles
    this.renderCastles(map, cameraTransform);

    // Draw Markers
    this.renderMarkers(map, cameraTransform);

    // Draw Labels
    this.renderLabels(map, cameraTransform);

    ctx.restore();
  }

  private renderRivers(map: WorldMap, camera: { k: number }) {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3b82f6'; // River blue

    for (const river of map.rivers) {
      if (river.points.length === 0) continue;

      ctx.beginPath();
      const p0 = river.points[0];
      ctx.moveTo(p0.x, p0.y);

      for (let i = 1; i < river.points.length; i++) {
        ctx.lineTo(river.points[i].x, river.points[i].y);
      }

      ctx.lineWidth = Math.max(0.5, river.width / camera.k);
      ctx.stroke();
    }
  }

  private renderRoads(map: WorldMap, camera: { k: number }) {
    const { ctx } = this;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#5d4037'; // Dirt path brown

    for (const road of map.roads) {
      if (road.points.length === 0) continue;

      ctx.beginPath();
      const p0 = road.points[0];
      ctx.moveTo(p0.x, p0.y);

      for (let i = 1; i < road.points.length; i++) {
        ctx.lineTo(road.points[i].x, road.points[i].y);
      }

      // Dashed line
      ctx.setLineDash([5 / camera.k, 3 / camera.k]);
      ctx.lineWidth = 1.5 / camera.k;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private renderTerrainFeatures(map: WorldMap, camera: { k: number, x: number, y: number }) {
    const { ctx } = this;
    const { cells, points } = map;

    // Only draw textures if zoomed in enough to see them
    if (camera.k < 0.3) return;

    for (let i = 0; i < cells.biomes.length; i++) {
      const b = cells.biomes[i] as BiomeType;
      const x = points[i * 2];
      const y = points[i * 2 + 1];

      // Only draw on visible cells (simplified)
      // ... (skipping complex occlusion for now)

      if (b === BiomeType.MOUNTAIN || b === BiomeType.SNOW) {
        // Draw a simple mountain peak
        ctx.beginPath();
        ctx.moveTo(x, y - 4 / camera.k);
        ctx.lineTo(x + 5 / camera.k, y + 4 / camera.k);
        ctx.lineTo(x - 5 / camera.k, y + 4 / camera.k);
        ctx.closePath();
        ctx.fillStyle = b === BiomeType.SNOW ? '#fff' : '#455a64';
        ctx.fill();
        ctx.strokeStyle = '#263238';
        ctx.lineWidth = 0.5 / camera.k;
        ctx.stroke();
      } else if (b === BiomeType.FOREST || b === BiomeType.DENSE_FOREST) {
        // Draw some small tree "dots"
        const size = b === BiomeType.DENSE_FOREST ? 1.5 : 1;
        ctx.fillStyle = '#1b5e20';
        ctx.beginPath();
        ctx.arc(x, y, size / camera.k, 0, Math.PI * 2);
        ctx.fill();
      } else if (b === BiomeType.DESERT) {
        // Draw a small sand ripple / dash
        ctx.strokeStyle = '#e67e22';
        ctx.lineWidth = 0.5 / camera.k;
        ctx.beginPath();
        ctx.moveTo(x - 2 / camera.k, y);
        ctx.lineTo(x + 2 / camera.k, y);
        ctx.stroke();
      }
    }
  }

  private renderCities(map: WorldMap, camera: { k: number }) {
    const { ctx } = this;

    for (const city of map.cities) {
      const x = map.points[city.cellId * 2];
      const y = map.points[city.cellId * 2 + 1];

      ctx.beginPath();
      if (city.type === 'Capital') {
        // Red star or square for capital
        ctx.fillStyle = '#ff3b3b';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1 / camera.k;
        ctx.rect(x - 3 / camera.k, y - 3 / camera.k, 6 / camera.k, 6 / camera.k);
      } else if (city.type === 'Town') {
        // Circle for town
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.5 / camera.k;
        ctx.arc(x, y, 2.5 / camera.k, 0, Math.PI * 2);
      } else {
        // Small dot for village
        ctx.fillStyle = '#ddd';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 0.2 / camera.k;
        ctx.arc(x, y, 1.5 / camera.k, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    }
  }

  private renderCastles(map: WorldMap, camera: { k: number }) {
    const { ctx } = this;
    for (const castle of map.castles) {
      const x = map.points[castle.cellId * 2];
      const y = map.points[castle.cellId * 2 + 1];
      const size = (castle.type === 'Citadel' ? 5 : castle.type === 'Keep' ? 4 : 3) / camera.k;

      ctx.fillStyle = '#78909c';
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 1 / camera.k;

      ctx.beginPath();
      ctx.rect(x - size, y - size, size * 2, size * 2);
      ctx.fill();
      ctx.stroke();

      // Add a tiny "crown" or notch for castles
      ctx.beginPath();
      ctx.moveTo(x - size, y - size);
      ctx.lineTo(x - size, y - size - 2 / camera.k);
      ctx.lineTo(x - size / 2, y - size - 2 / camera.k);
      ctx.lineTo(x - size / 2, y - size);
      ctx.moveTo(x + size / 2, y - size);
      ctx.lineTo(x + size / 2, y - size - 2 / camera.k);
      ctx.lineTo(x + size, y - size - 2 / camera.k);
      ctx.lineTo(x + size, y - size);
      ctx.stroke();
    }
  }

  private renderMarkers(map: WorldMap, camera: { k: number }) {
    const { ctx } = this;
    for (const marker of map.markers) {
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 4 / camera.k, 0, Math.PI * 2);
      ctx.fillStyle = '#ffeb3b';
      ctx.strokeStyle = '#f57f17';
      ctx.lineWidth = 1 / camera.k;
      ctx.fill();
      ctx.stroke();

      // Draw simplified marker "icon" (just a dot or the emoji if we want to get fancy)
      ctx.font = `${6 / camera.k}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(marker.icon || '?', marker.x, marker.y);
    }
  }

  private renderLabels(map: WorldMap, camera: { k: number }) {
    const { ctx } = this;

    // 1. City Labels (only if zoomed in a bit)
    if (camera.k > 0.5) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2 / camera.k;

      for (const city of map.cities) {
        // Only show village names if zoomed in more
        if (city.type === 'Village' && camera.k < 1.5) continue;

        const x = map.points[city.cellId * 2];
        const y = map.points[city.cellId * 2 + 1];

        const fontSize = city.type === 'Capital' ? 12 : city.type === 'Town' ? 10 : 8;
        ctx.font = `bold ${fontSize / camera.k}px Inter, system-ui, sans-serif`;

        const labelText = city.name.split(' (')[0]; // Strip "(Capital of ...)" for map label
        ctx.strokeText(labelText, x, y + 5 / camera.k);
        ctx.fillText(labelText, x, y + 5 / camera.k);
      }
    }

    // 2. State Labels (Always visible, large)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4 / camera.k;

    for (const state of map.states) {
      if (state.cellCount < 10) continue; // Don't label tiny states

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.lineWidth = 3 / camera.k;

      const fontSize = Math.max(14, Math.sqrt(state.cellCount) * 2);
      ctx.font = `italic bold ${fontSize / camera.k}px "Palatino Linotype", "Book Antiqua", Palatino, serif`;

      ctx.strokeText(state.name.toUpperCase(), state.centerX, state.centerY);
      ctx.fillText(state.name.toUpperCase(), state.centerX, state.centerY);
    }

    // Reset shadow
    ctx.shadowBlur = 0;
  }
}