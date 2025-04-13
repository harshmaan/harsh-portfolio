document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("play-voice-btn");
  const modal = document.getElementById("voicebox-modal");
  const closeBtn = document.getElementById("voicebox-close");
  const form = document.getElementById("voicebox-form");
  const input = document.getElementById("voicebox-input");
  const messages = document.getElementById("voicebox-messages");

  // Always hide the modal if it exists
  if (modal) modal.style.display = "none";

  // Stop if required elements are missing (i.e., not the homepage)
  if (!openBtn || !modal || !closeBtn || !form || !input || !messages) return;

  openBtn.addEventListener("click", () => {
    modal.classList.remove("hidden"); // show
    modal.classList.add("flex");      // restore flex layout
  });

  closeBtn.addEventListener("click", () => {
    modal.classList.remove("flex");
    modal.classList.add("hidden");    // hide
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userMsg = input.value.trim();
    if (!userMsg) return;

    input.disabled = true;
    const submitBtn = form.querySelector("button");
    submitBtn?.setAttribute("disabled", "true");

    const userEl = document.createElement("div");
    userEl.className = "chat-bubble user";
    userEl.innerHTML = `<p>🧑 ${userMsg}</p>`;
    messages.appendChild(userEl);
    messages.scrollTop = messages.scrollHeight;
    input.value = '';

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
        2. Always respond in first person tone.
        3. Always add a touch of humor, puns, or light sarcasm — keep it clever and human.
        4. Keep answers short. Be clear and concise. 
        5. Use markdown formatting — include lists, bold text, code blocks, etc. when helpful.
        
        Now, answer this user query as Harsh Maan:
        
        "${userMsg}"
      `;

      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt }),
      });

      const rawReply = (await res.json()).response || "Sorry, I’ve got nothing.";

      const botReply = rawReply
        .replace(/[^\w\s.,!?\'"-]/g, "")
        .replace(/\s+/g, " ")
        .replace(/[*_~`>#]/g, "")
        .trim();

      const botEl = document.createElement("div");
      botEl.className = "chat-bubble bot";
      botEl.innerHTML = `
        <p>🤖 Speaking… listen up! 🎧</p>
        <div class="voice-anim mt-2 flex gap-1">
          <div class="bar bar1"></div>
          <div class="bar bar2"></div>
          <div class="bar bar3"></div>
        </div>
      `;
      messages.appendChild(botEl);
      messages.scrollTop = messages.scrollHeight;

      const audioRes = await fetch("/api/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: botReply }),
      });

      const audioBlob = await audioRes.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        input.disabled = false;
        submitBtn?.removeAttribute("disabled");
        const anim = botEl.querySelector(".voice-anim");
        if (anim) anim.remove();
      };

      await audio.play();

    } catch (err) {
      console.error("Voicechat error:", err);
      input.disabled = false;
      form.querySelector("button")?.removeAttribute("disabled");
    }
  });
});
