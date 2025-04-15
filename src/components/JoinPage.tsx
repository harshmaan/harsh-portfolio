import { createSignal, onMount, For, Show } from "solid-js";
import { db } from "../lib/firebase";
import { ref, set, onValue, update, remove } from "firebase/database";

const JoinPage = () => {
  const [name, setName] = createSignal("");
  const [sessionId, setSessionId] = createSignal("");
  const [joined, setJoined] = createSignal(false);
  const [playerId, setPlayerId] = createSignal("");
  const [players, setPlayers] = createSignal<any[]>([]);

  const [prompt, setPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [hasSubmitted, setHasSubmitted] = createSignal(false);
  const [scores, setScores] = createSignal<Record<string, number>>({});
  const [roundComplete, setRoundComplete] = createSignal(false);

  // Check if this player is the "host" (first player)
  const isHost = () => players().length > 0 && players()[0]?.id === playerId();

  // 🎯 Score using Gemini model
  const scoreWithLLM = async (responses: Record<string, string>) => {
    const formatted = Object.entries(responses)
      .map(([pid, res]) => `Player ${pid}: ${res}`)
      .join("\n");

    const promptText = `Evaluate these player responses to the prompt:\n\n"${prompt()}"\n\n${formatted}\n\nGive a JSON of playerId to score like { "playerId1": 90, "playerId2": 85 }`;

    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: promptText }),
    });

    const data = await res.json();
    try {
      const parsed = JSON.parse(data.response);
      setScores(parsed);
    } catch {
      console.error("Gemini LLM failed to return JSON, fallback to manual scoring");
    }
  };

  const handleJoin = async () => {
    if (!name().trim() || !sessionId().trim()) return;

    const newId = crypto.randomUUID();
    setPlayerId(newId);

    const playerRef = ref(db, `sessions/${sessionId()}/players/${newId}`);
    await set(playerRef, {
      name: name(),
      responded: false,
    });

    setJoined(true);

    const playersRef = ref(db, `sessions/${sessionId()}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data).map(([id, val]: any) => ({ id, ...val }));
      setPlayers(list);
    });

    const promptRef = ref(db, `sessions/${sessionId()}/prompt`);
    onValue(promptRef, (snapshot) => setPrompt(snapshot.val() || ""));

    const responsesRef = ref(db, `sessions/${sessionId()}/responses`);
    onValue(responsesRef, async (snapshot) => {
      const data = snapshot.val() || {};
      const allResponded = players().length > 0 && players().every(p => p.responded);
      if (allResponded) {
        await scoreWithLLM(data);
        setRoundComplete(true);
      }
    });
  };

  const generatePrompt = async () => {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Give a fun, creative prompt for an AI-powered group game.",
      }),
    });

    const data = await res.json();
    const generated = data.response?.trim();
    if (generated) {
      const promptRef = ref(db, `sessions/${sessionId()}/prompt`);
      await set(promptRef, generated);
    }
  };

  const handleSubmit = async () => {
    const res = response();
    const resRef = ref(db, `sessions/${sessionId()}/responses/${playerId()}`);
    await set(resRef, res);

    const playerRef = ref(db, `sessions/${sessionId()}/players/${playerId()}`);
    await update(playerRef, { responded: true });

    setHasSubmitted(true);
  };

  const startNewRound = async () => {
    await remove(ref(db, `sessions/${sessionId()}/responses`));
    const updates: any = {};
    players().forEach((p) => {
      updates[p.id] = { ...p, responded: false };
    });
    await update(ref(db, `sessions/${sessionId()}/players`), updates);
    await set(ref(db, `sessions/${sessionId()}/prompt`), "");
    setResponse("");
    setPrompt("");
    setScores({});
    setHasSubmitted(false);
    setRoundComplete(false);
  };

  return (
    <main class="min-h-screen bg-[#0d0d0d] text-white p-6">
      <Show when={!joined()}>
        <div class="max-w-md mx-auto space-y-4">
          <h1 class="text-2xl font-bold">🎮 Join Prompt Quest</h1>
          <input
            class="w-full p-2 rounded bg-neutral-800 text-white border border-neutral-600"
            placeholder="Enter your name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <input
            class="w-full p-2 rounded bg-neutral-800 text-white border border-neutral-600"
            placeholder="Enter session ID"
            value={sessionId()}
            onInput={(e) => setSessionId(e.currentTarget.value)}
          />
          <button
            class="w-full bg-red-600 hover:bg-red-700 py-2 rounded"
            onClick={handleJoin}
          >
            🚀 Join Game
          </button>
        </div>
      </Show>

      <Show when={joined()}>
        <div class="flex flex-col md:flex-row gap-6 mt-6">
          {/* Players Panel */}
          <aside class="w-full md:w-1/4 bg-neutral-900 border border-neutral-700 rounded-xl p-4">
            <h2 class="text-lg font-semibold mb-2">🧑‍🤝‍🧑 Players</h2>
            <For each={players()}>
              {(p) => (
                <div class="flex justify-between text-sm" key={p.id}>
                  <span>{p.name}</span>
                  <span class="text-xs text-gray-400">
                    {p.responded ? "✅" : "⌛"}
                  </span>
                </div>
              )}
            </For>

            <Show when={isHost() && !prompt()}>
              <button
                class="mt-4 text-sm bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded"
                onClick={generatePrompt}
              >
                🎲 Generate Prompt
              </button>
            </Show>

            <Show when={roundComplete()}>
              <div class="mt-4 border-t border-neutral-700 pt-2">
                <h3 class="text-sm font-semibold">🏆 Scores</h3>
                <ul class="text-xs mt-1">
                  <For each={Object.entries(scores())}>
                    {([pid, score]) => {
                      const player = players().find(p => p.id === pid);
                      return <li>{player?.name || pid}: {score}</li>;
                    }}
                  </For>
                </ul>
                <button
                  onClick={startNewRound}
                  class="mt-3 text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
                >
                  🔄 New Round
                </button>
              </div>
            </Show>
          </aside>

          {/* Game Area */}
          <section class="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-6">
            <h1 class="text-2xl font-bold mb-4">🎯 Quest Prompt</h1>
            <p class="text-gray-300 mb-6">
              {prompt() || "Waiting for prompt to load..."}
            </p>

            <textarea
              class="w-full bg-neutral-800 border border-neutral-600 text-white rounded-lg p-3 min-h-[120px]"
              placeholder="Write your response here..."
              value={response()}
              onInput={(e) => setResponse(e.currentTarget.value)}
              disabled={hasSubmitted() || !prompt()}
            />

            <button
              class="mt-4 bg-red-600 hover:bg-red-700 py-2 px-4 rounded-lg disabled:opacity-50"
              onClick={handleSubmit}
              disabled={hasSubmitted() || !response().trim()}
            >
              {hasSubmitted() ? "✔️ Submitted" : "🚀 Submit"}
            </button>
          </section>
        </div>
      </Show>
    </main>
  );
};

export default JoinPage;
