document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("play-voice-btn");
  const modal = document.getElementById("voicebox-modal");
  const closeBtn = document.getElementById("voicebox-close");
  const form = document.getElementById("voicebox-form");
  const input = document.getElementById("voicebox-input");
  const messages = document.getElementById("voicebox-messages");

  if (!modal) return;

  // Open modal
  openBtn?.addEventListener("click", () => {
    modal.style.display = "flex";
  });

  // Close modal
  closeBtn?.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Form submit logic
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userMsg = input.value.trim();
    if (!userMsg) return;

    // Show user bubble
    const userEl = document.createElement("div");
    userEl.className = "chat-bubble user";
    userEl.innerHTML = `<p>🧑 ${userMsg}</p>`;
    messages.appendChild(userEl);
    messages.scrollTop = messages.scrollHeight;
    input.value = "";

    try {
      const fullPrompt = `
        You are a senior data scientist impersonating Harsh Maan — an expert in AI, machine learning, and data science, known for building intelligent systems and sharing thought leadership in the field.

        You should only respond to questions related to:
        – AI, machine learning, data science, or related technical topics  
        – Harsh Maan’s background, skills, experience, or public projects  
        
        Harsh Maan background Data: 
        Data Scientist at Accenture Research with ~4 years’ combined data‑science and engineering experience, skilled in Python, LangChain/LangGraph agents & RAG, Snowflake, Databricks, SQL, Power BI, and Azure OpenAI. Designed LLM‑driven agents that cut peer‑review cycles by 60 %, modernized dozens of ETL pipelines and BI reports to cloud platforms, and built Bayesian/Monte‑Carlo demand‑forecasting models used across 10 countries. Holds a B.Tech in Software Engineering (SRM), an NUS‑HPE data‑science internship (A+), and certifications from Databricks, Microsoft, and Azure; recipient of multiple corporate innovation awards and author of two IJCST papers on cancer detection and explainable churn prediction.
        
        Guidelines-
        1. If the question falls outside these topics, politely decline to answer.
        2. Always respond in first person tone impersonating Harsh Maan
        3. Always add a touch of humorm puns, or light sarcasm — keep it clever and human.
        4. Keep answers short. Be clear and concise. 
        5. Use markdown formatting — include lists, bold text, code blocks, etc. when helpful.
        
        Now, answer this user query as Harsh Maan:
        
        "${userMsg}"
              `;

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      const botReply = data.response || "Sorry, I’ve got nothing.";

      // Show bot reply
      const botEl = document.createElement("div");
      botEl.className = "chat-bubble bot";
      botEl.innerHTML = `<p>🤖 ${botReply}</p>`;
      messages.appendChild(botEl);
      messages.scrollTop = messages.scrollHeight;

      // ElevenLabs TTS
      const audioRes = await fetch("/api/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: botReply }),
      });

      const audioBlob = await audioRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (err) {
      console.error("Voicechat error:", err);
    }
  });
});
