import React, { useRef, useEffect, useState, useCallback } from 'react';
import { WorldMap, Point } from '../core/MapState';
import { MapGenerator } from '../core/MapGenerator';
import { CanvasRenderer } from '../render/CanvasRenderer';
import { ToolManager } from '../tools/ToolManager';
import { useUIStore } from './store';

const MapCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<WorldMap | null>(null);
  const [renderer, setRenderer] = useState<CanvasRenderer | null>(null);
  const { activeLayer, activeTool, mapVersion, mapSeed, pointCount, camera, setCamera } = useUIStore();
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });

  // Initialize map and renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const handleResize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (map && renderer) {
        renderer.render(map, camera, activeLayer);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Generate initial map if not already present
    if (!map) {
      const initialMap = MapGenerator.generate(canvas.width, canvas.height, mapSeed, pointCount);
      setMap(initialMap);
    }

    // Create renderer
    const canvasRenderer = new CanvasRenderer(canvas);
    setRenderer(canvasRenderer);

    return () => window.removeEventListener('resize', handleResize);
  }, [mapSeed, pointCount, map, renderer]); // Removed camera and activeLayer from dependencies to avoid infinite loops if not careful, but renderer.render needs them. Actually better to use separate effects.

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

    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });

    if (activeTool === 'select') {
      return; // Panning only
    }

    const worldPos = getWorldCoords(e.clientX, e.clientY);
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

    if (activeTool === 'select') {
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setCamera({ ...camera, x: camera.x + dx, y: camera.y + dy });
      setLastMousePos({ x: e.clientX, y: e.clientY });
      return;
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
  }, [isDragging, lastMousePos, getWorldCoords, getCellId, map, activeTool]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.05; // Less sensitive
    const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
    const newK = Math.max(0.1, Math.min(10, camera.k * (1 + delta)));

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
    <div ref={containerRef} className="flex-1 h-full relative min-w-0">
      <canvas
        ref={canvasRef}
        className={activeTool === 'select' ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"}
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
