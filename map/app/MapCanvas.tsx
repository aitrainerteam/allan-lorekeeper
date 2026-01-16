import { useRef, useEffect, useState, useCallback } from 'react';
import { Point } from '../core/MapState';
import { MapGenerator } from '../core/MapGenerator';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { ToolManager } from '../tools/ToolManager';
import { useUIStore } from './store';
import { MapPersistence } from '../core/MapPersistence';

const MapCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<CanvasRenderer | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { map, setMap, activeLayer, activeTool, mapVersion, mapSeed, pointCount, camera, setCamera } = useUIStore();
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [hoverElement, setHoverElement] = useState<{ type: 'city' | 'castle' | 'marker' | 'state', data: any } | null>(null);
  const [editingElement, setEditingElement] = useState<{ type: 'city' | 'castle' | 'marker' | 'state', data: any } | null>(null);

  // Initialize canvas dimensions and renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set initial canvas size
    canvas.width = container.clientWidth || 800;
    canvas.height = container.clientHeight || 600;

    // Create renderer
    const canvasRenderer = new CanvasRenderer(canvas);
    setRenderer(canvasRenderer);
    setIsInitialized(true);

    const handleResize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Only run once on mount

  // Load from persistence OR Generate fresh map
  useEffect(() => {
    if (!isInitialized) return;

    // 1. Try to load from persistence
    const savedMap = MapPersistence.load();
    if (savedMap) {
      setMap(savedMap);
      return;
    }

    // 2. Otherwise generate fresh
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.width || 800;
    const height = canvas.height || 600;

    console.log('Generating map with seed:', mapSeed, 'cells:', pointCount, 'size:', width, 'x', height);
    const newMap = MapGenerator.generate(width, height, mapSeed, pointCount);
    setMap(newMap);
    MapPersistence.save(newMap); // Initial save
  }, [isInitialized, mapVersion, mapSeed, pointCount, setMap]);

  // Auto-save map when it changes (debounced would be better but simple for now)
  useEffect(() => {
    if (map) {
      // MapPersistence.save(map); // Optional: add auto-save here if performance allows
    }
  }, [map]);

  // Render when map or camera changes
  useEffect(() => {
    if (!map || !renderer) return;
    renderer.render(map, camera, activeLayer);
  }, [map, camera, renderer, activeLayer]);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const getWorldCoords = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - camera.x) / camera.k;
    const y = (clientY - rect.top - camera.y) / camera.k;

    return { x, y };
  }, [camera]);

  const getCellId = useCallback((worldX: number, worldY: number): number => {
    if (!map) return -1;
    return map.delaunay.find(worldX, worldY);
  }, [map]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });

    const worldPos = getWorldCoords(e.clientX, e.clientY);
    if (!map || !renderer) return;

    if (activeTool === 'select') {
      // Check if clicking an element to edit
      if (hoverElement) {
        setEditingElement(hoverElement);
        setIsDragging(false); // Don't pan if we clicked an element
        return;
      }
      return; // Panning only
    }

    const cellId = getCellId(worldPos.x, worldPos.y);
    const toolEvent = {
      x: worldPos.x,
      y: worldPos.y,
      cellId,
      isDragging: false,
      altKey: e.altKey
    };

    // Handle tool interaction
    const tool = ToolManager.getTool(activeTool);
    if (tool) {
      tool.onMouseDown(map, toolEvent);

      // For instant tools (City Placer, Castle Placer, etc.), update store immediately
      if (activeTool === 'city-placer' || activeTool === 'castle-placer' || activeTool === 'marker-placer') {
        setMap({ ...map });
        MapPersistence.save(map);
      } else {
        // For continuous tools (Paint), just render canvas for performance
        renderer.render(map, camera, activeLayer);
      }
    }
  }, [getWorldCoords, getCellId, map, activeTool, setMap, renderer, camera, activeLayer, hoverElement]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setMousePos({ x: mouseX, y: mouseY });

    // Hover detection for elements (only if not dragging to save perf)
    if (map && !isDragging) {
      let foundElement: { type: 'city' | 'castle' | 'marker' | 'state', data: any } | null = null;
      const threshold = 10;

      // 1. Check Cities
      for (const city of map.cities) {
        const x = map.points[city.cellId * 2];
        const y = map.points[city.cellId * 2 + 1];
        const screenX = x * camera.k + camera.x;
        const screenY = y * camera.k + camera.y;
        const dist = Math.sqrt((mouseX - screenX) ** 2 + (mouseY - screenY) ** 2);
        if (dist < threshold) {
          foundElement = { type: 'city', data: city };
          break;
        }
      }

      // 2. Check Castles
      if (!foundElement) {
        for (const castle of map.castles) {
          const x = map.points[castle.cellId * 2];
          const y = map.points[castle.cellId * 2 + 1];
          const screenX = x * camera.k + camera.x;
          const screenY = y * camera.k + camera.y;
          const dist = Math.sqrt((mouseX - screenX) ** 2 + (mouseY - screenY) ** 2);
          if (dist < threshold) {
            foundElement = { type: 'castle', data: castle };
            break;
          }
        }
      }

      // 3. Check Markers
      if (!foundElement) {
        for (const marker of map.markers) {
          const screenX = marker.x * camera.k + camera.x;
          const screenY = marker.y * camera.k + camera.y;
          const dist = Math.sqrt((mouseX - screenX) ** 2 + (mouseY - screenY) ** 2);
          if (dist < threshold) {
            foundElement = { type: 'marker', data: marker };
            break;
          }
        }
      }

      // 4. Check States (by checking if mouse is near state center)
      if (!foundElement && activeLayer === 'political') {
        const worldPos = getWorldCoords(e.clientX, e.clientY);
        for (const state of map.states) {
          if (state.cellCount < 10) continue; // Skip tiny states
          const dist = Math.sqrt((worldPos.x - state.centerX) ** 2 + (worldPos.y - state.centerY) ** 2);
          // Use a larger threshold for states since they're larger labels
          const stateThreshold = 50 / camera.k; // Scale with zoom
          if (dist < stateThreshold) {
            foundElement = { type: 'state', data: state };
            break;
          }
        }
      }

      setHoverElement(foundElement);
    }

    if (!isDragging) return;

    if (activeTool === 'select') {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
    }

    const worldPos = getWorldCoords(e.clientX, e.clientY);
    const cellId = getCellId(worldPos.x, worldPos.y);

    if (!map || !renderer) return;

    const toolEvent = {
      x: worldPos.x,
      y: worldPos.y,
      cellId,
      isDragging: true,
      altKey: e.altKey
    };

    // Handle tool interaction
    const tool = ToolManager.getTool(activeTool);
    if (tool) {
      tool.onMouseMove(map, toolEvent);
      // OPTIMIZATION: Do NOT call setMap here. It triggers Sidebar re-render.
      // Just render the canvas directly.
      renderer.render(map, camera, activeLayer);
    }
  }, [isDragging, lastMousePos, getWorldCoords, getCellId, map, activeTool, camera, setCamera, setMap, renderer, activeLayer]);

  const handleMouseUp = useCallback(() => {
    // If we were painting, now is the time to sync with the store/persistence
    if (isDragging && map && (activeTool === 'height-paint' || activeTool === 'biome-paint')) {
      setMap({ ...map }); // Update global state (Sidebar, etc.)
      MapPersistence.save(map);
    }
    setIsDragging(false);
  }, [isDragging, activeTool, map, setMap]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.1; // Increased sensitivity
    const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
    const newK = Math.max(0.1, Math.min(10, camera.k * (1 + delta)));

    // console.log('Wheel event:', { deltaY: e.deltaY, currentK: camera.k, newK });

    // Zoom towards mouse position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newX = mouseX - (mouseX - camera.x) * (newK / camera.k);
      const newY = mouseY - (mouseY - camera.y) * (newK / camera.k);

      setCamera({ k: newK, x: newX, y: newY });
    }
  }, [camera, setCamera]);

  const deleteElement = () => {
    if (!editingElement || !map) return;
    const { type, data } = editingElement;

    if (type === 'city') {
      map.cities = map.cities.filter(c => c.id !== data.id);
    } else if (type === 'castle') {
      map.castles = map.castles.filter(c => c.id !== data.id);
    } else if (type === 'marker') {
      map.markers = map.markers.filter(m => m.id !== data.id);
    } else if (type === 'state') {
      // Remove state and unclaim all its cells
      const stateId = data.id;
      for (let i = 0; i < map.cells.states.length; i++) {
        if (map.cells.states[i] === stateId) {
          map.cells.states[i] = 0; // Unclaimed
        }
      }
      // Remove cities that are capitals of this state
      map.cities = map.cities.filter(city => !city.name.includes(`(Capital of ${data.name})`));
      // Remove the state itself
      map.states = map.states.filter(s => s.id !== stateId);
    }

    setMap({ ...map });
    MapPersistence.save(map);
    setEditingElement(null);
  };

  const updateElementName = (newName: string) => {
    if (!editingElement || !map) return;
    const oldName = editingElement.data.name;
    editingElement.data.name = newName;
    
    // If editing a state, update city names that reference it
    if (editingElement.type === 'state' && oldName !== newName) {
      map.cities = map.cities.map(city => {
        if (city.name.includes(`(Capital of ${oldName})`)) {
          return { ...city, name: city.name.replace(`(Capital of ${oldName})`, `(Capital of ${newName})`) };
        }
        return city;
      });
    }
    
    setMap({ ...map });
    MapPersistence.save(map);
  };

  const { brushSize } = useUIStore();
  const showBrush = activeTool === 'height-paint' || activeTool === 'biome-paint';

  return (
    <div ref={containerRef} className="flex-1 h-full relative min-w-0 bg-[#0f171d]">
      <canvas
        ref={canvasRef}
        className={activeTool === 'select' ? "cursor-grab active:cursor-grabbing" : "cursor-none"}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Brush Indicator */}
      {showBrush && (
        <div
          className="absolute rounded-full border border-white/50 pointer-events-none z-10 bg-white/10"
          style={{
            left: mousePos.x,
            top: mousePos.y,
            width: brushSize * 2 * camera.k,
            height: brushSize * 2 * camera.k,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 10px rgba(0,0,0,0.3)'
          }}
        />
      )}

      {/* Hover Info Tooltip */}
      {hoverElement && map && !editingElement && (
        <div
          className="absolute pointer-events-none bg-gray-900/95 border border-gray-700 p-3 rounded-lg shadow-2xl z-50 min-w-[160px]"
          style={{
            left: mousePos.x + 15,
            top: mousePos.y - 20
          }}
        >
          <div className="text-sm font-bold text-white mb-1">
            {hoverElement.type === 'state' ? hoverElement.data.name.toUpperCase() : hoverElement.data.name.split(' (')[0]}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold 
              ${hoverElement.type === 'city' ? (hoverElement.data.type === 'Capital' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400') :
                hoverElement.type === 'castle' ? 'bg-orange-500/20 text-orange-400' :
                hoverElement.type === 'state' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-yellow-500/20 text-yellow-400'}`}>
              {hoverElement.type === 'city' ? hoverElement.data.type : hoverElement.type === 'state' ? 'Region' : hoverElement.type}
            </span>
            {hoverElement.type === 'state' && (
              <div className="text-[10px] text-gray-400">{hoverElement.data.cellCount} regions</div>
            )}
          </div>
          <div className="text-[11px] text-gray-400 italic">
            {activeTool === 'select' ? "Click to edit" : "Switch to Pan to edit"}
          </div>
        </div>
      )}

      {/* Editing Dialog */}
      {editingElement && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-[100]">
          <div className="bg-gray-800 border border-gray-700 p-6 rounded-xl shadow-2xl w-80 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 capitalize">
              Edit {editingElement.type}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Name</label>
                <input
                  type="text"
                  value={editingElement.data.name}
                  onChange={(e) => updateElementName(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {editingElement.type === 'city' && (
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Population</label>
                  <div className="text-sm text-gray-300">{(editingElement.data.population).toLocaleString()}</div>
                </div>
              )}

              {editingElement.type === 'state' && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingElement.data.color}
                        onChange={(e) => {
                          if (!map) return;
                          editingElement.data.color = e.target.value;
                          setMap({ ...map });
                          MapPersistence.save(map);
                        }}
                        className="w-16 h-8 bg-gray-900 border border-gray-700 rounded cursor-pointer"
                      />
                      <div className="text-xs text-gray-400">{editingElement.data.cellCount} regions</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex flex-col gap-2">
                <button
                  onClick={deleteElement}
                  className="w-full py-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 rounded font-semibold transition-colors"
                >
                  Delete {editingElement.type}
                </button>
                <button
                  onClick={() => setEditingElement(null)}
                  className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapCanvas;
