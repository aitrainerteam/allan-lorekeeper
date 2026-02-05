import { create } from 'zustand';
import { ToolType } from '../tools/ToolManager';
import { WorldMap } from '../core/MapState';
import { SerializedMap, MapPersistence } from '../core/MapPersistence';

const MAX_HISTORY_SIZE = 20;
const AUTOSAVE_EDIT_THRESHOLD = 5;
const AUTOSAVE_DEBOUNCE_MS = 30000; // 30 seconds minimum between autosaves

interface UIState {
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;
  activeLayer: 'height' | 'political';
  setLayer: (l: 'height' | 'political') => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;

  // Map state
  map: WorldMap | null;
  setMap: (map: WorldMap) => void;

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
  selectedBiome: number;
  setSelectedBiome: (biome: number) => void;

  // Map settings
  mapSeed: number;
  setMapSeed: (seed: number) => void;
  pointCount: number;
  setPointCount: (count: number) => void;

  // City display settings
  showCapitalStars: boolean;
  setShowCapitalStars: (show: boolean) => void;

  // Triggers for map updates
  mapVersion: number;
  bumpMapVersion: () => void;

  // Undo/Redo history
  history: SerializedMap[];
  historyIndex: number;
  pushHistory: (map: WorldMap) => void;
  undo: () => WorldMap | null;
  redo: () => WorldMap | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;

  // Autosave tracking
  editCount: number;
  incrementEditCount: () => void;
  resetEditCount: () => void;
  lastSaveTime: number;
  setLastSaveTime: (time: number) => void;
  shouldAutosave: () => boolean;

  // Load modal state
  isLoadModalOpen: boolean;
  setLoadModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
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

  map: null,
  setMap: (map) => set({ map }),

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
  selectedBiome: 2, // Default to Grassland
  setSelectedBiome: (biome) => set({ selectedBiome: biome }),

  mapSeed: 12345,
  setMapSeed: (seed) => set({ mapSeed: seed }),
  pointCount: 10000,
  setPointCount: (count) => set({ pointCount: count }),

  showCapitalStars: false,
  setShowCapitalStars: (show) => set({ showCapitalStars: show }),

  mapVersion: 0,
  bumpMapVersion: () => set((state) => ({ mapVersion: state.mapVersion + 1 })),

  // Undo/Redo history
  history: [],
  historyIndex: -1,
  
  pushHistory: (map: WorldMap) => {
    const state = get();
    const serialized = MapPersistence.serialize(map);
    
    // If we're not at the end of history, truncate future states
    let newHistory = state.history.slice(0, state.historyIndex + 1);
    
    // Add new state
    newHistory.push(serialized);
    
    // Limit history size
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory = newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
    }
    
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1
    });
  },
  
  undo: () => {
    const state = get();
    if (state.historyIndex <= 0) return null;
    
    const newIndex = state.historyIndex - 1;
    const serialized = state.history[newIndex];
    const map = MapPersistence.deserialize(serialized);
    
    set({ historyIndex: newIndex, map });
    return map;
  },
  
  redo: () => {
    const state = get();
    if (state.historyIndex >= state.history.length - 1) return null;
    
    const newIndex = state.historyIndex + 1;
    const serialized = state.history[newIndex];
    const map = MapPersistence.deserialize(serialized);
    
    set({ historyIndex: newIndex, map });
    return map;
  },
  
  canUndo: () => {
    const state = get();
    return state.historyIndex > 0;
  },
  
  canRedo: () => {
    const state = get();
    return state.historyIndex < state.history.length - 1;
  },
  
  clearHistory: () => {
    set({ history: [], historyIndex: -1 });
  },

  // Autosave tracking
  editCount: 0,
  incrementEditCount: () => set((state) => ({ editCount: state.editCount + 1 })),
  resetEditCount: () => set({ editCount: 0 }),
  lastSaveTime: 0,
  setLastSaveTime: (time: number) => set({ lastSaveTime: time }),
  
  shouldAutosave: () => {
    const state = get();
    const now = Date.now();
    const timeSinceLastSave = now - state.lastSaveTime;
    return state.editCount >= AUTOSAVE_EDIT_THRESHOLD && timeSinceLastSave >= AUTOSAVE_DEBOUNCE_MS;
  },

  // Load modal state
  isLoadModalOpen: false,
  setLoadModalOpen: (open: boolean) => set({ isLoadModalOpen: open }),
}));