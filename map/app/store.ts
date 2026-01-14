import { create } from 'zustand';
import { ToolType } from '../tools/ToolManager';

interface UIState {
  activeTool: ToolType;
  setActiveTool: (t: ToolType) => void;
  activeLayer: 'height' | 'political';
  setLayer: (l: 'height' | 'political') => void;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
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
  mapVersion: 0,
  bumpMapVersion: () => set((state) => ({ mapVersion: state.mapVersion + 1 })),
}));