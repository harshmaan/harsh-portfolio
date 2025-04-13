document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const messages = document.getElementById("chat-messages");
  const closeBtn = document.getElementById("chatbox-close");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const userMsg = input.value.trim();
    if (!userMsg) return;

    const userEl = document.createElement("p");
    userEl.innerText = "🧑 " + userMsg;
    messages.appendChild(userEl);
    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg }),
      });

      const data = await res.json();
      const botEl = document.createElement("p");
      botEl.innerText = "🤖 " + (data.response || "Hmm... no answer.");
      messages.appendChild(botEl);
      messages.scrollTop = messages.scrollHeight;
    } catch (err) {
      console.error("Chat error:", err);
    }
  });

  closeBtn?.addEventListener("click", () => {
    document.getElementById("chatbox-modal")?.classList.add("hidden");
  });
});
