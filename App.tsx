import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ClimberState, Level, Hold, Limb, HoldType, Point, AttachedLimb } from './types';
import { INITIAL_STAMINA, INITIAL_CHALK, SAMPLE_LEVELS, HOLD_STAMINA_DRAIN, ANATOMY, MAX_REACH, HOLD_COLORS } from './constants';
import { calculateTickDrain, calculateStability, constrainBodyPosition, getFrictionPenalty, isAttached, calculateDistance } from './utils/gameUtils';
import { generateLevel, getCoachAdvice, generateLevelFromImage } from './services/geminiService';
import BoulderingWall from './components/BoulderingWall';
import GameHUD from './components/GameHUD';
import EditorControls from './components/EditorControls';

const App: React.FC = () => {
  const [mode, setMode] = useState<'play' | 'editor'>('play');
  const [climbingMode, setClimbingMode] = useState<'boulder' | 'sport'>('boulder');
  const [infiniteStamina, setInfiniteStamina] = useState(false);
  const [realismMode, setRealismMode] = useState(false); // New Toggle
  const [isUserDragging, setIsUserDragging] = useState(false);
  const [isSlipping, setIsSlipping] = useState(false);
  
  const [level, setLevel] = useState<Level>(SAMPLE_LEVELS[0]);

  // Spawn settings
  const getGroundY = (lvl: Level) => lvl.height || 100;
  const getStartCom = (lvl: Level) => ({ x: 50, y: getGroundY(lvl) - 14 }); // Standing height
  const getStartLimbs = (lvl: Level) => ({
      leftHand: null,
      rightHand: null,
      leftFoot: { x: 46, y: getGroundY(lvl) }, // Feet on ground
      rightFoot: { x: 54, y: getGroundY(lvl) }
  });

  const [climber, setClimber] = useState<ClimberState>({
    limbs: getStartLimbs(SAMPLE_LEVELS[0]),
    stamina: INITIAL_STAMINA,
    armPump: { left: 0, right: 0 },
    chalk: INITIAL_CHALK,
    balance: 0,
    status: 'idle',
    centerOfMass: getStartCom(SAMPLE_LEVELS[0]),
    velocity: { x: 0, y: 0 }
  });

  const [editorTool, setEditorTool] = useState<HoldType>('jug');
  const [editorColor, setEditorColor] = useState<string>(HOLD_COLORS['jug']);
  const [isGenerating, setIsGenerating] = useState(false);

  const [coachAdvice, setCoachAdvice] = useState<string | null>(null);
  const gameLoopRef = useRef<number>(0);
  const staminaAccumulatorRef = useRef<number>(0);
  const prevCOMRef = useRef<Point>(getStartCom(SAMPLE_LEVELS[0]));

  const resetClimber = useCallback(() => {
    const startPos = getStartCom(level);
    setClimber({
      limbs: getStartLimbs(level),
      stamina: INITIAL_STAMINA,
      armPump: { left: 0, right: 0 },
      chalk: INITIAL_CHALK,
      balance: 0,
      status: 'idle',
      centerOfMass: startPos,
      velocity: { x: 0, y: 0 }
    });
    setCoachAdvice(null);
    setIsSlipping(false);
    prevCOMRef.current = startPos;
  }, [level]);

  // Sync editor color with tool type by default
  useEffect(() => {
      setEditorColor(HOLD_COLORS[editorTool]);
  }, [editorTool]);

  // Chalk Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key.toLowerCase() === 'c' && climber.status === 'climbing') {
            setClimber(prev => {
                if (prev.chalk >= 100) return prev;
                return {
                    ...prev,
                    chalk: Math.min(100, prev.chalk + 5),
                    stamina: Math.max(0, prev.stamina - 1)
                };
            });
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [climber.status]);

  useEffect(() => {
    if (mode === 'editor') {
        if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
        return;
    }

    let lastTime = performance.now();

    const loop = (time: number) => {
      const dt = time - lastTime;
      const safeDt = Math.min(dt, 50); 
      lastTime = time;

      if (safeDt > 0) {
        setClimber(prev => {
          let nextState = { ...prev };
          const groundY = getGroundY(level);

          // --- Velocity Calculation ---
          // Determine velocity from previous frame movement
          const vx = (prev.centerOfMass.x - prevCOMRef.current.x) * (16 / safeDt);
          const vy = (prev.centerOfMass.y - prevCOMRef.current.y) * (16 / safeDt);
          
          nextState.velocity = { x: vx, y: vy };
          prevCOMRef.current = { ...prev.centerOfMass };

          // --- 0. Falling Physics ---
          if (nextState.status === 'falling') {
              nextState.limbs = { leftHand: null, rightHand: null, leftFoot: null, rightFoot: null };
              
              // Fall until ground
              if (nextState.centerOfMass.y < groundY - 5) {
                  nextState.centerOfMass.y += 1.5; // Reduced terminal velocity for slower falls
                  nextState.centerOfMass.x += nextState.velocity.x * 0.95; // Maintain momentum while falling
                  
                  // Bounce/Slide off walls
                  if (nextState.centerOfMass.x < 0) nextState.centerOfMass.x = 0;
                  if (nextState.centerOfMass.x > 100) nextState.centerOfMass.x = 100;
              } else {
                  // Hit ground: Reset to idle standing
                  nextState.status = 'idle';
                  nextState.centerOfMass.y = groundY - 14;
                  nextState.limbs = getStartLimbs(level);
                  nextState.stamina = 50; // Penalty
              }
              return nextState;
          }

          // --- Check if Standing on Ground ---
          const isGrounded = nextState.centerOfMass.y >= groundY - 16;
          
          if (isGrounded && !isUserDragging) {
              nextState.balance = 0; 
              nextState.stamina = Math.min(100, nextState.stamina + 0.5); 
              nextState.armPump = { left: 0, right: 0 }; 
              setIsSlipping(false);
              
              if (nextState.status !== 'idle') nextState.status = 'idle';

              if (vx === 0 && vy === 0) {
                  nextState.centerOfMass.y = nextState.centerOfMass.y * 0.9 + (groundY - 14) * 0.1;
              }
              
              if (nextState.centerOfMass.y > groundY - 12) nextState.centerOfMass.y = groundY - 12;

              if (!nextState.limbs.leftFoot) nextState.limbs.leftFoot = { x: nextState.centerOfMass.x - 4, y: groundY };
              if (!nextState.limbs.rightFoot) nextState.limbs.rightFoot = { x: nextState.centerOfMass.x + 4, y: groundY };

              return nextState;
          }

          // --- 1. Climbing Physics (Momentum + Gravity + Muscles) ---
          if (!isUserDragging) {
             let gravity = 0.2; 
             let damping = 0.92;
             
             // Adjust gravity based on foot placement (Standing vs Hanging)
             const activeFootLimbs = [nextState.limbs.leftFoot, nextState.limbs.rightFoot].filter(l => l !== null); 
             if (activeFootLimbs.length > 0) {
                 const avgFootY = activeFootLimbs.reduce((sum, l) => sum + l!.y, 0) / activeFootLimbs.length;
                 // If center of mass is ABOVE feet (standing)
                 if (nextState.centerOfMass.y < avgFootY + 5) {
                     const angleRad = (level.angle || 0) * (Math.PI / 180);
                     // On slabs/vertical, gravity is supported by feet mostly
                     gravity = 0.2 * Math.sin(angleRad);
                     if (level.angle !== undefined && level.angle < 0) gravity = 0.05;
                 }
             }

             // --- MUSCLE ACTIVATION / CORE TENSION ---
             // If we are hanging (especially on overhangs), we use muscles to hold position.
             // We only do this if we have some stamina left and are attached.
             const handCount = [nextState.limbs.leftHand, nextState.limbs.rightHand].filter(isAttached).length;
             
             if (handCount > 0 && nextState.stamina > 5) {
                 const velocityMag = Math.sqrt(vx*vx + vy*vy);
                 
                 // If we are relatively still (attempting to lock off), activate muscles
                 // Threshold ensures we don't kill momentum during a big swing/dyno
                 if (velocityMag < 1.0) {
                     // How much can we fight gravity? Depends on stamina.
                     // at 100 stamina -> 1.0 strength. at 0 stamina -> 0 strength.
                     const muscleStrength = Math.min(1.0, nextState.stamina / 20); 
                     
                     // Reduce gravity effect to simulate holding the core tight
                     // We leave a tiny bit of gravity so it feels organic, not perfectly frozen
                     gravity *= (1 - (0.9 * muscleStrength));
                     
                     // Increase damping to kill micro-movements (stiffen up)
                     damping = 0.92 * (1 - (0.15 * muscleStrength));
                 }
             }

             let proposedCOM = { 
                 x: nextState.centerOfMass.x + (nextState.velocity.x * damping), 
                 y: nextState.centerOfMass.y + (nextState.velocity.y * damping) + gravity 
             };

             // --- AUTO-DETACH LOGIC ---
             // If momentum carries us beyond reach of a limb, we should detach that limb
             // rather than bouncing off an invisible wall (which constrainsBodyPosition does).
             const nextLimbs = { ...nextState.limbs };
             
             const checkAndDetach = (limb: Limb, anchorOffset: {x:number, y:number}, maxR: number) => {
                 if (nextLimbs[limb]) {
                     const anchor = { x: proposedCOM.x + anchorOffset.x, y: proposedCOM.y + anchorOffset.y };
                     if (calculateDistance(anchor, nextLimbs[limb]!) > maxR * 1.05) {
                         nextLimbs[limb] = null;
                     }
                 }
             };

             checkAndDetach('leftHand', { x: -ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85 }, MAX_REACH.hand);
             checkAndDetach('rightHand', { x: ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85 }, MAX_REACH.hand);
             checkAndDetach('leftFoot', { x: -ANATOMY.hipWidth/2, y: 1.5 }, MAX_REACH.foot);
             checkAndDetach('rightFoot', { x: ANATOMY.hipWidth/2, y: 1.5 }, MAX_REACH.foot);
             
             nextState.limbs = nextLimbs;

             // Constrain to remaining limbs (creates the swinging/pendulum effect)
             nextState.centerOfMass = constrainBodyPosition(proposedCOM, nextState.limbs, level.holds);
          }

          // --- 2. Game Logic (Stamina & Balance) ---
          if (nextState.status === 'climbing' && !isUserDragging) {
              staminaAccumulatorRef.current += safeDt;
              if (staminaAccumulatorRef.current > 100) {
                 staminaAccumulatorRef.current = 0;

                 // Pass realismMode to physics
                 const balanceScore = calculateStability(nextState, level.holds, level.angle || 0, realismMode);
                 nextState.balance = balanceScore;
                 
                 const frictionPenalty = getFrictionPenalty(nextState, level.holds, level.angle || 0, realismMode);
                 
                 // In realism mode, slips happen easier
                 const slipThreshold = realismMode ? 15 : 20;
                 setIsSlipping(frictionPenalty > slipThreshold);

                 if (balanceScore >= 100 && !infiniteStamina) {
                     nextState.balance = 100;
                     nextState.status = 'falling';
                     nextState.limbs = { leftHand: null, rightHand: null, leftFoot: null, rightFoot: null };
                 }

                 const drains = calculateTickDrain(nextState, level.holds, HOLD_STAMINA_DRAIN, level.angle || 0, realismMode);
                 
                 if (!infiniteStamina) {
                     nextState.stamina = Math.max(0, nextState.stamina - drains.core);
                     nextState.armPump = {
                         left: Math.max(0, Math.min(100, nextState.armPump.left + drains.leftPump)),
                         right: Math.max(0, Math.min(100, nextState.armPump.right + drains.rightPump))
                     };
                     nextState.chalk = Math.max(0, nextState.chalk - 0.02);

                     if (nextState.armPump.left >= 100) nextState.limbs.leftHand = null;
                     if (nextState.armPump.right >= 100) nextState.limbs.rightHand = null;
                     
                     if (nextState.stamina <= 0) {
                         nextState.status = 'falling';
                         nextState.limbs = { leftHand: null, rightHand: null, leftFoot: null, rightFoot: null };
                     }
                 }
              }
          } else {
             nextState.balance = 0;
             setIsSlipping(false);
          }

          // --- 3. Check Fall ---
          const handCount = [nextState.limbs.leftHand, nextState.limbs.rightHand].filter(isAttached).length;
          
          if (!isUserDragging && handCount === 0 && nextState.centerOfMass.y < groundY - 18) {
               nextState.centerOfMass.y += 1.0; 
               if (nextState.status === 'climbing') {
                   nextState.status = 'falling';
                   nextState.limbs = { leftHand: null, rightHand: null, leftFoot: null, rightFoot: null };
               }
          }

          return nextState;
        });
      }

      gameLoopRef.current = requestAnimationFrame(loop);
    };

    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [mode, climber.status, level.holds, level.angle, infiniteStamina, realismMode, isUserDragging, level.height]);

  // Periodic Coach Advice
  useEffect(() => {
    if (climber.status === 'climbing' && mode === 'play') {
       const interval = setInterval(async () => {
           if (Math.random() > 0.8) {
               const advice = await getCoachAdvice(climber, level.holds);
               setCoachAdvice(advice);
               setTimeout(() => setCoachAdvice(null), 5000);
           }
       }, 10000);
       return () => clearInterval(interval);
    }
  }, [climber.status, mode, level.holds, climber]);

  // --- Handlers ---

  const handlePlaceLimb = (val: AttachedLimb | Point | null, limb: Limb) => {
    setClimber(prev => {
      const nextLimbs = { ...prev.limbs, [limb]: val };
      let status = prev.status;
      
      const lhVal = limb === 'leftHand' ? val : nextLimbs.leftHand;
      const rhVal = limb === 'rightHand' ? val : nextLimbs.rightHand;

      if (isAttached(lhVal) && isAttached(rhVal)) {
          const lhHold = level.holds.find(h => h.id === lhVal.holdId);
          const rhHold = level.holds.find(h => h.id === rhVal.holdId);
          
          if (lhHold?.type === 'finish' && rhHold?.type === 'finish') {
              status = 'topped';
          }
      }

      if (status === 'idle' && (isAttached(val) || val !== null)) {
          status = 'climbing';
      }

      return {
        ...prev,
        limbs: nextLimbs,
        status: status
      };
    });
  };

  const handleUpdateCOM = (newCOM: Point) => {
      setClimber(prev => ({ ...prev, centerOfMass: newCOM }));
  };

  const handleEditorCanvasClick = (x: number, y: number) => {
    const newHold: Hold = {
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      type: editorTool,
      rotation: 0,
      color: editorColor // Use selected color
    };
    setLevel(prev => ({ ...prev, holds: [...prev.holds, newHold] }));
  };

  const handleEditorHoldClick = (hold: Hold) => {
    setLevel(prev => ({
      ...prev,
      holds: prev.holds.filter(h => h.id !== hold.id)
    }));
  };

  const handleUpdateAngle = (newAngle: number) => {
      setLevel(prev => ({...prev, angle: newAngle}));
  };

  const handleGenerateLevel = async (desc: string) => {
    setIsGenerating(true);
    try {
        const newHolds = await generateLevel(desc);
        setLevel(prev => ({
        ...prev,
        name: `AI: ${desc.substring(0, 15)}...`,
        holds: newHolds
        }));
    } catch(e) {
        alert("Failed to generate level. Please try again.");
    } finally {
        setIsGenerating(false);
        resetClimber();
    }
  };

  const handleImageUpload = async (file: File) => {
      setIsGenerating(true);
      try {
          const newHolds = await generateLevelFromImage(file);
          setLevel(prev => ({
              ...prev,
              name: `Import: ${file.name.substring(0, 10)}...`,
              holds: newHolds
          }));
      } catch(e) {
          alert("Failed to process image. Make sure it's a clear photo of a wall.");
      } finally {
          setIsGenerating(false);
          resetClimber();
      }
  };

  const handleLevelChange = (newLevel: Level) => {
    setLevel(newLevel);
    // Reset climber position
    const startPos = getStartCom(newLevel);
    setClimber({
      limbs: getStartLimbs(newLevel),
      stamina: INITIAL_STAMINA,
      armPump: { left: 0, right: 0 },
      chalk: INITIAL_CHALK,
      balance: 0,
      status: 'idle',
      centerOfMass: startPos,
      velocity: { x: 0, y: 0 }
    });
    setCoachAdvice(null);
    setIsSlipping(false);
    prevCOMRef.current = startPos;
  };

  const filteredLevels = SAMPLE_LEVELS.filter(l => {
      const isSport = (l.height || 100) > 150;
      return climbingMode === 'sport' ? isSport : !isSport;
  });

  return (
    <div className="w-screen h-screen bg-stone-950 flex flex-col text-stone-100">
      <nav className="h-16 bg-stone-900 border-b border-stone-800 flex items-center justify-between px-6 shrink-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
            <span className="text-2xl">🧗</span>
            <h1 className="text-xl font-bold tracking-tight text-white"><span className="text-yellow-500">Ascent</span> Simulator</h1>
        </div>
        
        <div className="flex gap-4 items-center">
             {mode === 'play' && (
                <div className="flex items-center gap-2 mr-4">
                     {/* Mode Switcher */}
                    <div className="flex bg-stone-800 rounded p-1 mr-2">
                        <button 
                            onClick={() => { setClimbingMode('boulder'); handleLevelChange(SAMPLE_LEVELS[0]); }}
                            className={`px-3 py-1 text-xs rounded transition-colors ${climbingMode === 'boulder' ? 'bg-stone-600 text-white' : 'text-stone-400 hover:text-white'}`}
                        >
                            Boulder
                        </button>
                        <button 
                            onClick={() => { setClimbingMode('sport'); handleLevelChange(SAMPLE_LEVELS.find(l => (l.height || 100) > 150) || SAMPLE_LEVELS[0]); }}
                            className={`px-3 py-1 text-xs rounded transition-colors ${climbingMode === 'sport' ? 'bg-indigo-600 text-white' : 'text-stone-400 hover:text-white'}`}
                        >
                            Sport / Free Solo
                        </button>
                    </div>

                    <span className="text-xs text-gray-400 uppercase font-bold hidden md:inline">Route:</span>
                    <select
                        className="bg-stone-800 text-white text-sm px-3 py-1.5 rounded border border-stone-700 outline-none focus:border-yellow-500 min-w-[140px]"
                        onChange={(e) => {
                             const selected = SAMPLE_LEVELS.find(l => l.id === e.target.value);
                             if (selected) handleLevelChange(selected);
                        }}
                        value={level.id}
                    >
                        {filteredLevels.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>{lvl.name} ({lvl.difficulty})</option>
                        ))}
                    </select>
                </div>
            )}

            <button 
                onClick={() => setMode('play')}
                className={`px-4 py-2 rounded font-medium transition-colors text-sm ${mode === 'play' ? 'bg-yellow-500 text-black shadow' : 'text-gray-400 hover:text-white hover:bg-stone-800'}`}
            >
                Play
            </button>
            <button 
                onClick={() => { setMode('editor'); resetClimber(); }}
                className={`px-4 py-2 rounded font-medium transition-colors text-sm ${mode === 'editor' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-stone-800'}`}
            >
                Editor
            </button>
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-stone-900 border-r border-stone-800 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 z-20 shadow-xl">
             {mode === 'play' ? (
                <GameHUD 
                    state={climber} 
                    levelName={level.name}
                    onReset={resetClimber}
                    coachAdvice={coachAdvice}
                    infiniteStamina={infiniteStamina}
                    toggleInfiniteStamina={() => setInfiniteStamina(!infiniteStamina)}
                    realismMode={realismMode}
                    toggleRealismMode={() => setRealismMode(!realismMode)}
                    isSlipping={isSlipping}
                    wallAngle={level.angle || 0}
                    height={level.height || 100}
                />
             ) : (
                <div className="flex flex-col gap-4 text-center items-center justify-center h-full text-stone-500">
                    <div className="text-4xl">🛠️</div>
                    <p className="text-sm">Editor Mode Active</p>
                    <p className="text-xs">Select tools from the floating panel on the right to build your route.</p>
                </div>
             )}
             
             {/* Instructions Footer in Sidebar */}
             <div className="mt-auto pt-6 border-t border-stone-800 text-xs text-stone-500 leading-relaxed">
                <p className="font-bold text-stone-400 mb-1">Controls:</p>
                <ul className="list-disc pl-4 space-y-1">
                    <li>Drag <span className="text-blue-400">hands</span> and <span className="text-yellow-500">feet</span></li>
                    <li>Drag <span className="text-white">body</span> to swing/dyno</li>
                    <li>Press <span className="text-yellow-400">'C'</span> to Chalk Up</li>
                    <li className={realismMode ? "text-red-400 font-bold" : ""}>{realismMode ? "Watch your pull angles!" : "Have fun!"}</li>
                </ul>
             </div>
        </aside>

        {/* Main Wall Area */}
        <main className="flex-1 relative p-6 flex justify-center items-center bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] overflow-hidden">
            <div className="w-full max-w-3xl h-full max-h-[95vh] relative flex flex-col justify-center">
                <BoulderingWall 
                    level={level}
                    climberState={climber}
                    isEditorMode={mode === 'editor'}
                    onHoldClick={handleEditorHoldClick}
                    onPlaceLimb={handlePlaceLimb}
                    onCanvasClick={handleEditorCanvasClick}
                    onUpdateCOM={handleUpdateCOM}
                    onDragStart={() => setIsUserDragging(true)}
                    onDragEnd={() => setIsUserDragging(false)}
                    realismMode={realismMode}
                />

                {mode === 'editor' && (
                    <EditorControls 
                        currentTool={editorTool}
                        setCurrentTool={setEditorTool}
                        currentColor={editorColor}
                        setCurrentColor={setEditorColor}
                        onGenerateLevel={handleGenerateLevel}
                        onUploadImage={handleImageUpload}
                        isGenerating={isGenerating}
                        onClear={() => setLevel(l => ({ ...l, holds: [] }))}
                        onSave={() => alert("Level saved (mock)!")}
                        angle={level.angle || 0}
                        onUpdateAngle={handleUpdateAngle}
                    />
                )}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;