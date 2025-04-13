document.getElementById('chat-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const input = document.getElementById('chat-input');
  const messages = document.getElementById('chat-messages');

  const userMsg = input.value.trim();
  if (!userMsg) return;

  // Show user message
  const userEl = document.createElement('p');
  userEl.innerText = "🧑 " + userMsg;
  messages.appendChild(userEl);
  input.value = '';
  messages.scrollTop = messages.scrollHeight;

  // Call Gemini backend
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: userMsg }),
  });

  const data = await res.json();

  const botEl = document.createElement('p');
  botEl.innerText = "🤖 " + (data.reply || "Hmm... something went wrong.");
  messages.appendChild(botEl);

  messages.scrollTop = messages.scrollHeight;
});
