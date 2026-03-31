import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { drugs } = await request.json();

    if (!drugs || !Array.isArray(drugs) || drugs.length < 2) {
      return new Response(
        JSON.stringify({ error: "Please provide at least 2 drug names." }),
        { status: 400 }
      );
    }

    const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured." }),
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const drugList = drugs.map((d: string) => d.trim()).join(", ");

    const prompt = `You are a pharmacology expert AI assistant. Analyze the potential drug-drug interactions between the following medications: ${drugList}

Return your analysis as a JSON object with this exact structure (no markdown, no code fences, just pure JSON):
{
  "summary": "A 2-3 sentence overview of the interaction risk level",
  "interactions": [
    {
      "drug_a": "Drug Name A",
      "drug_b": "Drug Name B",
      "severity": "Major|Moderate|Minor|None",
      "type": "Pharmacokinetic|Pharmacodynamic|Combined|None",
      "mechanism": "Brief explanation of the mechanism",
      "clinical_effect": "What could happen to the patient",
      "recommendation": "What a clinician should do"
    }
  ],
  "contraindications": ["List any absolute contraindications"],
  "general_advice": "Overall recommendation for this combination"
}

Important: Analyze ALL possible pairwise interactions. If there are 3 drugs, analyze A-B, A-C, and B-C.
Be medically accurate but add a disclaimer that this is for educational purposes only.`;

    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    // Try to parse as JSON, clean if needed
    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { summary: text, interactions: [], contraindications: [], general_advice: "" };
    }

    return new Response(JSON.stringify(parsed), { status: 200 });
  } catch (err: any) {
    console.error("Drug interaction API error:", err.message || err);
    return new Response(
      JSON.stringify({ error: `Error: ${err.message || "Unknown error"}` }),
      { status: 500 }
    );
  }
};
