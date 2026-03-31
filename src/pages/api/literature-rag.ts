import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Simple in-memory vector store for the session
// In production, use Pinecone, Weaviate, etc.
let documentChunks: { text: string; embedding: number[] }[] = [];

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function chunkText(text: string, chunkSize = 800, overlap = 200): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured." }),
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const body = await request.json();
    const { action } = body;

    if (action === "upload") {
      // Receive extracted text from client, chunk it, embed it
      const { text } = body;
      if (!text || text.length < 50) {
        return new Response(
          JSON.stringify({ error: "Text is too short. Please upload a longer document." }),
          { status: 400 }
        );
      }

      const chunks = chunkText(text);

      // Use Gemini embedding model
      const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

      const embeddings: number[][] = [];
      // Batch embed in groups of 5 to avoid rate limits
      for (let i = 0; i < chunks.length; i += 5) {
        const batch = chunks.slice(i, i + 5);
        const results = await Promise.all(
          batch.map((c) =>
            embedModel.embedContent(c).then((r) => r.embedding.values)
          )
        );
        embeddings.push(...results);
      }

      documentChunks = chunks.map((text, idx) => ({
        text,
        embedding: embeddings[idx],
      }));

      return new Response(
        JSON.stringify({
          success: true,
          chunks: chunks.length,
          preview: chunks[0].slice(0, 200) + "...",
        }),
        { status: 200 }
      );
    }

    if (action === "query") {
      const { question } = body;
      if (!question) {
        return new Response(
          JSON.stringify({ error: "Please provide a question." }),
          { status: 400 }
        );
      }

      if (documentChunks.length === 0) {
        return new Response(
          JSON.stringify({ error: "No document uploaded yet. Please upload a paper first." }),
          { status: 400 }
        );
      }

      // Embed the query
      const embedModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
      const queryEmbedding = await embedModel
        .embedContent(question)
        .then((r) => r.embedding.values);

      // Find top-k most similar chunks
      const scored = documentChunks
        .map((chunk, idx) => ({
          idx,
          text: chunk.text,
          score: cosineSimilarity(queryEmbedding, chunk.embedding),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      const context = scored.map((s) => s.text).join("\n\n---\n\n");

      // Generate answer using retrieved context
      const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const prompt = `You are a medical research assistant. Answer the user's question based ONLY on the provided document excerpts. If the answer isn't in the excerpts, say so.

Include specific citations by referencing which part of the text you're drawing from.

Return as JSON (no markdown fences):
{
  "answer": "Your detailed answer with citations",
  "confidence": "High|Medium|Low",
  "relevant_excerpts": ["Short quote 1 from the source", "Short quote 2"]
}

Document excerpts:
${context}

User question: ${question}`;

      const result = await model.generateContent(prompt);
      const text = await result.response.text();

      let parsed;
      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { answer: text, confidence: "Medium", relevant_excerpts: [] };
      }

      return new Response(
        JSON.stringify({
          ...parsed,
          sources: scored.map((s) => ({
            chunk_index: s.idx,
            score: Math.round(s.score * 100) / 100,
            preview: s.text.slice(0, 150) + "...",
          })),
        }),
        { status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "upload" or "query".' }),
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Literature RAG API error:", err.message || err);
    return new Response(
      JSON.stringify({ error: `Error: ${err.message || "Unknown error"}` }),
      { status: 500 }
    );
  }
};
