import fs from 'fs';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface PositionResult {
  positions: {
    label: string;
    x: number;  // percentage 0-100
    y: number;  // percentage 0-100
    confidence: 'high' | 'medium' | 'low';
  }[];
  description?: string;
}

export interface VisionAnalysisRequest {
  imagePath: string;
  query: string;
}

export interface SafeZone {
  label: string;
  x: number;      // center x percentage 0-100
  y: number;      // center y percentage 0-100
  width: number;  // percentage of frame width
  height: number; // percentage of frame height
  reason: string; // why this zone is safe
}

export interface AvoidZone {
  label: string;
  x: number;      // center x percentage 0-100
  y: number;      // center y percentage 0-100
  width: number;  // percentage of frame width
  height: number; // percentage of frame height
  reason: string; // why to avoid (e.g., "person's face")
}

export interface SafeZonesResult {
  safeZones: SafeZone[];
  avoidZones: AvoidZone[];
  recommendedPosition?: { x: number; y: number };
  description?: string;
}

/**
 * Analyze an image using Gemini 3 Flash via OpenRouter to detect positions of elements
 */
export async function analyzeFrameForPositions(
  request: VisionAnalysisRequest
): Promise<PositionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(request.imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  // Determine mime type from extension
  const ext = request.imagePath.toLowerCase().split('.').pop();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const systemPrompt = `You are a precise visual analysis assistant. Your task is to identify specific elements in video frames and return their positions as percentages of the frame dimensions.

When asked to find elements:
1. Analyze the image carefully
2. Identify each requested element
3. Return positions as x,y percentages where:
   - x=0 is left edge, x=100 is right edge
   - y=0 is top edge, y=100 is bottom edge
4. Estimate confidence based on how clearly you can identify the element

Always respond in valid JSON format with this structure:
{
  "positions": [
    {"label": "element name", "x": 50, "y": 30, "confidence": "high"},
    ...
  ],
  "description": "Brief description of what you see"
}`;

  const userPrompt = `Analyze this video frame and find the following elements. Return their positions as x,y percentages (0-100).

Query: ${request.query}

Important:
- Be precise about positions
- If you see a finger pointing, identify both the fingertip position AND what it might be pointing toward
- For "background" elements, they are typically in the upper portion of the frame (lower y values)
- For people, return the center of their face/head area
- Return ALL relevant elements mentioned in the query

Respond ONLY with valid JSON.`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
      'X-Title': 'Acta Video Editor',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.1, // Low temperature for more precise analysis
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response content from Gemini');
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const result = JSON.parse(jsonStr) as PositionResult;
    return result;
  } catch {
    // If parsing fails, try to extract positions manually
    console.error('Failed to parse Gemini response:', content);
    return {
      positions: [],
      description: content,
    };
  }
}

export interface BackgroundChangeResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

/**
 * Change the background of an image using Gemini 2.5 Flash Image
 * The model can perform targeted edits using natural language without needing masks
 */
export async function changeImageBackground(
  imagePath: string,
  newBackgroundDescription: string,
  outputPath: string
): Promise<BackgroundChangeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'OPENROUTER_API_KEY environment variable is not set' };
  }

  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  // Determine mime type from extension
  const ext = imagePath.toLowerCase().split('.').pop();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const prompt = `Edit this image: Keep the person/subject in the foreground exactly as they are, but completely replace the background with: ${newBackgroundDescription}. 

Make sure:
- The person/subject remains unchanged and in the same position
- The new background looks natural and properly lit
- The edges between subject and background blend seamlessly
- The overall image looks realistic and professional`;

  try {
    // Debug: log API key details
    console.log('[changeImageBackground] API key present:', !!apiKey);
    console.log('[changeImageBackground] API key starts with:', apiKey?.substring(0, 15));
    console.log('[changeImageBackground] API key length:', apiKey?.length);
    console.log('[changeImageBackground] Image size:', imageBuffer.length, 'bytes');
    
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
        'X-Title': 'Acta Video Editor',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        // Required: specify we want image output
        modalities: ['image', 'text'],
        max_tokens: 8192,
        temperature: 0.7,
      }),
    });
    
    console.log('[changeImageBackground] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `OpenRouter API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    
    if (!message) {
      return { success: false, error: 'No response message from Gemini' };
    }

    // OpenRouter returns images in message.images array
    // Each image has { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
    if (message.images && Array.isArray(message.images) && message.images.length > 0) {
      const firstImage = message.images[0];
      const dataUrl = firstImage.image_url?.url;
      
      if (dataUrl) {
        // Extract base64 data from data URL
        const base64Match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (base64Match) {
          const imageData = Buffer.from(base64Match[1], 'base64');
          fs.writeFileSync(outputPath, imageData);
          return { success: true, outputPath };
        }
      }
    }
    
    // If we got text instead of an image
    const textContent = message.content || '';
    return { 
      success: false, 
      error: `Model returned text instead of image. Response: ${typeof textContent === 'string' ? textContent.substring(0, 300) : JSON.stringify(textContent).substring(0, 300)}` 
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Generate a description of what to look for based on user's annotation request
 */
export function generatePositionQuery(userDescription: string): string {
  // Extract key elements from the user's description
  const elements: string[] = [];
  
  // Common patterns
  if (/finger|hand|pointing/i.test(userDescription)) {
    elements.push('the fingertip or pointing hand');
  }
  if (/guy|man|person|people/i.test(userDescription)) {
    if (/left/i.test(userDescription)) {
      elements.push('the person on the left side');
    } else if (/right/i.test(userDescription)) {
      elements.push('the person on the right side');
    } else if (/background/i.test(userDescription)) {
      elements.push('the person in the background');
    } else {
      elements.push('the person/people visible');
    }
  }
  if (/background/i.test(userDescription) && !/person|guy|man/i.test(userDescription)) {
    elements.push('the background area');
  }
  if (/object|item|thing/i.test(userDescription)) {
    elements.push('the main object of interest');
  }
  
  if (elements.length === 0) {
    // Fallback: ask about the general description
    return `Find the elements described as: "${userDescription}"`;
  }
  
  return `Find these elements in the frame:\n${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
}

/**
 * Analyze an image to find safe zones for placing decorative elements (balloons, SVGs, etc.)
 * and zones to avoid (faces, important subjects)
 */
export async function analyzeFrameForSafeZones(
  imagePath: string
): Promise<SafeZonesResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not set');
  }

  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  // Determine mime type from extension
  const ext = imagePath.toLowerCase().split('.').pop();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const systemPrompt = `You are a precise visual analysis assistant specializing in finding safe placement zones for decorative overlays in video frames.

Your task is to analyze the frame and identify:
1. AVOID ZONES: Areas that should NOT have overlays placed on them (faces, heads, important text, key subjects)
2. SAFE ZONES: Areas where decorative elements (balloons, arrows, graphics) can be placed without obscuring important content

When analyzing:
- Faces and heads are the HIGHEST priority to avoid
- Also avoid hands, important text/signs, and the main subject of focus
- Safe zones are typically: empty background areas, sky, walls, floors, edges of frame
- Return positions and sizes as percentages (0-100) of frame dimensions
- x=0 is left edge, x=100 is right edge
- y=0 is top edge, y=100 is bottom edge

CRITICAL: All coordinates MUST be within 0-100 range. Never return negative values or values >100.

Always respond in valid JSON format with this structure:
{
  "avoidZones": [
    {"label": "person's face", "x": 50, "y": 30, "width": 20, "height": 25, "reason": "would cover the person's face"}
  ],
  "safeZones": [
    {"label": "upper left corner", "x": 15, "y": 15, "width": 25, "height": 20, "reason": "empty background area"}
  ],
  "recommendedPosition": {"x": 15, "y": 15},
  "description": "Brief description of the frame layout"
}`;

  const userPrompt = `Analyze this video frame and identify:

1. AVOID ZONES: Where should decorative elements (like balloons, arrows, text overlays) NOT be placed? Focus especially on:
   - All visible faces and heads
   - Hands and arms
   - Important text or signs
   - The main subject/focus of the frame

2. SAFE ZONES: Where CAN decorative elements be safely placed without obscuring important content? Look for:
   - Empty background areas
   - Sky, walls, floors
   - Corners and edges with no important content
   - Areas with minimal visual importance

3. RECOMMENDED POSITION: Pick the single best position (x, y) for placing a decorative element.

IMPORTANT:
- All x, y, width, height values must be percentages between 0 and 100
- Be generous with avoid zones around faces (add padding)
- The recommendedPosition should be at least 15% away from any face

Respond ONLY with valid JSON.`;

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
      'X-Title': 'Acta Video Editor',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response content from Gemini');
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    const result = JSON.parse(jsonStr) as SafeZonesResult;
    
    // Validate and clamp all coordinates to 0-100 range
    result.avoidZones = (result.avoidZones || []).map(zone => ({
      ...zone,
      x: Math.max(0, Math.min(100, zone.x)),
      y: Math.max(0, Math.min(100, zone.y)),
      width: Math.max(0, Math.min(100, zone.width)),
      height: Math.max(0, Math.min(100, zone.height)),
    }));
    
    result.safeZones = (result.safeZones || []).map(zone => ({
      ...zone,
      x: Math.max(0, Math.min(100, zone.x)),
      y: Math.max(0, Math.min(100, zone.y)),
      width: Math.max(0, Math.min(100, zone.width)),
      height: Math.max(0, Math.min(100, zone.height)),
    }));
    
    if (result.recommendedPosition) {
      result.recommendedPosition.x = Math.max(5, Math.min(95, result.recommendedPosition.x));
      result.recommendedPosition.y = Math.max(5, Math.min(95, result.recommendedPosition.y));
    }
    
    return result;
  } catch {
    console.error('Failed to parse safe zones response:', content);
    // Return empty result with fallback safe zone in upper-left corner
    return {
      safeZones: [{ label: 'upper-left corner (fallback)', x: 15, y: 15, width: 20, height: 20, reason: 'default safe area' }],
      avoidZones: [],
      recommendedPosition: { x: 15, y: 15 },
      description: 'Failed to analyze frame, using fallback position',
    };
  }
}

/**
 * Clamp annotation position to stay within frame bounds with padding
 */
export function clampPositionToFrame(x: number, y: number, padding: number = 5): { x: number; y: number } {
  return {
    x: Math.max(padding, Math.min(100 - padding, x)),
    y: Math.max(padding, Math.min(100 - padding, y)),
  };
}
