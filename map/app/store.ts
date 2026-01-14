import { create } from 'zustand';
import { ToolType } from '../tools/ToolManager';

interface UIState {
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;
  activeLayer: 'height' | 'political';
  setLayer: (l: 'height' | 'political') => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  // Camera state
  camera: { k: number, x: number, y: number };
  setCamera: (camera: { k: number, x: number, y: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;

  // Brush settings
  brushSize: number;
  setBrushSize: (size: number) => void;
  brushIntensity: number;
  setBrushIntensity: (intensity: number) => void;

  // Map settings
  mapSeed: number;
  setMapSeed: (seed: number) => void;
  pointCount: number;
  setPointCount: (count: number) => void;

  // Triggers for map updates
  mapVersion: number;
  bumpMapVersion: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTool: 'select',
  setActiveTool: (t) => {
    console.log('setActiveTool called with:', t);
    set({ activeTool: t });
  },
  activeLayer: 'height',
  setLayer: (l) => {
    console.log('setLayer called with:', l);
    set({ activeLayer: l });
  },
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  camera: { k: 1, x: 0, y: 0 },
  setCamera: (camera) => set({ camera }),
  zoomIn: () => set((state) => {
    const newK = Math.min(10, state.camera.k * 1.2);
    return { camera: { ...state.camera, k: newK } };
  }),
  zoomOut: () => set((state) => {
    const newK = Math.max(0.1, state.camera.k / 1.2);
    return { camera: { ...state.camera, k: newK } };
  }),

  brushSize: 50,
  setBrushSize: (size) => set({ brushSize: size }),
  brushIntensity: 0.1,
  setBrushIntensity: (intensity) => set({ brushIntensity: intensity }),

  mapSeed: 12345,
  setMapSeed: (seed) => set({ mapSeed: seed }),
  pointCount: 10000,
  setPointCount: (count) => set({ pointCount: count }),

  mapVersion: 0,
  bumpMapVersion: () => set((state) => ({ mapVersion: state.mapVersion + 1 })),
}));