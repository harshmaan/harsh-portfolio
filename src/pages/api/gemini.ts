// ✅ Astro API route syntax
import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { prompt } = await request.json();

    const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY is missing.");
      return new Response(JSON.stringify({ error: "API key not set.", response: null }), {
        status: 500,
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const result = await model.generateContent(prompt);

    if (!result || !result.response) {
      return new Response(JSON.stringify({ error: "Empty response from Gemini.", response: null }), {
        status: 500,
      });
    }

    const text = await result.response.text(); // Await is correct here
    return new Response(JSON.stringify({ response: text }), {
      status: 200,
    });

  } catch (err: any) {
    console.error("🔥 Gemini API error:", err.message || err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error", response: null }), {
      status: 500,
    });
  }
};
