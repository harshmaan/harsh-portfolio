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
You are a professional reputation analysis AI. Based on the following Reddit posts about "${name}", generate a detailed executive-grade report in **Markdown format** with the following structure:

**📈 Reputation KPI Snapshot**  
| KPI                           | Value                       |
|-------------------------------|-----------------------------|
| Sentiment Ratio               | 👍 X% / 😐 X% / 👎 X%        |
| Avg. Engagement               | X comments/upvotes          |
| Spike Event                   | <If any, e.g., date/topic>  |
| Most Mentioned Brand Pillar   | <Pillar name> (X mentions)  |
| Narrative Drift Score         | XX% alignment with official messaging  
| Most Viral Post Sentiment     | <Positive / Neutral / Negative>


**Sentiment Breakdown:**
Positive: X (X%)  
Neutral: X (X%)  
Negative: X (X%)  
↳ Trend Analysis: <Brief 1-liner about sentiment shift, if any>

**Public Narrative Summary:**
<Tone, dominant perception, and a quote if applicable>

**Messaging Alignment:**
✔ Core Message Echoed:  
✘ Message Misses:  

**Top Concerns / Topics (with frequency):**
- <Theme> — X posts
- <Theme> — X posts

**Audience Insight (optional if detectable):**
Main contributors include <e.g., tech-savvy users / disgruntled employees / investors>

**Recommendations to Improve Public Perception:**

*Short-Term Actions:*  
1. <PR / Comms suggestion>  
2. <Social media or influencer engagement idea>  

*Long-Term Strategy:*  
3. <Product, CX, or cultural initiative>  
4. <Thought leadership or innovation comms idea>  

Reddit Posts:
${postTexts}
Please format the entire response using **Markdown**.
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
