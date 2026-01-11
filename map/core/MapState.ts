import { Delaunay, Voronoi } from 'd3-delaunay';

export interface Point {
  x: number;
  y: number;
}

export type BiomeId = number;

// The core data model, decoupled from React
export interface WorldMap {
  seed: number;
  width: number;
  height: number;
  
  // Mesh (Voronoi)
  points: Float64Array; // [x0, y0, x1, y1, ...]
  delaunay: Delaunay<number>;
  voronoi: Voronoi<number>;
  
  // Data Layers (SoA - Structure of Arrays for performance)
  cells: {
    heights: Float32Array; // 0.0 to 1.0
    biomes: Uint8Array;    // BiomeId
    states: Uint16Array;   // State ID
    cultures: Uint16Array; // Culture ID
    pop: Float32Array;     // Population density
  };

  // Vector Features
  rivers: River[];
  roads: Road[];
  cities: City[];
  labels: MapLabel[];
  
  // Meta
  nextId: {
    city: number;
    state: number;
  };
}

export interface River {
  id: string;
  points: Point[]; // Sequence of vertices
  width: number;
}

export interface Road {
  id: string;
  points: Point[];
  type: 'dirt' | 'paved' | 'trade';
}

export interface City {
  id: number;
  cellId: number;
  name: string;
  population: number;
  type: 'Capital' | 'Town' | 'Village';
}

export interface MapLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  type: 'region' | 'city' | 'ocean';
}