import { createSignal, Show, For, createEffect } from "solid-js";
import { db } from "../lib/firebase";
import { ref, set, onValue, remove, get } from "firebase/database";

/**
 * JoinSpyGame – real‑time “Spy Among Prompts” with multi‑round matches.
 *
 * Firebase schema under /spy/<sessionId>:
 * ─ players/{playerId}             → { name, joinedAt }
 * ─ basePrompt                     → string (visible to all)
 * ─ roles/{playerId}               → "Imposter" | "Collaborator"
 * ─ personalPrompts/{playerId}     → string (role‑specific)
 * ─ responses/{playerId}           → string
 * ─ votes/{voterId}                → votedPlayerId
 * ─ eliminated                     → playerId (round result)
 * ─ winner                         → "Imposter" | "Collaborators" (match result)
 * ─ gameOver                       → boolean
 * ─ roundId                        → uuid per round  (in‑match reset)
 * ─ matchId                        → uuid per match  (full reset to lobby)
 *
 * Only the host (first player) drives prompt generation / round transitions.
 */
const JoinSpyGame = () => {
  /* ──────────── reactive state ──────────── */
  const [name, setName]                     = createSignal("");
  const [sessionId, setSessionId]           = createSignal("");
  const [joined, setJoined]                 = createSignal(false);
  const [playerId, setPlayerId]             = createSignal("");
  const [players, setPlayers]               = createSignal<any[]>([]);
  const [role, setRole]                     = createSignal<"Imposter" | "Collaborator" | null>(null);
  const [prompt, setPrompt]                 = createSignal("");
  const [personalPrompt, setPersonalPrompt] = createSignal("");
  const [response, setResponse]             = createSignal("");
  const [hasSubmitted, setHasSubmitted]     = createSignal(false);
  const [responses, setResponses]           = createSignal<Record<string, string>>({});
  const [votingPhase, setVotingPhase]       = createSignal(false);
  const [votes, setVotes]                   = createSignal<Record<string, string>>({});
  const [eliminated, setEliminated]         = createSignal<string | null>(null);
  const [gameOver, setGameOver]             = createSignal(false);
  const [winner, setWinner]                 = createSignal<"Imposter" | "Collaborators" | null>(null);

  /* ──────────── helpers ──────────── */
  const base   = () => `spy/${sessionId()}`;
  const isHost = () => players()[0]?.id === playerId();

  /* ──────────── join lobby & Firebase listeners ──────────── */
  const handleJoin = async () => {
    const id = crypto.randomUUID();
    setPlayerId(id);
    await set(ref(db, `${base()}/players/${id}`), { name: name(), joinedAt: Date.now() });
    setJoined(true);

    /* players list (sorted so first‑join = host) */
    onValue(ref(db, `${base()}/players`), snap => {
      const data    = snap.val() || {};
      const sorted  = Object.entries(data).sort((a:any,b:any)=>a[1].joinedAt-b[1].joinedAt);
      setPlayers(sorted.map(([pid,val]:any)=>({ id: pid, ...val })));
    });

    /* personal role & prompt */
    onValue(ref(db, `${base()}/roles/${id}`),            s => s.exists() && setRole(s.val()));
    onValue(ref(db, `${base()}/personalPrompts/${id}`), s => s.exists() && setPersonalPrompt(s.val()));

    /* shared state */
    onValue(ref(db, `${base()}/basePrompt`),    s => s.exists() && setPrompt(s.val()));
    onValue(ref(db, `${base()}/responses`),     s => {
      const data = s.val() || {};
      setResponses(data);
      if (Object.keys(data).length === players().length) setVotingPhase(true);
    });
    onValue(ref(db, `${base()}/votes`),         s => setVotes(s.val() || {}));
    onValue(ref(db, `${base()}/eliminated`),    s => s.exists() && setEliminated(s.val()));
    onValue(ref(db, `${base()}/gameOver`),      s => s.exists() && setGameOver(s.val()));
    onValue(ref(db, `${base()}/winner`),        s => s.exists() && setWinner(s.val()));

    /* round reset (within same match) */
    onValue(ref(db, `${base()}/roundId`), s => {
      if (!s.exists()) return;
      setVotingPhase(false);
      setHasSubmitted(false);
      setPrompt("");
      setPersonalPrompt("");
      setResponse("");
      setEliminated(null);
      setResponses({});
      setVotes({});
    });

    /* match reset (full lobby reset) */
    onValue(ref(db, `${base()}/matchId`), s => {
      if (!s.exists()) return;
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
  };

  /* ──────────── host‑only helpers ──────────── */
  const generatePrompt = async () => {
    const res = await fetch("/api/spy-prompt");
    const { basePrompt, imposterPrompt } = await res.json();

    await set(ref(db, `${base()}/basePrompt`), basePrompt);

    /* random player is the Imposter */
    const impIdx = Math.floor(Math.random() * players().length);
    await Promise.all(players().map((p, idx) => {
      const r = idx === impIdx ? "Imposter" : "Collaborator";
      return Promise.all([
        set(ref(db, `${base()}/roles/${p.id}`), r),
        set(ref(db, `${base()}/personalPrompts/${p.id}`), idx === impIdx ? imposterPrompt : basePrompt)
      ]);
    }));
  };

  const startNextRound = async () => {
    /* clear round‑scoped keys */
    await Promise.all([
      "basePrompt","roles","personalPrompts","responses","votes","eliminated"
    ].map(k => remove(ref(db, `${base()}/${k}`))));
    await set(ref(db, `${base()}/roundId`), crypto.randomUUID());
  };

  const startNewMatch = async () => {
    /* clear *everything* except player list */
    await startNextRound();
    await Promise.all([
      remove(ref(db, `${base()}/winner`)),
      remove(ref(db, `${base()}/gameOver`))
    ]);
    await set(ref(db, `${base()}/matchId`), crypto.randomUUID());
  };

  /* ──────────── player actions ──────────── */
  const handleSubmitResponse = async () => {
    await set(ref(db, `${base()}/responses/${playerId()}`), response());
    setHasSubmitted(true);
  };
  const handleVote = (target:string) => set(ref(db, `${base()}/votes/${playerId()}`), target);

  /* ──────────── vote tally & round progression ──────────── */
  const tallyVotesAndEliminate = async () => {
    /* count votes */
    const counts:Record<string,number> = {};
    Object.values(votes()).forEach(id => counts[id] = (counts[id] || 0) + 1);
    const [topId] = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    await set(ref(db, `${base()}/eliminated`), topId);

    /* determine outcome */
    const roleSnap   = await get(ref(db, `${base()}/roles/${topId}`));
    const elimRole   = roleSnap.val();
    const remaining  = players().length - 1;

    if (elimRole === "Imposter") {
      await set(ref(db, `${base()}/winner`), "Collaborators");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (remaining <= 2) {
      await set(ref(db, `${base()}/winner`), "Imposter");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (isHost()) {
      /* match continues  */
      await startNextRound();
      await generatePrompt();
    }
  };

  createEffect(() => {
    if (votingPhase() && Object.keys(votes()).length === players().length && !eliminated()) {
      tallyVotesAndEliminate();
    }
  });

  /* ──────────── UI helpers ──────────── */
  const eliminatedName = () => players().find(p => p.id === eliminated())?.name;

  const resultLine = () =>
    winner() === "Collaborators"
      ? (role() === "Imposter"
          ? "❌ You were caught and eliminated!"
          : `✅ You caught the Imposter! ${eliminatedName()} was eliminated.`)
      : "😈 Imposter wins! Only 2 players remain.";

  const RoleBanner = () => role() && (
    <div
      class={`mb-4 p-3 rounded font-semibold text-center ${
        role() === "Imposter" ? "bg-red-700" : "bg-green-700"
      }`}
    >
      {role() === "Imposter" ? "😈 You are the Imposter" : "🫶 You are a Collaborator"}
    </div>
  );

  /* ──────────── JSX layout ──────────── */
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
            onInput={e => setName(e.currentTarget.value)}
          />
          <input
            class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded"
            placeholder="Session ID"
            value={sessionId()}
            onInput={e => setSessionId(e.currentTarget.value)}
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
        <RoleBanner />

        {/* Players list */}
        <div class="mb-6 border border-neutral-700 p-4 rounded bg-neutral-800">
          <h3 class="text-lg font-semibold mb-2">👥 Players in Lobby</h3>
          <For each={players()}>
            {p => {
              const isSelf      = p.id === playerId();
              const hasPrompt   = !!personalPrompt();
              const roleDisplay =
                isSelf && role()
                  ? ` — ${role()}`
                  : hasPrompt
                  ? " — Role Hidden"
                  : null;
              const hasResp     = hasPrompt && responses()[p.id];
              return (
                <div class="text-sm flex justify-between items-center mb-1">
                  <div>
                    {p.name}
                    {isSelf && " (You)"}
                    {roleDisplay && (
                      <span class="text-xs text-gray-400 italic ml-1">
                        {roleDisplay}
                      </span>
                    )}
                  </div>
                  {hasPrompt && (
                    <span
                      class={`text-xs font-medium ${
                        hasResp ? "text-green-400" : "text-yellow-400 animate-pulse"
                      }`}
                    >
                      {hasResp ? "✅ Responded" : "⌛ Waiting"}
                    </span>
                  )}
                </div>
              );
            }}
          </For>
        </div>

        {/* Host controls / waiting message */}
        <Show
          when={
            isHost() &&
            players().length >= 2 &&
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
            players().length >= 2 &&
            !prompt() &&
            !personalPrompt() &&
            !gameOver()
          }
        >
          <p class="text-sm text-yellow-400 text-center mb-4">
            ⏳ Waiting for host to start the match…
          </p>
        </Show>

        {/* Personal prompt & submission */}
        <Show when={personalPrompt() && winner() === null}>
          <Show when={eliminated() === playerId()}>
            <p class="mb-4 text-yellow-400 italic">
              ❌ You’ve been eliminated. You cannot submit a response this round.
            </p>
          </Show>

          <Show when={eliminated() !== playerId()}>
            <p class="mb-4">
              📝 <strong>Your Prompt:</strong> {personalPrompt()}
            </p>
            <textarea
              class="w-full bg-neutral-800 border border-neutral-600 p-2 rounded"
              rows="5"
              value={response()}
              onInput={e => setResponse(e.currentTarget.value)}
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
        </Show>

        {/* All responses list */}
        <Show when={Object.keys(responses()).length === players().length}>
          <div class="mt-6">
            <h3 class="text-lg font-semibold mb-2">🧾 All Responses</h3>
            <For each={Object.entries(responses())}>
              {([id, resp]) => (
                <div class="mb-2 p-2 border border-neutral-600 bg-neutral-800 rounded">
                  <p class="text-sm italic">{resp}</p>
                  <Show
                    when={
                      votingPhase() &&
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
                  <Show
                    when={eliminated() === playerId() && votingPhase()}
                  >
                    <p class="text-xs italic text-yellow-400 mt-1">
                      You’ve been eliminated. Viewing only.
                    </p>
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
