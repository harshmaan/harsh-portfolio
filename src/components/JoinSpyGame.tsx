import { createSignal, Show, For, createEffect, onCleanup } from "solid-js";
import type { Database, Unsubscribe } from "firebase/database";

// Lazy-load Firebase — only fetched once when user joins a game
let _db: Database | null = null;
let _fbMod: typeof import("firebase/database") | null = null;
let _firebaseReady: Promise<{ db: Database; fb: typeof import("firebase/database") }> | null = null;

function getFirebase() {
  if (_db && _fbMod) return { db: _db, fb: _fbMod };
  // If already loading, return the in-flight promise
  if (_firebaseReady) return _firebaseReady;
  _firebaseReady = (async () => {
    const [{ db }, fb] = await Promise.all([
      import("../lib/firebase"),
      import("firebase/database"),
    ]);
    _db = db;
    _fbMod = fb;
    return { db, fb };
  })();
  return _firebaseReady;
}

/** Synchronous access — only call after Firebase has been loaded (post-join) */
function fb() {
  return { db: _db!, fb: _fbMod! };
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
  const [startingMatch, setStartingMatch] = createSignal(false);
  const [matchError, setMatchError]       = createSignal("");

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

  /* ─────────── detect auto-join params synchronously (before first render) ─────────── */
  const _spyParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const _spyUrlSession = _spyParams?.get("sessionId")?.trim() || "";
  const _spyStoredName = typeof window !== "undefined" ? localStorage.getItem("spyName")?.trim() || "" : "";
  const _spyShouldAutoJoin = !!(_spyUrlSession && _spyStoredName);

  if (_spyUrlSession) setSessionId(_spyUrlSession);
  if (_spyStoredName) setName(_spyStoredName);

  const [autoJoining, setAutoJoining] = createSignal(_spyShouldAutoJoin);

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

  /* ─────────── auto-join from landing page (fires immediately, no flash) ─────────── */
  if (_spyShouldAutoJoin) {
    handleJoin().then(() => setAutoJoining(false), () => setAutoJoining(false));
  }

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
    setStartingMatch(true);
    setMatchError("");
    try {
      const { db, fb: f } = fb();
      const { ref, set, get } = f;

      // Fetch API prompt and Firebase state in parallel
      const [promptRes, rolesSnap, playersSnap, deadSnap] = await Promise.all([
        fetch("/api/spy-prompt"),
        get(ref(db, `${base()}/roles`)),
        get(ref(db, `${base()}/players`)),
        get(ref(db, `${base()}/dead`)),
      ]);

      if (!promptRes.ok) {
        const errBody = await promptRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Prompt API returned ${promptRes.status}`);
      }

      const { basePrompt, imposterPrompt } = await promptRes.json();

      if (!basePrompt || !imposterPrompt) {
        throw new Error("AI failed to generate prompts — try again.");
      }

      await set(ref(db, `${base()}/basePrompt`), basePrompt);

      const firstRound = !rolesSnap.exists();

      const rosterObj   = playersSnap.exists() ? playersSnap.val() : {};
      const deadMap     = deadSnap.exists() ? deadSnap.val() : {};
      const live        = Object.entries(rosterObj)
        .sort((a:any,b:any)=>a[1].joinedAt-b[1].joinedAt)
        .map(([id,val]:any)=>({ id, ...val }))
        .filter(p => !deadMap[p.id]);
    
      if (live.length < 3) {
        throw new Error("Need at least 3 living players to start a round.");
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
    } catch (err: any) {
      console.error("generatePrompt error:", err);
      setMatchError(err?.message || "Something went wrong. Try again.");
    } finally {
      setStartingMatch(false);
    }
  };

  const startNextRound = async () => {
    const { db, fb: f } = fb();
    const { ref, set, remove } = f;

    await Promise.all([
      ...["basePrompt","responses","votes","eliminated"].map((k) =>
        remove(ref(db, `${base()}/${k}`)),
      ),
      set(ref(db, `${base()}/roundId`), crypto.randomUUID()),
    ]);
  };

  const startNewMatch = async () => {
    const { db, fb: f } = fb();
    const { ref, set, remove } = f;

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
    setHasSubmitted(true); // optimistic UI — update button instantly
    const { db, fb: f } = fb();
    const { ref, set } = f;
    await set(ref(db, `${base()}/responses/${playerId()}`), response());
  };

  const handleVote = (target: string) => {
    const { db, fb: f } = fb();
    const { ref, set } = f;
    set(ref(db, `${base()}/votes/${playerId()}`), target); // fire-and-forget
  };

  const handleSendMessage = () => {
    const text = chatInput().trim();
    if (!text) return;
    setChatInput(""); // optimistic UI — clear input instantly
    const { db, fb: f } = fb();
    const { ref, set } = f;
    const msgId = crypto.randomUUID();
    set(ref(db, `${base()}/chat/${msgId}`), {
      authorId:   playerId(),
      authorName: name(),
      text,
      timestamp:  Date.now(),
    }); // fire-and-forget — listener will update chat
  };

  /* ─────────── vote tally & progression (HOST ONLY) ─────────── */
  const tallyVotesAndEliminate = async () => {
    // Only the host should execute tally to prevent duplicate writes
    if (!isHost()) return;

    const { db, fb: f } = fb();
    const { ref, set, get } = f;

    const counts: Record<string, number> = {};
    Object.values(votes()).forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    const [topId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    // Write eliminated + dead in parallel
    await Promise.all([
      set(ref(db, `${base()}/eliminated`), topId),
      set(ref(db, `${base()}/dead/${topId}`), true),
    ]);

    const roleSnap = await get(ref(db, `${base()}/roles/${topId}`));
    const elimRole = roleSnap.val();
    const remaining = alivePlayers().length;

    if (elimRole === "Imposter") {
      await Promise.all([
        set(ref(db, `${base()}/winner`), "Collaborators"),
        set(ref(db, `${base()}/gameOver`), true),
      ]);
    } else if (remaining === 2) { 
      await Promise.all([
        set(ref(db, `${base()}/winner`), "Imposter"),
        set(ref(db, `${base()}/gameOver`), true),
      ]);
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
        ? "You were caught and eliminated!"
        : `You caught the Imposter! ${eliminatedName()} was unmasked.`
      : "The Imposter wins! Only 2 players remain.";

  const resultEmoji = () =>
    winner() === "Collaborators"
      ? role() === "Imposter" ? "💀" : "🎉"
      : role() === "Imposter" ? "😈" : "💀";

  const votersFor = (responseId: string) =>
    Object.entries(votes())
      .filter(([, targetId]) => targetId === responseId)
      .map(([voterId]) => players().find(p => p.id === voterId)?.name || "Unknown");

  const submittedCount = () => Object.keys(responses()).length;
  const totalAlive     = () => alivePlayers().length;
  const votedCount     = () => Object.keys(votes()).length;

  // Game phase helper
  const currentPhase = () => {
    if (gameOver()) return "gameover";
    if (votingPhase()) return "voting";
    if (personalPrompt() || (isDead() && prompt())) return "writing";
    return "lobby";
  };

  /* ─────────── JSX layout ─────────── */
  return (
    <div class="max-w-4xl mx-auto px-4 py-8 text-white">
      {/* ───── Auto-joining spinner (prevents form flash) ───── */}
      <Show when={autoJoining()}>
        <div class="flex flex-col justify-center items-center min-h-[80vh] gap-4">
          <span class="text-5xl">🕵️</span>
          <div class="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-gray-400 text-sm">Joining session…</p>
        </div>
      </Show>

      {/* ───── Join Form (only if NOT auto-joining and NOT joined) ───── */}
      <Show when={!joined() && !autoJoining()}>
        <div class="flex justify-center items-center min-h-[80vh]">
          <div class="max-w-md w-full">
            {/* Back link */}
            <a href="/spy" class="text-sm text-gray-400 hover:text-white mb-8 inline-block transition-colors">← Back to Game Info</a>

            {/* Hero */}
            <div class="text-center mb-8">
              <span class="text-5xl inline-block mb-4">🕵️</span>
              <h1 class="text-3xl font-bold mb-2">Enter the Arena</h1>
              <p class="text-gray-400 text-sm">Join a session to start playing with your friends</p>
            </div>
      
            {/* Form Card */}
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-8 space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  class="w-full bg-darkslate-300 border border-darkslate-100 text-white px-4 py-3 rounded-xl outline-none focus:border-primary-500 transition-colors placeholder:text-gray-500"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Session ID</label>
                <input
                  type="text"
                  placeholder="Enter session ID"
                  class="w-full bg-darkslate-300 border border-darkslate-100 text-white px-4 py-3 rounded-xl outline-none focus:border-primary-500 transition-colors placeholder:text-gray-500"
                  value={sessionId()}
                  onInput={(e) => setSessionId(e.currentTarget.value)}
                />
              </div>
              <button
                class="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!name().trim() || !sessionId().trim()}
                onClick={handleJoin}
              >
                Enter Game →
              </button>
            </div>
      
            {/* Instructions */}
            <div class="mt-8 bg-darkslate-500/50 border border-darkslate-100 rounded-2xl p-6 space-y-4">
              <h2 class="font-bold text-sm uppercase tracking-wider text-gray-300">Quick Guide</h2>
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div class="flex items-start gap-2">
                  <span class="text-primary-400 font-mono text-xs mt-0.5">01</span>
                  <span class="text-gray-400">First player becomes host</span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-primary-400 font-mono text-xs mt-0.5">02</span>
                  <span class="text-gray-400">Host starts the match</span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-primary-400 font-mono text-xs mt-0.5">03</span>
                  <span class="text-gray-400">Write your response to the prompt</span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-primary-400 font-mono text-xs mt-0.5">04</span>
                  <span class="text-gray-400">Vote out the imposter!</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* ───── In‑Game View ───── */}
      <Show when={joined()}>
        {/* Top bar — game status + phase indicator */}
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold">
              {name()}
              <Show when={isHost()}>
                <span class="ml-2 text-xs bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">Host</span>
              </Show>
            </h2>
            <p class="text-xs text-gray-500 font-mono mt-0.5">Session: {sessionId()}</p>
          </div>
          <div class="flex items-center gap-2">
            <Show when={role()}>
              <span
                class={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                  role() === "Imposter"
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                }`}
              >
                <span class="w-2 h-2 rounded-full" style={`background: ${role() === "Imposter" ? "#ef4444" : "#10b981"}`}></span>
                {role() === "Imposter" ? "Imposter" : "Collaborator"}
              </span>
            </Show>
            <Show when={isDead()}>
              <span class="px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-500/15 text-gray-400 border border-gray-500/30">
                👻 Spectating
              </span>
            </Show>
          </div>
        </div>

        {/* Phase progress bar */}
        <Show when={!gameOver()}>
          <div class="flex items-center gap-1 mb-8">
            {["lobby", "writing", "voting"].map((phase) => (
              <div class={`h-1 flex-1 rounded-full transition-all duration-500 ${
                currentPhase() === phase
                  ? "bg-primary-500"
                  : ["lobby", "writing", "voting"].indexOf(phase) < ["lobby", "writing", "voting"].indexOf(currentPhase())
                    ? "bg-primary-500/40"
                    : "bg-darkslate-100"
              }`} />
            ))}
          </div>
        </Show>

        {/* Main content grid */}
        <div class="grid gap-6 md:grid-cols-3">
          {/* Left column — Players */}
          <div class="md:col-span-1">
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-5 sticky top-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-bold text-sm uppercase tracking-wider text-gray-300">Players</h3>
                <span class="text-xs text-gray-500 font-mono">{alivePlayers().length}/{players().length} alive</span>
              </div>
              <div class="space-y-2">
                <For each={players()}>
                  {(p) => (
                    <div class={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                      dead()[p.id]
                        ? "bg-darkslate-300/30 opacity-50"
                        : p.id === playerId()
                          ? "bg-primary-500/10 border border-primary-500/20"
                          : "bg-darkslate-300/50"
                    }`}>
                      <div class={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        dead()[p.id]
                          ? "bg-gray-700 text-gray-500"
                          : p.id === permaHostId()
                            ? "bg-primary-500/20 text-primary-400"
                            : "bg-darkslate-100 text-gray-300"
                      }`}>
                        {dead()[p.id] ? "💀" : p.name.charAt(0).toUpperCase()}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class={`text-sm font-medium truncate ${dead()[p.id] ? "line-through text-gray-500" : "text-white"}`}>
                          {p.name}
                          {p.id === playerId() && <span class="text-primary-400 text-xs ml-1">(you)</span>}
                        </p>
                        {p.id === permaHostId() && !dead()[p.id] && (
                          <p class="text-[10px] text-primary-400 font-mono uppercase">Host</p>
                        )}
                      </div>
                      {/* Show submission/vote status */}
                      <Show when={currentPhase() === "writing" && !dead()[p.id]}>
                        <div class={`w-2 h-2 rounded-full ${responses()[p.id] ? "bg-emerald-400" : "bg-gray-600"}`} title={responses()[p.id] ? "Submitted" : "Writing..."} />
                      </Show>
                      <Show when={currentPhase() === "voting" && !dead()[p.id]}>
                        <div class={`w-2 h-2 rounded-full ${votes()[p.id] ? "bg-emerald-400" : "bg-yellow-500 animate-pulse"}`} title={votes()[p.id] ? "Voted" : "Voting..."} />
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Right column — Game area */}
          <div class="md:col-span-2 space-y-6">
            {/* Host controls — waiting to start */}
            <Show when={currentPhase() === "lobby" && !gameOver()}>
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-8 text-center">
                <Show when={isHost() && alivePlayers().length >= 3}>
                  <div class="mb-4">
                    <span class="text-4xl inline-block mb-3">🎭</span>
                    <h3 class="text-lg font-bold mb-2">Ready to Start</h3>
                    <p class="text-sm text-gray-400 mb-6">{players().length} player{players().length !== 1 ? "s" : ""} in the lobby. You need at least 3 to play.</p>
                  </div>
                  <button
                    onClick={generatePrompt}
                    disabled={startingMatch()}
                    class="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/20 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {startingMatch() ? (
                      <span class="inline-flex items-center gap-2">
                        <span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating Prompt…
                      </span>
                    ) : "Start Match"}
                  </button>
                  <Show when={matchError()}>
                    <p class="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2">{matchError()}</p>
                  </Show>
                </Show>
                <Show when={isHost() && alivePlayers().length < 3}>
                  <div class="py-4">
                    <div class="inline-flex items-center gap-2 text-yellow-400">
                      <span class="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                      <span class="text-sm font-medium">Waiting for players… ({players().length}/3 minimum)</span>
                    </div>
                  </div>
                </Show>
                <Show when={!isHost()}>
                  <div class="py-4">
                    <div class="inline-flex items-center gap-2 text-gray-400">
                      <span class="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                      <span class="text-sm">Waiting for host to start the match…</span>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>

            {/* ─── Writing Phase ─── */}
            <Show when={currentPhase() === "writing"}>
              {/* Prompt card */}
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-sm font-mono text-primary-400 uppercase tracking-wider">Prompt</span>
                  <span class="flex-1 h-px bg-darkslate-100" />
                  <span class="text-xs text-gray-500 font-mono">{submittedCount()}/{totalAlive()} submitted</span>
                </div>
                <p class="text-white leading-relaxed">{personalPrompt() || prompt()}</p>
              </div>

              {/* Response textarea — alive players only */}
              <Show when={!isDead()}>
                <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-6">
                  <label class="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Your Response</label>
                  <textarea
                    class="w-full bg-darkslate-300 border border-darkslate-100 text-white p-4 rounded-xl outline-none focus:border-primary-500 transition-colors resize-none placeholder:text-gray-500"
                    rows={5}
                    placeholder="Write your response here… Try to match the tone if you're the imposter 😉"
                    value={response()}
                    onInput={(e) => setResponse(e.currentTarget.value)}
                    disabled={hasSubmitted()}
                  />
                  <div class="flex items-center justify-between mt-3">
                    <span class="text-xs text-gray-500">{response().length} characters</span>
                    <button
                      onClick={handleSubmitResponse}
                      disabled={hasSubmitted() || !response().trim()}
                      class={`font-semibold py-2.5 px-6 rounded-xl transition-all duration-200 active:scale-[0.98] ${
                        hasSubmitted()
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default"
                          : "bg-primary-500 hover:bg-primary-600 text-white hover:shadow-lg hover:shadow-primary-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                    >
                      {hasSubmitted() ? "✓ Submitted" : "Submit Response"}
                    </button>
                  </div>
                </div>
              </Show>

              {/* Spectator notice */}
              <Show when={isDead()}>
                <div class="bg-darkslate-500/50 border border-darkslate-100 rounded-2xl p-6 text-center">
                  <span class="text-2xl mb-2 inline-block">👻</span>
                  <p class="text-gray-400 text-sm">You've been eliminated. Watching the round unfold…</p>
                </div>
              </Show>
            </Show>

            {/* ─── Voting Phase — Responses + Voting ─── */}
            <Show when={Object.keys(responses()).length === alivePlayers().length}>
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-4">
                  <span class="text-sm font-mono text-primary-400 uppercase tracking-wider">Responses</span>
                  <span class="flex-1 h-px bg-darkslate-100" />
                  <Show when={votingPhase() && !gameOver()}>
                    <span class="text-xs text-yellow-400 font-mono animate-pulse">{votedCount()}/{totalAlive()} voted</span>
                  </Show>
                </div>
                <div class="space-y-3">
                  <For each={Object.entries(responses())}>
                    {([id, resp]) => {
                      const hasVotedThis = () => votes()[playerId()] === id;
                      const voteCount = () => votersFor(id).length;
                      return (
                        <div class={`relative p-4 rounded-xl border transition-all duration-200 ${
                          hasVotedThis()
                            ? "bg-primary-500/10 border-primary-500/30"
                            : "bg-darkslate-300/50 border-darkslate-100 hover:border-darkslate-50"
                        }`}>
                          <p class="text-sm text-gray-200 leading-relaxed mb-3">{resp}</p>
                          
                          <div class="flex items-center justify-between">
                            <Show when={voteCount() > 0}>
                              <div class="flex items-center gap-1.5">
                                <span class="text-xs text-gray-500">🗳️ {voteCount()} vote{voteCount() !== 1 ? "s" : ""}</span>
                                <span class="text-xs text-gray-600">·</span>
                                <span class="text-xs text-gray-500">{votersFor(id).join(", ")}</span>
                              </div>
                            </Show>
                            <Show when={voteCount() === 0}>
                              <span />
                            </Show>

                            <Show
                              when={
                                votingPhase() &&
                                !isDead() &&
                                !votes()[playerId()] &&
                                winner() === null
                              }
                            >
                              <button
                                class="text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/25 px-3 py-1.5 rounded-lg transition-all duration-200 active:scale-[0.96]"
                                onClick={() => handleVote(id)}
                              >
                                Vote to Eliminate
                              </button>
                            </Show>

                            <Show when={hasVotedThis()}>
                              <span class="text-xs text-primary-400 font-medium">Your vote ✓</span>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>

            {/* ─── Discussion Chat ─── */}
            <Show when={votingPhase() && !gameOver()}>
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-6">
                <h3 class="text-sm font-mono text-primary-400 uppercase tracking-wider mb-4">💬 Discussion</h3>
            
                <div class="max-h-56 overflow-y-auto space-y-2 mb-4 scroll-smooth" style="scrollbar-width: thin; scrollbar-color: #404040 transparent;">
                  <Show when={chatMessages().length === 0}>
                    <p class="text-xs text-gray-500 text-center py-4">No messages yet. Start the discussion!</p>
                  </Show>
                  <For each={chatMessages()}>
                    {(msg) => (
                      <div class={`py-2 px-3 rounded-lg text-sm ${
                        msg.id === playerId() ? "bg-primary-500/10" : "bg-darkslate-300/30"
                      }`}>
                        <span class="font-semibold text-gray-200">{msg.authorName}</span>
                        <span class="text-gray-500 mx-1.5">·</span>
                        <span class="text-gray-300">{msg.text}</span>
                      </div>
                    )}
                  </For>
                </div>
            
                <div class="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    class="flex-1 bg-darkslate-300 border border-darkslate-100 text-white px-4 py-2.5 rounded-xl outline-none focus:border-primary-500 transition-colors text-sm placeholder:text-gray-500"
                    value={chatInput()}
                    onInput={(e) => setChatInput(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput().trim()}
                    class="bg-primary-500 hover:bg-primary-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.96]"
                  >
                    Send
                  </button>
                </div>
              </div>
            </Show>

            {/* Eliminated banner */}
            <Show when={eliminated() && !gameOver()}>
              <div class="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-center gap-4">
                <span class="text-3xl">💀</span>
                <div>
                  <p class="font-bold text-red-400">{eliminatedName()} was eliminated!</p>
                  <p class="text-sm text-gray-400 mt-0.5">The game continues…</p>
                </div>
              </div>
            </Show>

            {/* ─── Game Over ─── */}
            <Show when={gameOver()}>
              <div class={`rounded-2xl p-8 text-center border ${
                winner() === "Collaborators"
                  ? role() === "Imposter"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-emerald-500/10 border-emerald-500/30"
                  : role() === "Imposter"
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-red-500/10 border-red-500/30"
              }`}>
                <span class="text-5xl inline-block mb-4">{resultEmoji()}</span>
                <h2 class="text-2xl font-bold mb-2">Game Over</h2>
                <p class={`text-lg mb-1 ${
                  (winner() === "Collaborators" && role() !== "Imposter") || (winner() !== "Collaborators" && role() === "Imposter")
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}>
                  {(winner() === "Collaborators" && role() !== "Imposter") || (winner() !== "Collaborators" && role() === "Imposter") ? "You Win!" : "You Lose"}
                </p>
                <p class="text-gray-400 text-sm mb-6">{resultLine()}</p>

                <Show when={isHost()}>
                  <button
                    onClick={startNewMatch}
                    class="bg-primary-500 hover:bg-primary-600 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-primary-500/20 active:scale-[0.98]"
                  >
                    Start New Match
                  </button>
                </Show>
                <Show when={!isHost()}>
                  <p class="text-xs text-gray-500">Waiting for host to start a new match…</p>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default JoinSpyGame;
