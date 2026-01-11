import { Delaunay } from 'd3-delaunay';
import { createNoise2D } from 'simplex-noise';
import { WorldMap } from './MapState';

export class MapGenerator {
  static generate(width: number, height: number, seed: number, numCells: number = 10000): WorldMap {
    // 1. Generate Random Points (or Poisson Disc)
    const points = new Float64Array(numCells * 2);
    for (let i = 0; i < numCells * 2; i++) {
      points[i] = Math.random() * (i % 2 === 0 ? width : height);
    }

    // 2. Build Voronoi Mesh
    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    // 3. Generate Heightmap
    const noise2D = createNoise2D(() => Math.random()); // Use seed in real imp
    const heights = new Float32Array(numCells);
    const biomes = new Uint8Array(numCells);
    const states = new Uint16Array(numCells);
    const cultures = new Uint16Array(numCells);
    const pop = new Float32Array(numCells);

    for (let i = 0; i < numCells; i++) {
      const x = points[i * 2];
      const y = points[i * 2 + 1];
      
      // Simple island mask + noise
      const nx = x / width - 0.5;
      const ny = y / height - 0.5;
      const dist = Math.sqrt(nx * nx + ny * ny);
      const baseHeight = noise2D(x / 500, y / 500) * 0.5 + 0.5;
      
      heights[i] = Math.max(0, baseHeight - dist * 1.5); // Island shape
      biomes[i] = heights[i] < 0.2 ? 0 : heights[i] > 0.8 ? 5 : 2; // Simple biome mapping
    }

    return {
      seed,
      width,
      height,
      points,
      delaunay,
      voronoi,
      cells: { heights, biomes, states, cultures, pop },
      rivers: [],
      roads: [],
      cities: [],
      labels: [],
      nextId: { city: 1, state: 1 }
    };
  }
}