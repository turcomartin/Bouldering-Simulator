
import React from 'react';
import { ClimberState, Hold, Limb, Point } from '../types';
import { solveIK } from '../utils/gameUtils';
import { ANATOMY, MAX_REACH } from '../constants';

const CONFIG = {
  colors: {
    skeleton: '#a8a29e', 
    joint: '#57534e',    
    leftLimb: '#38bdf8', 
    rightLimb: '#38bdf8', 
    foot: '#fbbf24',     
    body: '#ffffff',     
  },
  sizes: {
    joint: 1.2,
    limbDot: 2.0, // Standard size for simple mode
    bodyDot: 2.2,
    limbHitbox: 4.5, 
    bodyHitbox: 6.0, 
  }
};

interface ControlHandleProps {
  x: number;
  y: number;
  type: 'hand' | 'foot' | 'body';
  rotation?: number; // Rotation in degrees
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  color?: string;
  zIndex?: number;
  realismMode: boolean;
}

const ControlHandle: React.FC<ControlHandleProps> = ({ x, y, type, rotation = 0, isDragging, onMouseDown, color, zIndex = 0, realismMode }) => {
  const hitboxR = type === 'body' ? CONFIG.sizes.bodyHitbox : CONFIG.sizes.limbHitbox;
  const visualR = type === 'body' ? CONFIG.sizes.bodyDot : CONFIG.sizes.limbDot;
  const fillColor = color || CONFIG.colors.body;
  
  // High transparency for body to see holds behind it
  const opacity = type === 'body' ? 0.3 : 0.8;
  const strokeOpacity = type === 'body' ? 0.5 : 1.0;

  return (
    <g 
      transform={`translate(${x}, ${y})`} 
      className={`cursor-grab active:cursor-grabbing group`}
      onMouseDown={(e) => {
        e.stopPropagation(); 
        onMouseDown(e);
      }}
      role="button"
      style={{ zIndex }}
    >
      <circle r={hitboxR} fill="transparent" className="hover:stroke-white/10 hover:stroke-1" />
      
      <g 
         className={`transition-all duration-200 ease-out ${isDragging ? 'scale-125' : 'group-hover:scale-125'}`}
         transform={realismMode ? `rotate(${rotation})` : undefined}
      >
        <circle r={visualR + 1} fill="black" opacity="0.2" filter="blur(1px)" />
        
        {!realismMode ? (
            // Simple Mode: Just Circles
            <circle 
                r={visualR} 
                fill={fillColor} 
                fillOpacity={opacity}
                stroke="white" 
                strokeWidth={1} 
                strokeOpacity={strokeOpacity}
                className="shadow-sm"
            />
        ) : (
            // Realism Mode: Anatomical Shapes
            <>
                {type === 'body' && (
                     <circle 
                        r={CONFIG.sizes.bodyDot} 
                        fill={fillColor} 
                        fillOpacity={opacity}
                        stroke="white" 
                        strokeWidth={1} 
                        strokeOpacity={strokeOpacity}
                        className="shadow-sm"
                     />
                )}

                {type === 'hand' && (
                     <g transform="translate(0,0)">
                         <rect x="-2" y="-3" width="4" height="5" rx="1.5" fill={fillColor} fillOpacity={opacity} stroke="white" strokeWidth="0.5"/>
                         <circle cx="0" cy="2" r="1.5" fill={CONFIG.colors.joint} />
                     </g>
                )}

                {type === 'foot' && (
                    <g transform="translate(0,0)">
                        <ellipse cx="0" cy="1" rx="2" ry="3.5" fill={fillColor} fillOpacity={opacity} stroke="white" strokeWidth="0.5" />
                        <circle cx="0" cy="-2" r="1.5" fill={CONFIG.colors.joint} />
                    </g>
                )}
            </>
        )}
        
        {type === 'body' && <circle r={0.8} fill={CONFIG.colors.joint} opacity={0.8} />}
      </g>
    </g>
  );
};

interface ClimberAvatarProps {
  state: ClimberState;
  holds: Hold[];
  onStartDragLimb?: (limb: Limb) => void;
  onStartDragBody?: (e: React.MouseEvent) => void;
  draggingLimb?: Limb | null;
  dragPos?: Point | null;
  realismMode: boolean;
}

const ClimberAvatar: React.FC<ClimberAvatarProps> = ({ 
    state, 
    holds, 
    onStartDragLimb, 
    onStartDragBody,
    draggingLimb, 
    dragPos,
    realismMode
}) => {
  const com = state.centerOfMass;

  // --- Logic: Position Resolution ---
  const resolveTarget = (limb: Limb, anchor: Point, maxR: number): Point => {
    // 1. Dragging
    if (draggingLimb === limb && dragPos) return dragPos;

    const val = state.limbs[limb];
    
    // 2. Attached or Flagging (Both have x,y)
    if (val) {
        return { x: val.x, y: val.y };
    }

    // 3. Falling / Hanging (Default)
    const defaults: Record<Limb, Point> = {
        leftHand: { x: com.x - ANATOMY.shoulderWidth, y: com.y - ANATOMY.torsoHeight * 0.8 },
        rightHand: { x: com.x + ANATOMY.shoulderWidth, y: com.y - ANATOMY.torsoHeight * 0.8 },
        leftFoot: { x: com.x - ANATOMY.hipWidth, y: com.y + ANATOMY.legUpper + ANATOMY.legLower * 0.5 },
        rightFoot: { x: com.x + ANATOMY.hipWidth, y: com.y + ANATOMY.legUpper + ANATOMY.legLower * 0.5 },
    };
    
    const target = defaults[limb];
    const dx = target.x - anchor.x;
    const dy = target.y - anchor.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    if (dist > maxR) {
        const ratio = maxR / dist;
        return { x: anchor.x + dx * ratio, y: anchor.y + dy * ratio };
    }
    return target;
  };

  // Helper: Angle between two points (in degrees) + 90 offset for visual alignment
  const getLimbAngle = (origin: Point, end: Point, offset: number = 0): number => {
      const dy = end.y - origin.y;
      const dx = end.x - origin.x;
      let theta = Math.atan2(dy, dx) * (180 / Math.PI); 
      return theta + offset;
  };

  // Body Anchors
  const neckBase = { x: com.x, y: com.y - ANATOMY.torsoHeight * 0.85 };
  const hipCenter = { x: com.x, y: com.y + 1.5 };
  
  const shoulderL = { x: neckBase.x - ANATOMY.shoulderWidth / 2, y: neckBase.y };
  const shoulderR = { x: neckBase.x + ANATOMY.shoulderWidth / 2, y: neckBase.y };
  const hipL = { x: hipCenter.x - ANATOMY.hipWidth / 2, y: hipCenter.y };
  const hipR = { x: hipCenter.x + ANATOMY.hipWidth / 2, y: hipCenter.y };

  // Targets
  const lhTarget = resolveTarget('leftHand', shoulderL, MAX_REACH.hand);
  const rhTarget = resolveTarget('rightHand', shoulderR, MAX_REACH.hand);
  const lfTarget = resolveTarget('leftFoot', hipL, MAX_REACH.foot);
  const rfTarget = resolveTarget('rightFoot', hipR, MAX_REACH.foot);

  // IK Joints
  const elbowL = solveIK(shoulderL, lhTarget, ANATOMY.armUpper, ANATOMY.armLower, false);
  const elbowR = solveIK(shoulderR, rhTarget, ANATOMY.armUpper, ANATOMY.armLower, true);
  const kneeL = solveIK(hipL, lfTarget, ANATOMY.legUpper, ANATOMY.legLower, true);
  const kneeR = solveIK(hipR, rfTarget, ANATOMY.legUpper, ANATOMY.legLower, false);

  // Calculate rotations for wrists/ankles
  // Hands align with forearm vector. -90 offset because 0deg is right, but hands hang down visually.
  const lhRot = getLimbAngle(elbowL, lhTarget, 90); 
  const rhRot = getLimbAngle(elbowR, rhTarget, 90);
  
  // Feet align with shin vector. 
  const lfRot = getLimbAngle(kneeL, lfTarget, 90);
  const rfRot = getLimbAngle(kneeR, rfTarget, 90);

  const Bone = ({ p1, p2, w = 2 }: { p1: Point, p2: Point, w?: number }) => (
    <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={CONFIG.colors.skeleton} strokeWidth={w} strokeLinecap="round" opacity="0.4" />
  );

  const Joint = ({ p }: { p: Point }) => (
    <circle cx={p.x} cy={p.y} r={CONFIG.sizes.joint} fill={CONFIG.colors.joint} opacity="0.5" />
  );

  const TensionLine = ({ start, end, active }: { start: Point, end: Point, active: boolean }) => {
      if (!active) return null;
      return <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#ef4444" strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />;
  };

  return (
    <g>
      {/* Skeleton (Torso Area) - Reduced Opacity to see holds through body */}
      <path 
        d={`M ${shoulderL.x} ${shoulderL.y} L ${shoulderR.x} ${shoulderR.y} L ${hipR.x} ${hipR.y} L ${hipL.x} ${hipL.y} Z`} 
        fill={CONFIG.colors.joint} 
        opacity="0.2" 
      />
      <TensionLine start={shoulderL} end={lhTarget} active={draggingLimb === 'leftHand'} />
      <TensionLine start={shoulderR} end={rhTarget} active={draggingLimb === 'rightHand'} />
      <TensionLine start={hipL} end={lfTarget} active={draggingLimb === 'leftFoot'} />
      <TensionLine start={hipR} end={rfTarget} active={draggingLimb === 'rightFoot'} />

      <Bone p1={hipL} p2={kneeL} w={2.5} />
      <Bone p1={kneeL} p2={lfTarget} w={2} />
      <Bone p1={hipR} p2={kneeR} w={2.5} />
      <Bone p1={kneeR} p2={rfTarget} w={2} />
      <Bone p1={shoulderL} p2={elbowL} w={2} />
      <Bone p1={elbowL} p2={lhTarget} w={1.5} />
      <Bone p1={shoulderR} p2={elbowR} w={2} />
      <Bone p1={elbowR} p2={rhTarget} w={1.5} />

      <Joint p={shoulderL} />
      <Joint p={shoulderR} />
      <Joint p={elbowL} />
      <Joint p={elbowR} />
      <Joint p={hipL} />
      <Joint p={hipR} />
      <Joint p={kneeL} />
      <Joint p={kneeR} />
      
      <circle cx={neckBase.x} cy={neckBase.y - 2.5} r={2} fill={CONFIG.colors.skeleton} opacity="0.3" />

      {/* Interactive Controls - No overlap displacement, raw coordinates */}
      <ControlHandle 
        x={com.x} 
        y={com.y} 
        type="body" 
        isDragging={false} 
        onMouseDown={(e) => onStartDragBody?.(e)} 
        realismMode={realismMode}
      />
      
      {/* Sort logic for Z-index: drag active goes last (top) */}
      {[
          { id: 'leftFoot', x: lfTarget.x, y: lfTarget.y, type: 'foot', c: CONFIG.colors.foot, r: lfRot },
          { id: 'rightFoot', x: rfTarget.x, y: rfTarget.y, type: 'foot', c: CONFIG.colors.foot, r: rfRot },
          { id: 'leftHand', x: lhTarget.x, y: lhTarget.y, type: 'hand', c: CONFIG.colors.leftLimb, r: lhRot },
          { id: 'rightHand', x: rhTarget.x, y: rhTarget.y, type: 'hand', c: CONFIG.colors.rightLimb, r: rhRot },
      ].sort((a, b) => (draggingLimb === a.id ? 1 : draggingLimb === b.id ? -1 : 0)).map(l => (
          <ControlHandle 
            key={l.id}
            x={l.x} y={l.y} 
            type={l.type as any} 
            color={l.c} 
            rotation={l.r}
            isDragging={draggingLimb === l.id} 
            onMouseDown={() => onStartDragLimb?.(l.id as Limb)} 
            realismMode={realismMode}
          />
      ))}
    </g>
  );
};

export default ClimberAvatar;
