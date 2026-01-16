import { Delaunay } from 'd3-delaunay';
import { createNoise2D } from 'simplex-noise';
import { WorldMap } from './MapState';
import { createSeededRandom } from './SeededRandom';
import { StateGenerator } from './StateGenerator';
import { CityGenerator } from './CityGenerator';
import { TerrainGenerator } from './TerrainGenerator';
import { RiverGenerator } from './RiverGenerator';
import { RoadGenerator } from './RoadGenerator';

export class MapGenerator {
  static generate(width: number, height: number, seed: number, numCells: number = 10000): WorldMap {
    // Create seeded PRNG for reproducible generation
    const prng = createSeededRandom(seed);

    // 1. Generate Random Points using seeded PRNG
    const points = new Float64Array(numCells * 2);
    for (let i = 0; i < numCells; i++) {
      points[i * 2] = prng() * width;
      points[i * 2 + 1] = prng() * height;
    }

    // 2. Build Voronoi Mesh
    const delaunay = new Delaunay(points);
    const voronoi = delaunay.voronoi([0, 0, width, height]);

    // 3. Generate Heightmap using seeded noise
    const noise2D = createNoise2D(prng);
    const heights = new Float32Array(numCells);
    const biomes = new Uint8Array(numCells);
    const cellStates = new Uint16Array(numCells);
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
    }

    const map: WorldMap = {
      seed,
      width,
      height,
      points,
      delaunay,
      voronoi,
      cells: { heights, biomes, states: cellStates, cultures, pop },
      rivers: [],
      roads: [],
      cities: [],
      castles: [],
      markers: [],
      labels: [],
      states: [],
      nextId: { city: 1, state: 1, castle: 1, marker: 1 }
    };

    // 4. Refine Terrain and Biomes
    TerrainGenerator.generateBiomes(map, seed);

    // 5. Generate Rivers
    const rivers = RiverGenerator.generate(map, seed);
    map.rivers = rivers;

    // 6. Generate Political States
    const states = StateGenerator.generate(map, 5, seed);
    map.states = states;
    map.nextId.state = states.length + 1;

    // 7. Generate Cities
    const cities = CityGenerator.generate(map, seed);
    map.cities = cities;
    map.nextId.city = cities.length + 1;

    // 8. Generate Roads
    const roads = RoadGenerator.generate(map, cities);
    map.roads = roads;

    return map;
  }
}