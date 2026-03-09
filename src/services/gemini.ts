import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface CountResult {
  totalCount: number;
  items: {
    name: string;
    count: number;
  }[];
  description: string;
}

export async function countObjectsInImage(base64Image: string): Promise<CountResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: "Analyze this image and count all distinct objects. Provide a total count and a breakdown of what you found. Return the response in JSON format.",
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(",")[1] || base64Image,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            totalCount: {
              type: Type.NUMBER,
              description: "The total number of objects counted.",
            },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Name of the object type." },
                  count: { type: Type.NUMBER, description: "Number of objects of this type." },
                },
                required: ["name", "count"],
              },
            },
            description: {
              type: Type.STRING,
              description: "A brief summary of what was counted.",
            },
          },
          required: ["totalCount", "items", "description"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as CountResult;
  } catch (error) {
    console.error("Error counting objects:", error);
    throw error;
  }
}
