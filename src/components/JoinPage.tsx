import { createSignal, For, Show, onCleanup, createEffect } from "solid-js";
import type { Database, Unsubscribe } from "firebase/database";

// ── Lazy-load Firebase — only fetched once when user joins ──
let _db: Database | null = null;
let _fbMod: typeof import("firebase/database") | null = null;
let _firebaseReady: Promise<{ db: Database; fb: typeof import("firebase/database") }> | null = null;

function getFirebase() {
  if (_db && _fbMod) return { db: _db, fb: _fbMod };
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
function fbSync() {
  return { db: _db!, fb: _fbMod! };
}

const JoinPage = () => {
  /* ─────────── reactive state ─────────── */
  const [name, setName] = createSignal("");
  const [sessionId, setSessionId] = createSignal("");
  const [joined, setJoined] = createSignal(false);
  const [playerId, setPlayerId] = createSignal("");

  const [players, setPlayers] = createSignal<any[]>([]);
  const [prompt, setPrompt] = createSignal("");
  const [myResponse, setMyResponse] = createSignal("");
  const [hasSubmitted, setHasSubmitted] = createSignal(false);
  const [scores, setScores] = createSignal<Record<string, number>>({});
  const [roundComplete, setRoundComplete] = createSignal(false);
  const [winnerId, setWinnerId] = createSignal("");
  const [hostId, setHostId] = createSignal<string | null>(null);
  const [allResponses, setAllResponses] = createSignal<Record<string, string>>({});

  // Loading & error states
  const [generatingPrompt, setGeneratingPrompt] = createSignal(false);
  const [promptError, setPromptError] = createSignal("");
  const [scoring, setScoring] = createSignal(false);
  const [joinError, setJoinError] = createSignal("");

  /* ─────────── listener cleanup tracking ─────────── */
  const unsubscribers: Unsubscribe[] = [];
  const track = (unsub: Unsubscribe) => {
    unsubscribers.push(unsub);
  };
  onCleanup(() => {
    unsubscribers.forEach((unsub) => unsub());
    unsubscribers.length = 0;
  });

  /* ─────────── helpers ─────────── */
  const isHost = () => playerId() === hostId();
  const base = () => `sessions/${sessionId()}`;

  const submittedCount = () =>
    players().filter((p) => p.responded).length;

  const currentPhase = () => {
    if (roundComplete()) return "results";
    if (prompt()) return "writing";
    return "lobby";
  };

  const initials = (n: string) =>
    n
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  /* ─────────── join lobby & listeners ─────────── */
  const handleJoin = async () => {
    if (!name().trim() || !sessionId().trim()) return;
    setJoinError("");

    try {
      const { db, fb } = await getFirebase();
      const { ref, set, onValue, get } = fb;

      const newPlayerId = crypto.randomUUID();
      setPlayerId(newPlayerId);

      await set(ref(db, `${base()}/players/${newPlayerId}`), {
        name: name(),
        responded: false,
        readyNextRound: false,
        joinedAt: Date.now(),
      });

      setJoined(true);

      // Determine host
      const hostSnap = await get(ref(db, `${base()}/hostId`));
      const hostOnServer = hostSnap.exists() ? hostSnap.val() : null;
      const hostStillHere =
        hostOnServer &&
        (await get(ref(db, `${base()}/players/${hostOnServer}`))).exists();
      if (!hostStillHere)
        await set(ref(db, `${base()}/hostId`), newPlayerId);

      // ── Listeners ──
      track(
        onValue(ref(db, `${base()}/players`), (snapshot) => {
          const data = snapshot.val() || {};
          const sorted = Object.entries(data).sort(
            (a: any, b: any) =>
              (a[1].joinedAt || 0) - (b[1].joinedAt || 0)
          );
          setPlayers(sorted.map(([id, val]: any) => ({ id, ...val })));
        })
      );

      track(
        onValue(ref(db, `${base()}/hostId`), (s) => {
          if (s.exists()) setHostId(s.val());
        })
      );

      track(
        onValue(ref(db, `${base()}/prompt`), (snapshot) => {
          const val = snapshot.val() || "";
          setPrompt(val);
          setHasSubmitted(false);
          setMyResponse("");
          if (!val) {
            setScores({});
            setRoundComplete(false);
            setWinnerId("");
          }
        })
      );

      track(
        onValue(ref(db, `${base()}/scores`), (snapshot) => {
          const data = snapshot.val() || {};
          setScores(data);
          if (snapshot.exists() && Object.keys(data).length > 0) {
            setRoundComplete(true);
          }
        })
      );

      track(
        onValue(ref(db, `${base()}/winnerId`), (snapshot) => {
          setWinnerId(snapshot.val() || "");
        })
      );

      track(
        onValue(ref(db, `${base()}/responses`), (snapshot) => {
          const data = snapshot.val() || {};
          setAllResponses(data);
        })
      );
    } catch (err: any) {
      console.error("Join failed:", err);
      setJoinError(err?.message || "Something went wrong while joining.");
    }
  };

  /* ─────────── host: auto-score when all responded ─────────── */
  createEffect(() => {
    const respondedCount = players().filter((p) => p.responded).length;
    const totalPlayers = players().length;
    if (
      totalPlayers > 0 &&
      respondedCount === totalPlayers &&
      isHost() &&
      !roundComplete() &&
      !scoring() &&
      prompt()
    ) {
      scoreAllResponses();
    }
  });

  const scoreAllResponses = async () => {
    setScoring(true);
    try {
      const { db, fb: f } = fbSync();
      const { ref, set } = f;

      const data = allResponses();
      const promptText = prompt();
      const newScores: Record<string, number> = {};

      for (const [pid, res] of Object.entries(data)) {
        const score = await getLLMScore(promptText, res as string);
        newScores[pid] = score;
      }

      const sorted = Object.entries(newScores).sort((a, b) => b[1] - a[1]);
      await Promise.all([
        set(ref(db, `${base()}/scores`), newScores),
        set(ref(db, `${base()}/winnerId`), sorted[0][0]),
      ]);
    } catch (err) {
      console.error("Scoring failed:", err);
    } finally {
      setScoring(false);
    }
  };

  /* ─────────── LLM scoring ─────────── */
  const getLLMScore = async (
    promptText: string,
    response: string
  ): Promise<number> => {
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Evaluate this response to a prompt on creativity, humor, and relevance. Give a score out of 100.\n\nPrompt: "${promptText}"\nResponse: "${response}"\n\nOnly return the score as a number.`,
        }),
      });
      const data = await res.json();
      const match = data.response?.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    } catch {
      return 0;
    }
  };

  /* ─────────── player actions ─────────── */
  const handleSubmit = async () => {
    setHasSubmitted(true); // optimistic
    try {
      const { db, fb: f } = fbSync();
      const { ref, set, update } = f;
      await set(
        ref(db, `${base()}/responses/${playerId()}`),
        myResponse()
      );
      await update(ref(db, `${base()}/players/${playerId()}`), {
        responded: true,
      });
    } catch (err) {
      console.error("Submit failed:", err);
      setHasSubmitted(false); // revert on failure
    }
  };

  /* ─────────── host actions ─────────── */
  const generatePrompt = async () => {
    setGeneratingPrompt(true);
    setPromptError("");
    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt:
            'You are a playful game master designing creative, lighthearted challenges for a multiplayer storytelling game called Prompt Quest. Generate one funny, corporate-themed challenge where the player must convince someone in a typical workplace to do something. Be concise. The character should be related to office life — like coworkers, bosses, HR, interns. The goal should be realistic or relatable, with a humorous twist. Avoid fantasy, complex logic, or niche references. Keep it simple and fun. Format: "Convince <workplace being> to <do something>." Examples: "Convince your manager to approve a week off with no questions asked." "Convince HR to let you bring your pet llama to the team meeting." "Convince the intern that you\'re actually the CEO in disguise." Now generate ONE corporate-themed convincing challenge.',
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `API returned ${res.status}`);
      }

      const data = await res.json();
      if (!data.response) {
        throw new Error("AI failed to generate a prompt — try again.");
      }

      const { db, fb: f } = fbSync();
      const { ref, set } = f;
      await set(ref(db, `${base()}/prompt`), data.response);
    } catch (err: any) {
      console.error("generatePrompt error:", err);
      setPromptError(err?.message || "Something went wrong. Try again.");
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const startNewRound = async () => {
    try {
      const { db, fb: f } = fbSync();
      const { ref, set, remove, update } = f;

      await Promise.all([
        remove(ref(db, `${base()}/responses`)),
        remove(ref(db, `${base()}/scores`)),
        remove(ref(db, `${base()}/winnerId`)),
      ]);

      const updates: any = {};
      players().forEach((p) => {
        updates[p.id] = { ...p, responded: false };
      });
      await update(ref(db, `${base()}/players`), updates);
      await set(ref(db, `${base()}/prompt`), "");

      setPrompt("");
      setMyResponse("");
      setScores({});
      setHasSubmitted(false);
      setRoundComplete(false);
      setWinnerId("");
      setAllResponses({});
    } catch (err) {
      console.error("New round failed:", err);
    }
  };

  /* ─────────── JSX ─────────── */
  return (
    <div class="max-w-4xl mx-auto px-4 py-8 text-white">
      {/* ───── Join Form ───── */}
      <Show when={!joined()}>
        <div class="flex justify-center items-center min-h-[80vh]">
          <div class="max-w-md w-full">
            {/* Back link */}
            <a
              href="/prompt-quest"
              class="text-sm text-gray-400 hover:text-white mb-8 inline-block transition-colors"
            >
              ← Back to Game Info
            </a>

            {/* Hero */}
            <div class="text-center mb-8">
              <span class="text-5xl inline-block mb-4">🧩</span>
              <h1 class="text-3xl font-bold mb-2">Enter the Arena</h1>
              <p class="text-gray-400 text-sm">
                Join a session to start playing with your friends
              </p>
            </div>

            {/* Form Card */}
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-8 space-y-4">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                  Your Name
                </label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  class="w-full bg-darkslate-300 border border-darkslate-100 text-white px-4 py-3 rounded-xl outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-500"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                  Session ID
                </label>
                <input
                  type="text"
                  placeholder="Enter session ID"
                  class="w-full bg-darkslate-300 border border-darkslate-100 text-white px-4 py-3 rounded-xl outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-500"
                  value={sessionId()}
                  onInput={(e) => setSessionId(e.currentTarget.value)}
                />
              </div>

              <Show when={joinError()}>
                <div class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2.5 rounded-xl">
                  {joinError()}
                </div>
              </Show>

              <button
                class="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!name().trim() || !sessionId().trim()}
                onClick={handleJoin}
              >
                Enter Game →
              </button>
            </div>

            {/* Instructions */}
            <div class="mt-8 bg-darkslate-500/50 border border-darkslate-100 rounded-2xl p-6 space-y-4">
              <h2 class="font-bold text-sm uppercase tracking-wider text-gray-300">
                Quick Guide
              </h2>
              <div class="grid grid-cols-2 gap-3 text-sm">
                <div class="flex items-start gap-2">
                  <span class="text-indigo-400 font-mono text-xs mt-0.5">
                    01
                  </span>
                  <span class="text-gray-400">
                    First player becomes host
                  </span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-indigo-400 font-mono text-xs mt-0.5">
                    02
                  </span>
                  <span class="text-gray-400">
                    Host generates the prompt
                  </span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-indigo-400 font-mono text-xs mt-0.5">
                    03
                  </span>
                  <span class="text-gray-400">
                    Everyone writes a response
                  </span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-indigo-400 font-mono text-xs mt-0.5">
                    04
                  </span>
                  <span class="text-gray-400">
                    AI scores — highest wins!
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* ───── In-Game View ───── */}
      <Show when={joined()}>
        {/* Top bar — game status + phase indicator */}
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold">
              {name()}
              <Show when={isHost()}>
                <span class="ml-2 text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-medium uppercase tracking-wider">
                  Host
                </span>
              </Show>
            </h2>
            <p class="text-xs text-gray-500 font-mono mt-0.5">
              Session: {sessionId()}
            </p>
          </div>

          {/* Phase indicator */}
          <div class="flex items-center gap-1.5">
            <div
              class={`h-2 w-8 rounded-full transition-colors ${
                currentPhase() === "lobby"
                  ? "bg-indigo-500"
                  : "bg-darkslate-100"
              }`}
            />
            <div
              class={`h-2 w-8 rounded-full transition-colors ${
                currentPhase() === "writing"
                  ? "bg-amber-500"
                  : "bg-darkslate-100"
              }`}
            />
            <div
              class={`h-2 w-8 rounded-full transition-colors ${
                currentPhase() === "results"
                  ? "bg-emerald-500"
                  : "bg-darkslate-100"
              }`}
            />
            <span class="text-xs text-gray-500 ml-2 uppercase tracking-wider">
              {currentPhase()}
            </span>
          </div>
        </div>

        {/* Main 2-column grid */}
        <div class="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
          {/* ── Player Sidebar ── */}
          <aside class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-5 space-y-3 md:sticky md:top-4 md:self-start">
            <h3 class="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
              Players ({players().length})
            </h3>
            <For each={players()}>
              {(player) => (
                <div class="flex items-center gap-3 py-1.5">
                  {/* Avatar */}
                  <div
                    class={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      player.id === winnerId() && roundComplete()
                        ? "bg-amber-500/20 text-amber-400 ring-2 ring-amber-500/40"
                        : player.id === playerId()
                        ? "bg-indigo-500/20 text-indigo-400"
                        : "bg-darkslate-300 text-gray-400"
                    }`}
                  >
                    {initials(player.name)}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span
                        class={`text-sm font-medium truncate ${
                          player.id === playerId()
                            ? "text-white"
                            : "text-gray-300"
                        }`}
                      >
                        {player.name}
                      </span>
                      <Show when={player.id === hostId()}>
                        <span class="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded-full">
                          HOST
                        </span>
                      </Show>
                    </div>
                  </div>
                  {/* Status indicator */}
                  <Show when={prompt() && !roundComplete()}>
                    <div
                      class={`w-2 h-2 rounded-full ${
                        player.responded
                          ? "bg-emerald-400"
                          : "bg-gray-600"
                      }`}
                      title={
                        player.responded ? "Submitted" : "Writing..."
                      }
                    />
                  </Show>
                  <Show
                    when={
                      roundComplete() &&
                      player.id === winnerId()
                    }
                  >
                    <span class="text-amber-400">🏆</span>
                  </Show>
                </div>
              )}
            </For>

            {/* Scores in sidebar after round */}
            <Show when={roundComplete()}>
              <div class="mt-4 pt-4 border-t border-darkslate-100">
                <h4 class="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Scores
                </h4>
                <For
                  each={Object.entries(scores()).sort(
                    (a, b) => b[1] - a[1]
                  )}
                >
                  {([pid, score], idx) => {
                    const p = players().find((p) => p.id === pid);
                    return (
                      <div class="flex items-center justify-between text-sm py-1">
                        <span class="text-gray-300">
                          {idx() === 0 ? "🥇" : idx() === 1 ? "🥈" : idx() === 2 ? "🥉" : `${idx() + 1}.`}{" "}
                          {p?.name || "Unknown"}
                        </span>
                        <span
                          class={`font-mono font-bold ${
                            idx() === 0
                              ? "text-amber-400"
                              : "text-gray-400"
                          }`}
                        >
                          {score}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </aside>

          {/* ── Main Game Area ── */}
          <section class="space-y-6">
            {/* Error banner */}
            <Show when={promptError()}>
              <div class="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
                <span>{promptError()}</span>
                <button
                  class="text-red-400 hover:text-red-300 text-xs"
                  onClick={() => setPromptError("")}
                >
                  ✕
                </button>
              </div>
            </Show>

            {/* Lobby — waiting for prompt */}
            <Show when={!prompt() && !roundComplete()}>
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-8 text-center">
                <div class="text-4xl mb-4">🎯</div>
                <h2 class="text-xl font-bold mb-2">
                  Waiting for the Quest
                </h2>
                <p class="text-gray-400 text-sm mb-6">
                  <Show when={isHost()} fallback="The host will generate a prompt soon...">
                    You're the host! Generate a prompt when everyone has joined.
                  </Show>
                </p>

                <Show when={isHost()}>
                  <button
                    class="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    onClick={generatePrompt}
                    disabled={generatingPrompt()}
                  >
                    <Show
                      when={!generatingPrompt()}
                      fallback={
                        <>
                          <svg
                            class="animate-spin h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                          >
                            <circle
                              class="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              stroke-width="4"
                            />
                            <path
                              class="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                            />
                          </svg>
                          Generating…
                        </>
                      }
                    >
                      ✨ Generate Prompt
                    </Show>
                  </button>
                </Show>

                {/* Player count */}
                <div class="mt-6 text-xs text-gray-500">
                  {players().length} player{players().length !== 1 ? "s" : ""} in lobby
                </div>
              </div>
            </Show>

            {/* Writing Phase */}
            <Show when={prompt() && !roundComplete()}>
              {/* Prompt Card */}
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-6">
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-indigo-400 font-mono text-xs uppercase tracking-wider">
                    Round Challenge
                  </span>
                  <Show when={scoring()}>
                    <span class="text-xs text-amber-400 flex items-center gap-1">
                      <svg
                        class="animate-spin h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        />
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                      AI Scoring…
                    </span>
                  </Show>
                </div>
                <p class="text-lg font-medium text-white whitespace-pre-wrap break-words leading-relaxed">
                  {prompt()}
                </p>
                <div class="mt-3 text-xs text-gray-500">
                  {submittedCount()} / {players().length} submitted
                </div>
              </div>

              {/* Response Area */}
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-6">
                <label class="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                  Your Response
                </label>
                <textarea
                  class="w-full bg-darkslate-300 border border-darkslate-100 text-white rounded-xl p-4 min-h-[140px] outline-none focus:border-indigo-500 transition-colors placeholder:text-gray-500 resize-none"
                  placeholder="Write your most creative, funny response..."
                  value={myResponse()}
                  onInput={(e) =>
                    setMyResponse(e.currentTarget.value)
                  }
                  disabled={hasSubmitted()}
                />
                <div class="flex items-center justify-between mt-4">
                  <span class="text-xs text-gray-500">
                    {myResponse().length} characters
                  </span>
                  <button
                    class={`font-semibold py-2.5 px-6 rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                      hasSubmitted()
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-indigo-500 hover:bg-indigo-600 text-white hover:shadow-lg hover:shadow-indigo-500/20"
                    }`}
                    onClick={handleSubmit}
                    disabled={hasSubmitted() || !myResponse().trim()}
                  >
                    {hasSubmitted()
                      ? "✓ Submitted"
                      : "🚀 Submit Response"}
                  </button>
                </div>
              </div>
            </Show>

            {/* Results Phase */}
            <Show when={roundComplete()}>
              {/* Winner banner */}
              <div class="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-6 text-center">
                <div class="text-4xl mb-3">🎉</div>
                <h2 class="text-2xl font-bold mb-1">
                  {players().find((p) => p.id === winnerId())?.name}{" "}
                  wins this round!
                </h2>
                <p class="text-gray-400 text-sm">
                  Score:{" "}
                  <span class="text-amber-400 font-bold">
                    {scores()[winnerId()] || 0}/100
                  </span>
                </p>
              </div>

              {/* All responses */}
              <div class="bg-darkslate-500 border border-darkslate-100 rounded-2xl p-6 space-y-4">
                <h3 class="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">
                  All Responses
                </h3>
                <For
                  each={Object.entries(scores()).sort(
                    (a, b) => b[1] - a[1]
                  )}
                >
                  {([pid, score], idx) => {
                    const player = players().find(
                      (p) => p.id === pid
                    );
                    const resp = allResponses()[pid] || "";
                    return (
                      <div
                        class={`rounded-xl p-4 border ${
                          idx() === 0
                            ? "bg-amber-500/5 border-amber-500/20"
                            : "bg-darkslate-300 border-darkslate-100"
                        }`}
                      >
                        <div class="flex items-center justify-between mb-2">
                          <div class="flex items-center gap-2">
                            <div
                              class={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                idx() === 0
                                  ? "bg-amber-500/20 text-amber-400"
                                  : "bg-darkslate-100 text-gray-400"
                              }`}
                            >
                              {initials(player?.name || "?")}
                            </div>
                            <span class="text-sm font-medium text-white">
                              {player?.name || "Unknown"}
                            </span>
                            <Show when={idx() === 0}>
                              <span class="text-amber-400 text-xs">
                                🏆 Winner
                              </span>
                            </Show>
                          </div>
                          <span
                            class={`font-mono font-bold text-sm ${
                              idx() === 0
                                ? "text-amber-400"
                                : "text-gray-400"
                            }`}
                          >
                            {score} pts
                          </span>
                        </div>
                        <p class="text-sm text-gray-300 italic leading-relaxed">
                          {resp}
                        </p>
                      </div>
                    );
                  }}
                </For>
              </div>

              {/* New Round button (host only) */}
              <Show when={isHost()}>
                <div class="text-center">
                  <button
                    class="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98]"
                    onClick={startNewRound}
                  >
                    🔄 Start New Round
                  </button>
                </div>
              </Show>
            </Show>
          </section>
        </div>
      </Show>
    </div>
  );
};

export default JoinPage;
