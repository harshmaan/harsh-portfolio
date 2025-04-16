import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { name, posts } = await request.json();

    if (!name || !Array.isArray(posts) || posts.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid input data." }),
        { status: 400 }
      );
    }

    const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing Gemini API key." }),
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const postTexts = posts
      .map(
        (p: any, i: number) =>
          `Post ${i + 1}:\nTitle: ${p.title}\nText: ${p.selftext || "N/A"}`
      )
      .join("\n\n");

    const prompt = `
You are a professional reputation analysis AI. Based on the following Reddit posts about "${name}", generate a clearly structured and readable report with the following five sections:

1. **Sentiment Breakdown** (Count of Positive / Neutral / Negative posts)
2. **Public Narrative Summary** (Brief 2–3 line summary of public perception)
3. **Messaging Alignment** (How aligned are the posts with the official messaging or brand image?)
4. **Top Concerns / Repeated Topics** (Bullet points)
5. **Recommendations to Improve Public Perception** (Numbered list, actionable)

Use this format exactly:

---
**Sentiment Breakdown:**
Positive: X  
Neutral: X  
Negative: X

**Public Narrative Summary:**
<summary>

**Messaging Alignment:**
<alignment analysis>

**Top Concerns / Topics:**
- Concern 1
- Concern 2

**Recommendations:**
1. Suggestion 1
2. Suggestion 2
3. Suggestion 3
---

Reddit Posts:
${postTexts}
`.trim();

    console.log("🧠 Gemini Prompt:", prompt); // helpful for debugging in logs

    const result = await model.generateContent(prompt);

    if (!result || !result.response) {
      return new Response(JSON.stringify({ error: "Empty Gemini response" }), { status: 500 });
    }

    const text = await result.response.text();

    if (!text || !text.trim()) {
      return new Response(JSON.stringify({ error: "No insights generated." }), { status: 500 });
    }

    return new Response(
      JSON.stringify({ report: text }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("🔥 Persona Report Error:", err.message || err);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500 }
    );
  }
};
