document.addEventListener("DOMContentLoaded", () => {
  const voiceBtn = document.getElementById("play-voice-btn");

  voiceBtn?.addEventListener("click", async () => {
    // Get the last bot message from the chat UI
    const lastBotBubble = [...document.querySelectorAll(".chat-bubble.bot")].pop();
    if (!lastBotBubble) return;

    const text = lastBotBubble.innerText.replace(/^🤖\s*/, "");
    if (!text) return;

    try {
      const res = await fetch("/api/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (err) {
      console.error("Voice playback error:", err);
    }
  });
});
