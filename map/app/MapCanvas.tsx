import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WorldMap, Point } from '../core/MapState';
import { MapGenerator } from '../core/MapGenerator';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { ToolManager } from '../tools/ToolManager';
import { useUIStore } from './store';

const MapCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [map, setMap] = useState<WorldMap | null>(null);
  const [renderer, setRenderer] = useState<CanvasRenderer | null>(null);
  const [camera, setCamera] = useState({ k: 1, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const { activeLayer, activeTool, mapVersion } = useUIStore();

  // Initialize map and renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size (excluding sidebar width)
    canvas.width = window.innerWidth - 320; // 320px for sidebar
    canvas.height = window.innerHeight;

    // Generate initial map
    const initialMap = MapGenerator.generate(canvas.width, canvas.height, 12345);
    setMap(initialMap);

    // Create renderer
    const canvasRenderer = new CanvasRenderer(canvas);
    setRenderer(canvasRenderer);
  }, []);

  // Render when map or camera changes
  useEffect(() => {
    if (!map || !renderer) return;
    renderer.render(map, camera, activeLayer);
  }, [map, camera, renderer, activeLayer, mapVersion]);

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

    // Check if click is within canvas bounds (exclude sidebar area)
    const sidebarWidth = 320;
    if (e.clientX > window.innerWidth - sidebarWidth) {
      return; // Ignore clicks in sidebar area
    }

    const worldPos = getWorldCoords(e.clientX, e.clientY);
    setIsDragging(true);

    if (!map) return;

    const cellId = getCellId(worldPos.x, worldPos.y);
    const toolEvent = {
      x: worldPos.x,
      y: worldPos.y,
      cellId,
      isDragging: false
    };

    // Handle tool interaction
    const tool = ToolManager.getTool(activeTool);
    if (tool) {
      tool.onMouseDown(map, toolEvent);
      setMap({ ...map }); // Trigger re-render
    }
  }, [getWorldCoords, getCellId, map, activeTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if mouse is within canvas bounds (exclude sidebar area)
    const sidebarWidth = 320;
    if (e.clientX > window.innerWidth - sidebarWidth) {
      return; // Ignore moves in sidebar area
    }

    const worldPos = getWorldCoords(e.clientX, e.clientY);
    const cellId = getCellId(worldPos.x, worldPos.y);

    if (!map) return;

    const toolEvent = {
      x: worldPos.x,
      y: worldPos.y,
      cellId,
      isDragging: true
    };

    // Handle tool interaction
    const tool = ToolManager.getTool(activeTool);
    if (tool) {
      tool.onMouseMove(map, toolEvent);
      setMap({ ...map }); // Trigger re-render
    }
  }, [isDragging, getWorldCoords, getCellId, map, activeTool]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.1;
    const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
    const newK = Math.max(0.1, Math.min(5, camera.k * (1 + delta)));

    // Zoom towards mouse position
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newX = mouseX - (mouseX - camera.x) * (newK / camera.k);
      const newY = mouseY - (mouseY - camera.y) * (newK / camera.k);

      setCamera({ k: newK, x: newX, y: newY });
    }
  }, [camera]);

  return (
    <div style={{ width: 'calc(100% - 320px)', height: '100%', position: 'absolute', left: 0, top: 0 }}>
      <canvas
        ref={canvasRef}
        className="cursor-crosshair"
        style={{ width: '100%', height: '100%', display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  );
};

export default MapCanvas;
