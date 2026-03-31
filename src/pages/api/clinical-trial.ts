import type { APIRoute } from "astro";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const POST: APIRoute = async ({ request }) => {
  try {
    const { nctId } = await request.json();

    if (!nctId || typeof nctId !== "string") {
      return new Response(
        JSON.stringify({ error: "Please provide a valid NCT ID (e.g., NCT05678901)." }),
        { status: 400 }
      );
    }

    const cleanId = nctId.trim().toUpperCase();

    // Step 1: Fetch trial data from ClinicalTrials.gov v2 API
    const ctRes = await fetch(
      `https://clinicaltrials.gov/api/v2/studies/${cleanId}?format=json`
    );

    if (!ctRes.ok) {
      return new Response(
        JSON.stringify({ error: `Trial "${cleanId}" not found on ClinicalTrials.gov.` }),
        { status: 404 }
      );
    }

    const trialData = await ctRes.json();

    // Extract key fields
    const proto = trialData.protocolSection || {};
    const id = proto.identificationModule || {};
    const status = proto.statusModule || {};
    const design = proto.designModule || {};
    const eligibility = proto.eligibilityModule || {};
    const desc = proto.descriptionModule || {};
    const arms = proto.armsInterventionsModule || {};
    const outcomes = proto.outcomesModule || {};
    const contacts = proto.contactsLocationsModule || {};

    const trialSummary = {
      nctId: cleanId,
      title: id.officialTitle || id.briefTitle || "N/A",
      briefSummary: desc.briefSummary || "N/A",
      detailedDescription: desc.detailedDescription || "",
      status: status.overallStatus || "N/A",
      startDate: status.startDateStruct?.date || "N/A",
      completionDate: status.completionDateStruct?.date || "N/A",
      studyType: design.studyType || "N/A",
      phases: design.phases?.join(", ") || "N/A",
      enrollment: design.enrollmentInfo?.count || "N/A",
      eligibilityCriteria: eligibility.eligibilityCriteria || "N/A",
      interventions: arms.interventions?.map((i: any) => `${i.type}: ${i.name}`).join("; ") || "N/A",
      primaryOutcomes: outcomes.primaryOutcomes?.map((o: any) => o.measure).join("; ") || "N/A",
      locations: contacts.locations?.slice(0, 5).map((l: any) => `${l.facility}, ${l.city}, ${l.country}`).join("; ") || "N/A",
    };

    // Step 2: Summarize with Gemini
    const GEMINI_API_KEY = import.meta.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured.", raw: trialSummary }),
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `You are a clinical research expert. Summarize the following clinical trial in clear, plain English that a non-scientist could understand. Include:

1. **What** the trial is studying (drug/treatment, disease/condition)
2. **Why** it matters (unmet need, innovation)
3. **Who** can participate (key eligibility)
4. **How** it works (design, phases, arms)
5. **When** (timeline, current status)
6. **Key Outcomes** being measured

Return as JSON (no markdown fences):
{
  "plain_summary": "3-4 paragraph plain English summary",
  "key_facts": {
    "condition": "...",
    "intervention": "...",
    "phase": "...",
    "status": "...",
    "enrollment": "...",
    "sponsor": "..."
  },
  "eli5": "One-sentence ELI5 explanation",
  "significance": "Why this trial matters in 1-2 sentences"
}

Trial data:
${JSON.stringify(trialSummary, null, 2)}`;

    const result = await model.generateContent(prompt);
    const text = await result.response.text();

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { plain_summary: text, key_facts: {}, eli5: "", significance: "" };
    }

    return new Response(
      JSON.stringify({ ...parsed, raw: trialSummary }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Clinical trial API error:", err.message || err);
    return new Response(
      JSON.stringify({ error: `Error: ${err.message || "Unknown error"}` }),
      { status: 500 }
    );
  }
};
