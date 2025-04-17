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

  const prompt = `
You're a game master for a social deduction game called "Spy Among Prompts".

Your task is to:
1. Generate a clear, simple base writing prompt.
2. Generate a subtle variation for an Imposter that changes the audience, tone, or context slightly.

Format your response exactly like this:

BASE PROMPT: <base prompt>
IMPOSTER PROMPT: <slightly different version of the base prompt>

The base prompt should be serious and work-related (e.g., emails, memos, updates, etc.).

Example:
BASE PROMPT: Write a message about budget cuts.
IMPOSTER PROMPT: Write an internal team message about budget cuts.

Now generate a fresh pair.
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
