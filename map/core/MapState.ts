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
  castles: Castle[];
  markers: Marker[];
  labels: MapLabel[];
  states: State[];  // Political states/kingdoms

  // Meta
  nextId: {
    city: number;
    state: number;
    castle: number;
    marker: number;
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

export interface Castle {
  id: number;
  cellId: number;
  name: string;
  type: 'Keep' | 'Fort' | 'Outpost' | 'Citadel';
}

export interface Marker {
  id: number;
  x: number;
  y: number;
  name: string;
  icon: string; // Emoji or Lucide name
  note: string;
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

export interface State {
  id: number;
  name: string;
  color: string;       // Hex color for map display
  capitalId: number;   // ID of the capital city
  centerX: number;     // Center of the state (for label placement)
  centerY: number;
  cellCount: number;   // Number of cells belonging to this state
}