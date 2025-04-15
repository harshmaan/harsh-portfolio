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
  const [winnerId, setWinnerId] = createSignal("");

  const isHost = () => players()[0]?.id === playerId();

  const handleJoin = async () => {
    if (!name().trim() || !sessionId().trim()) return;

    const newPlayerId = crypto.randomUUID();
    setPlayerId(newPlayerId);

    const playerRef = ref(db, `sessions/${sessionId()}/players/${newPlayerId}`);
    await set(playerRef, {
      name: name(),
      responded: false,
      readyNextRound: false,
    });

    setJoined(true);

    const playersRef = ref(db, `sessions/${sessionId()}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const formatted = Object.entries(data).map(([id, val]: any) => ({ id, ...val }));
      setPlayers(formatted);
    });

    const promptRef = ref(db, `sessions/${sessionId()}/prompt`);
    onValue(promptRef, (snapshot) => {
      setPrompt(snapshot.val() || "");
    });

    const responsesRef = ref(db, `sessions/${sessionId()}/responses`);
    onValue(responsesRef, async (snapshot) => {
      const data = snapshot.val() || {};
      const allResponded = players().length > 0 && players().every(p => p.responded);
      if (allResponded) {
        const promptText = prompt();
        const newScores: Record<string, number> = {};

        for (const [pid, res] of Object.entries(data)) {
          const score = await getLLMScore(promptText, res as string);
          newScores[pid] = score;
        }

        setScores(newScores);
        const sorted = Object.entries(newScores).sort((a, b) => b[1] - a[1]);
        setWinnerId(sorted[0][0]);
        setRoundComplete(true);
      }
    });
  };

  const getLLMScore = async (prompt: string, response: string): Promise<number> => {
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Evaluate this response to a prompt on creativity, humor, and relevance. Give a score out of 100.\n\nPrompt: "${prompt}"\nResponse: "${response}"\n\nOnly return the score as a number.`,
        }),
      });
      const data = await res.json();
      const match = data.response?.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    } catch {
      return 0;
    }
  };

  const handleSubmit = async () => {
    const responseVal = response();
    await set(ref(db, `sessions/${sessionId()}/responses/${playerId()}`), responseVal);
    await update(ref(db, `sessions/${sessionId()}/players/${playerId()}`), { responded: true });
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
    setPrompt("");
    setResponse("");
    setScores({});
    setHasSubmitted(false);
    setRoundComplete(false);
  };

  const generatePrompt = async () => {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Generate a creative multiplayer writing game prompt in markdown format. Keep it quirky and challenging." }),
    });
    const data = await res.json();
    await set(ref(db, `sessions/${sessionId()}/prompt`), data.response);
  };

  return (
    <main class="min-h-screen bg-[#0d0d0d] text-white p-6">
      <Show when={!joined()}>
        <div class="max-w-md mx-auto space-y-4">
          <h1 class="text-2xl font-bold">🎮 Join Prompt Quest</h1>
          <input class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded" placeholder="Enter your name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          <input class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded" placeholder="Enter session ID" value={sessionId()} onInput={(e) => setSessionId(e.currentTarget.value)} />
          <button class="w-full bg-red-600 hover:bg-red-700 py-2 rounded" onClick={handleJoin}>🚀 Join Game</button>
        </div>
      </Show>

      <Show when={joined()}>
        <div class="flex flex-col md:flex-row gap-6 mt-6">
          <aside class="w-full md:w-1/4 bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
            <h2 class="text-lg font-semibold">🧑‍🤝‍🧑 Players</h2>
            <For each={players()}>
              {(player) => (
                <div class="flex items-center justify-between text-sm" key={player.id}>
                  <span>{player.name}</span>
                  <span class="text-xs text-gray-400">
                    {player.responded ? "✅" : "⌛"}
                    {player.id === winnerId() && roundComplete() && " 🏆"}
                  </span>
                </div>
              )}
            </For>
            <Show when={roundComplete()}>
              <div class="mt-4 border-t border-neutral-700 pt-2 text-xs">
                <h3 class="text-sm font-semibold">🏅 Scores</h3>
                <For each={Object.entries(scores())}>
                  {([pid, score]) => {
                    const p = players().find(p => p.id === pid);
                    return <div>{p?.name || pid}: {score}</div>;
                  }}
                </For>
                <button class="mt-3 text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded" onClick={startNewRound}>🔄 New Round</button>
              </div>
            </Show>
          </aside>

          <section class="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-6">
            <h1 class="text-2xl font-bold mb-4">🎯 Quest Prompt</h1>

            <Show when={!prompt()}>
              <p class="text-gray-300 mb-6">Waiting for prompt to load...</p>
            </Show>

            <Show when={isHost() && !prompt()}>
              <button class="mb-6 bg-green-600 hover:bg-green-700 py-2 px-4 rounded" onClick={generatePrompt}>✨ Generate Prompt</button>
            </Show>

            <Show when={prompt() && !roundComplete()}>
              <p class="text-gray-300 mb-6 whitespace-pre-wrap">{prompt()}</p>
              <textarea
                class="w-full bg-neutral-800 border border-neutral-600 text-white rounded-lg p-3 min-h-[120px]"
                placeholder="Write your response here..."
                value={response()}
                onInput={(e) => setResponse(e.currentTarget.value)}
                disabled={hasSubmitted()}
              />
              <button
                class="mt-4 bg-red-600 hover:bg-red-700 py-2 px-4 rounded-lg disabled:opacity-50"
                onClick={handleSubmit}
                disabled={hasSubmitted() || !response().trim()}
              >
                {hasSubmitted() ? "✔️ Submitted" : "🚀 Submit Response"}
              </button>
            </Show>

            <Show when={roundComplete()}>
              <div class="bg-neutral-800 border border-neutral-600 p-4 rounded-lg">
                <h2 class="text-xl font-semibold mb-2">🏆 Round Complete!</h2>
                <p class="mb-2">🎉 <strong>{players().find(p => p.id === winnerId())?.name}</strong> won this round!</p>
                <ul class="text-sm space-y-1">
                  <For each={Object.entries(scores())}>
                    {([pid, score]) => {
                      const p = players().find(p => p.id === pid);
                      return <li>{p?.name || pid}: {score}</li>;
                    }}
                  </For>
                </ul>
              </div>
            </Show>
          </section>
        </div>
      </Show>
    </main>
  );
};

export default JoinPage;
