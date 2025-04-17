// File: src/components/JoinSpyGame.tsx

import { createSignal, Show, For } from "solid-js";
import { db } from "../lib/firebase";
import { ref, set, onValue } from "firebase/database";

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

    const roleRef = ref(db, `spy/${sessionId()}/roles/${id}`);
    onValue(roleRef, (snap) => {
      if (snap.exists()) setRole(snap.val());
    });

    const personalPromptRef = ref(db, `spy/${sessionId()}/personalPrompts/${id}`);
    onValue(personalPromptRef, (snap) => {
      if (snap.exists()) setPersonalPrompt(snap.val());
    });

    const promptRef = ref(db, `spy/${sessionId()}/basePrompt`);
    onValue(promptRef, (snap) => {
      if (snap.exists()) setPrompt(snap.val());
    });

    const responsesRef = ref(db, `spy/${sessionId()}/responses`);
    onValue(responsesRef, (snap) => {
      setResponses(snap.val() || {});
    });

    const votesRef = ref(db, `spy/${sessionId()}/votes`);
    onValue(votesRef, (snap) => {
      setVotes(snap.val() || {});
    });

    const eliminatedRef = ref(db, `spy/${sessionId()}/eliminated`);
    onValue(eliminatedRef, (snap) => {
      if (snap.exists()) setEliminated(snap.val());
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

  return (
    <main class="p-6 max-w-4xl mx-auto text-white">
      <Show when={!joined()}>
        <div class="space-y-4 text-center">
          <h1 class="text-3xl font-bold">🕵️ Join Spy Among Prompts</h1>
          <input
            class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded"
            placeholder="Name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <input
            class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded"
            placeholder="Session ID"
            value={sessionId()}
            onInput={(e) => setSessionId(e.currentTarget.value)}
          />
          <button
            onClick={handleJoin}
            class="bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
          >
            🚀 Join Game
          </button>
        </div>
      </Show>

      <Show when={joined()}>
        <h2 class="text-xl font-semibold mb-2">Welcome, {name()}!</h2>
      
        {/* 👥 Player Lobby List */}
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
                    <span
                      class={`text-xs font-medium ${
                        hasResponded ? "text-green-400" : "text-yellow-400 animate-pulse"
                      }`}
                    >
                      {hasResponded ? "✅ Responded" : "⌛ Waiting"}
                    </span>
                  )}
                </div>
              );
            }}
          </For>
        </div>

      
        {/* 🧑‍💼 Host sees Start Round button + waiting info */}
        <Show when={isHost()}>
          <button
            onClick={generatePrompt}
            disabled={players().length < 4}
            class="mb-4 bg-green-600 hover:bg-green-700 py-2 px-4 rounded disabled:opacity-50"
          >
            🎭 Start Round
          </button>
      
          <Show when={players().length < 4}>
            <p class="text-yellow-400 text-sm mt-2 animate-pulse">
              ⏳ Need {4 - players().length} more player(s) to start...
            </p>
          </Show>
        </Show>
      
        {/* 🧍 Non-host waiting indicator */}
        <Show when={!isHost() && players().length < 4}>
          <div class="text-sm text-yellow-400 mb-4 animate-pulse">
            ⏳ Waiting for host to start — {4 - players().length} more needed
          </div>
        </Show>
      
        {/* ✍️ Prompt + response section */}
        <Show when={personalPrompt()}>
          <p class="mb-4">📝 <strong>Your Prompt:</strong> {personalPrompt()}</p>
          <textarea
            class="w-full bg-neutral-800 border border-neutral-600 p-2 rounded"
            rows="5"
            value={response()}
            onInput={(e) => setResponse(e.currentTarget.value)}
            disabled={hasSubmitted()}
          />
          <button
            onClick={handleSubmitResponse}
            disabled={hasSubmitted()}
            class="mt-2 bg-red-600 hover:bg-red-700 py-2 px-4 rounded"
          >
            {hasSubmitted() ? "✔️ Submitted" : "📤 Submit Response"}
          </button>
        </Show>
      
        {/* 🧾 Show all anonymous responses when all submitted */}
        <Show when={Object.keys(responses()).length === players().length}>
          <div class="mt-6">
            <h3 class="text-lg font-semibold mb-2">🧾 All Responses</h3>
            <For each={Object.entries(responses())}>
              {([id, resp]) => (
                <div class="mb-2 p-2 border border-neutral-600 bg-neutral-800 rounded">
                  <p class="text-sm italic">{resp}</p>
                  <Show when={!votingPhase()}>
                    <button
                      class="mt-1 text-xs bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded"
                      onClick={() => handleVote(id)}
                    >
                      Vote to Eliminate
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      
        {/* ❌ Show elimination result */}
        <Show when={eliminated()}>
          <div class="mt-6 p-4 border border-red-600 bg-neutral-900 rounded">
            ❌ <strong>{players().find(p => p.id === eliminated())?.name}</strong> was eliminated!
          </div>
        </Show>
      </Show>
    </main>
  );
};

export default JoinSpyGame;
