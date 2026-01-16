import { useState } from 'react';
import { useUIStore } from '../store';
import { Layers, Brush, Settings, Download, Plus, Minus, MapPin, Castle as CastleIcon, Map as MapIcon, List, Edit2, Save, X } from 'lucide-react';
import { MapPersistence } from '../../core/MapPersistence';
import { BIOMES } from '../../core/TerrainGenerator';

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
    zoomIn,
    zoomOut,
    bumpMapVersion,
    map,
    setMap
  } = useUIStore();
  const [activeTab, setActiveTab] = useState('layers');
  const [editingEntity, setEditingEntity] = useState<{ type: 'city' | 'castle' | 'marker', id: number } | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const startEditing = (type: 'city' | 'castle' | 'marker', entity: any) => {
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
    }

    setMap(newMap); // This function comes from useUIStore but acts on the store. We need to check if 'setMap' is available in scope. It is.
    // Note: useUIStore's setMap updates the store state. 
    // If we want persistence, we should probably save it too, although the original code didn't seem to save on every small change, maybe explicit save?
    // The instructions say "change in the map as well", implying immediate visual update.
    // Let's add persistence to be safe, as user might expect it.
    MapPersistence.save(newMap);

    setEditingEntity(null);
    setEditForm({});
    bumpMapVersion(); // Trigger re-render if needed
  };

  console.log('Sidebar render:', { activeTool, activeLayer });

  return (
    <div className="w-80 h-full shrink-0 bg-gray-800 border-l border-gray-700 shadow-xl flex flex-col z-20 pointer-events-auto relative">
      <div className="p-4 border-b border-gray-700 font-bold text-xl flex items-center gap-2">
        <MapIcon className="text-blue-500" />
        LoreKeeper Map
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveTab('layers');
          }}
          className={`flex-1 p-3 hover:bg-gray-700 flex justify-center ${activeTab === 'layers' ? 'bg-gray-600' : ''}`}
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
          className={`flex-1 p-3 hover:bg-gray-700 flex justify-center ${activeTab === 'entities' ? 'bg-gray-600' : ''}`}
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
          className={`flex-1 p-3 hover:bg-gray-700 flex justify-center ${activeTab === 'brush' ? 'bg-gray-600' : ''}`}
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
          className={`flex-1 p-3 hover:bg-gray-700 flex justify-center ${activeTab === 'settings' ? 'bg-gray-600' : ''}`}
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
          className={`flex-1 p-3 hover:bg-gray-700 flex justify-center ${activeTab === 'export' ? 'bg-gray-600' : ''}`}
        >
          <Download size={20} />
        </button>
      </div>

      {/* Tools Section - Always Visible */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Tools</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveTool('select');
            }}
            className={`p-2 rounded border border-gray-600 text-sm flex items-center justify-center gap-2 ${activeTool === 'select' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
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
            className={`p-2 rounded border border-gray-600 text-sm flex items-center justify-center gap-2 ${activeTool === 'height-paint' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
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
            className={`p-2 rounded border border-gray-600 text-sm flex items-center justify-center gap-2 ${activeTool === 'biome-paint' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
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
            className={`p-2 rounded border border-gray-600 text-sm flex items-center justify-center gap-2 ${activeTool === 'city-placer' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
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
            className={`p-2 rounded border border-gray-600 text-sm flex items-center justify-center gap-2 ${activeTool === 'castle-placer' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
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
            className={`p-2 rounded border border-gray-600 text-sm flex items-center justify-center gap-2 ${activeTool === 'marker-placer' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
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
            className="p-2 rounded border border-gray-600 hover:bg-gray-700 flex items-center justify-center gap-2 text-sm"
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
            className="p-2 rounded border border-gray-600 hover:bg-gray-700 flex items-center justify-center gap-2 text-sm"
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
            <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Layers</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLayer('height');
                }}
                className={`w-full text-left px-3 py-2 rounded ${activeLayer === 'height' ? 'bg-blue-600' : 'bg-gray-700'} hover:bg-gray-600`}
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
                className={`w-full text-left px-3 py-2 rounded ${activeLayer === 'political' ? 'bg-blue-600' : 'bg-gray-700'} hover:bg-gray-600`}
              >
                Political
              </button>
            </div>

            {/* States List */}
            {activeLayer === 'political' && map && map.states.length > 0 && (
              <div className="mt-6 border-t border-gray-700 pt-4">
                <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">States ({map.states.length})</h3>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {map.states.map(state => (
                    <div key={state.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-default group">
                      <div
                        className="w-4 h-4 rounded shadow-sm shrink-0 border border-black/20"
                        style={{ backgroundColor: state.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-gray-200">{state.name}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">{state.cellCount} regions</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cities List */}
            {map && map.cities.length > 0 && (
              <div className="mt-6 border-t border-gray-700 pt-4">
                <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Cities & Settlements ({map.cities.length})</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                  {[...map.cities].sort((a, b) => b.population - a.population).map(city => (
                    <div key={city.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-default group">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${city.type === 'Capital' ? 'bg-red-500' : city.type === 'Town' ? 'bg-white' : 'bg-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-gray-200">{city.name.split(' (')[0]}</div>
                        <div className="flex justify-between items-center text-[10px] text-gray-500 uppercase tracking-wider">
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
            <h3 className="text-sm uppercase text-gray-400 font-semibold mb-4">Map Entities</h3>

            {/* Cities Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-white"></div> Cities & Towns
                </h4>
                <span className="text-xs text-gray-500">{map?.cities.length || 0}</span>
              </div>

              <div className="space-y-2">
                {map?.cities.map(city => (
                  <div key={city.id} className="bg-gray-700/50 rounded p-2 border border-gray-700 hover:border-gray-600 transition-colors">
                    {editingEntity?.type === 'city' && editingEntity.id === city.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
                          placeholder="City Name"
                        />
                        <div className="flex gap-2">
                          <select
                            value={editForm.type}
                            onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
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
                            className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
                            placeholder="Pop"
                          />
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={cancelEditing} className="p-1 hover:bg-gray-600 rounded text-gray-400"><X size={14} /></button>
                          <button onClick={saveEntity} className="p-1 bg-blue-600 hover:bg-blue-500 rounded text-white"><Save size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start group">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-200">{city.name}</div>
                          <div className="text-[10px] text-gray-400">{city.type} • Pop: {city.population.toLocaleString()}</div>
                        </div>
                        <button
                          onClick={() => startEditing('city', city)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded text-gray-400"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {(!map?.cities || map.cities.length === 0) && <div className="text-xs text-gray-500 italic">No cities placed yet. Use the City tool.</div>}
              </div>
            </div>

            {/* Castles Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <CastleIcon size={12} /> Castles & Forts
                </h4>
                <span className="text-xs text-gray-500">{map?.castles.length || 0}</span>
              </div>
              <div className="space-y-2">
                {map?.castles.map(castle => (
                  <div key={castle.id} className="bg-gray-700/50 rounded p-2 border border-gray-700 hover:border-gray-600 transition-colors">
                    {editingEntity?.type === 'castle' && editingEntity.id === castle.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
                          placeholder="Castle Name"
                        />
                        <select
                          value={editForm.type}
                          onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
                        >
                          <option value="Keep">Keep</option>
                          <option value="Fort">Fort</option>
                          <option value="Citadel">Citadel</option>
                          <option value="Outpost">Outpost</option>
                        </select>
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={cancelEditing} className="p-1 hover:bg-gray-600 rounded text-gray-400"><X size={14} /></button>
                          <button onClick={saveEntity} className="p-1 bg-blue-600 hover:bg-blue-500 rounded text-white"><Save size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start group">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-200">{castle.name}</div>
                          <div className="text-[10px] text-gray-400">{castle.type}</div>
                        </div>
                        <button
                          onClick={() => startEditing('castle', castle)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded text-gray-400"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {(!map?.castles || map.castles.length === 0) && <div className="text-xs text-gray-500 italic">No castles placed yet. Use the Castle tool.</div>}
              </div>
            </div>

            {/* Markers Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                  <MapPin size={12} /> Markers
                </h4>
                <span className="text-xs text-gray-500">{map?.markers.length || 0}</span>
              </div>
              <div className="space-y-2">
                {map?.markers.map(marker => (
                  <div key={marker.id} className="bg-gray-700/50 rounded p-2 border border-gray-700 hover:border-gray-600 transition-colors">
                    {editingEntity?.type === 'marker' && editingEntity.id === marker.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
                          placeholder="Marker Label"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editForm.icon}
                            onChange={e => setEditForm({ ...editForm, icon: e.target.value })}
                            className="w-10 text-center bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
                            placeholder="Icon"
                            title="Icon emoji"
                          />
                          <input
                            type="text"
                            value={editForm.note}
                            onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                            className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs"
                            placeholder="Note..."
                          />
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={cancelEditing} className="p-1 hover:bg-gray-600 rounded text-gray-400"><X size={14} /></button>
                          <button onClick={saveEntity} className="p-1 bg-blue-600 hover:bg-blue-500 rounded text-white"><Save size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start group">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-200 flex items-center gap-2">
                            <span>{marker.icon}</span> {marker.name}
                          </div>
                          <div className="text-[10px] text-gray-400 truncate">{marker.note}</div>
                        </div>
                        <button
                          onClick={() => startEditing('marker', marker)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-600 rounded text-gray-400"
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {(!map?.markers || map.markers.length === 0) && <div className="text-xs text-gray-500 italic">No markers placed yet. Use the Marker tool.</div>}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'brush' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Brush Settings</h3>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-1">
                  <label className="block text-sm text-gray-300">Size</label>
                  <span className="text-xs text-blue-400">{brushSize}px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="200"
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              {activeTool === 'height-paint' && (
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="block text-sm text-gray-300">Intensity</label>
                    <span className="text-xs text-blue-400">{brushIntensity.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.01"
                    max="0.5"
                    step="0.01"
                    value={brushIntensity}
                    onChange={(e) => setBrushIntensity(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <p className="text-[10px] text-gray-500 mt-1 italic">Tip: Hold Alt to lower land</p>
                </div>
              )}

              {activeTool === 'biome-paint' && (
                <div className="space-y-2">
                  <label className="block text-sm text-gray-300">Target Biome</label>
                  <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {Object.values(BIOMES).map(biome => (
                      <button
                        key={biome.type}
                        onClick={() => setSelectedBiome(biome.type)}
                        className={`flex items-center gap-2 p-1.5 rounded border text-[11px] transition-colors ${selectedBiome === biome.type ? 'bg-blue-600 border-blue-400' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}
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
            <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Map Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Map Seed</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={mapSeed}
                    onChange={(e) => setMapSeed(parseInt(e.target.value))}
                    className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMapSeed(Math.floor(Math.random() * 1000000));
                    }}
                    className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm hover:bg-gray-600"
                    title="Random Seed"
                  >
                    🎲
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Cell Count</label>
                <input
                  type="number"
                  value={pointCount}
                  onChange={(e) => setPointCount(parseInt(e.target.value))}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                />
                <span className="text-xs text-gray-500">Higher values = more detail (slower)</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  MapPersistence.clear();
                  bumpMapVersion();
                }}
                className="w-full px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center justify-center gap-2"
              >
                🗺️ Generate New Map
              </button>
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Export</h3>
            <div className="space-y-2">
              <button
                className="w-full px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-left disabled:opacity-50"
                disabled
              >
                Export as PNG
              </button>
              <button
                className="w-full px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-left disabled:opacity-50"
                disabled
              >
                Export as JSON
              </button>
              <span className="text-xs text-gray-500 block">Export functionality coming soon</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;