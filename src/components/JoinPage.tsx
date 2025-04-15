// File: src/components/JoinGame.tsx
import { createSignal, onMount, For } from "solid-js";
import { ref, set, onValue, update } from "firebase/database";
import { db } from "../lib/firebase"; // make sure this path is correct

interface Props {
  sessionId: string;
}

const JoinGame = (props: Props) => {
  const sessionId = props.sessionId;
  const playerName = localStorage.getItem("promptQuestName") || "";
  const playerId = crypto.randomUUID();

  const [players, setPlayers] = createSignal<any[]>([]);
  const [prompt, setPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [hasSubmitted, setHasSubmitted] = createSignal(false);

  onMount(() => {
    if (!playerName || !sessionId) return;

    const playerRef = ref(db, `sessions/${sessionId}/players/${playerId}`);
    set(playerRef, {
      name: playerName,
      responded: false,
      readyNextRound: false,
    });

    const playersRef = ref(db, `sessions/${sessionId}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const formatted = Object.entries(data).map(([id, val]: any) => ({
        id,
        ...val,
      }));
      setPlayers(formatted);
    });

    const promptRef = ref(db, `sessions/${sessionId}/prompt`);
    onValue(promptRef, (snapshot) => {
      setPrompt(snapshot.val() || "");
    });
  });

  const handleSubmit = async () => {
    const responseVal = response();
    const responseRef = ref(db, `sessions/${sessionId}/responses/${playerId}`);
    await set(responseRef, responseVal);
    const playerRef = ref(db, `sessions/${sessionId}/players/${playerId}`);
    await update(playerRef, { responded: true });
    setHasSubmitted(true);
  };

  if (!playerName) {
    return (
      <div class="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <p>⚠️ Please go back and enter your name to join the game.</p>
      </div>
    );
  }

  return (
    <main class="min-h-screen bg-[#0d0d0d] text-white p-6 flex flex-col md:flex-row gap-6">
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
    </main>
  );
};

export default JoinGame;
