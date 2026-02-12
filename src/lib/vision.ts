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
