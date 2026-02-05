import { useState, useCallback } from 'react';
import { useUIStore } from '../store';
import { Layers, Brush, Settings, Download, Plus, Minus, MapPin, Castle as CastleIcon, Map as MapIcon, List, Edit2, Save, X, Undo2, Redo2, FolderOpen } from 'lucide-react';
import { MapPersistence } from '../../core/MapPersistence';
import { BIOMES } from '../../core/TerrainGenerator';
import LoadMapModal from './LoadMapModal';

const Sidebar = () => {
  const {
    activeLayer,
    setLayer,
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    brushIntensity,
    setBrushIntensity,
    selectedBiome,
    setSelectedBiome,
    mapSeed,
    setMapSeed,
    pointCount,
    setPointCount,
    showCapitalStars,
    setShowCapitalStars,
    zoomIn,
    zoomOut,
    bumpMapVersion,
    map,
    setMap,
    // Undo/Redo
    undo,
    redo,
    canUndo,
    canRedo,
    pushHistory,
    clearHistory,
    // Autosave
    resetEditCount,
    setLastSaveTime,
    // Load modal
    isLoadModalOpen,
    setLoadModalOpen
  } = useUIStore();
  const [activeTab, setActiveTab] = useState('layers');
  const [editingEntity, setEditingEntity] = useState<{ type: 'city' | 'castle' | 'marker' | 'state', id: number } | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // Get canvas thumbnail for saves (sized for sharp preview in Load Map modal)
  const getCanvasThumbnail = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return '';

    const targetLongSide = 480; // Match modal preview size so thumbnails aren't upscaled
    const w = canvas.width;
    const h = canvas.height;
    const scale = Math.min(1, targetLongSide / Math.max(w, h));
    const thumbW = Math.round(w * scale);
    const thumbH = Math.round(h * scale);

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, w, h, 0, 0, thumbW, thumbH);
    return thumbCanvas.toDataURL('image/png');
  }, []);

  // Manual save handler
  const handleManualSave = useCallback(() => {
    if (!map) return;
    
    const thumbnail = getCanvasThumbnail();
    MapPersistence.saveVersion(map, 'manual', thumbnail);
    resetEditCount();
    setLastSaveTime(Date.now());
  }, [map, getCanvasThumbnail, resetEditCount, setLastSaveTime]);

  // Load map by ID
  const handleLoadMap = useCallback((id: string) => {
    const loadedMap = MapPersistence.loadVersion(id);
    if (loadedMap) {
      setMap(loadedMap);
      clearHistory();
      pushHistory(loadedMap);
      setLoadModalOpen(false);
    }
  }, [setMap, clearHistory, pushHistory, setLoadModalOpen]);

  // Generate new map
  const handleGenerateNew = useCallback(() => {
    MapPersistence.clear();
    clearHistory();
    bumpMapVersion();
    setLoadModalOpen(false);
  }, [clearHistory, bumpMapVersion, setLoadModalOpen]);

  // Undo handler
  const handleUndo = useCallback(() => {
    const undoneMap = undo();
    if (undoneMap) {
      MapPersistence.save(undoneMap);
    }
  }, [undo]);

  // Redo handler
  const handleRedo = useCallback(() => {
    const redoneMap = redo();
    if (redoneMap) {
      MapPersistence.save(redoneMap);
    }
  }, [redo]);

  // Export as PNG
  const exportAsPNG = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas || !map) return;
    
    const link = document.createElement('a');
    link.download = `map-${map.seed}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [map]);

  // Export as JSON
  const exportAsJSON = useCallback(() => {
    if (!map) return;
    
    const serialized = MapPersistence.serialize(map);
    const blob = new Blob([JSON.stringify(serialized, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `map-${map.seed}-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, [map]);

  // Import from JSON
  const importFromJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          const loadedMap = MapPersistence.deserialize(json);
          setMap(loadedMap);
          MapPersistence.save(loadedMap);
          clearHistory();
          pushHistory(loadedMap);
        } catch (err) {
          console.error('Failed to import map:', err);
          alert('Failed to import map. Please check the file format.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setMap, clearHistory, pushHistory]);

  const startEditing = (type: 'city' | 'castle' | 'marker' | 'state', entity: any) => {
    setEditingEntity({ type, id: entity.id });
    setEditForm({ ...entity });
  };

  const cancelEditing = () => {
    setEditingEntity(null);
    setEditForm({});
  };

  const saveEntity = () => {
    if (!map || !editingEntity) return;

    const newMap = { ...map };

    if (editingEntity.type === 'city') {
      newMap.cities = map.cities.map(c => c.id === editingEntity.id ? { ...c, ...editForm } : c);
    } else if (editingEntity.type === 'castle') {
      newMap.castles = map.castles.map(c => c.id === editingEntity.id ? { ...c, ...editForm } : c);
    } else if (editingEntity.type === 'marker') {
      newMap.markers = map.markers.map(m => m.id === editingEntity.id ? { ...m, ...editForm } : m);
    } else if (editingEntity.type === 'state') {
      // Update state and also update city names that reference it
      const oldState = map.states.find(s => s.id === editingEntity.id);
      newMap.states = map.states.map(s => s.id === editingEntity.id ? { ...s, ...editForm } : s);
      
      // Update city names that reference this state
      if (oldState && editForm.name !== oldState.name) {
        newMap.cities = map.cities.map(city => {
          if (city.name.includes(`(Capital of ${oldState.name})`)) {
            return { ...city, name: city.name.replace(`(Capital of ${oldState.name})`, `(Capital of ${editForm.name})`) };
          }
          return city;
        });
      }
    }

    setMap(newMap);
    MapPersistence.save(newMap);

    setEditingEntity(null);
    setEditForm({});
    bumpMapVersion(); // Trigger re-render if needed
  };

  const deleteEntity = (type: 'city' | 'castle' | 'marker' | 'state', id: number) => {
    if (!map) return;

    const newMap = { ...map };

    if (type === 'city') {
      newMap.cities = map.cities.filter(c => c.id !== id);
    } else if (type === 'castle') {
      newMap.castles = map.castles.filter(c => c.id !== id);
    } else if (type === 'marker') {
      newMap.markers = map.markers.filter(m => m.id !== id);
    } else if (type === 'state') {
      // Remove state and unclaim all its cells
      const stateId = id;
      for (let i = 0; i < map.cells.states.length; i++) {
        if (map.cells.states[i] === stateId) {
          newMap.cells.states[i] = 0; // Unclaimed
        }
      }
      // Remove cities that are capitals of this state
      const state = map.states.find(s => s.id === stateId);
      if (state) {
        newMap.cities = map.cities.filter(city => !city.name.includes(`(Capital of ${state.name})`));
      }
      // Remove the state itself
      newMap.states = map.states.filter(s => s.id !== id);
    }

    setMap(newMap);
    MapPersistence.save(newMap);
    bumpMapVersion();
  };

  console.log('Sidebar render:', { activeTool, activeLayer });

  return (
    <div className="w-80 h-full shrink-0 bg-slate-900 border-l border-slate-800 shadow-xl flex flex-col z-20 pointer-events-auto relative">
      <div className="p-4 border-b border-slate-800 font-bold text-xl flex items-center gap-2">
        <MapIcon className="text-indigo-500" />
        LoreKeeper Map
      </div>

      {/* Save/Load/Undo/Redo Actions */}
      <div className="p-3 border-b border-slate-800">
        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleManualSave();
            }}
            className="p-2 rounded border border-slate-700 text-sm flex flex-col items-center justify-center gap-1 hover:bg-slate-800 hover:border-indigo-400"
            title="Save Map"
          >
            <Save size={16} />
            <span className="text-xs">Save</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLoadModalOpen(true);
            }}
            className="p-2 rounded border border-slate-700 text-sm flex flex-col items-center justify-center gap-1 hover:bg-slate-800 hover:border-indigo-400"
            title="Load Map"
          >
            <FolderOpen size={16} />
            <span className="text-xs">Load</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleUndo();
            }}
            disabled={!canUndo()}
            className={`p-2 rounded border border-slate-700 text-sm flex flex-col items-center justify-center gap-1 ${
              canUndo() ? 'hover:bg-slate-800 hover:border-indigo-400' : 'opacity-40 cursor-not-allowed'
            }`}
            title="Undo"
          >
            <Undo2 size={16} />
            <span className="text-xs">Undo</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleRedo();
            }}
            disabled={!canRedo()}
            className={`p-2 rounded border border-slate-700 text-sm flex flex-col items-center justify-center gap-1 ${
              canRedo() ? 'hover:bg-slate-800 hover:border-indigo-400' : 'opacity-40 cursor-not-allowed'
            }`}
            title="Redo"
          >
            <Redo2 size={16} />
            <span className="text-xs">Redo</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('layers');
          }}
          className={`flex-1 p-3 hover:bg-slate-800 flex justify-center ${activeTab === 'layers' ? 'bg-slate-700' : ''}`}
          title="Layers"
        >
          <Layers size={20} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('entities');
          }}
          className={`flex-1 p-3 hover:bg-slate-800 flex justify-center ${activeTab === 'entities' ? 'bg-slate-700' : ''}`}
          title="Entities List"
        >
          <List size={20} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('brush');
          }}
          className={`flex-1 p-3 hover:bg-slate-800 flex justify-center ${activeTab === 'brush' ? 'bg-slate-700' : ''}`}
        >
          <Brush size={20} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('settings');
          }}
          className={`flex-1 p-3 hover:bg-slate-800 flex justify-center ${activeTab === 'settings' ? 'bg-slate-700' : ''}`}
        >
          <Settings size={20} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('export');
          }}
          className={`flex-1 p-3 hover:bg-slate-800 flex justify-center ${activeTab === 'export' ? 'bg-slate-700' : ''}`}
        >
          <Download size={20} />
        </button>
      </div>

      {/* Tools Section - Always Visible */}
      <div className="p-4 border-b border-slate-800">
        <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2">Tools</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTool('select');
            }}
            className={`p-2 rounded border border-slate-700 text-sm flex items-center justify-center gap-2 ${activeTool === 'select' ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-800'}`}
          >
            Pan
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTool('height-paint');
            }}
            className={`p-2 rounded border border-slate-700 text-sm flex items-center justify-center gap-2 ${activeTool === 'height-paint' ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-800'}`}
            title="Left Click: Raise, Alt+Click: Lower"
          >
            Height
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTool('biome-paint');
            }}
            className={`p-2 rounded border border-slate-700 text-sm flex items-center justify-center gap-2 ${activeTool === 'biome-paint' ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-800'}`}
          >
            Biome
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTool('city-placer');
            }}
            className={`p-2 rounded border border-slate-700 text-sm flex items-center justify-center gap-2 ${activeTool === 'city-placer' ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-800'}`}
          >
            City
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTool('castle-placer');
            }}
            className={`p-2 rounded border border-slate-700 text-sm flex items-center justify-center gap-2 ${activeTool === 'castle-placer' ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-800'}`}
          >
            <CastleIcon size={14} /> Castle
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTool('marker-placer');
            }}
            className={`p-2 rounded border border-slate-700 text-sm flex items-center justify-center gap-2 ${activeTool === 'marker-placer' ? 'bg-indigo-600 border-indigo-400' : 'hover:bg-slate-800'}`}
          >
            <MapPin size={14} /> Marker
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              zoomIn();
            }}
            className="p-2 rounded border border-slate-700 hover:bg-slate-800 flex items-center justify-center gap-2 text-sm"
            title="Zoom In"
          >
            <Plus size={14} /> Zoom In
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              zoomOut();
            }}
            className="p-2 rounded border border-slate-700 hover:bg-slate-800 flex items-center justify-center gap-2 text-sm"
            title="Zoom Out"
          >
            <Minus size={14} /> Zoom Out
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 flex-1 overflow-y-auto">
        {activeTab === 'layers' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2">Layers</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLayer('height');
                }}
                className={`w-full text-left px-3 py-2 rounded ${activeLayer === 'height' ? 'bg-indigo-600' : 'bg-slate-800'} hover:bg-slate-700`}
              >
                Heightmap
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLayer('political');
                }}
                className={`w-full text-left px-3 py-2 rounded ${activeLayer === 'political' ? 'bg-indigo-600' : 'bg-slate-800'} hover:bg-slate-700`}
              >
                Political
              </button>
            </div>

            {/* States List */}
            {activeLayer === 'political' && map && map.states.length > 0 && (
              <div className="mt-6 border-t border-slate-800 pt-4">
                <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2">States ({map.states.length})</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {map.states.map(state => (
                    <div key={state.id} className="p-2 rounded hover:bg-slate-800 cursor-default group">
                      {editingEntity?.type === 'state' && editingEntity.id === state.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                            placeholder="State Name"
                            autoFocus
                          />
                          <div className="flex gap-2 items-center">
                            <label className="text-[10px] text-slate-400">Color:</label>
                            <input
                              type="color"
                              value={editForm.color}
                              onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                              className="w-10 h-6 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                            />
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <button onClick={cancelEditing} className="p-1 hover:bg-slate-700 rounded text-slate-400"><X size={14} /></button>
                            <button onClick={saveEntity} className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"><Save size={14} /></button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded shadow-sm shrink-0 border border-black/20"
                            style={{ backgroundColor: state.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate text-slate-200">{state.name}</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{state.cellCount} regions</div>
                          </div>
                          <button
                            onClick={() => startEditing('state', state)}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 shrink-0"
                            title="Edit State"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cities List */}
            {map && map.cities.length > 0 && (
              <div className="mt-6 border-t border-slate-800 pt-4">
                <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2">Cities & Settlements ({map.cities.length})</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {[...map.cities].sort((a, b) => b.population - a.population).map(city => (
                    <div key={city.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-800 cursor-default group">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${city.type === 'Capital' ? 'bg-red-500' : city.type === 'Town' ? 'bg-white' : 'bg-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-slate-200">{city.name.split(' (')[0]}</div>
                        <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider">
                          <span>{city.type}</span>
                          <span>{city.population.toLocaleString()} pop</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'entities' && (
          <div className="mb-6 pb-20">
            <h3 className="text-sm uppercase text-slate-400 font-semibold mb-4">Map Entities</h3>

            {/* Cities Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white"></div> Cities & Towns
                </h4>
                <span className="text-xs text-slate-500">{map?.cities.length || 0}</span>
              </div>

              <div className="space-y-2">
                {map?.cities.map(city => (
                  <div key={city.id} className="bg-slate-800/50 rounded p-2 border border-slate-800 hover:border-slate-700 transition-colors">
                    {editingEntity?.type === 'city' && editingEntity.id === city.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                          placeholder="City Name"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editForm.type}
                            onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                          >
                            <option value="Town">Town</option>
                            <option value="City">City</option>
                            <option value="Capital">Capital</option>
                            <option value="Village">Village</option>
                          </select>
                          <input
                            type="number"
                            value={editForm.population}
                            onChange={e => setEditForm({ ...editForm, population: parseInt(e.target.value) })}
                            className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                            placeholder="Pop"
                          />
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={cancelEditing} className="p-1 hover:bg-slate-700 rounded text-slate-400"><X size={14} /></button>
                          <button onClick={saveEntity} className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"><Save size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start group">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-200">{city.name}</div>
                          <div className="text-[10px] text-slate-400">{city.type} • Pop: {city.population.toLocaleString()}</div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => startEditing('city', city)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400"
                            title="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => deleteEntity('city', city.id)}
                            className="p-1 hover:bg-red-600/20 rounded text-red-400"
                            title="Delete"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(!map?.cities || map.cities.length === 0) && <div className="text-xs text-slate-500 italic">No cities placed yet. Use the City tool.</div>}
              </div>
            </div>

            {/* Castles Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <CastleIcon size={12} /> Castles & Forts
                </h4>
                <span className="text-xs text-slate-500">{map?.castles.length || 0}</span>
              </div>
              <div className="space-y-2">
                {map?.castles.map(castle => (
                  <div key={castle.id} className="bg-slate-800/50 rounded p-2 border border-slate-800 hover:border-slate-700 transition-colors">
                    {editingEntity?.type === 'castle' && editingEntity.id === castle.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                          placeholder="Castle Name"
                        />
                        <select
                          value={editForm.type}
                          onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                        >
                          <option value="Keep">Keep</option>
                          <option value="Fort">Fort</option>
                          <option value="Citadel">Citadel</option>
                          <option value="Outpost">Outpost</option>
                        </select>
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={cancelEditing} className="p-1 hover:bg-slate-700 rounded text-slate-400"><X size={14} /></button>
                          <button onClick={saveEntity} className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"><Save size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start group">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-200">{castle.name}</div>
                          <div className="text-[10px] text-slate-400">{castle.type}</div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => startEditing('castle', castle)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400"
                            title="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => deleteEntity('castle', castle.id)}
                            className="p-1 hover:bg-red-600/20 rounded text-red-400"
                            title="Delete"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(!map?.castles || map.castles.length === 0) && <div className="text-xs text-slate-500 italic">No castles placed yet. Use the Castle tool.</div>}
              </div>
            </div>

            {/* Markers Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <MapPin size={12} /> Markers
                </h4>
                <span className="text-xs text-slate-500">{map?.markers.length || 0}</span>
              </div>
              <div className="space-y-2">
                {map?.markers.map(marker => (
                  <div key={marker.id} className="bg-slate-800/50 rounded p-2 border border-slate-800 hover:border-slate-700 transition-colors">
                    {editingEntity?.type === 'marker' && editingEntity.id === marker.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                          placeholder="Marker Label"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editForm.icon}
                            onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
                            className="w-10 text-center bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                            placeholder="Icon"
                            title="Icon emoji"
                          />
                          <input
                            type="text"
                            value={editForm.note}
                            onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                            placeholder="Note..."
                          />
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={cancelEditing} className="p-1 hover:bg-slate-700 rounded text-slate-400"><X size={14} /></button>
                          <button onClick={saveEntity} className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"><Save size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start group">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-200 flex items-center gap-2">
                            <span>{marker.icon}</span> {marker.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{marker.note}</div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => startEditing('marker', marker)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400"
                            title="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => deleteEntity('marker', marker.id)}
                            className="p-1 hover:bg-red-600/20 rounded text-red-400"
                            title="Delete"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(!map?.markers || map.markers.length === 0) && <div className="text-xs text-slate-500 italic">No markers placed yet. Use the Marker tool.</div>}
              </div>
            </div>

            {/* States Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <MapIcon size={12} /> Regions & States
                </h4>
                <span className="text-xs text-slate-500">{map?.states.length || 0}</span>
              </div>
              <div className="space-y-2">
                {map?.states.map(state => (
                  <div key={state.id} className="bg-slate-800/50 rounded p-2 border border-slate-800 hover:border-slate-700 transition-colors">
                    {editingEntity?.type === 'state' && editingEntity.id === state.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
                          placeholder="State Name"
                        />
                        <div className="flex gap-2 items-center">
                          <label className="text-[10px] text-slate-400">Color:</label>
                          <input
                            type="color"
                            value={editForm.color}
                            onChange={e => setEditForm({ ...editForm, color: e.target.value })}
                            className="w-12 h-6 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                          />
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <div className="text-[10px] text-slate-400">{state.cellCount} regions</div>
                          <div className="flex gap-2">
                            <button onClick={cancelEditing} className="p-1 hover:bg-slate-700 rounded text-slate-400"><X size={14} /></button>
                            <button onClick={saveEntity} className="p-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white"><Save size={14} /></button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start group">
                        <div className="flex-1 flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded shadow-sm shrink-0 border border-black/20"
                            style={{ backgroundColor: state.color }}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-200">{state.name}</div>
                            <div className="text-[10px] text-slate-400">{state.cellCount} regions</div>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => startEditing('state', state)}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400"
                            title="Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => deleteEntity('state', state.id)}
                            className="p-1 hover:bg-red-600/20 rounded text-red-400"
                            title="Delete"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {(!map?.states || map.states.length === 0) && <div className="text-xs text-slate-500 italic">No states generated yet.</div>}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'brush' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2">Brush Settings</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="block text-sm text-slate-300">Size</label>
                  <span className="text-xs text-indigo-400">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="200"
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              {activeTool === 'height-paint' && (
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="block text-sm text-slate-300">Intensity</label>
                    <span className="text-xs text-indigo-400">{brushIntensity.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.5"
                    step="0.01"
                    value={brushIntensity}
                    onChange={(e) => setBrushIntensity(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1 italic">Tip: Hold Alt to lower land</p>
                </div>
              )}

              {activeTool === 'biome-paint' && (
                <div className="space-y-2">
                  <label className="block text-sm text-slate-300">Target Biome</label>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.values(BIOMES).map(biome => (
                      <button
                        key={biome.type}
                        onClick={() => setSelectedBiome(biome.type)}
                        className={`flex items-center gap-2 p-1.5 rounded border text-[11px] transition-colors ${selectedBiome === biome.type ? 'bg-indigo-600 border-indigo-400' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'}`}
                      >
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: biome.color }} />
                        <span className="truncate">{biome.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2">Map Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Map Seed</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={mapSeed}
                    onChange={(e) => setMapSeed(parseInt(e.target.value))}
                    className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMapSeed(Math.floor(Math.random() * 1000000));
                    }}
                    className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm hover:bg-slate-700"
                    title="Random Seed"
                  >
                    🎲
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Cell Count</label>
                <input
                  type="number"
                  value={pointCount}
                  onChange={(e) => setPointCount(parseInt(e.target.value))}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm"
                />
                <span className="text-xs text-slate-500">Higher values = more detail (slower)</span>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-slate-300">Capital Stars</label>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCapitalStars(!showCapitalStars);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showCapitalStars ? 'bg-indigo-600' : 'bg-slate-700'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showCapitalStars ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  MapPersistence.clear();
                  bumpMapVersion();
                }}
                className="w-full px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-2"
              >
                🗺️ Generate New Map
              </button>
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2">Export</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  exportAsPNG();
                }}
                disabled={!map}
                className="w-full px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-left disabled:opacity-50 flex items-center gap-2"
              >
                <Download size={16} />
                Export as PNG
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  exportAsJSON();
                }}
                disabled={!map}
                className="w-full px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-left disabled:opacity-50 flex items-center gap-2"
              >
                <Download size={16} />
                Export as JSON
              </button>
              <span className="text-xs text-slate-500 block mt-2">JSON files can be imported later</span>
            </div>

            <h3 className="text-sm uppercase text-slate-400 font-semibold mb-2 mt-6">Import</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  importFromJSON();
                }}
                className="w-full px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-left flex items-center gap-2"
              >
                <FolderOpen size={16} />
                Import from JSON
              </button>
              <span className="text-xs text-slate-500 block">Load a previously exported map file</span>
            </div>
          </div>
        )}
      </div>

      {/* Load Map Modal */}
      {isLoadModalOpen && (
        <LoadMapModal
          onClose={() => setLoadModalOpen(false)}
          onLoad={handleLoadMap}
          onGenerateNew={handleGenerateNew}
        />
      )}
    </div>
  );
};

export default Sidebar;