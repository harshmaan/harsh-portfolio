import type { APIRoute } from 'astro';
import { GenerativeModel } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { prompt } = await request.json();

    const inputPrompt = prompt?.trim() || "Give me 5 innovative project ideas using AI in healthcare.";

    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY is missing.");
      return new Response(JSON.stringify({ response: "API key not set." }), {
        status: 500,
      });
    }

    const model = new GenerativeModel({
      model: "gemini-2.0-flash",
      apiKey: GEMINI_API_KEY,
    });

    const result = await model.generateContent(inputPrompt);

    if (!result || !result.response) {
      console.error("❌ No response from Gemini model:", result);
      return new Response(JSON.stringify({ response: "Empty response from Gemini." }), {
        status: 500,
      });
    }

    const text = result.response.text();

    return new Response(JSON.stringify({ response: text }), {
      status: 200,
    });

  } catch (err: any) {
    console.error("🔥 Gemini API error:", err.message || err);
    return new Response(JSON.stringify({ response: "Internal error occurred." }), {
      status: 500,
    });
  }
};
