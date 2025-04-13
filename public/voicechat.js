document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("play-voice-btn");
  const modal = document.getElementById("voicebox-modal");
  const closeBtn = document.getElementById("voicebox-close");
  const form = document.getElementById("voicebox-form");
  const input = document.getElementById("voicebox-input");
  const messages = document.getElementById("voicebox-messages");

  if (modal) {
    modal.style.display = "none";
  }

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

  // 🚫 Disable input and button during processing
  input.disabled = true;
  form.querySelector("button")?.setAttribute("disabled", "true");

  // Show user bubble
  const userEl = document.createElement("div");
  userEl.className = "chat-bubble user";
  userEl.innerHTML = `<p>🧑 ${userMsg}</p>`;
  messages.appendChild(userEl);
  messages.scrollTop = messages.scrollHeight;
  input.value = '';

  try {
    const fullPrompt = `
      You are a senior data scientist impersonating Harsh Maan — an expert in AI, machine learning, and data science...

      Now, answer this user query as Harsh Maan:
      "${userMsg}"
    `;

    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: fullPrompt }),
    });

    let rawReply = (await res.json()).response || "Sorry, I’ve got nothing.";

    // ✅ Sanitize special characters
    const botReply = rawReply
      .replace(/[^\w\s.,!?'"-]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Show placeholder message
    const botEl = document.createElement("div");
    botEl.className = "chat-bubble bot";
    botEl.innerHTML = `<p>🤖 Speaking… listen up! 🎧</p>`;
    messages.appendChild(botEl);
    messages.scrollTop = messages.scrollHeight;

    // 🔊 Send to ElevenLabs
    const audioRes = await fetch("/api/elevenlabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: botReply }),
    });

    const audioBlob = await audioRes.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    // 🟢 Re-enable input after audio ends
    audio.onended = () => {
      input.disabled = false;
      form.querySelector("button")?.removeAttribute("disabled");
    };

    // Try auto-play
    try {
      await audio.play();
    } catch {
      // On blocked autoplay, show manual play button
      const playBtn = document.createElement("button");
      playBtn.textContent = "▶️ Play Response";
      playBtn.className = "text-sm text-green-400 underline hover:text-green-200";
      playBtn.onclick = () => {
        audio.currentTime = 0;
        audio.play();
      };
      botEl.appendChild(playBtn);

      // Still re-enable so user isn’t stuck
      input.disabled = false;
      form.querySelector("button")?.removeAttribute("disabled");
    }
  } catch (err) {
    console.error("Voicechat error:", err);
    input.disabled = false;
    form.querySelector("button")?.removeAttribute("disabled");
  }
});
