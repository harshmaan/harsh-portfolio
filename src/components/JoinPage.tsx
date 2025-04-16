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
  const [hostId, setHostId] = createSignal<string | null>(null);

  const isHost = () => playerId() === hostId();

  const handleJoin = async () => {
    if (!name().trim() || !sessionId().trim()) return;

    const newPlayerId = crypto.randomUUID();
    setPlayerId(newPlayerId);

    const playerRef = ref(db, `sessions/${sessionId()}/players/${newPlayerId}`);
    await set(playerRef, {
      name: name(),
      responded: false,
      readyNextRound: false,
      joinedAt: Date.now(),
    });

    setJoined(true);

    const playersRef = ref(db, `sessions/${sessionId()}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const sortedEntries = Object.entries(data).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
      const formatted = sortedEntries.map(([id, val]: any) => ({ id, ...val }));
      setPlayers(formatted);
      setHostId(formatted[0]?.id || null);
    });

    const promptRef = ref(db, `sessions/${sessionId()}/prompt`);
    onValue(promptRef, (snapshot) => {
      const val = snapshot.val() || "";
      setPrompt(val);
    
      // ✅ Always reset for new prompt
      setHasSubmitted(false);
      setResponse("");
    
      // 🧼 Optional: clear scores if prompt is empty (initial state)
      if (!val) {
        setScores({});
      }
    });

    const scoresRef = ref(db, `sessions/${sessionId()}/scores`);
    onValue(scoresRef, (snapshot) => {
      const data = snapshot.val() || {};
      setScores(data);
      setRoundComplete(!!snapshot.exists());
    });

    const winnerRef = ref(db, `sessions/${sessionId()}/winnerId`);
    onValue(winnerRef, (snapshot) => {
      setWinnerId(snapshot.val() || "");
    });

    const responsesRef = ref(db, `sessions/${sessionId()}/responses`);
    onValue(responsesRef, async (snapshot) => {
      const data = snapshot.val() || {};
      const allResponded = players().length > 0 && Object.keys(data).length === players().length;

      if (allResponded && isHost()) {
        const promptText = prompt();
        const newScores: Record<string, number> = {};

        for (const [pid, res] of Object.entries(data)) {
          const score = await getLLMScore(promptText, res as string);
          newScores[pid] = score;
        }

        const sorted = Object.entries(newScores).sort((a, b) => b[1] - a[1]);
        await set(ref(db, `sessions/${sessionId()}/scores`), newScores);
        await set(ref(db, `sessions/${sessionId()}/winnerId`), sorted[0][0]);
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
    const playerPath = `sessions/${sessionId()}/players/${playerId()}`;
    await set(ref(db, `sessions/${sessionId()}/responses/${playerId()}`), responseVal);
    await update(ref(db, playerPath), { responded: true });
    setHasSubmitted(true);
  };

  const startNewRound = async () => {
    await remove(ref(db, `sessions/${sessionId()}/responses`));
    await remove(ref(db, `sessions/${sessionId()}/scores`));
    await remove(ref(db, `sessions/${sessionId()}/winnerId`));

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
      body: JSON.stringify({
        prompt:
          "You are a playful game master designing creative, lighthearted challenges for a multiplayer storytelling game called Prompt Quest. Generate one funny, corporate-themed challenge where the player must convince someone or something in a typical workplace to do something. The character should be related to office life — like coworkers, bosses, HR, interns. The goal should be realistic or relatable, with a humorous twist. Avoid fantasy, complex logic, or niche references. Keep it simple and fun. Format: “Convince <workplace being> to <do something>.” Examples: “Convince your manager to approve a week off with no questions asked.” “Convince HR to let you bring your pet llama to the team meeting.” “Convince the intern that you’re actually the CEO in disguise.” Now generate ONE corporate-themed convincing challenge.",
      }),
    });
    const data = await res.json();
    await set(ref(db, `sessions/${sessionId()}/prompt`), data.response);
  };

  return (
    <main class="p-6 w-full max-w-screen-xl mx-auto text-white overflow-x-hidden overflow-y-auto min-h-screen">
      <a
        class="text-white absolute bg-neutral-900 hover:bg-neutral-800 top-4 left-4 px-4 py-2 border border-neutral-600 rounded-lg text-sm z-50"
        href="/"
      >
        ← Back
      </a>

      <Show when={!joined()}>
        <div class="flex justify-center items-center min-h-[90vh] px-4">
          <div class="max-w-md w-full space-y-6 text-center">
            <h1 class="text-3xl font-bold">Enter the Arena</h1>
      
            <div class="space-y-4">
              <input
                class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded text-white"
                placeholder="Enter your name"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
              <input
                class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded text-white"
                placeholder="Enter session ID"
                value={sessionId()}
                onInput={(e) => setSessionId(e.currentTarget.value)}
              />
              <button
                class="w-full bg-red-600 hover:bg-red-700 py-2 rounded disabled:opacity-50"
                disabled={!name().trim() || !sessionId().trim()}
                onClick={async () => {
                  console.log("Joining with name:", name(), "Session ID:", sessionId());
                  try {
                    await handleJoin();
                  } catch (err) {
                    console.error("Join failed:", err);
                    alert("Something went wrong while joining. Please try again.");
                  }
                }}
              >
                Join Game
              </button>
            </div>
      
            <div class="text-left mt-6 p-4 bg-neutral-900 border border-neutral-700 rounded space-y-4 text-sm leading-relaxed text-gray-300">
              <div>
                <h2 class="text-white font-semibold text-base">Concept</h2>
                <p>
                  Each team member gets a challenge like:  
                  <em>“Convince a dragon to give you the treasure — but you can only use cooking metaphors.”</em><br />
                  They submit their responses, and the LLM rates them on creativity, cleverness, or humor.
                </p>
              </div>
      
              <div>
                <h2 class="text-white font-semibold text-base">Instructions</h2>
                <ol class="list-decimal list-inside space-y-1">
                  <li>The first player creates a session by entering their name and a custom session ID.</li>
                  <li>Share the session ID with friends so they can join the same game.</li>
                  <li>The first player to join becomes the host and can generate prompts and start new rounds.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </Show>



      <Show when={joined()}>
        <div class="flex flex-col md:flex-row gap-6 mt-14 max-w-full">
          <aside class="w-full md:w-1/4 bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3 text-white max-h-screen overflow-y-auto">
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
            <Show when={roundComplete() && isHost()}>
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

          <section class="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-6 text-white max-h-screen overflow-y-auto">
            <h1 class="text-2xl font-bold mb-4">🎯 Quest Prompt</h1>

            <Show when={!prompt()}>
              <p class="text-gray-300 mb-6">Waiting for prompt to load...</p>
            </Show>

            <Show when={isHost() && !prompt()}>
              <button class="mb-6 bg-green-600 hover:bg-green-700 py-2 px-4 rounded" onClick={generatePrompt}>✨ Generate Prompt</button>
            </Show>

            <Show when={prompt() && !roundComplete()}>
              <p class="text-gray-300 mb-6 whitespace-pre-wrap break-words">{prompt()}</p>
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
              <div class="bg-neutral-800 border border-neutral-600 p-4 rounded-lg space-y-4">
                <p class="text-lg font-semibold text-green-400">
                  🎉 {players().find(p => p.id === winnerId())?.name} won this round!
                </p>
            
                <div class="text-sm text-gray-300">
                  <p class="font-semibold">📝 Winning Response:</p>
                  <Show when={players().length}>
                    {() => {
                      const responseRef = ref(db, `sessions/${sessionId()}/responses/${winnerId()}`);
                      onValue(responseRef, (snap) => {
                        const val = snap.val();
                        if (val) setResponse(val);
                      });
            
                      const score = scores()[winnerId()] || 0;
                      return (
                        <p class="mt-1 italic">
                          {response()} <span class="text-yellow-400 font-medium ml-2">({score} pts)</span>
                        </p>
                      );
                    }}
                  </Show>
                </div>
            
                <div class="pt-2 border-t border-neutral-700">
                  <h3 class="text-sm font-semibold mb-2">🗣️ All Player Responses</h3>
                  <For each={players()}>
                    {(player) => {
                      const playerResponseRef = ref(db, `sessions/${sessionId()}/responses/${player.id}`);
                      const [playerResponse, setPlayerResponse] = createSignal("");
            
                      onValue(playerResponseRef, (snap) => {
                        const val = snap.val();
                        if (val) setPlayerResponse(val);
                      });
            
                      return (
                        <div class="mb-2 text-sm">
                          <span class="font-semibold">{player.name}:</span>{" "}
                          <span class="italic text-gray-300">{playerResponse()}</span>
                          <span class="text-yellow-400 font-medium ml-2">
                            ({scores()[player.id] || 0} pts)
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </section>
        </div>
      </Show>
    </main>
  );
};

export default JoinPage;
