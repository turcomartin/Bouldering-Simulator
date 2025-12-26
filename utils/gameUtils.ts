
import { ClimberState, Hold, Point, Limb, AttachedLimb, HoldType } from '../types';
import { SIMULATION_CONFIG, ANATOMY, MAX_REACH, HOLD_FRICTION } from '../constants';

// Type guard for AttachedLimb (On a hold)
export const isAttached = (val: any): val is AttachedLimb => {
  return val && typeof val === 'object' && 'holdId' in val;
};

// Type guard for Smearing/Flagging (Point but NOT AttachedLimb)
export const isSmearing = (val: any): val is Point => {
  return val && typeof val === 'object' && !('holdId' in val) && 'x' in val;
};

export const calculateDistance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const isReachable = (
  shoulderPoint: Point, 
  target: Point,
  maxReach: number
): boolean => {
  const dist = calculateDistance(shoulderPoint, target);
  return dist <= maxReach;
};

// Helper to get angle in degrees (0-360) where 0 is Right, 90 is Down, 180 is Left, 270 is Up
const getAngle = (p1: Point, p2: Point): number => {
    const dy = p2.y - p1.y;
    const dx = p2.x - p1.x;
    let theta = Math.atan2(dy, dx); // range (-PI, PI)
    theta *= 180 / Math.PI; // rads to degs, range (-180, 180)
    if (theta < 0) theta = 360 + theta; // range (0, 360)
    return theta;
}

// Helper for angular difference
const getAngleDiff = (a: number, b: number): number => {
    let diff = Math.abs(a - b);
    if (diff > 180) diff = 360 - diff;
    return diff;
}

interface DrainResult {
    core: number;
    leftPump: number;
    rightPump: number;
}

export const calculateTickDrain = (
  state: ClimberState,
  holds: Hold[],
  holdDrains: Record<string, number>,
  wallAngle: number = 0,
  realismMode: boolean = false
): DrainResult => {
  let coreDrain = 0.005; // Base metabolism
  let leftPumpDelta = -0.02; // Recovery by default
  let rightPumpDelta = -0.02;

  // --- Core Energy Logic ---
  const activeLimbsCount = Object.values(state.limbs).filter(l => l !== null).length;
  if (activeLimbsCount === 0) return { core: 0, leftPump: -0.1, rightPump: -0.1 };

  const loadFactor = SIMULATION_CONFIG.climberWeightKg / Math.max(1, activeLimbsCount); 
  const instabilityCost = (state.balance / 100) * (realismMode ? 0.05 : 0.03); 

  // Angle Factor: Steeper = More Core Drain
  // Revised to be much more punishing on overhangs to account for "Muscle Activation" holding climber in place
  const anglePenalty = wallAngle > 0 ? (wallAngle / 45) * 0.06 : 0; 
  
  coreDrain += anglePenalty;
  coreDrain += instabilityCost;

  // Feet cut (Campusing) logic
  const feetAttached = [state.limbs.leftFoot, state.limbs.rightFoot].filter(l => l !== null).length;
  if (feetAttached === 0 && wallAngle > 0) {
      coreDrain += realismMode ? 0.25 : 0.15; // Massive drain for campusing overhangs
  }

  // --- Arm Pump Logic ---
  const calculateArmPump = (limb: Limb, currentPump: number): number => {
      const val = state.limbs[limb];
      if (!isAttached(val)) return -0.05; // Rest

      const hold = holds.find(h => h.id === val.holdId);
      if (!hold) return 0;

      // Base hold difficulty
      let difficulty = holdDrains[hold.type] || 0.05;

      // Directional Pull Punishment in Realism Mode
      if (realismMode) {
          const handPos = { x: val.x, y: val.y };
          const bodyPos = { x: state.centerOfMass.x, y: state.centerOfMass.y - 8 }; // Approximate shoulder
          const pullAngle = getAngle(handPos, bodyPos);
          
          let idealAngle = 90; // Default down
          if (hold.type === 'crimp' || hold.type === 'sloper') {
             idealAngle = (hold.rotation + 90) % 360; // Perpendicular to edge
          }

          const diff = getAngleDiff(pullAngle, idealAngle);
          if (diff > 45) {
              difficulty *= 1.5 + (diff / 45); // Pump increases drastically with bad angles
          }
      }

      // Jugs and Start/Finish allow recovery if stability is good
      if ((hold.type === 'jug' || hold.type === 'start' || hold.type === 'finish') && state.balance < 40 && wallAngle < 30) {
          return -0.03; // Shake out
      }

      // Overhang Multiplier for arms
      const overhangMult = wallAngle > 0 ? 1 + (wallAngle / 30) : 1.0;
      
      // If feet are cut, arms take 100% load
      const footSupportMult = feetAttached === 0 ? 2.5 : 1.0;

      return difficulty * overhangMult * footSupportMult * 0.8;
  };

  leftPumpDelta = calculateArmPump('leftHand', state.armPump.left);
  rightPumpDelta = calculateArmPump('rightHand', state.armPump.right);

  return {
      core: coreDrain,
      leftPump: leftPumpDelta,
      rightPump: rightPumpDelta
  };
};

export const getFrictionPenalty = (
    state: ClimberState, 
    holds: Hold[], 
    wallAngle: number = 0, 
    realismMode: boolean = false
): number => {
    let totalPenalty = 0;

    // Chalk Factor: Low chalk = High slip risk
    const chalkPenalty = Math.max(0, (30 - state.chalk)) * (realismMode ? 0.8 : 0.5);
    totalPenalty += chalkPenalty;

    const feet = [state.limbs.leftFoot, state.limbs.rightFoot].filter(l => l !== null);
    const hands = [state.limbs.leftHand, state.limbs.rightHand].filter(l => l !== null);

    // Calculate Normal Force based on Angle
    const rad = wallAngle * (Math.PI / 180);
    const normalForceRatio = Math.cos(rad); // 1.0 at 0deg, 0.7 at 45deg, 0.0 at 90deg
    
    // 1. Analyze Feet Support
    if (feet.length === 0) {
        // No feet
        if (hands.length > 0) {
            // Campusing
            // Reduce base penalty for campusing to allow dynos
            const noFeetPenaltyBase = wallAngle < 0 ? 150 : 30; 
            const overhangCampusPenalty = Math.max(0, wallAngle - 10) * 0.8;
            totalPenalty += noFeetPenaltyBase + overhangCampusPenalty;
        }
    } else {
        // Check feet individually
        feet.forEach(foot => {
            if (isAttached(foot)) {
                // On Hold
                const hold = holds.find(h => h.id === foot.holdId);
                if (hold) {
                    const friction = HOLD_FRICTION[hold.type] * (wallAngle < 0 ? 1.2 : normalForceRatio);
                    if (friction < 0.3) totalPenalty += (0.3 - friction) * 50; 
                }
            } else if (isSmearing(foot)) {
                // Smearing logic 
                if (wallAngle < 0) {
                    totalPenalty += 2; 
                } else if (wallAngle <= 10) {
                    totalPenalty += 10;
                } else {
                    // Overhang smearing is bad, worse in realism
                    totalPenalty += (realismMode ? 45 : 30) + (wallAngle * 1.5);
                }
            }
        });
    }

    // 2. Hand Directionality (The Meat of the Physics Update)
    hands.forEach(hand => {
        if (!isAttached(hand)) return;
        const hold = holds.find(h => h.id === hand.holdId);
        if (!hold) return;

        // Vector from Hand to Body (Direction of Pull)
        const handPos = { x: hand.x, y: hand.y };
        // Approximate shoulder position relative to hand based on body COM
        const bodyPullPoint = { x: state.centerOfMass.x, y: state.centerOfMass.y - 10 }; 
        
        const pullAngle = getAngle(handPos, bodyPullPoint);
        
        // Determine "Good" Angles for this hold
        let idealPullAngle = 90; // Default: Downwards pull
        let tolerance = 90; // Default: Forgiving

        // If realism mode is on, tolerances are tighter and logic is stricter
        const strictness = realismMode ? 0.5 : 1.0; 

        switch (hold.type) {
            case 'jug': 
                // Jugs are good usually, but upside down jugs (underclings) need upward pull
                idealPullAngle = (hold.rotation + 90) % 360;
                tolerance = 160; // Very forgiving
                break;
                
            case 'crimp':
                // Crimps must be pulled perpendicular to their edge
                idealPullAngle = (hold.rotation + 90) % 360;
                // e.g., rotation 0 (horizontal) -> ideal 90 (down)
                // e.g., rotation 90 (vertical/sidepull) -> ideal 180 (left)
                tolerance = 60 * strictness; 
                break;
                
            case 'sloper':
                // Slopers require COM to be below the hold (Active Hang)
                idealPullAngle = (hold.rotation + 90) % 360;
                tolerance = 40 * strictness; // Very strict
                break;

            case 'pocket':
                idealPullAngle = (hold.rotation + 90) % 360;
                tolerance = 70 * strictness;
                break;
                
            case 'volume':
                // Volumes rely on friction direction
                idealPullAngle = (hold.rotation + 90) % 360;
                tolerance = 80 * strictness;
                break;

            case 'start':
            case 'finish':
                tolerance = 180;
                break;
        }

        const diff = getAngleDiff(pullAngle, idealPullAngle);
        
        if (diff > tolerance) {
            // Calculate how bad the angle is (0.0 to 1.0 scale of badness)
            const errorFactor = (diff - tolerance) / (180 - tolerance);
            
            // Penalty Multiplier based on Realism
            const penaltyMult = realismMode ? 80 : 40;
            totalPenalty += errorFactor * penaltyMult;
        }
    });

    return Math.max(0, totalPenalty);
};

export const calculateStability = (
    state: ClimberState, 
    holds: Hold[], 
    wallAngle: number = 0,
    realismMode: boolean = false
): number => {
    const activeLimbs = Object.values(state.limbs).filter(l => l !== null);
    if (activeLimbs.length === 0) return 0; 
    
    // --- Dynamic Stability Factor ---
    // If we are moving fast (Dyno/Jump), we are momentarily stable due to inertia.
    // We shouldn't penalize "Static Equilibrium" (deviation from support base) as heavily.
    const velocityMag = Math.sqrt(state.velocity.x ** 2 + state.velocity.y ** 2);
    // As velocity increases, dynamicStability factor goes from 1.0 (Static) down to ~0.2 (High speed)
    const dynamicFactor = 1 / (1 + velocityMag * 3);

    // --- 1. Base of Support ---
    const supportX = activeLimbs.reduce((sum, l) => sum + l.x, 0) / activeLimbs.length;
    
    // --- 2. System Center of Mass ---
    const BODY_WEIGHT = 0.6;
    const LIMB_WEIGHT = 0.1;
    let systemMomentX = state.centerOfMass.x * BODY_WEIGHT;
    let totalWeight = BODY_WEIGHT;

    Object.entries(state.limbs).forEach(([limbName, val]) => {
        let lx = 0;
        if (val) {
            lx = val.x;
        } else {
            lx = limbName.includes('Hand') ? state.centerOfMass.x + (limbName === 'leftHand' ? -6 : 6) : state.centerOfMass.x;
        }
        systemMomentX += lx * LIMB_WEIGHT;
        totalWeight += LIMB_WEIGHT;
    });

    const systemCOM_X = systemMomentX / totalWeight;

    // --- 3. Equilibrium & Barn Door Logic ---
    let deviation = Math.abs(systemCOM_X - supportX);
    
    // Overhang Penalty (Barn Door)
    if (wallAngle > 0) {
        const hands = [state.limbs.leftHand, state.limbs.rightHand].filter(l => l !== null);
        const feet = [state.limbs.leftFoot, state.limbs.rightFoot].filter(l => l !== null);
        
        // If only 1 hand connected on overhang
        if (hands.length === 1) {
            const hand = hands[0];
            const footSpread = feet.length > 0 
                ? Math.abs(feet[0].x - feet[feet.length-1].x) 
                : 0;
            
            const isMovingSideways = Math.abs(state.velocity.x) > 0.1;

            if (footSpread < 10 && isMovingSideways) {
                // BARN DOOR!
                deviation *= realismMode ? 4.0 : 3.0; // Penalty
            }
            
            const swingDist = Math.abs(hand.x - systemCOM_X);
            deviation += swingDist * (realismMode ? 2.0 : 1.5);
        }
    }
    
    // Slab Mechanics
    if (wallAngle < 0) {
        const feet = [state.limbs.leftFoot, state.limbs.rightFoot].filter(l => l !== null);
        if (feet.length > 0) {
            const avgFootX = feet.reduce((s, f) => s + f.x, 0) / feet.length;
            const slabDeviation = Math.abs(systemCOM_X - avgFootX);
            deviation = (deviation * 0.5) + (slabDeviation * 2.5); 
        }
    }

    // Apply Dynamic Factor to the Deviation penalty
    // When jumping, we don't care if we are "out of balance" statically
    deviation *= dynamicFactor;

    const lateralVelocity = Math.abs(state.velocity.x);
    const swingPenalty = lateralVelocity * (wallAngle > 0 ? 25.0 : 10.0);

    const frictionPenalty = getFrictionPenalty(state, holds, wallAngle, realismMode);
    
    const score = frictionPenalty + swingPenalty + (deviation * 2.5);
    
    return Math.min(100, Math.max(0, score));
};

export const constrainBodyPosition = (
    proposedCOM: Point,
    limbs: ClimberState['limbs'],
    holds: Hold[]
): Point => {
    let result = { ...proposedCOM };
    const ITERATIONS = 4; 
    
    const HAND_REACH = MAX_REACH.hand * 0.99;
    const FOOT_REACH = MAX_REACH.foot * 0.99;
    // Minimum distance required between limb anchor (shoulder/hip) and the limb end. 
    // Prevents "crunching" or "contortion" where the body overlaps the limb.
    const MIN_COMPRESSION = 3.0; 

    for (let i = 0; i < ITERATIONS; i++) {
        if (limbs.leftHand) result = applyConstraint(result, limbs.leftHand, HAND_REACH, {x: -ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85}, MIN_COMPRESSION);
        if (limbs.rightHand) result = applyConstraint(result, limbs.rightHand, HAND_REACH, {x: ANATOMY.shoulderWidth/2, y: -ANATOMY.torsoHeight * 0.85}, MIN_COMPRESSION);
        if (limbs.leftFoot) result = applyConstraint(result, limbs.leftFoot, FOOT_REACH, {x: -ANATOMY.hipWidth/2, y: 1.5}, MIN_COMPRESSION);
        if (limbs.rightFoot) result = applyConstraint(result, limbs.rightFoot, FOOT_REACH, {x: ANATOMY.hipWidth/2, y: 1.5}, MIN_COMPRESSION);
    }
    return result;
};

const applyConstraint = (
    currentCOM: Point, 
    val: AttachedLimb | Point | null, 
    maxLen: number, 
    offsetFromCOM: Point,
    minLen: number = 0
): Point => {
    // Both AttachedLimb and Point have x/y
    if (!val) return currentCOM;

    const anchorX = currentCOM.x + offsetFromCOM.x;
    const anchorY = currentCOM.y + offsetFromCOM.y;

    const dx = val.x - anchorX; // Vector from Anchor -> Limb
    const dy = val.y - anchorY;
    const dist = Math.sqrt(dx*dx + dy*dy);

    // Max Reach Constraint (Pull body towards limb)
    if (dist > maxLen) {
        const scale = maxLen / dist; 
        const targetAnchorX = val.x - dx * scale;
        const targetAnchorY = val.y - dy * scale;
        return {
            x: targetAnchorX - offsetFromCOM.x,
            y: targetAnchorY - offsetFromCOM.y
        };
    }
    
    // Min Compression Constraint (Push body away from limb to prevent contortion)
    if (dist < minLen && dist > 0.1) {
        const scale = minLen / dist;
        // Move anchor AWAY from val, keeping direction
        const targetAnchorX = val.x - dx * scale;
        const targetAnchorY = val.y - dy * scale;
        return {
            x: targetAnchorX - offsetFromCOM.x,
            y: targetAnchorY - offsetFromCOM.y
        };
    }

    return currentCOM;
};

export const solveIK = (
    p1: Point, 
    p2: Point, 
    length1: number, 
    length2: number, 
    bendRight: boolean
): Point => {
    const dist = calculateDistance(p1, p2);
    
    if (!p1 || !p2 || isNaN(p1.x) || isNaN(p2.x)) return { x: 0, y: 0 };

    if (dist >= length1 + length2 - 0.1) {
        const ratio = length1 / (length1 + length2); 
        return {
            x: p1.x + (p2.x - p1.x) * ratio,
            y: p1.y + (p2.y - p1.y) * ratio
        };
    }

    const safeDist = Math.max(dist, 1.0); 
    const cosAngle = Math.max(-1, Math.min(1, (safeDist * safeDist + length1 * length1 - length2 * length2) / (2 * safeDist * length1)));
    const angle = Math.acos(cosAngle);
    
    const baseAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const totalAngle = bendRight ? baseAngle + angle : baseAngle - angle;

    return {
        x: p1.x + Math.cos(totalAngle) * length1,
        y: p1.y + Math.sin(totalAngle) * length1
    };
};
