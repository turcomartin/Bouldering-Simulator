
import { GoogleGenAI, Type } from "@google/genai";
import { Hold } from '../types';

let genAI: GoogleGenAI | null = null;

const getAI = () => {
  if (!genAI) {
    genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return genAI;
};

// Helper to convert File to Base64 for Gemini
const fileToGenerativePart = async (file: File) => {
  return new Promise<{ inlineData: { data: string; mimeType: string } }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const generateLevelFromImage = async (file: File): Promise<Hold[]> => {
  const ai = getAI();
  const imagePart = await fileToGenerativePart(file);

  const prompt = `
  Analyze this image of a climbing wall. Identify all distinct climbing holds.
  Map their positions to a coordinate system where x goes from 0 to 100 (left to right) and y goes from 0 to 100 (top to bottom).
  
  Return a raw JSON array of holds. 
  Do not use Markdown formatting (no \`\`\`json blocks).
  
  Each hold object must have these exact properties:
  - "id": string
  - "x": number (0-100)
  - "y": number (0-100)
  - "type": string (one of: 'jug', 'crimp', 'sloper', 'pocket', 'volume', 'start', 'finish'). Estimate based on visual size and shape.
  - "rotation": number (0-360 degrees).

  Example: [{"id": "h1", "x": 50, "y": 50, "type": "jug", "rotation": 0}]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Vision-capable model
      contents: {
        parts: [
            imagePart,
            { text: prompt }
        ]
      },
      // Note: 'gemini-2.5-flash-image' does not support responseSchema or responseMimeType: 'application/json'
    });

    let text = response.text || "[]";
    
    // Clean up potentially marked down JSON
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Extract array if embedded in text
    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1) {
        text = text.substring(startIdx, endIdx + 1);
    }

    const data = JSON.parse(text) as any[];
    return data.map((h: any) => ({
      id: h.id || Math.random().toString(36).substr(2, 9),
      x: Number(h.x),
      y: Number(h.y),
      type: h.type || 'jug',
      rotation: Number(h.rotation || 0)
    })) as Hold[];
  } catch (error) {
    console.error("Gemini Vision Error:", error);
    throw error;
  }
};

export const generateLevel = async (description: string): Promise<Hold[]> => {
  const ai = getAI();
  const prompt = `Generate a bouldering route based on this description: "${description}".
  The wall is a 2D grid from x:0-100 and y:0-100.
  y=0 is top, y=100 is bottom.
  Provide a JSON list of holds. Each hold must have:
  - id (string)
  - x (number)
  - y (number)
  - type (one of: 'jug', 'crimp', 'sloper', 'pocket', 'volume', 'start', 'finish')
  - rotation (number, degrees)
  Ensure there is at least one 'start' hold near y=90 and one 'finish' hold near y=10.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              type: { type: Type.STRING },
              rotation: { type: Type.NUMBER },
            },
            required: ['id', 'x', 'y', 'type', 'rotation']
          }
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text) as any[];
      // Validate and cast
      return data.map((h: any) => ({
        id: h.id || Math.random().toString(36).substr(2, 9),
        x: Number(h.x),
        y: Number(h.y),
        type: h.type,
        rotation: Number(h.rotation || 0)
      })) as Hold[];
    }
    throw new Error("No data returned");
  } catch (error) {
    console.error("Gemini Level Gen Error:", error);
    // Fallback simple route if API fails
    return [
      { id: 'f_start', x: 50, y: 90, type: 'start', rotation: 0 },
      { id: 'f_end', x: 50, y: 20, type: 'finish', rotation: 0 },
      { id: 'f_mid', x: 50, y: 55, type: 'jug', rotation: 0 },
    ];
  }
};

export const getCoachAdvice = async (
    climberState: any, 
    holds: Hold[]
): Promise<string> => {
  const ai = getAI();
  
  // Simplify data for token efficiency
  const limbs = climberState.limbs;
  const currentStamina = Math.round(climberState.stamina);
  
  const prompt = `
  You are a bouldering coach. 
  Current Climber Status:
  - Stamina: ${currentStamina}%
  - Limbs Placed: ${JSON.stringify(limbs)}
  
  Route Holds: ${JSON.stringify(holds.map(h => ({id: h.id, x: h.x, y: h.y, type: h.type})))}
  
  The climber is currently stuck or needs advice. Give a very short, punchy tip (max 20 words) on what to do next or how to manage stamina.
  `;

  try {
     const response = await ai.models.generateContent({
       model: 'gemini-3-flash-preview',
       contents: prompt,
     });
     return response.text || "Keep breathing!";
  } catch (e) {
      return "Focus on your feet!";
  }
}
