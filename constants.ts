
import { HoldType, SimulationConfig, Level, Hold } from './types';

export const INITIAL_STAMINA = 100;
export const INITIAL_CHALK = 100;

export const SIMULATION_CONFIG: SimulationConfig = {
  climberWeightKg: 65,
  gravity: 9.81,
  reachRadius: 32, 
};

export const ANATOMY = {
  torsoHeight: 11,    
  shoulderWidth: 6.5,  
  hipWidth: 3.5,     
  armUpper: 6.5,      
  armLower: 6.5,
  legUpper: 8,      
  legLower: 8,
  headRadius: 2.2,
};

export const MAX_REACH = {
  hand: ANATOMY.armUpper + ANATOMY.armLower,
  foot: ANATOMY.legUpper + ANATOMY.legLower,
};

export const HOLD_COLORS: Record<HoldType, string> = {
  jug: '#10b981', 
  crimp: '#ef4444', 
  sloper: '#22c55e', 
  pocket: '#3b82f6', 
  volume: '#57534e', 
  start: '#a855f7', 
  finish: '#ec4899', 
};

export const HOLD_STAMINA_DRAIN: Record<HoldType, number> = {
  jug: 0.005,
  start: 0.00,
  finish: 0.005,
  volume: 0.01,
  pocket: 0.04,
  sloper: 0.05,
  crimp: 0.1,
};

export const HOLD_FRICTION: Record<HoldType, number> = {
  jug: 1.0,
  start: 1.0,
  finish: 1.0,
  crimp: 0.9,  
  pocket: 0.9,
  volume: 0.3, 
  sloper: 0.2, 
};

// --- Procedural Generation for Sport Routes ---

const generateSportRoute = (id: string, name: string, height: number, difficulty: string, angle: number): Level => {
    const holds: Hold[] = [];
    const stepY = 15; // Vertical distance between "moves"
    const moves = Math.floor(height / stepY);
    
    // Start Holds (Hands) - Raised to allow standing start
    holds.push(
        { id: `${id}_s1`, x: 45, y: height - 28, type: 'start', rotation: 0 },
        { id: `${id}_s2`, x: 55, y: height - 28, type: 'start', rotation: 0 }
    );
    
    // Start Holds (Feet)
    holds.push(
        { id: `${id}_sf1`, x: 40, y: height - 5, type: 'crimp', rotation: 0 },
        { id: `${id}_sf2`, x: 60, y: height - 5, type: 'crimp', rotation: 0 }
    );

    let currentX = 50;
    
    // Adjust loop to account for new start height
    for (let i = 2; i < moves; i++) {
        const y = height - 28 - ((i-1) * stepY);
        if (y < 20) break; // Don't go above finish

        // Random sway left/right
        const sway = (Math.random() - 0.5) * 60; 
        const nextX = Math.max(20, Math.min(80, currentX + sway));
        
        // Determine hold type based on difficulty and angle
        const rand = Math.random();
        let type: HoldType = 'jug';
        let rotation = 0;

        if (difficulty.includes('V4') || difficulty.includes('V5') || difficulty.includes('5.12')) {
            if (rand > 0.6) type = 'crimp';
            else if (rand > 0.4) type = 'sloper';
            else type = 'jug';
        } else if (difficulty.includes('V8') || difficulty.includes('5.13')) {
            if (rand > 0.3) type = 'crimp';
            else if (rand > 0.1) type = 'pocket';
            else type = 'sloper';
        }

        // Add main hand hold
        holds.push({
            id: `${id}_h${i}`,
            x: nextX,
            y: y,
            type,
            rotation: (Math.random() - 0.5) * 45
        });

        // Add intermediate/foot holds
        if (Math.random() > 0.3) {
             holds.push({
                id: `${id}_f${i}`,
                x: (currentX + nextX) / 2 + (Math.random() - 0.5) * 20,
                y: y + stepY * 0.5,
                type: 'crimp',
                rotation: 90
            });
        }
        
        currentX = nextX;
    }

    // Finish
    holds.push({ id: `${id}_finish`, x: currentX, y: 10, type: 'finish', rotation: 0 });

    return {
        id,
        name,
        author: 'Procedural Gen',
        difficulty,
        angle,
        height,
        holds
    };
};

const LEVEL_1_HOLDS = [
  { id: 'start1', x: 45, y: 70, type: 'start', rotation: 0 },
  { id: 'start2', x: 55, y: 70, type: 'start', rotation: 0 },
  { id: 'foot1', x: 40, y: 95, type: 'crimp', rotation: 0 },
  { id: 'foot2', x: 60, y: 95, type: 'crimp', rotation: 0 },
  { id: 'f1', x: 35, y: 60, type: 'sloper', rotation: -45 }, 
  { id: 'f2', x: 65, y: 55, type: 'sloper', rotation: 45 },  
  { id: 'vol1', x: 50, y: 45, type: 'volume', rotation: 0 },
  { id: 'c1', x: 40, y: 35, type: 'crimp', rotation: 90 }, 
  { id: 'c2', x: 60, y: 35, type: 'crimp', rotation: -90 }, 
  { id: 'j1', x: 42, y: 22, type: 'pocket', rotation: 0 }, 
  { id: 'finish', x: 50, y: 12, type: 'finish', rotation: 0 },
] as const;

export const DEFAULT_LEVEL_HOLDS = LEVEL_1_HOLDS;

const BOULDERING_LEVELS: Level[] = [
  { id: 'lvl1', name: 'Intro Warmup', author: 'System', difficulty: 'V1', angle: 0, holds: [...LEVEL_1_HOLDS] },
  {
    id: 'lvl2', name: 'Slippery Slope', author: 'System', difficulty: 'V2', angle: 5,
    holds: [
        { id: 's1', x: 40, y: 70, type: 'start', rotation: 0 },
        { id: 's2', x: 60, y: 70, type: 'start', rotation: 0 },
        { id: 'ft1', x: 45, y: 95, type: 'crimp', rotation: 0 },
        { id: 'ft2', x: 55, y: 95, type: 'crimp', rotation: 0 },
        { id: 'v1', x: 50, y: 60, type: 'volume', rotation: 0 },
        { id: 'sl1', x: 30, y: 50, type: 'sloper', rotation: -30 },
        { id: 'sl2', x: 70, y: 45, type: 'sloper', rotation: 30 },
        { id: 'v2', x: 50, y: 30, type: 'volume', rotation: 180 },
        { id: 'f1', x: 50, y: 15, type: 'finish', rotation: 0 },
    ]
  },
  {
    id: 'lvl3', name: 'The Ladder', author: 'System', difficulty: 'V2', angle: 0,
    holds: [
        { id: 's1', x: 50, y: 75, type: 'start', rotation: 0 },
        { id: 'ft1', x: 50, y: 96, type: 'jug', rotation: 0 },
        { id: 'j1', x: 40, y: 65, type: 'jug', rotation: 0 },
        { id: 'j2', x: 60, y: 55, type: 'jug', rotation: 0 },
        { id: 'j3', x: 40, y: 45, type: 'jug', rotation: 0 },
        { id: 'j4', x: 60, y: 35, type: 'jug', rotation: 0 },
        { id: 'j5', x: 40, y: 25, type: 'jug', rotation: 0 },
        { id: 'f1', x: 50, y: 12, type: 'finish', rotation: 0 },
    ]
  },
  {
    id: 'lvl4', name: 'Crimp City', author: 'System', difficulty: 'V4', angle: 15,
    holds: [
        { id: 's1', x: 45, y: 70, type: 'start', rotation: 0 },
        { id: 's2', x: 55, y: 70, type: 'start', rotation: 0 },
        { id: 'ft1', x: 35, y: 95, type: 'crimp', rotation: 0 },
        { id: 'ft2', x: 65, y: 95, type: 'crimp', rotation: 0 },
        { id: 'c1', x: 35, y: 60, type: 'crimp', rotation: 90 },
        { id: 'c2', x: 65, y: 55, type: 'crimp', rotation: -90 },
        { id: 'c3', x: 45, y: 45, type: 'crimp', rotation: 0 },
        { id: 'c4', x: 55, y: 35, type: 'crimp', rotation: 180 },
        { id: 'c5', x: 35, y: 25, type: 'crimp', rotation: 45 },
        { id: 'p1', x: 50, y: 20, type: 'pocket', rotation: 0 },
        { id: 'f1', x: 50, y: 10, type: 'finish', rotation: 0 },
    ]
  },
  {
    id: 'lvl7', name: 'Roof Training', author: 'System', difficulty: 'V4', angle: 45,
    holds: [
        { id: 's1', x: 50, y: 75, type: 'start', rotation: 0 },
        { id: 'ft1', x: 40, y: 95, type: 'jug', rotation: 0 },
        { id: 'ft2', x: 60, y: 95, type: 'jug', rotation: 0 },
        { id: 'j1', x: 50, y: 65, type: 'jug', rotation: 0 },
        { id: 'v1', x: 30, y: 55, type: 'volume', rotation: -45 },
        { id: 'v2', x: 70, y: 55, type: 'volume', rotation: 45 },
        { id: 'j2', x: 40, y: 40, type: 'jug', rotation: 0 },
        { id: 'j3', x: 60, y: 40, type: 'jug', rotation: 0 },
        { id: 'j4', x: 50, y: 28, type: 'jug', rotation: 0 },
        { id: 'f1', x: 50, y: 15, type: 'finish', rotation: 0 },
    ]
  },
  {
    id: 'lvl11', name: 'Slab Ballet', author: 'System', difficulty: 'V3', angle: -10,
    holds: [
        { id: 's1', x: 45, y: 70, type: 'start', rotation: 0 },
        { id: 's2', x: 55, y: 70, type: 'start', rotation: 0 },
        { id: 'ft1', x: 50, y: 95, type: 'crimp', rotation: 0 },
        { id: 'v1', x: 50, y: 60, type: 'volume', rotation: 0 },
        { id: 'c1', x: 35, y: 50, type: 'crimp', rotation: 90 },
        { id: 'c2', x: 65, y: 45, type: 'crimp', rotation: -90 },
        { id: 'j1', x: 50, y: 30, type: 'pocket', rotation: 0 },
        { id: 'f1', x: 50, y: 15, type: 'finish', rotation: 0 },
    ]
  },
  {
      id: 'lvl12', name: 'The Dyno', author: 'System', difficulty: 'V5', angle: 5,
      holds: [
          { id: 's1', x: 50, y: 70, type: 'start', rotation: 0 },
          { id: 'ft1', x: 50, y: 95, type: 'jug', rotation: 0 }, // Foot hold for start
          { id: 'j1', x: 50, y: 60, type: 'jug', rotation: 0 },
          { id: 'f1', x: 50, y: 35, type: 'finish', rotation: 0 }, 
      ]
  }
];

const SPORT_LEVELS: Level[] = [
    generateSportRoute('sport1', 'The Spire', 200, '5.10a', 0),
    generateSportRoute('sport2', 'Endurance Test', 250, '5.10c', 5),
    generateSportRoute('sport3', 'Slab Marathon', 250, '5.11a', -5),
    generateSportRoute('sport4', 'Overhang Overture', 220, '5.11b', 20),
    generateSportRoute('sport5', 'Pump Fest', 300, '5.11d', 15),
    generateSportRoute('sport6', 'The Crux', 200, '5.12a', 30),
    generateSportRoute('sport7', 'Sky High', 350, '5.12b', 0),
    generateSportRoute('sport8', 'Finger Shredder', 250, '5.12d', 10),
    generateSportRoute('sport9', 'No Rest', 300, '5.13a', 25),
    generateSportRoute('sport10', 'El Capitan\'t', 400, '5.13b', 5),
];

export const SAMPLE_LEVELS = [...BOULDERING_LEVELS, ...SPORT_LEVELS];
