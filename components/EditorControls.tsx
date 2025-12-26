
import React, { useState, useRef } from 'react';
import { HoldType, Hold } from '../types';
import { HOLD_COLORS } from '../constants';

interface EditorControlsProps {
  currentTool: HoldType;
  setCurrentTool: (t: HoldType) => void;
  currentColor: string;
  setCurrentColor: (c: string) => void;
  onGenerateLevel: (desc: string) => void;
  onUploadImage: (file: File) => void;
  isGenerating: boolean;
  onClear: () => void;
  onSave: () => void;
  angle: number;
  onUpdateAngle: (angle: number) => void;
}

const EditorControls: React.FC<EditorControlsProps> = ({ 
    currentTool, 
    setCurrentTool, 
    currentColor,
    setCurrentColor,
    onGenerateLevel,
    onUploadImage,
    isGenerating,
    onClear,
    onSave,
    angle,
    onUpdateAngle
}) => {
  const [prompt, setPrompt] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tools: HoldType[] = ['jug', 'crimp', 'sloper', 'pocket', 'volume', 'start', 'finish'];

  if (!isOpen) {
      return (
          <button 
            onClick={() => setIsOpen(true)}
            className="absolute top-4 right-4 bg-stone-800 text-white p-2 rounded shadow border border-stone-600 hover:bg-stone-700"
          >
              Open Editor Tools
          </button>
      )
  }

  const getAngleLabel = (a: number) => {
      if (a === 0) return 'Vertical (0°)';
      if (a < 0) return `${Math.abs(a)}° Slab`;
      return `${a}° Overhang`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          onUploadImage(e.target.files[0]);
      }
  };

  return (
    <div className="absolute top-4 right-4 w-72 bg-stone-900/95 backdrop-blur border border-stone-700 p-4 rounded-xl shadow-2xl flex flex-col gap-4 text-sm z-30 max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg text-white">Level Editor</h3>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">✕</button>
      </div>

      {/* Wall Settings */}
      <div className="bg-stone-800 p-3 rounded-lg border border-stone-700">
         <h4 className="font-semibold text-gray-300 mb-2">Wall Angle</h4>
         <div className="flex items-center justify-between mb-1 text-xs text-gray-400">
             <span>Slab (-10°)</span>
             <span>Roof (60°)</span>
         </div>
         <input 
            type="range" 
            min="-10" 
            max="60" 
            step="5"
            value={angle}
            onChange={(e) => onUpdateAngle(Number(e.target.value))}
            className="w-full h-2 bg-stone-600 rounded-lg appearance-none cursor-pointer accent-yellow-500"
         />
         <div className="text-center mt-1 text-yellow-400 font-bold">{getAngleLabel(angle)}</div>
      </div>

      {/* AI Generation */}
      <div className="bg-stone-800 p-3 rounded-lg border border-stone-700">
        <h4 className="font-semibold text-purple-400 mb-2 flex items-center gap-2">
            ✨ Gemini Route Gen
        </h4>
        
        {/* Text Gen */}
        <textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., 'A hard route with crimps and a big jump at the end'"
            className="w-full bg-black/50 text-white p-2 rounded text-xs mb-2 border border-stone-600 focus:border-purple-500 outline-none resize-none h-16"
        />
        <button 
            disabled={isGenerating || !prompt}
            onClick={() => onGenerateLevel(prompt)}
            className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-stone-700 disabled:text-gray-500 text-white rounded font-bold transition-colors mb-2 text-xs"
        >
            {isGenerating ? 'Generating...' : 'Generate from Text'}
        </button>

        {/* Image Gen */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-700">
            <span className="text-xs text-gray-400">Or from image:</span>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*"
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-stone-700 text-white rounded font-bold text-xs"
            >
                {isGenerating ? 'Scanning...' : '📷 Upload Photo'}
            </button>
        </div>
      </div>

      <hr className="border-stone-700" />

      {/* Manual Tools */}
      <div>
        <div className="flex items-center justify-between mb-2">
           <h4 className="font-semibold text-gray-300">Hold Properties</h4>
        </div>

        {/* Color Picker */}
        <div className="flex items-center gap-3 mb-4 bg-stone-800 p-2 rounded border border-stone-700">
            <label className="text-xs text-gray-400 font-medium">Color:</label>
            <div className="flex items-center gap-2 flex-1">
                <input 
                    type="color" 
                    value={currentColor}
                    onChange={(e) => setCurrentColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent p-0 border-0"
                />
                <span className="text-xs text-gray-500 font-mono uppercase">{currentColor}</span>
            </div>
        </div>

        <h4 className="font-semibold text-gray-300 mb-2">Hold Type</h4>
        <div className="grid grid-cols-2 gap-2">
            {tools.map(t => (
                <button
                    key={t}
                    onClick={() => setCurrentTool(t)}
                    className={`flex items-center gap-2 px-3 py-2 rounded border transition-all
                        ${currentTool === t 
                            ? 'bg-stone-700 border-white text-white' 
                            : 'bg-stone-800 border-stone-700 text-gray-400 hover:bg-stone-700'}`}
                >
                    <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: HOLD_COLORS[t] }} 
                    />
                    <span className="capitalize">{t}</span>
                </button>
            ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Click on the wall to place selected hold. Click existing hold to remove.
      </div>

      <div className="flex gap-2 pt-2">
          <button onClick={onClear} className="flex-1 py-2 bg-red-900/50 hover:bg-red-800 text-red-200 rounded border border-red-800">
              Clear All
          </button>
          <button onClick={onSave} className="flex-1 py-2 bg-green-900/50 hover:bg-green-800 text-green-200 rounded border border-green-800">
              Save Level
          </button>
      </div>
    </div>
  );
};

export default EditorControls;
