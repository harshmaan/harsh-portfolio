import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const GET: APIRoute = async () => {
  const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Gemini API key." }),
      { status: 500 }
    );
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  /* --- src/pages/api/spy‑prompt.ts -------------------------------------- */
  const prompt = `
You are the friendly game‑master for **“Spy Among Prompts.”**

GOAL  
Generate two very easy‑to‑understand writing tasks about normal office life:

  1. **BASE PROMPT** – one simple, clear sentence (≤ 12 words).  
  2. **IMPOSTER PROMPT** – same topic, but with a tiny twist (different
     audience, place, or tone).

RULES  
• Keep it workplace‑related: emails, meeting notes, quick updates.  
• Use plain English, everyday words, no jargon or buzzwords.  
• The twist should be subtle, not tricky.  
• Output **exactly** like this (no extra lines):

BASE PROMPT: <base prompt>
IMPOSTER PROMPT: <imposter prompt>

Example  
BASE PROMPT: Write a message about budget cuts.
IMPOSTER PROMPT: Write an internal team message about budget cuts.

Now give one fresh pair.
`.trim();

  try {
    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    const baseMatch = text.match(/BASE PROMPT:\s*(.+)/i);
    const imposterMatch = text.match(/IMPOSTER PROMPT:\s*(.+)/i);

    const basePrompt = baseMatch?.[1]?.trim() || "";
    const imposterPrompt = imposterMatch?.[1]?.trim() || "";

    if (!basePrompt || !imposterPrompt) {
      throw new Error("Failed to extract prompts from Gemini response.");
    }

    return new Response(JSON.stringify({ basePrompt, imposterPrompt }), {
      status: 200,
    });
  } catch (err: any) {
    console.error("🔴 spy-prompt error:", err.message || err);
    return new Response(
      JSON.stringify({ error: "Failed to generate prompts." }),
      { status: 500 }
    );
  }
};
