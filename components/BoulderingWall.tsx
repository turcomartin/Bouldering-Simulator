
import React, { useState, useRef } from 'react';
import { Hold, ClimberState, Limb, Level, Point, AttachedLimb } from '../types';
import { HOLD_COLORS, ANATOMY, MAX_REACH } from '../constants';
import ClimberAvatar from './ClimberAvatar';
import { isReachable, constrainBodyPosition, calculateDistance, isAttached } from '../utils/gameUtils';

interface BoulderingWallProps {
  level: Level;
  climberState: ClimberState;
  isEditorMode: boolean;
  onHoldClick: (hold: Hold) => void;
  onPlaceLimb: (target: AttachedLimb | Point | null, limb: Limb) => void;
  onCanvasClick: (x: number, y: number) => void;
  onUpdateCOM: (newCOM: Point) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  realismMode: boolean;
}

const AngleIndicator = ({ angle }: { angle: number }) => {
    const length = 28;
    const startX = 15;
    const startY = 40;
    const rad = (angle * Math.PI) / 180;
    const endX = startX + length * Math.sin(rad);
    const endY = startY - length * Math.cos(rad);

    return (
        <div className="absolute bottom-4 right-4 w-20 h-24 bg-slate-900/90 backdrop-blur rounded-lg border border-slate-700 shadow-xl z-20 flex flex-col items-center justify-center pointer-events-none select-none transition-all duration-300 hover:scale-105 hover:bg-slate-800">
            <div className="text-[9px] text-slate-500 font-bold tracking-widest uppercase mb-1">Side View</div>
            <svg width="50" height="50" viewBox="0 0 50 50" className="overflow-visible">
                <line x1="0" y1="40" x2="50" y2="40" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
                <line x1={startX} y1="40" x2={startX} y2="5" stroke="#475569" strokeWidth="1" strokeDasharray="2,2" />
                <path d={`M ${startX} 40 L ${endX} ${endY}`} stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                {angle > 0 && (
                    <path 
                        d={`M ${startX} 30 A 10 10 0 0 1 ${startX + 10 * Math.sin(rad)} ${40 - 10 * Math.cos(rad)}`}
                        fill="none" 
                        stroke="#fbbf24" 
                        strokeWidth="1"
                        opacity="0.5"
                    />
                )}
                <circle cx={startX + (length/2) * Math.sin(rad)} cy={40 - (length/2) * Math.cos(rad)} r="2.5" fill="#38bdf8" />
            </svg>
            <div className="text-xs font-mono font-bold text-yellow-500 mt-1">{angle}°</div>
        </div>
    );
};

const BoulderingWall: React.FC<BoulderingWallProps> = ({
  level,
  climberState,
  isEditorMode,
  onHoldClick,
  onPlaceLimb,
  onCanvasClick,
  onUpdateCOM,
  onDragStart,
  onDragEnd,
  realismMode
}) => {
  const [dragTarget, setDragTarget] = useState<'COM' | Limb | null>(null);
  const [draggedLimbPos, setDraggedLimbPos] = useState<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({x: 0, y: 0});
  const svgRef = useRef<SVGSVGElement>(null);

  const wallHeight = level.height || 100;
  
  // Camera Logic
  // Center climber on screen vertically (offset 60% down)
  const viewHeight = 100;
  let camY = climberState.centerOfMass.y - 60;
  // Clamp Camera - Allow seeing the floor (wallHeight) at bottom
  camY = Math.max(0, Math.min(camY, wallHeight - viewHeight + 5)); 
  
  const viewBox = `0 ${camY} 100 ${viewHeight}`;

  const getSVGPoint = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    
    // Convert screen px to SVG coords accounting for viewBox
    const pxX = clientX - rect.left;
    const pxY = clientY - rect.top;
    
    // Scale factors
    const scaleX = 100 / rect.width;
    const scaleY = viewHeight / rect.height;
    
    return {
      x: pxX * scaleX,
      y: (pxY * scaleY) + camY // Add camera offset
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditorMode) {
        const p = getSVGPoint(e.clientX, e.clientY);
        onCanvasClick(p.x, p.y);
        return;
    }
  };

  const handleBodyDragStart = (e: React.MouseEvent) => {
    if (isEditorMode || climberState.status === 'topped' || climberState.status === 'falling') return;
    
    // Check constraints to prevent "Flying"
    const attachedCount = Object.values(climberState.limbs).filter(isAttached).length;
    const groundY = (level.height || 100) - 14;
    const isGrounded = climberState.centerOfMass.y >= groundY - 2;

    // If we are in mid-air and not holding onto anything, we cannot drag the body
    if (attachedCount === 0 && !isGrounded) return;

    const p = getSVGPoint(e.clientX, e.clientY);
    const com = climberState.centerOfMass;
    
    // Calculate offset so body doesn't snap to pointer center
    setDragOffset({ x: com.x - p.x, y: com.y - p.y });
    setDragTarget('COM');
    onDragStart(); 
  };

  const handleLimbDragStart = (limb: Limb) => {
      if (isEditorMode) return;
      if (climberState.status === 'topped') return; 
      setDragTarget(limb);
      onDragStart(); 
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!dragTarget) return;

      const p = getSVGPoint(e.clientX, e.clientY);

      if (dragTarget === 'COM') {
          // --- ANTI-GRAVITY / FLYING PREVENTION ---
          const attachedCount = Object.values(climberState.limbs).filter(isAttached).length;
          const floorY = level.height || 100;
          
          if (attachedCount === 0) {
              // If we are significantly above ground, we shouldn't be able to drag/fly.
              // Cancel drag and let physics take over (falling).
              if (climberState.centerOfMass.y < floorY - 16) {
                  setDragTarget(null);
                  onDragEnd();
                  return;
              }
              
              // If on ground, allow Walking (X-axis) but prevent Fly (Y-axis lift) and Burrow (Y-axis drop)
              // We constrain the Y to standing height (floorY - 14)
              const standingHeight = floorY - 14;
              
              let walkCOM = { 
                  x: p.x + dragOffset.x, 
                  y: standingHeight 
              };

              // Still apply body constraints so we don't detach feet by "walking" away from them
              // Note: Standing feet are Points (not AttachedLimb), but constraint function handles Points too.
              walkCOM = constrainBodyPosition(walkCOM, climberState.limbs, level.holds);
              
              // Hard clamp Y again in case constraint tried to lift us or push us down
              walkCOM.y = standingHeight;
              
              onUpdateCOM(walkCOM);
              return;
          }

          // Apply offset to keep body relative to mouse
          const com = { x: p.x + dragOffset.x, y: p.y + dragOffset.y };
          
          Object.entries(climberState.limbs).forEach(([limbName, val]) => {
              if (isAttached(val)) {
                  const limb = limbName as Limb;
                  let anchorOffset = { x: 0, y: 0 };
                  let maxLen = 0;
                  
                  if (limb === 'leftHand') { anchorOffset = { x: -ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85 }; maxLen = MAX_REACH.hand; }
                  else if (limb === 'rightHand') { anchorOffset = { x: ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85 }; maxLen = MAX_REACH.hand; }
                  else if (limb === 'leftFoot') { anchorOffset = { x: -ANATOMY.hipWidth/2, y: 1.5 }; maxLen = MAX_REACH.foot; }
                  else if (limb === 'rightFoot') { anchorOffset = { x: ANATOMY.hipWidth/2, y: 1.5 }; maxLen = MAX_REACH.foot; }

                  const anchorPos = { x: com.x + anchorOffset.x, y: com.y + anchorOffset.y };
                  const dist = calculateDistance(anchorPos, { x: val.x, y: val.y });

                  // AUTO-DETACH: If pulling body away from limb, break the hold
                  if (dist > maxLen * 1.05) {
                      onPlaceLimb(null, limb);
                  }
              }
          });

          // Even when dragging, we constrain to limb max reach to prevent impossible stretches
          // But we use the dragOffset-adjusted COM as the target
          const constrainedCOM = constrainBodyPosition(com, climberState.limbs, level.holds);
          onUpdateCOM(constrainedCOM);
      } else {
          // Dragging a Limb
          setDraggedLimbPos(p);

          // --- BODY PULL LOGIC ---
          // When dragging a limb far enough, it should pull the body
          const com = climberState.centerOfMass;
          let anchorOffset = { x: 0, y: 0 };
          let maxLen = 0;

          if (dragTarget === 'leftHand') { anchorOffset = { x: -ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85 }; maxLen = MAX_REACH.hand; }
          else if (dragTarget === 'rightHand') { anchorOffset = { x: ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85 }; maxLen = MAX_REACH.hand; }
          else if (dragTarget === 'leftFoot') { anchorOffset = { x: -ANATOMY.hipWidth/2, y: 1.5 }; maxLen = MAX_REACH.foot; }
          else if (dragTarget === 'rightFoot') { anchorOffset = { x: ANATOMY.hipWidth/2, y: 1.5 }; maxLen = MAX_REACH.foot; }

          const anchorPos = { x: com.x + anchorOffset.x, y: com.y + anchorOffset.y };
          const dist = calculateDistance(anchorPos, p);
          
          // If dragged beyond 90% of max reach, start pulling the body
          const PULL_THRESHOLD = 0.9;
          const pullLimit = maxLen * PULL_THRESHOLD;

          if (dist > pullLimit) {
              // Calculate vector from Limb Mouse Pos -> Body Anchor
              const dx = anchorPos.x - p.x;
              const dy = anchorPos.y - p.y;
              
              const currentDist = Math.sqrt(dx*dx + dy*dy);
              const ratio = pullLimit / currentDist;
              
              // New position for the Body Anchor to maintain pullLimit distance
              const newAnchorX = p.x + dx * ratio;
              const newAnchorY = p.y + dy * ratio;
              
              // Reverse calculate new COM based on new Anchor pos
              let newCOM = {
                  x: newAnchorX - anchorOffset.x,
                  y: newAnchorY - anchorOffset.y
              };

              // CRITICAL FIX: When dragging a limb, we must update the limb position used in constraint calculation
              // Otherwise, constrainBodyPosition will use the OLD limb position (attached to previous hold/ground)
              // and pull the body back, effectively freezing it.
              const draggingLimbsOverride = { ...climberState.limbs };
              draggingLimbsOverride[dragTarget] = { x: p.x, y: p.y }; // Use mouse pos as virtual limb pos

              // Ensure this new body position doesn't violate OTHER attached limbs
              newCOM = constrainBodyPosition(newCOM, draggingLimbsOverride, level.holds);
              
              onUpdateCOM(newCOM);
          }
      }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      if (dragTarget && dragTarget !== 'COM') {
          const p = getSVGPoint(e.clientX, e.clientY);
          
          const closestHold = level.holds.find(h => calculateDistance(p, {x: h.x, y: h.y}) < 6);
          
          const com = climberState.centerOfMass;
          let origin = com;
          let maxLen = 0;
          
           if (dragTarget.includes('Hand')) {
              origin = { 
                  x: dragTarget === 'leftHand' ? com.x - ANATOMY.shoulderWidth/2 : com.x + ANATOMY.shoulderWidth/2, 
                  y: com.y - ANATOMY.torsoHeight * 0.85
              };
              maxLen = MAX_REACH.hand;
          } else {
              origin = { 
                  x: dragTarget === 'leftFoot' ? com.x - ANATOMY.hipWidth/2 : com.x + ANATOMY.hipWidth/2, 
                  y: com.y + 1.5
              };
              maxLen = MAX_REACH.foot;
          }

          if (closestHold) {
              const holdRadius = closestHold.type === 'volume' ? 5 : closestHold.type === 'jug' ? 3 : 2;
              
              const dx = p.x - closestHold.x;
              const dy = p.y - closestHold.y;
              const dist = Math.sqrt(dx*dx + dy*dy);
              
              let finalX = p.x;
              let finalY = p.y;

              if (dist > holdRadius) {
                  const ratio = holdRadius / dist;
                  finalX = closestHold.x + dx * ratio;
                  finalY = closestHold.y + dy * ratio;
              }

              const targetPoint = { x: finalX, y: finalY };

              if (isReachable(origin, targetPoint, maxLen * 1.2)) {
                  onPlaceLimb({ holdId: closestHold.id, x: targetPoint.x, y: targetPoint.y }, dragTarget);
              } else {
                   onPlaceLimb(null, dragTarget);
              }
          } else {
              if (dragTarget.includes('Foot') && isReachable(origin, {x: p.x, y: p.y}, maxLen)) {
                  onPlaceLimb({x: p.x, y: p.y}, dragTarget);
              } else {
                  onPlaceLimb(null, dragTarget);
              }
          }
      }

      setDragTarget(null);
      setDraggedLimbPos(null);
      setDragOffset({x: 0, y: 0});
      onDragEnd(); 
  };

  const HoldShape = ({ hold }: { hold: Hold }) => {
      // Use hold-specific color or fallback to type default
      const color = hold.color || HOLD_COLORS[hold.type];
      const size = hold.type === 'volume' ? 8 : hold.type === 'jug' ? 4 : 2.5;
      
      if (hold.type === 'volume') {
          const p1 = { x: 0, y: -7 }; 
          const p2 = { x: 7, y: 6 }; 
          const p3 = { x: -7, y: 6 }; 
          const apex = { x: 0, y: 1 };

          return (
             <g filter="url(#holdShadow)">
                 <polygon points={`${p3.x},${p3.y} ${p1.x},${p1.y} ${apex.x},${apex.y}`} fill={color} opacity="0.8" stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
                 <polygon points={`${p2.x},${p2.y} ${p1.x},${p1.y} ${apex.x},${apex.y}`} fill={color} opacity="0.6" stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
                 <polygon points={`${p3.x},${p3.y} ${p2.x},${p2.y} ${apex.x},${apex.y}`} fill={color} opacity="1.0" stroke="rgba(0,0,0,0.2)" strokeWidth="0.5" />
             </g>
          );
      }

      return (
          <g filter="url(#holdShadow)">
            {hold.type === 'crimp' && <rect x="-3" y="-1.5" width="6" height="3" fill={color} rx="0.5" />}
            {hold.type === 'jug' && <path d="M -3 0 Q 0 -4 3 0 Q 0 3 -3 0" fill={color} stroke="rgba(0,0,0,0.2)" strokeWidth="0.5"/>}
            {hold.type === 'sloper' && <ellipse rx="5" ry="3" fill={color} />}
            {hold.type === 'pocket' && (
                <g>
                    <circle r="3" fill={color} />
                    <circle r="1.2" fill="rgba(0,0,0,0.4)" cy="-0.5"/>
                </g>
            )}
            {(hold.type === 'start' || hold.type === 'finish') && (
                 <rect x="-4" y="-4" width="8" height="8" fill={color} rx="2" stroke="white" strokeWidth="1"/>
            )}
            <circle cx="-1" cy="-1" r={size/3} fill="white" opacity="0.2" filter="url(#blur)" />
          </g>
      );
  };
  
  const currentAngle = level.angle || 0;

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl border border-stone-600 bg-slate-800 group">
      <AngleIndicator angle={currentAngle} />

      {/* Background with Perspective Effect */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-all duration-700 ease-in-out"
        style={{
            transform: `perspective(800px) rotateX(${-currentAngle * 0.4}deg) scale(${1 + currentAngle * 0.002})`,
            transformOrigin: 'bottom center',
            // Simple tiling for tall walls
            backgroundRepeat: 'repeat',
            backgroundPosition: `0px -${camY}px` 
        }}
      >
        <div 
            className="absolute inset-0 opacity-40"
            style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.5'/%3E%3C/svg%3E")`,
                backgroundSize: '200px'
            }}
        />
        <div 
             className="absolute inset-0 bg-gradient-to-b from-slate-700/10 to-slate-900/10 transition-opacity duration-700" 
             style={{ opacity: (currentAngle / 90) * 0.9 }} 
        />
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-slate-800/10 to-slate-900/10" />
      
      {!isEditorMode && (
         <div 
            className="absolute z-0 pointer-events-none rounded-full blur-3xl transition-all duration-300"
            style={{
                width: '60%',
                height: '60%',
                // Need to map COM to pixel space relative to viewport for the glow, but simplest is to just use % relative to wall
                display: wallHeight > 100 ? 'none' : 'block',
                left: `${climberState.centerOfMass.x}%`,
                top: `${climberState.centerOfMass.y}%`,
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0) 70%)'
            }}
         />
      )}

      <svg
        ref={svgRef}
        className={`relative z-10 w-full h-full ${dragTarget === 'COM' ? 'cursor-grabbing' : 'cursor-default'}`}
        viewBox={viewBox}
        preserveAspectRatio="none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <filter id="holdShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0.5" dy="1" stdDeviation="0.5" floodColor="rgba(0,0,0,0.5)" />
          </filter>
          <filter id="blur">
            <feGaussianBlur stdDeviation="0.5" />
          </filter>
        </defs>

        {/* Crash Pad Floor */}
        <g>
             {/* Main Mat */}
            <rect x="-10" y={wallHeight} width="120" height="20" fill="#1c1917" />
            <rect x="-10" y={wallHeight} width="120" height="4" fill="#d97706" /> {/* Orange Mat Top */}
            <line x1="-10" y1={wallHeight} x2="110" y2={wallHeight} stroke="#78350f" strokeWidth="0.5" />
            
            {/* Texture/Logo maybe? */}
            <text x="50" y={wallHeight + 8} textAnchor="middle" fontSize="3" fill="#44403c" fontWeight="bold" letterSpacing="0.2em">CRASH PAD</text>
        </g>

        {level.holds.map((hold) => (
          <g
            key={hold.id}
            transform={`translate(${hold.x}, ${hold.y}) rotate(${hold.rotation})`}
            onClick={(e) => isEditorMode ? onHoldClick(hold) : null}
            className={`${isEditorMode ? 'cursor-pointer' : ''}`}
          >
            <g className="transition-transform duration-200 hover:scale-110">
                <HoldShape hold={hold} />
            </g>
          </g>
        ))}

        {!isEditorMode && (
            <ClimberAvatar 
                state={climberState} 
                holds={level.holds} 
                onStartDragLimb={handleLimbDragStart}
                onStartDragBody={handleBodyDragStart}
                draggingLimb={typeof dragTarget === 'string' && dragTarget !== 'COM' ? dragTarget : null}
                dragPos={draggedLimbPos}
                realismMode={realismMode}
            />
        )}

      </svg>
      
    </div>
  );
};

export default BoulderingWall;
