import { useState } from 'react';
import { useUIStore } from '../store';
import { Layers, Brush, Settings, Download, Plus, Minus } from 'lucide-react';

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
    mapSeed,
    setMapSeed,
    pointCount,
    setPointCount,
    zoomIn,
    zoomOut
  } = useUIStore();
  const [activeTab, setActiveTab] = useState('layers');

  console.log('Sidebar render:', { activeTool, activeLayer });

  return (
    <div className="w-80 h-full shrink-0 bg-gray-800 border-l border-gray-700 shadow-xl flex flex-col z-20 pointer-events-auto relative">
      <div className="p-4 border-b border-gray-700 font-bold text-xl">
        Fantasy Mapper
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Layers tab clicked');
            setActiveTab('layers');
          }}
          className={`flex-1 p-3 hover:bg-gray-700 flex justify-center ${activeTab === 'layers' ? 'bg-gray-600' : ''}`}
        >
          <Layers size={20} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Brush tab clicked');
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
            console.log('Settings tab clicked');
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
            console.log('Export tab clicked');
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
              console.log('Select tool clicked');
              setActiveTool('select');
            }}
            className={`p-2 rounded border border-gray-600 ${activeTool === 'select' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
          >
            Pan
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Height paint tool clicked');
              setActiveTool('height-paint');
            }}
            className={`p-2 rounded border border-gray-600 ${activeTool === 'height-paint' ? 'bg-blue-600 border-blue-400' : 'hover:bg-gray-700'}`}
          >
            Raise Land
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
            className="p-2 rounded border border-gray-600 hover:bg-gray-700 flex items-center justify-center gap-2"
            title="Zoom In"
          >
            <Plus size={16} /> Zoom In
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              zoomOut();
            }}
            className="p-2 rounded border border-gray-600 hover:bg-gray-700 flex items-center justify-center gap-2"
            title="Zoom Out"
          >
            <Minus size={16} /> Zoom Out
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
                  console.log('Height layer clicked');
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
                  console.log('Political layer clicked');
                  setLayer('political');
                }}
                className={`w-full text-left px-3 py-2 rounded ${activeLayer === 'political' ? 'bg-blue-600' : 'bg-gray-700'} hover:bg-gray-600`}
              >
                Political
              </button>
            </div>
          </div>
        )}

        {activeTab === 'brush' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Brush Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Brush Size</label>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={brushSize}
                  onChange={(e) => setBrushSize(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Brush Intensity</label>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={brushIntensity}
                  onChange={(e) => setBrushIntensity(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mb-6">
            <h3 className="text-sm uppercase text-gray-400 font-semibold mb-2">Map Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">Map Seed</label>
                <input
                  type="number"
                  value={mapSeed}
                  onChange={(e) => setMapSeed(parseInt(e.target.value))}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Cell Count</label>
                <input
                  type="number"
                  value={pointCount}
                  onChange={(e) => setPointCount(parseInt(e.target.value))}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
                />
              </div>
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