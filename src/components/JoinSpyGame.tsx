import { createSignal, Show, For, createEffect } from "solid-js";
import { db } from "../lib/firebase";
import { ref, set, onValue, remove } from "firebase/database";

const JoinSpyGame = () => {
  const [name, setName] = createSignal("");
  const [sessionId, setSessionId] = createSignal("");
  const [joined, setJoined] = createSignal(false);
  const [playerId, setPlayerId] = createSignal("");
  const [players, setPlayers] = createSignal<any[]>([]);
  const [role, setRole] = createSignal<"Imposter" | "Collaborator" | null>(null);
  const [prompt, setPrompt] = createSignal("");
  const [personalPrompt, setPersonalPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [hasSubmitted, setHasSubmitted] = createSignal(false);
  const [responses, setResponses] = createSignal<Record<string, string>>({});
  const [votingPhase, setVotingPhase] = createSignal(false);
  const [votes, setVotes] = createSignal<Record<string, string>>({});
  const [eliminated, setEliminated] = createSignal<string | null>(null);
  const [gameOver, setGameOver] = createSignal(false);
  const [winner, setWinner] = createSignal<"Imposter" | "Collaborators" | null>(null);

  const isHost = () => players()[0]?.id === playerId();

  const handleJoin = async () => {
    const id = crypto.randomUUID();
    setPlayerId(id);
    await set(ref(db, `spy/${sessionId()}/players/${id}`), {
      name: name(),
      joinedAt: Date.now(),
    });
    setJoined(true);

    const playersRef = ref(db, `spy/${sessionId()}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const sorted = Object.entries(data).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
      setPlayers(sorted.map(([id, val]: any) => ({ id, ...val })));
    });

    onValue(ref(db, `spy/${sessionId()}/roles/${id}`), (snap) => {
      if (snap.exists()) setRole(snap.val());
    });

    onValue(ref(db, `spy/${sessionId()}/personalPrompts/${id}`), (snap) => {
      if (snap.exists()) setPersonalPrompt(snap.val());
    });

    onValue(ref(db, `spy/${sessionId()}/basePrompt`), (snap) => {
      if (snap.exists()) setPrompt(snap.val());
    });

    onValue(ref(db, `spy/${sessionId()}/responses`), (snap) => {
      const data = snap.val() || {};
      setResponses(data);
      if (Object.keys(data).length === players().length) {
        setVotingPhase(true);
      }
    });

    onValue(ref(db, `spy/${sessionId()}/votes`), (snap) => {
      setVotes(snap.val() || {});
    });

    onValue(ref(db, `spy/${sessionId()}/gameOver`), (snap) => {
      if (snap.exists()) setGameOver(snap.val());
    });

    onValue(ref(db, `spy/${sessionId()}/winner`), (snap) => {
      if (snap.exists()) setWinner(snap.val());
    });

    // 🔄 NEW: Listen for round reset trigger
    onValue(ref(db, `spy/${sessionId()}/roundId`), (snap) => {
      if (!snap.exists()) return;
      setVotingPhase(false);
      setHasSubmitted(false);
      setPrompt("");
      setPersonalPrompt("");
      setResponse("");
      setEliminated(null);
      setGameOver(false);
      setWinner(null);
      setResponses({});
      setVotes({});
    });

    onValue(ref(db, `spy/${sessionId()}/eliminated`), async (snap) => {
      if (!snap.exists()) return;
      const eliminatedId = snap.val();
      setEliminated(eliminatedId);

      if (isHost() && !gameOver()) {
        setTimeout(async () => {
          await startNextRound();
          await generatePrompt();
        }, 2000);
      }
    });
  };

  const generatePrompt = async () => {
    const res = await fetch("/api/spy-prompt");
    const { basePrompt, imposterPrompt } = await res.json();
    await set(ref(db, `spy/${sessionId()}/basePrompt`), basePrompt);

    const imposterIndex = Math.floor(Math.random() * players().length);
    await Promise.all(
      players().map(async (player, idx) => {
        const role = idx === imposterIndex ? "Imposter" : "Collaborator";
        const promptToSend = idx === imposterIndex ? imposterPrompt : basePrompt;

        await set(ref(db, `spy/${sessionId()}/roles/${player.id}`), role);
        await set(ref(db, `spy/${sessionId()}/personalPrompts/${player.id}`), promptToSend);
      })
    );
  };

  const handleSubmitResponse = async () => {
    await set(ref(db, `spy/${sessionId()}/responses/${playerId()}`), response());
    setHasSubmitted(true);
  };

  const handleVote = async (targetId: string) => {
    await set(ref(db, `spy/${sessionId()}/votes/${playerId()}`), targetId);
  };

  const startNextRound = async () => {
    const base = `spy/${sessionId()}`;
    await Promise.all([
      remove(ref(db, `${base}/basePrompt`)),
      remove(ref(db, `${base}/roles`)),
      remove(ref(db, `${base}/personalPrompts`)),
      remove(ref(db, `${base}/responses`)),
      remove(ref(db, `${base}/votes`)),
      remove(ref(db, `${base}/eliminated`)),
      remove(ref(db, `${base}/gameOver`)),
      remove(ref(db, `${base}/winner`)),
    ]);

    // 🔄 NEW: Signal reset to all clients
    await set(ref(db, `${base}/roundId`), crypto.randomUUID());
  };

  const tallyVotesAndEliminate = async () => {
    const allVotes = votes();
    const voteCounts: Record<string, number> = {};
    Object.values(allVotes).forEach((id) => {
      voteCounts[id] = (voteCounts[id] || 0) + 1;
    });

    const [topPlayerId] = Object.entries(voteCounts).sort((a, b) => b[1] - a[1])[0];
    await set(ref(db, `spy/${sessionId()}/eliminated`), topPlayerId);

    const roleRef = ref(db, `spy/${sessionId()}/roles/${topPlayerId}`);
    onValue(roleRef, (snap) => {
      if (!snap.exists()) return;

      (async () => {
        const eliminatedRole = snap.val();
        if (eliminatedRole === "Imposter") {
          await set(ref(db, `spy/${sessionId()}/winner`), "Collaborators");
          await set(ref(db, `spy/${sessionId()}/gameOver`), true);
        } else {
          const remaining = players().length - 1;
          if (remaining <= 2) {
            await set(ref(db, `spy/${sessionId()}/winner`), "Imposter");
            await set(ref(db, `spy/${sessionId()}/gameOver`), true);
          }
        }
      })();
    }, { onlyOnce: true });
  };

  createEffect(() => {
    if (votingPhase() && Object.keys(votes()).length === players().length && !eliminated()) {
      tallyVotesAndEliminate();
    }
  });

  return (
    <main class="p-6 max-w-4xl mx-auto text-white">
      <Show when={!joined()}>
        <div class="space-y-4 text-center">
          <h1 class="text-3xl font-bold">🕵️ Join Spy Among Prompts</h1>
          <input class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded"
            placeholder="Name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
          <input class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded"
            placeholder="Session ID" value={sessionId()} onInput={(e) => setSessionId(e.currentTarget.value)} />
          <button onClick={handleJoin} class="bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded">🚀 Join Game</button>
        </div>
      </Show>

      <Show when={joined()}>
        <h2 class="text-xl font-semibold mb-2">Welcome, {name()}!</h2>

        <div class="mb-6 border border-neutral-700 p-4 rounded bg-neutral-800">
          <h3 class="text-lg font-semibold mb-2">👥 Players in Lobby</h3>
          <For each={players()}>
            {(player) => {
              const isSelf = player.id === playerId();
              const hasPrompt = !!personalPrompt();
              const playerRole =
                hasPrompt && player.id === playerId()
                  ? role()
                  : hasPrompt
                  ? "❓"
                  : null;
              const hasResponded = hasPrompt && responses()[player.id];

              return (
                <div class="text-sm text-gray-200 flex justify-between items-center mb-1">
                  <div>
                    {player.name}
                    {isSelf && " (You)"}
                    {playerRole && (
                      <span class="text-xs text-gray-400 italic ml-1">
                        {player.id === playerId()
                          ? playerRole === "Imposter"
                            ? "— Imposter"
                            : "— Collaborator"
                          : "— Role Hidden"}
                      </span>
                    )}
                  </div>
                  {hasPrompt && (
                    <span class={`text-xs font-medium ${
                      hasResponded ? "text-green-400" : "text-yellow-400 animate-pulse"
                    }`}>
                      {hasResponded ? "✅ Responded" : "⌛ Waiting"}
                    </span>
                  )}
                </div>
              );
            }}
          </For>
        </div>

        <Show when={personalPrompt() && eliminated() !== playerId() && winner() === null}>
          <p class="mb-4">📝 <strong>Your Prompt:</strong> {personalPrompt()}</p>
          <textarea
            class="w-full bg-neutral-800 border border-neutral-600 p-2 rounded"
            rows="5"
            value={response()}
            onInput={(e) => setResponse(e.currentTarget.value)}
            disabled={hasSubmitted() || eliminated() === playerId()}
          />
          <button
            onClick={handleSubmitResponse}
            disabled={hasSubmitted() || eliminated() === playerId()}
            class="mt-2 bg-red-600 hover:bg-red-700 py-2 px-4 rounded"
          >
            {hasSubmitted() ? "✔️ Submitted" : "📤 Submit Response"}
          </button>
        </Show>

        <Show when={Object.keys(responses()).length === players().length}>
          <div class="mt-6">
            <h3 class="text-lg font-semibold mb-2">🧾 All Responses</h3>
            <For each={Object.entries(responses())}>
              {([id, resp]) => (
                <div class="mb-2 p-2 border border-neutral-600 bg-neutral-800 rounded">
                  <p class="text-sm italic">{resp}</p>
                  <Show when={votingPhase() && !votes()[playerId()] && eliminated() !== playerId() && winner() === null}>
                    <button
                      class="mt-1 text-xs bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded"
                      onClick={() => handleVote(id)}
                    >
                      Vote to Eliminate
                    </button>
                  </Show>
                  <Show when={eliminated() === playerId() && votingPhase()}>
                  <p class="text-xs italic text-yellow-400 mt-1">You’ve been eliminated. Viewing only.</p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={eliminated()}>
          <div class="mt-6 p-4 border border-red-600 bg-neutral-900 rounded">
            ❌ <strong>{players().find(p => p.id === eliminated())?.name}</strong> was eliminated!
          </div>
        </Show>

        <Show when={gameOver()}>
          <div class="mt-6 p-6 bg-neutral-900 border border-neutral-600 rounded text-center">
            <h2 class="text-2xl font-bold mb-2">🎮 Game Over</h2>
            <p class="text-lg">
              {winner() === "Collaborators"
                ? "✅ Collaborators win! The Imposter was caught."
                : "😈 Imposter wins! Only 2 players remain."}
            </p>
            <Show when={isHost()}>
              <button
                onClick={startNextRound}
                class="mt-4 bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
              >
                🔁 Play Again
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </main>
  );
};

export default JoinSpyGame;
