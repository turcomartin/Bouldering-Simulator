
export type HoldType = 'jug' | 'crimp' | 'sloper' | 'pocket' | 'volume' | 'start' | 'finish';

export interface Point {
  x: number;
  y: number;
}

export interface AttachedLimb extends Point {
  holdId: string;
}

export interface Hold {
  id: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  type: HoldType;
  rotation: number;
  color?: string;
}

export interface Level {
  id: string;
  name: string;
  author: string;
  holds: Hold[];
  difficulty: string;
  angle: number; // Negative = Slab, 0 = Vertical, >0 = Overhang
  height?: number; // Default 100. Sport routes > 100.
}

export type Limb = 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';

export interface ClimberState {
  limbs: {
    // AttachedLimb (on hold), Point (flagging/smearing), or null (hanging)
    [key in Limb]: AttachedLimb | Point | null; 
  };
  stamina: number; // Core Energy 0-100
  armPump: { left: number; right: number }; // 0-100, 100 = failure
  chalk: number; // 0-100
  balance: number; // 0-100 (0 = perfect, 100 = fall)
  status: 'idle' | 'climbing' | 'falling' | 'topped';
  centerOfMass: Point;
  velocity: Point; // dx, dy per frame
}

export interface SimulationConfig {
  climberWeightKg: number;
  gravity: number;
  reachRadius: number; // percentage of wall height
}
