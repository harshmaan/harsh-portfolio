import { createSignal, onMount, For, Show } from "solid-js";
import { db } from "../lib/firebase";
import { ref, set, onValue, update, remove } from "firebase/database";

// Simple scoring: compares responses to prompt length-wise
const scoreResponse = (prompt: string, response: string): number => {
  const lenDiff = Math.abs(prompt.length - response.length);
  return Math.max(0, 100 - lenDiff);
};

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

  const handleJoin = async () => {
    if (!name().trim() || !sessionId().trim()) return;

    const newPlayerId = crypto.randomUUID();
    setPlayerId(newPlayerId);

    // Register player
    const playerRef = ref(db, `sessions/${sessionId()}/players/${newPlayerId}`);
    await set(playerRef, {
      name: name(),
      responded: false,
      readyNextRound: false,
    });

    setJoined(true);

    // Live update players
    const playersRef = ref(db, `sessions/${sessionId()}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const formatted = Object.entries(data).map(([id, val]: any) => ({
        id,
        ...val,
      }));
      setPlayers(formatted);
    });

    // Watch prompt
    const promptRef = ref(db, `sessions/${sessionId()}/prompt`);
    onValue(promptRef, (snapshot) => {
      setPrompt(snapshot.val() || "");
    });

    // Watch for round completion
    const responsesRef = ref(db, `sessions/${sessionId()}/responses`);
    onValue(responsesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const allResponded = players().length > 0 &&
        players().every(p => p.responded);
      if (allResponded) {
        const promptText = prompt();
        const newScores: Record<string, number> = {};
        Object.entries(data).forEach(([pid, res]) => {
          newScores[pid] = scoreResponse(promptText, res as string);
        });
        setScores(newScores);
        setRoundComplete(true);
      }
    });
  };

  const handleSubmit = async () => {
    const responseVal = response();
    const responseRef = ref(db, `sessions/${sessionId()}/responses/${playerId()}`);
    await set(responseRef, responseVal);
    const playerRef = ref(db, `sessions/${sessionId()}/players/${playerId()}`);
    await update(playerRef, { responded: true });
    setHasSubmitted(true);
  };

  const startNewRound = async () => {
    if (!sessionId()) return;
    const responsesRef = ref(db, `sessions/${sessionId()}/responses`);
    const playersRef = ref(db, `sessions/${sessionId()}/players`);
    await remove(responsesRef);
    await update(playersRef, Object.fromEntries(players().map(p => [p.id, { ...p, responded: false }])));
    setPrompt("");
    setResponse("");
    setHasSubmitted(false);
    setScores({});
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
          <aside class="w-full md:w-1/4 bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
            <h2 class="text-lg font-semibold mb-2">🧑‍🤝‍🧑 Players</h2>
            <For each={players()}>
              {(player) => (
                <div class="flex items-center justify-between text-sm" key={player.id}>
                  <span>{player.name}</span>
                  <span class="text-xs text-gray-400">
                    {player.responded ? "✅ Responded" : "⌛ Waiting"}
                  </span>
                </div>
              )}
            </For>

            <Show when={roundComplete()}>
              <div class="mt-4 border-t border-neutral-700 pt-2">
                <h3 class="text-sm font-semibold">🏆 Scores</h3>
                <ul class="text-xs mt-1">
                  <For each={Object.entries(scores())}>
                    {([pid, score]) => {
                      const p = players().find(p => p.id === pid);
                      return <li>{p?.name || pid}: {score} points</li>;
                    }}
                  </For>
                </ul>
                <button
                  onClick={startNewRound}
                  class="mt-3 text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
                >
                  🔄 Start New Round
                </button>
              </div>
            </Show>
          </aside>

          <section class="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-6">
            <h1 class="text-2xl font-bold mb-4">🎯 Quest Prompt</h1>
            <p class="text-gray-300 mb-6">{prompt() || "Waiting for prompt to load..."}</p>

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
              {hasSubmitted() ? "✔️ Submitted" : "🚀 Submit Response"}
            </button>
          </section>
        </div>
      </Show>
    </main>
  );
};

export default JoinPage;
