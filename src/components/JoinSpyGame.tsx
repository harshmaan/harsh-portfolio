import { createSignal, Show, For, createEffect, onCleanup } from "solid-js";
import type { Database, Unsubscribe } from "firebase/database";

// Lazy-load Firebase — only fetched when user actually joins a game
let _db: Database | null = null;
let _fbMod: typeof import("firebase/database") | null = null;

async function getFirebase() {
  if (_db && _fbMod) return { db: _db, fb: _fbMod };
  const { db } = await import("../lib/firebase");
  const fb = await import("firebase/database");
  _db = db;
  _fbMod = fb;
  return { db, fb };
}

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
 * ├─ hostId               → playerId    // permanent host
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
  const [permaHostId, setPermaHostId] = createSignal<string | null>(null);
  const [matchId, setMatchId]         = createSignal<string | null>(null);
  const [chatInput,    setChatInput]    = createSignal("");
  const [chatMessages, setChatMessages] = createSignal<
    { id: string; authorName: string; text: string; timestamp: number }[]
  >([]);

  /* ─────────── listener cleanup tracking ─────────── */
  const unsubscribers: Unsubscribe[] = [];

  // Helper: subscribe and track for cleanup
  const track = (unsub: Unsubscribe) => { unsubscribers.push(unsub); };

  onCleanup(() => {
    unsubscribers.forEach(unsub => unsub());
    unsubscribers.length = 0;
  });

  /* ─────────── helpers ─────────── */
  const base        = () => `spy/${sessionId()}`;
  const isHost      = () => permaHostId() === playerId();
  const alivePlayers = () => players().filter(p => !dead()[p.id]);
  const isDead      = () => !!dead()[playerId()];

  /* ─────────── join lobby & listeners ─────────── */
  const handleJoin = async () => {
    const { db, fb } = await getFirebase();
    const { ref, set, onValue, get } = fb;

    const id = crypto.randomUUID();
    setPlayerId(id);
    await set(ref(db, `${base()}/players/${id}`), {
      name: name(),
      joinedAt: Date.now(),
    });
    setJoined(true);
    const hostSnap = await get(ref(db, `${base()}/hostId`));
    const hostIdOnServer = hostSnap.exists() ? hostSnap.val() : null;
    const hostStillHere  = hostIdOnServer && (await get(ref(db, `${base()}/players/${hostIdOnServer}`))).exists();
    if (!hostStillHere) await set(ref(db, `${base()}/hostId`), id);   // promote myself

    // ───── Chat listener ─────
    track(onValue(ref(db, `${base()}/chat`), snap => {
      const data = snap.val() || {};
      const msgs = Object.entries(data)
        .map(([id, msg]: any) => ({
          id,
          authorName: msg.authorName,
          text:       msg.text,
          timestamp:  msg.timestamp,
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
      setChatMessages(msgs);
    }));

    /* players list (sorted) */
    track(onValue(ref(db, `${base()}/players`), snap => {
      const data = snap.val() || {};
      const sorted = Object.entries(data).sort((a:any,b:any)=>a[1].joinedAt-b[1].joinedAt);
      setPlayers(sorted.map(([pid,val]:any) => ({ id: pid, ...val })));
    }));

    track(onValue(ref(db, `${base()}/hostId`), s => {
      if (s.exists()) setPermaHostId(s.val());
    }));

    /* graveyard */
    track(onValue(ref(db, `${base()}/dead`), snap => setDead(snap.val() || {})));

    /* personal role & prompt */
    track(onValue(
      ref(db, `${base()}/roles/${id}`),
      (snap) => {
        if (snap.exists()) {
          setRole(snap.val());
        } else {
          setRole(null);
        }
      }
    ));

    track(onValue(ref(db, `${base()}/personalPrompts/${id}`),  s => s.exists() && setPersonalPrompt(s.val())));

    /* shared state */
    track(onValue(ref(db, `${base()}/basePrompt`),  s => s.exists() && setPrompt(s.val())));
    track(onValue(ref(db, `${base()}/responses`),   s => {
      const data = s.val() || {};
      setResponses(data);
      if (Object.keys(data).length === alivePlayers().length) setVotingPhase(true);
    }));
    track(onValue(ref(db, `${base()}/votes`),       s => setVotes(s.val() || {})));
    track(onValue(ref(db, `${base()}/eliminated`),  s => setEliminated(s.exists() ? s.val() : null)));
    track(onValue(ref(db, `${base()}/gameOver`),    s => setGameOver(s.exists() ? s.val() : false)));
    track(onValue(ref(db, `${base()}/winner`),      s => setWinner(s.exists() ? s.val() : null)));

    /* resets */
    track(onValue(ref(db, `${base()}/roundId`), s => s.exists() && resetRoundLocal()));
    track(onValue(ref(db, `${base()}/matchId`), s => {
      if (!s.exists()) return;
    
      const newId = s.val();
      if (newId === matchId()) return;
    
      setMatchId(newId);
      resetMatchLocal();
    }));
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
    setDead({});  
    resetRoundLocal();
  };

  /* ─────────── host‑only helpers ─────────── */
  const generatePrompt = async () => {
    const { db, fb } = await getFirebase();
    const { ref, set, get } = fb;

    const res = await fetch("/api/spy-prompt");
    const { basePrompt, imposterPrompt } = await res.json();
    await set(ref(db, `${base()}/basePrompt`), basePrompt);
  
    const rolesSnap = await get(ref(db, `${base()}/roles`));
    const firstRound = !rolesSnap.exists();
  
    const playersSnap = await get(ref(db, `${base()}/players`));
    const rosterObj   = playersSnap.exists() ? playersSnap.val() : {};
    const deadSnap    = await get(ref(db, `${base()}/dead`));
    const deadMap     = deadSnap.exists() ? deadSnap.val() : {};
    const live        = Object.entries(rosterObj)
      .sort((a:any,b:any)=>a[1].joinedAt-b[1].joinedAt)
      .map(([id,val]:any)=>({ id, ...val }))
      .filter(p => !deadMap[p.id]);
  
    if (live.length < 3) {
      console.warn("Need at least 3 living players to start a round");
      return;
    }
  
    if (firstRound) {
      const impIdx = Math.floor(Math.random() * live.length);
      await Promise.all(
        live.map((p, idx) =>
          Promise.all([
            set(ref(db, `${base()}/roles/${p.id}`), idx === impIdx ? "Imposter" : "Collaborator"),
            set(ref(db, `${base()}/personalPrompts/${p.id}`),
              idx === impIdx ? imposterPrompt : basePrompt
            ),
          ])
        )
      );
    } else {
      await Promise.all(
        live.map(async (p) => {
          const roleSnap = await get(ref(db, `${base()}/roles/${p.id}`));
          const text = roleSnap.val() === "Imposter" ? imposterPrompt : basePrompt;
          await set(ref(db, `${base()}/personalPrompts/${p.id}`), text);
        })
      );
    }
  };

  const startNextRound = async () => {
    const { db, fb } = await getFirebase();
    const { ref, set, remove } = fb;

    await Promise.all(
      ["basePrompt","responses","votes","eliminated"].map((k) =>
        remove(ref(db, `${base()}/${k}`)),
      ),
    );
    await set(ref(db, `${base()}/roundId`), crypto.randomUUID());
  };

  const startNewMatch = async () => {
    const { db, fb } = await getFirebase();
    const { ref, set, remove } = fb;

    await startNextRound();
  
    await Promise.all([
      remove(ref(db, `${base()}/roles`)),
      remove(ref(db, `${base()}/personalPrompts`)),
      set(ref(db, `${base()}/winner`),     null),
      set(ref(db, `${base()}/gameOver`),   false),
      set(ref(db, `${base()}/eliminated`), null),
      remove(ref(db, `${base()}/dead`)),
    ]);
  
    setDead({});
  
    await set(ref(db, `${base()}/matchId`), crypto.randomUUID());
  };

  /* ─────────── player actions ─────────── */
  const handleSubmitResponse = async () => {
    if (isDead()) return;
    const { db, fb } = await getFirebase();
    const { ref, set } = fb;
    await set(ref(db, `${base()}/responses/${playerId()}`), response());
    setHasSubmitted(true);
  };

  const handleVote = async (target: string) => {
    const { db, fb } = await getFirebase();
    const { ref, set } = fb;
    await set(ref(db, `${base()}/votes/${playerId()}`), target);
  };

  const handleSendMessage = async () => {
    const text = chatInput().trim();
    if (!text) return;
    const { db, fb } = await getFirebase();
    const { ref, set } = fb;
    const msgId = crypto.randomUUID();
    await set(ref(db, `${base()}/chat/${msgId}`), {
      authorId:   playerId(),
      authorName: name(),
      text,
      timestamp:  Date.now(),
    });
    setChatInput("");
  };

  /* ─────────── vote tally & progression (HOST ONLY) ─────────── */
  const tallyVotesAndEliminate = async () => {
    // Only the host should execute tally to prevent duplicate writes
    if (!isHost()) return;

    const { db, fb } = await getFirebase();
    const { ref, set, get } = fb;

    const counts: Record<string, number> = {};
    Object.values(votes()).forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    const [topId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    await set(ref(db, `${base()}/eliminated`), topId);
    await set(ref(db, `${base()}/dead/${topId}`), true);

    const roleSnap = await get(ref(db, `${base()}/roles/${topId}`));
    const elimRole = roleSnap.val();
    const remaining = alivePlayers().length;

    if (elimRole === "Imposter") {
      await set(ref(db, `${base()}/winner`), "Collaborators");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (remaining === 2) { 
      await set(ref(db, `${base()}/winner`), "Imposter");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (!isDead() && remaining >= 3) {
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

  const votersFor = (responseId: string) =>
    Object.entries(votes())
      .filter(([, targetId]) => targetId === responseId)
      .map(([voterId]) => players().find(p => p.id === voterId)?.name || "Unknown");

  /* ─────────── JSX layout ─────────── */
  return (
    <main class="p-6 max-w-4xl mx-auto text-white">
      {/* ───── Join Form ───── */}
      <Show when={!joined()}>
        <div class="flex justify-center items-center min-h-[90vh] px-4">
          <div class="max-w-md w-full space-y-6 text-center">
            <h1 class="text-3xl font-bold">🕵️ Enter the Arena</h1>
      
            <div class="space-y-4">
              <input
                type="text"
                name="name"
                placeholder="Enter your name"
                class="w-full p-3 rounded bg-neutral-800 border border-neutral-600 text-white"
                value={name()}
                onInput={(e) => setName(e.currentTarget.value)}
              />
              <input
                type="text"
                name="sessionId"
                placeholder="Enter session ID"
                class="w-full p-3 rounded bg-neutral-800 border border-neutral-600 text-white"
                value={sessionId()}
                onInput={(e) => setSessionId(e.currentTarget.value)}
              />
              <button
                class="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded disabled:opacity-50 text-white"
                disabled={!name().trim() || !sessionId().trim()}
                onClick={handleJoin}
              >
                🚀 Enter Game
              </button>
            </div>
      
            {/* Concept & Instructions panel */}
            <div class="text-left mt-6 p-4 bg-neutral-900 border border-neutral-700 rounded space-y-4 text-sm leading-relaxed text-gray-300">
              <div>
                <h2 class="text-white font-semibold text-base">Concept</h2>
                <p>
                  Players receive AI‑generated writing prompts each round—one secret Imposter gets a misleading variation while
                  Collaborators share the base prompt. After submissions, responses are anonymized and you vote to unmask the Imposter.
                </p>
              </div>
              <div>
                <h2 class="text-white font-semibold text-base">Instructions</h2>
                <ol class="list-decimal list-inside space-y-1">
                  <li>Enter your name and session ID; the first to join becomes host.</li>
                  <li>Host clicks “Enter Game” then “Start Match” to assign roles and draw the first prompt.</li>
                  <li>Alive players craft a response to their personal prompt; eliminated players spectate.</li>
                  <li>Once everyone’s in, vote on who to eliminate.</li>
                  <li>If the Imposter is caught, Collaborators win; if only two remain, the Imposter wins.</li>
                  <li>Host can start a new round or a new match to reshuffle and play again.</li>
                </ol>
              </div>
            </div>
          </div> {/* end max-w-md */}
        </div>   {/* end flex container */}
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
            !isDead() &&  
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
        <Show when={(personalPrompt() || (isDead() && prompt())) && winner() === null && !votingPhase()}>
          <p class="mb-4">
            📝 <strong>Task:</strong> {personalPrompt() || prompt()}
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
            
                  {/* ← new block ↓ */}
                  <Show when={votersFor(id).length > 0}>
                    <p class="mt-1 text-xs text-gray-400">
                      Voted by: {votersFor(id).join(", ")}
                    </p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* ─── Discussion Chat (single card) ─── */}
        <Show when={votingPhase() && !gameOver()}>
          <div class="mt-6 p-4 bg-neutral-900 border border-neutral-700 rounded-lg">
            <h3 class="text-lg font-semibold mb-4">💬 Discussion</h3>
        
            {/* messages container */}
            <div class="max-h-48 overflow-y-auto space-y-2">
              <For each={chatMessages()}>
                {(msg) => (
                  <p class="text-sm">
                    <strong class="text-white">{msg.authorName}:</strong> {msg.text}
                  </p>
                )}
              </For>
            </div>
        
            {/* input + send */}
            <div class="flex gap-2 mt-4">
              <input
                type="text"
                placeholder="Type a message..."
                class="flex-1 bg-neutral-800 border border-neutral-600 p-2 rounded text-sm"
                value={chatInput()}
                onInput={(e) => setChatInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput().trim()}
                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
              >
                Send
              </button>
            </div>
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
