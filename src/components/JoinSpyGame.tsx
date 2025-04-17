import { createSignal, Show, For, createEffect } from "solid-js";
import { db } from "../lib/firebase";
import { ref, set, onValue, remove, get } from "firebase/database";

/**
 * Firebase layout  (added `/dead`)
 *
 * /spy/<sessionId>
 * ├─ players/{id}         → { name, joinedAt }
 * ├─ dead/{id}            → true           // persists for the whole match
 * ├─ basePrompt           → string
 * ├─ roles/{id}           → "Imposter" | "Collaborator"
 * ├─ personalPrompts/{id} → string
 * ├─ responses/{id}       → string
 * ├─ votes/{voterId}      → votedPlayerId
 * ├─ eliminated           → playerId       // round banner only
 * ├─ winner               → "Imposter" | "Collaborators"
 * ├─ gameOver             → boolean
 * ├─ roundId              → uuid  (round reset)
 * └─ matchId              → uuid  (full lobby reset)
 */

const JoinSpyGame = () => {
  /* ─────────── reactive state ─────────── */
  const [name, setName]               = createSignal("");
  const [sessionId, setSessionId]     = createSignal("");
  const [joined, setJoined]           = createSignal(false);
  const [playerId, setPlayerId]       = createSignal("");
  const [players, setPlayers]         = createSignal<any[]>([]);
  const [dead, setDead]               = createSignal<Record<string, boolean>>({});
  const [role, setRole]               = createSignal<"Imposter" | "Collaborator" | null>(null);
  const [prompt, setPrompt]           = createSignal("");
  const [personalPrompt, setPersonalPrompt] = createSignal("");
  const [response, setResponse]       = createSignal("");
  const [hasSubmitted, setHasSubmitted] = createSignal(false);
  const [responses, setResponses]     = createSignal<Record<string, string>>({});
  const [votingPhase, setVotingPhase] = createSignal(false);
  const [votes, setVotes]             = createSignal<Record<string, string>>({});
  const [eliminated, setEliminated]   = createSignal<string | null>(null);
  const [gameOver, setGameOver]       = createSignal(false);
  const [winner, setWinner]           = createSignal<"Imposter" | "Collaborators" | null>(null);

  /* ─────────── helpers ─────────── */
  const base        = () => `spy/${sessionId()}`;
  const isHost      = () => players()[0]?.id === playerId();
  const alivePlayers = () => players().filter(p => !dead()[p.id]);
  const isDead      = () => !!dead()[playerId()];

  /* ─────────── join lobby & listeners ─────────── */
  const handleJoin = async () => {
    const id = crypto.randomUUID();
    setPlayerId(id);
    await set(ref(db, `${base()}/players/${id}`), {
      name: name(),
      joinedAt: Date.now(),
    });
    setJoined(true);

    /* players list (sorted) */
    onValue(ref(db, `${base()}/players`), snap => {
      const data = snap.val() || {};
      const sorted = Object.entries(data).sort((a:any,b:any)=>a[1].joinedAt-b[1].joinedAt);
      setPlayers(sorted.map(([pid,val]:any) => ({ id: pid, ...val })));
    });

    /* graveyard */
    onValue(ref(db, `${base()}/dead`), snap => setDead(snap.val() || {}));

    /* personal role & prompt */
    onValue(ref(db, `${base()}/roles/${id}`),            s => s.exists() && setRole(s.val()));
    onValue(ref(db, `${base()}/personalPrompts/${id}`),  s => s.exists() && setPersonalPrompt(s.val()));

    /* shared state */
    onValue(ref(db, `${base()}/basePrompt`),  s => s.exists() && setPrompt(s.val()));
    onValue(ref(db, `${base()}/responses`),   s => {
      const data = s.val() || {};
      setResponses(data);
      if (Object.keys(data).length === alivePlayers().length) setVotingPhase(true);
    });
    onValue(ref(db, `${base()}/votes`),       s => setVotes(s.val() || {}));
    onValue(ref(db, `${base()}/eliminated`),  s => s.exists() && setEliminated(s.val()));
    onValue(ref(db, `${base()}/gameOver`),    s => s.exists() && setGameOver(s.val()));
    onValue(ref(db, `${base()}/winner`),      s => s.exists() && setWinner(s.val()));

    /* resets */
    onValue(ref(db, `${base()}/roundId`), s => s.exists() && resetRoundLocal());
    onValue(ref(db, `${base()}/matchId`), s => s.exists() && resetMatchLocal());
  };

  const resetRoundLocal = () => {
    setVotingPhase(false);
    setHasSubmitted(false);
    setPrompt("");
    setPersonalPrompt("");
    setResponse("");
    setEliminated(null);
    setResponses({});
    setVotes({});
  };

  const resetMatchLocal = () => {
    resetRoundLocal();
    setGameOver(false);
    setWinner(null);
  };

  /* ─────────── host‑only helpers ─────────── */
  const generatePrompt = async () => {
    const res = await fetch("/api/spy-prompt");
    const { basePrompt, imposterPrompt } = await res.json();

    await set(ref(db, `${base()}/basePrompt`), basePrompt);

    /* pick Imposter from alive players */
    const live = alivePlayers();
    const impIdx = Math.floor(Math.random() * live.length);
    await Promise.all(
      live.map((p, idx) => {
        const r = idx === impIdx ? "Imposter" : "Collaborator";
        return Promise.all([
          set(ref(db, `${base()}/roles/${p.id}`), r),
          set(
            ref(db, `${base()}/personalPrompts/${p.id}`),
            idx === impIdx ? imposterPrompt : basePrompt,
          ),
        ]);
      }),
    );
  };

  const startNextRound = async () => {
    await Promise.all(
      ["basePrompt", "roles", "personalPrompts", "responses", "votes", "eliminated"].map((k) =>
        remove(ref(db, `${base()}/${k}`)),
      ),
    );
    await set(ref(db, `${base()}/roundId`), crypto.randomUUID());
  };

  const startNewMatch = async () => {
    await startNextRound();
    await Promise.all([
      remove(ref(db, `${base()}/winner`)),
      remove(ref(db, `${base()}/gameOver`)),
      remove(ref(db, `${base()}/dead`)), // everyone alive again
    ]);
    await set(ref(db, `${base()}/matchId`), crypto.randomUUID());
  };

  /* ─────────── player actions ─────────── */
  const handleSubmitResponse = async () => {
    if (isDead()) return; // safety guard
    await set(ref(db, `${base()}/responses/${playerId()}`), response());
    setHasSubmitted(true);
  };

  const handleVote = (target: string) =>
    set(ref(db, `${base()}/votes/${playerId()}`), target);

  /* ─────────── vote tally & progression ─────────── */
  const tallyVotesAndEliminate = async () => {
    const counts: Record<string, number> = {};
    Object.values(votes()).forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    const [topId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    await set(ref(db, `${base()}/eliminated`), topId);
    await set(ref(db, `${base()}/dead/${topId}`), true); // persist kill

    /* check win conditions */
    const roleSnap = await get(ref(db, `${base()}/roles/${topId}`));
    const elimRole = roleSnap.val();
    const remaining = alivePlayers().length;

    if (elimRole === "Imposter") {
      await set(ref(db, `${base()}/winner`), "Collaborators");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (remaining === 2) { 
      await set(ref(db, `${base()}/winner`), "Imposter");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (isHost()) {
      await startNextRound();
      await generatePrompt();
    }
  };

  createEffect(() => {
    if (
      votingPhase() &&
      Object.keys(votes()).length === alivePlayers().length &&
      !eliminated()
    ) {
      tallyVotesAndEliminate();
    }
  });

  /* ─────────── UI helpers ─────────── */
  const eliminatedName = () => players().find((p) => p.id === eliminated())?.name;

  const resultLine = () =>
    winner() === "Collaborators"
      ? role() === "Imposter"
        ? "❌ You were caught and eliminated!"
        : `✅ You caught the Imposter! ${eliminatedName()} was eliminated.`
      : "😈 Imposter wins! Only 2 players remain.";

  const RoleBanner = () =>
    role() && (
      <div
        class={`mb-4 p-3 rounded font-semibold text-center ${
          role() === "Imposter" ? "bg-red-700" : "bg-green-700"
        }`}
      >
        {role() === "Imposter" ? "😈 You are the Imposter" : "🫶 You are a Collaborator"}
      </div>
    );

  /* ─────────── JSX layout ─────────── */
  return (
    <main class="p-6 max-w-4xl mx-auto text-white">
      {/* ───── Join Form ───── */}
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

      {/* ───── In‑Game View ───── */}
      <Show when={joined()}>
        <h2 class="text-xl font-semibold mb-2">Welcome, {name()}!</h2>
        <Show when={role()}>
        <span
          class={`inline-block mb-4 px-3 py-1 rounded-full text-sm font-medium ${
            role() === "Imposter"
              ? "bg-red-700 text-red-100"
              : "bg-green-700 text-green-100"
          }`}
        >
          {role() === "Imposter" ? "😈 Imposter" : "🫶 Collaborator"}
        </span>
      </Show>

        {/* Players list */}
        <div class="mb-6 border border-neutral-700 p-4 rounded bg-neutral-800">
          <h3 class="text-lg font-semibold mb-2">👥 Players in Lobby</h3>
          <For each={players()}>
            {(p) => (
              <div class="text-sm flex justify-between items-center mb-1">
                <span
                  class={dead()[p.id] ? "line-through opacity-60" : ""}
                >
                  {p.name}
                  {p.id === playerId() && " (You)"}
                  {dead()[p.id] && " — eliminated"}
                </span>
              </div>
            )}
          </For>
        </div>

        {/* Host controls or waiting message */}
        <Show
          when={
            isHost() &&
            alivePlayers().length >= 3 &&
            !prompt() &&
            !personalPrompt() &&
            !gameOver()
          }
        >
          <button
            onClick={generatePrompt}
            class="mb-4 bg-green-600 hover:bg-green-700 py-2 px-4 rounded"
          >
            🎭 Start Match
          </button>
        </Show>

        <Show
          when={
            !isHost() &&
            alivePlayers().length >= 3 &&
            !prompt() &&
            !personalPrompt() &&
            !gameOver()
          }
        >
          <p class="text-sm text-yellow-400 text-center mb-4">
            ⏳ Waiting for host to start the match…
          </p>
        </Show>
        
        {/* ─── Prompt section ─── */}
        <Show when={personalPrompt() && winner() === null && !votingPhase()}>
          <p class="mb-4">
            📝 <strong>Your Prompt:</strong> {personalPrompt()}
          </p>
        
          {/* Alive players get the textarea */}
          <Show when={!isDead()}>
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
        
          {/* Eliminated players just get a notice */}
          <Show when={isDead()}>
            <p class="mb-4 text-yellow-400 italic">
              ❌ You’ve been eliminated. You are now spectating.
            </p>
          </Show>
        </Show>

        {isDead() && personalPrompt() && winner() === null && (
          <p class="mb-4 text-yellow-400 italic">
            ❌ You’ve been eliminated. You are now spectating.
          </p>
        )}

        {/* All responses & voting */}
        <Show when={Object.keys(responses()).length === alivePlayers().length}>
          <div class="mt-6">
            <h3 class="text-lg font-semibold mb-2">🧾 All Responses</h3>
            <For each={Object.entries(responses())}>
              {([id, resp]) => (
                <div class="mb-2 p-2 border border-neutral-600 bg-neutral-800 rounded">
                  <p class="text-sm italic">{resp}</p>

                  <Show
                    when={
                      votingPhase() &&
                      !isDead() &&
                      !votes()[playerId()] &&
                      eliminated() !== playerId() &&
                      winner() === null
                    }
                  >
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

        {/* Eliminated banner */}
        <Show when={eliminated()}>
          <div class="mt-6 p-4 border border-red-600 bg-neutral-900 rounded">
            ❌ <strong>{eliminatedName()}</strong> was eliminated!
          </div>
        </Show>

        {/* Game‑over banner */}
        <Show when={gameOver()}>
          <div class="mt-6 p-6 bg-neutral-900 border border-neutral-600 rounded text-center">
            <h2 class="text-2xl font-bold mb-2">🎮 Game Over</h2>
            <p class="text-lg">{resultLine()}</p>

            <Show when={isHost()}>
              <button
                onClick={startNewMatch}
                class="mt-4 bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
              >
                🔁 Start New Match
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </main>
  );
};

export default JoinSpyGame;
