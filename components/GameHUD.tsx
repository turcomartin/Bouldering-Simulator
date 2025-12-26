
import React from 'react';
import { ClimberState, Level } from '../types';

interface GameHUDProps {
  state: ClimberState;
  levelName: string;
  onReset: () => void;
  coachAdvice: string | null;
  infiniteStamina: boolean;
  toggleInfiniteStamina: () => void;
  realismMode: boolean;
  toggleRealismMode: () => void;
  isSlipping: boolean;
  wallAngle: number;
  height?: number;
}

const GameHUD: React.FC<GameHUDProps> = ({ 
    state, 
    levelName, 
    onReset, 
    coachAdvice,
    infiniteStamina,
    toggleInfiniteStamina,
    realismMode,
    toggleRealismMode,
    isSlipping,
    wallAngle,
    height = 100
}) => {
  const getAngleText = (angle: number) => {
      if (angle === 0) return 'VERTICAL';
      if (angle < 0) return `${Math.abs(angle)}° SLAB`;
      return `${angle}° OVERHANG`;
  };

  const altitude = Math.max(0, Math.round(height - state.centerOfMass.y));

  const PumpBar = ({ label, value }: { label: string, value: number }) => (
      <div className="flex flex-col gap-0.5 mb-2">
          <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold">
              <span>{label}</span>
              <span className={value > 80 ? 'text-red-500' : 'text-gray-400'}>{Math.round(value)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div 
                  className={`h-full transition-all duration-300 ${value > 80 ? 'bg-red-500' : 'bg-cyan-500'}`}
                  style={{ width: `${value}%` }}
              />
          </div>
      </div>
  );

  const getStatusText = () => {
      if (state.status === 'idle') return 'STANDING (SAFE)';
      if (state.status === 'climbing') return 'CLIMBING';
      if (state.status === 'falling') return 'FALLING!';
      if (state.status === 'topped') return 'TOPPED!';
      return state.status;
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Status Card */}
      <div className="bg-stone-800 p-4 rounded-xl border border-stone-700 shadow-lg">
        <div className="flex justify-between items-start mb-1">
            <h2 className="text-xl font-bold text-white leading-tight">{levelName}</h2>
            <div className={`text-[10px] px-2 py-1 rounded font-mono whitespace-nowrap ${wallAngle < 0 ? 'bg-indigo-900 text-indigo-200' : 'bg-stone-700 text-stone-300'}`}>
                {getAngleText(wallAngle)}
            </div>
        </div>
        
        {height > 150 && (
             <div className="text-xs font-mono text-stone-500 mb-2">
                 Altitude: <span className="text-white font-bold">{altitude}m</span> / {height}m
             </div>
        )}
        
        <div className={`text-sm font-semibold mb-3 uppercase tracking-wider
            ${state.status === 'climbing' ? 'text-blue-400' : 
              state.status === 'falling' ? 'text-red-500' : 
              state.status === 'topped' ? 'text-green-400' : 'text-emerald-400'}`}>
            {getStatusText()}
        </div>

        {/* Core Energy */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-300 mb-1">
            <span>Core Energy</span>
            <span>{infiniteStamina ? '∞' : Math.round(state.stamina) + '%'}</span>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
                className={`h-full transition-all duration-300 ${state.stamina < 30 && !infiniteStamina ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} 
                style={{ width: infiniteStamina ? '100%' : `${state.stamina}%` }}
            />
          </div>
        </div>
        
        {/* Arm Pumps */}
        <div className="bg-stone-900/50 p-2 rounded mb-4 border border-stone-700/50">
            <PumpBar label="L. Arm Pump" value={state.armPump.left} />
            <PumpBar label="R. Arm Pump" value={state.armPump.right} />
        </div>

        {/* Chalk */}
        <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-300 mb-1">
                <span>Chalk</span>
                <span>{Math.round(state.chalk)}%</span>
            </div>
            <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-white/80 transition-all duration-300" 
                    style={{ width: `${state.chalk}%` }}
                />
            </div>
            <div className="text-[10px] text-gray-500 text-right mt-0.5">Press 'C' to Chalk</div>
        </div>

        {/* Stability / Grip Level Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-300 mb-1">
            <span>Instability</span>
            <div className="flex gap-2">
                {isSlipping && <span className="text-orange-400 font-bold animate-pulse">SLIPPING!</span>}
                <span className={state.balance > 80 ? "text-red-500 font-bold" : ""}>{Math.round(state.balance)}%</span>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden border border-gray-600">
            {/* The bar fills up as stability gets worse (0 -> 100) */}
            <div 
                className={`h-full transition-all duration-100 ease-out
                    ${state.balance > 80 ? 'bg-red-600 animate-pulse' : 
                      state.balance > 50 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                style={{ width: `${state.balance}%` }}
            />
          </div>
          {state.balance > 90 && <div className="text-[10px] text-red-400 mt-1">Danger! High Instability!</div>}
          {isSlipping && <div className="text-[10px] text-orange-400 mt-1">Low chalk / Slippery holds!</div>}
        </div>

        <div className="flex gap-2 mb-2">
            <button 
                onClick={toggleInfiniteStamina}
                className={`flex-1 py-1 text-xs rounded border transition-colors
                    ${infiniteStamina ? 'bg-yellow-600/50 border-yellow-500 text-yellow-200' : 'bg-stone-700 border-stone-600 text-gray-400'}`}
            >
                {infiniteStamina ? 'Inf Stamina' : 'Stamina'}
            </button>
            <button 
                onClick={toggleRealismMode}
                className={`flex-1 py-1 text-xs rounded border transition-colors
                    ${realismMode ? 'bg-red-900/50 border-red-500 text-red-200' : 'bg-stone-700 border-stone-600 text-gray-400'}`}
            >
                {realismMode ? 'Realism ON' : 'Realism OFF'}
            </button>
        </div>

        <button 
            onClick={onReset}
            className="w-full py-2 bg-stone-700 hover:bg-stone-600 text-white text-sm font-bold rounded transition-colors"
        >
            {state.status === 'topped' || state.status === 'falling' ? 'Try Again' : 'Reset Climb'}
        </button>
      </div>

      {/* Coach Advice Bubble */}
      {coachAdvice && (
         <div className="bg-blue-900/40 p-3 rounded-xl border border-blue-800 shadow-lg animate-fade-in-up">
            <div className="flex items-start gap-2">
                <span className="text-xl">🧗</span>
                <div>
                    <h4 className="text-xs font-bold uppercase text-blue-200">Coach Gemini</h4>
                    <p className="text-sm text-blue-100 italic">"{coachAdvice}"</p>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default GameHUD;
