import { X, Trash2, Clock, Save as SaveIcon } from 'lucide-react';
import { useUIStore } from '../store';
import { MapPersistence, SavedMapMeta } from '../../core/MapPersistence';
import { useState, useEffect } from 'react';

interface LoadMapModalProps {
  onClose: () => void;
  onLoad: (id: string) => void;
  onGenerateNew: () => void;
}

const LoadMapModal = ({ onClose, onLoad, onGenerateNew }: LoadMapModalProps) => {
  const [savedMaps, setSavedMaps] = useState<SavedMapMeta[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    // Load the list of saved maps
    setSavedMaps(MapPersistence.loadVersionList());
  }, []);

  const handleDelete = (id: string) => {
    if (confirmDelete === id) {
      MapPersistence.deleteVersion(id);
      setSavedMaps(MapPersistence.loadVersionList());
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-700 rounded-lg w-[800px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Load Map</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Generate New Map option */}
          <button
            onClick={() => {
              onGenerateNew();
              onClose();
            }}
            className="w-full mb-4 p-4 border-2 border-dashed border-slate-600 rounded-lg hover:border-indigo-500 hover:bg-slate-800/50 transition-colors flex items-center justify-center gap-2 text-slate-300 hover:text-white"
          >
            <span className="text-2xl">+</span>
            <span>Generate New Map</span>
          </button>

          {savedMaps.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No saved maps yet. Save your current map to see it here.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {savedMaps.map((mapMeta) => (
                <div
                  key={mapMeta.id}
                  className="border border-slate-700 rounded-lg overflow-hidden hover:border-slate-500 transition-colors group relative"
                >
                  {/* Thumbnail */}
                  <div 
                    className="aspect-video bg-slate-800 cursor-pointer"
                    onClick={() => onLoad(mapMeta.id)}
                  >
                    {mapMeta.thumbnail ? (
                      <img 
                        src={mapMeta.thumbnail} 
                        alt={mapMeta.name}
                        className="w-full h-full object-cover"
                        draggable={false}
                        style={{ imageRendering: 'auto' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        No preview
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div 
                    className="p-3 bg-slate-800/50 cursor-pointer"
                    onClick={() => onLoad(mapMeta.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white truncate">
                        Seed: {mapMeta.seed}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        mapMeta.type === 'manual' 
                          ? 'bg-indigo-600/50 text-indigo-200' 
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {mapMeta.type === 'manual' ? (
                          <span className="flex items-center gap-1">
                            <SaveIcon size={10} /> Saved
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Clock size={10} /> Auto
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatDate(mapMeta.date)}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(mapMeta.id);
                    }}
                    className={`absolute top-2 right-2 p-1.5 rounded transition-all ${
                      confirmDelete === mapMeta.id
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-900/80 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-400'
                    }`}
                    title={confirmDelete === mapMeta.id ? 'Click again to confirm' : 'Delete'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700 text-xs text-slate-500">
          {savedMaps.length} saved map{savedMaps.length !== 1 ? 's' : ''} 
          {savedMaps.filter(m => m.type === 'autosave').length > 0 && (
            <span> ({savedMaps.filter(m => m.type === 'autosave').length} autosaves)</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoadMapModal;
